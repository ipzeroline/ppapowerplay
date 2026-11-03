import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load } from "./load-ts.mjs";

// Member app: faster first load and steady under many members at once, without changing what it does.

const schema = () => readFileSync("database/schema.sql", "utf8");

test("bookings keep no unique key on court, time and status, so a second expired or cancelled booking of a slot cannot stop expiry", () => {
  const text = schema();
  const start = text.indexOf("CREATE TABLE IF NOT EXISTS bookings");
  const create = text.slice(start, text.indexOf(") ENGINE", start));
  assert.doesNotMatch(create, /UNIQUE KEY uq_booking_court_slot/);
  assert.match(create, /KEY idx_bookings_court_slot \(court_id, starts_at, ends_at\)/, "fresh installs get the plain index");
  const add = text.indexOf("ALTER TABLE bookings ADD INDEX IF NOT EXISTS idx_bookings_court_slot (court_id, starts_at, ends_at);");
  const drop = text.indexOf("ALTER TABLE bookings DROP INDEX IF EXISTS uq_booking_court_slot;");
  assert.ok(add > 0, "existing databases get the plain index");
  assert.ok(drop > add, "the court foreign key keeps an index: the plain one exists before the unique key is dropped");
});

test("queries that run on every app open, dashboard refresh and cash-up have indexes", () => {
  const text = schema();
  for (const statement of [
    "ALTER TABLE payments ADD INDEX IF NOT EXISTS idx_payments_status_paid (status, paid_at);",
    "ALTER TABLE payments ADD INDEX IF NOT EXISTS idx_payments_status_created (status, created_at);",
    "ALTER TABLE bookings ADD INDEX IF NOT EXISTS idx_bookings_starts (starts_at);",
    "ALTER TABLE member_visits ADD INDEX IF NOT EXISTS idx_member_visits_created (created_at);",
    "ALTER TABLE admin_audit_logs ADD INDEX IF NOT EXISTS idx_admin_audit_created (created_at);",
  ]) assert.ok(text.includes(statement), statement);
});

function bootstrapRoute(seen) {
  return load("app/api/bootstrap/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2, displayName: "Member", memberCode: "PPA-1" }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test" },
    "@/lib/db": { query: async (sql) => { seen.push(sql); await new Promise((resolve) => setTimeout(resolve, 5)); return sql.includes("FROM sports") ? [{ id: 1, slug: "badminton" }] : []; } },
  });
}
const catalogQueries = (seen) => seen.filter((sql) => /FROM sports WHERE active|FROM trainers WHERE active|FROM app_content_items WHERE active/.test(sql));

test("the catalog every member shares is read once a minute, however many members open the app at once", async () => {
  const seen = [];
  const route = bootstrapRoute(seen);
  const bodies = await Promise.all(Array.from({ length: 20 }, () => route.GET().then((response) => response.json())));
  assert.equal(catalogQueries(seen).length, 3, "sports, trainers and app content once for 20 simultaneous opens");
  assert.ok(bodies.every((body) => body.sports[0].slug === "badminton"));
  assert.equal(seen.filter((sql) => sql.includes("FROM wallet_accounts")).length, 20, "each member's own data is still read for each open");
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 61_000;
    await route.GET();
    assert.equal(catalogQueries(seen).length, 6, "after a minute the catalog is read again");
  } finally {
    Date.now = realNow;
  }
});

test("a failed catalog read is not cached", async () => {
  const { sharedCache } = load("lib/shared-cache.ts");
  let calls = 0;
  const flaky = () => { calls += 1; return calls === 1 ? Promise.reject(new Error("db down")) : Promise.resolve(["ok"]); };
  await assert.rejects(sharedCache("catalog:test", 60_000, flaky));
  assert.deepEqual(await sharedCache("catalog:test", 60_000, flaky), ["ok"]);
  assert.deepEqual(await sharedCache("catalog:test", 60_000, flaky), ["ok"]);
  assert.equal(calls, 2);
});

test("staff edits to content and trainers reach the app at once on this server", () => {
  for (const file of ["app/api/admin/content/route.ts", "app/api/admin/trainers/route.ts"]) {
    assert.match(readFileSync(file, "utf8"), /clearSharedCache\(\)/, file);
  }
});

test("members do not download the back-office stylesheet", () => {
  const root = readFileSync("app/layout.tsx", "utf8");
  assert.doesNotMatch(root, /admin\.css/, "the member page loads only member styles");
  assert.match(readFileSync("app/AdminConsole/layout.tsx", "utf8"), /import "\.\.\/admin\.css"/);
  assert.doesNotMatch(root, /preload: false/, "Inter draws prices, numbers and the PPA wordmark (member styles put it first), so it stays preloaded");
  const member = readFileSync("app/responsive.css", "utf8");
  assert.match(member, /:where\(\.phone\) :where\(div, section, article, form, label\) \{\s*min-width: 0;/, "the layout rule the member app took from admin.css");
  assert.match(member, /\.phone dialog\.admin-modal-backdrop \{/, "the member confirm dialog keeps its full-screen layer");
  assert.match(member, /:where\(\.phone\) :where\(input, select, textarea\) \{\s*font-size: 1rem;/, "16px fields keep iOS from zooming");
});

test("uploaded photos are served right after upload and optimized for phones", async () => {
  const files = new Map([["public/uploads/trainers/1730000000000-0b8e2a4c-1f2d-4c3b-9a8e-7d6c5b4a3f21.png", Buffer.from("png-bytes")]]);
  const route = load("app/media/trainers/[file]/route.ts", {
    "node:fs/promises": { readFile: async (target) => { for (const [name, bytes] of files) if (target.endsWith(name)) return bytes; throw Object.assign(new Error("missing"), { code: "ENOENT" }); } },
  });
  const get = (file) => route.GET(new Request(`http://localhost/media/trainers/${file}`), { params: Promise.resolve({ file }) });
  const ok = await get("1730000000000-0b8e2a4c-1f2d-4c3b-9a8e-7d6c5b4a3f21.png");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.match(ok.headers.get("cache-control"), /immutable/, "upload names are unique, so a photo never changes");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  assert.equal(Buffer.from(await ok.arrayBuffer()).toString(), "png-bytes");
  for (const bad of ["..%2F..%2F.env", "../secret.png", "photo.svg", "photo.png.html", "missing-0000.png"]) assert.equal((await get(bad)).status, 404, bad);
  const config = load("next.config.ts").default;
  const rewrites = await config.rewrites();
  assert.deepEqual(rewrites.fallback, [{ source: "/uploads/trainers/:file", destination: "/media/trainers/:file" }], "only files the server did not see at start fall back to the route");
  assert.deepEqual(config.images.localPatterns, [{ pathname: "/uploads/**", search: "" }], "only uploads are optimized, without query strings");
  const app = readFileSync("components/ppa-app.tsx", "utf8");
  assert.match(app, /function UploadImage/);
  assert.doesNotMatch(app, /<Image unoptimized width=\{160\} height=\{160\} alt=\{trainer\.name\}/, "trainer photos go through the optimizer");
});

test("on reopen the app shows the member's last data at once, only for the same LINE account and for a day", () => {
  const { readMemberCache, writeMemberCache, clearMemberCache, memberCacheMaxAgeMs } = load("lib/member-cache.ts");
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: (key) => store.delete(key) };
  const now = Date.parse("2026-11-03T10:00:00Z");
  writeMemberCache("Uaaa", { user: { displayName: "A" } }, storage, now);
  assert.deepEqual(readMemberCache("Uaaa", storage, now + 1000), { user: { displayName: "A" } });
  assert.equal(readMemberCache("Ubbb", storage, now + 1000), null, "another LINE account on the same phone sees nothing");
  assert.equal(readMemberCache("", storage, now), null);
  assert.equal(readMemberCache("Uaaa", storage, now + memberCacheMaxAgeMs + 1), null, "nothing older than a day");
  clearMemberCache(storage);
  assert.equal(readMemberCache("Uaaa", storage, now), null, "logout removes it");
  store.set("ppa_member_cache_v1", "{not json");
  assert.equal(readMemberCache("Uaaa", storage, now), null);
  writeMemberCache("Uaaa", { big: "x".repeat(1_600_000) }, storage, now);
  assert.equal(store.has("ppa_member_cache_v1"), false, "too large to keep");
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal(readMemberCache("Uaaa", blocked, now), null, "a blocked or full storage just loads normally");
  writeMemberCache("Uaaa", {}, blocked, now);
  clearMemberCache(blocked);
});

test("the first open shows the app frame with skeletons instead of a progress screen", () => {
  const app = readFileSync("components/ppa-app.tsx", "utf8");
  assert.match(app, /function MemberLoading/);
  assert.doesNotMatch(app, /SPORT COMPLEX LOADING|gate-status|gate-progress|gate-rings/, "no loading theatre");
  assert.match(app, /readMemberCache(<\w+>)?\(/);
  assert.match(app, /writeMemberCache\(/);
  assert.match(app, /getDecodedIDToken/, "saved data is matched to the signed-in LINE account");
  const logout = app.slice(app.indexOf("async function logout"), app.indexOf("async function logout") + 700);
  assert.match(logout, /clearMemberCache\(\)/, "logout removes the saved data");
  assert.doesNotMatch(readFileSync("components/booking-calendar.tsx", "utf8"), /loading \? "…"/, "calendar days show a skeleton while loading");
});
