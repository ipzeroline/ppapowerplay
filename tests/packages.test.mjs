import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { load, require } from "./load-ts.mjs";

const schema = readFileSync("database/schema.sql", "utf8");
const schemaLines = schema.split("\n");
const statements = schema.split(/;\s*\n/)
  .map((statement) => statement.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim())
  .filter(Boolean);
const lineFor = (marker) => schemaLines.find((line) => line.includes(marker));

test("schema seeds the package catalog with spec prices and keeps admin edits", () => {
  const contentPrices = [
    ["fitness-12m", 19200], ["fitness-swim-12m", 19700], ["fitness-hyrox-12m", 19700],
    ["fitness-1m", 2000], ["fitness-swim-1m", 2700], ["fitness-hyrox-1m", 2700],
    ["fitness-6m", 10885], ["fitness-swim-6m", 11485], ["fitness-hyrox-6m", 11485],
    ["fitness-1-visit", 200], ["fitness-swim-1-visit", 300], ["fitness-hyrox-1-visit", 300],
    ["fitness-1-week", 1000], ["fitness-swim-1-week", 1500], ["fitness-hyrox-1-week", 1500],
    ["package-pause", 500], ["coupon-renewal", 500],
  ];
  for (const [slug, price] of contentPrices) {
    const row = lineFor(`'${slug}'`);
    assert.ok(row, `missing seed ${slug}`);
    assert.match(row, new RegExp(`'${slug}'.*, ${price}, '\\{`), `${slug} must cost ${price}`);
  }
  assert.match(lineFor("'fitness-12m'"), /"featured":true,"badge":"คุ้มสุด".*"months":12,"pausesAllowed":2/);
  assert.match(lineFor("'fitness-6m'"), /"months":6,"pausesAllowed":1/);
  assert.match(lineFor("'fitness-1-visit'"), /"days":1,"uses":1/);
  assert.match(lineFor("'fitness-1-week'"), /"days":7/);

  const couponSeeds = [
    ["FIT-COUPON-10", 1600, 10, 60], ["FIT-SWIM-COUPON-10", 2400, 10, 60], ["FIT-HYROX-COUPON-10", 2400, 10, 60],
    ["FIT-COUPON-30", 4200, 30, 120], ["FIT-SWIM-COUPON-30", 6300, 30, 120], ["FIT-HYROX-COUPON-30", 6300, 30, 120],
    ["FIT-COUPON-60", 7200, 60, 180], ["FIT-SWIM-COUPON-60", 12000, 60, 180], ["FIT-HYROX-COUPON-60", 12000, 60, 180],
    ["FIT-COUPON-120", 12000, 120, 365], ["FIT-SWIM-COUPON-120", 18000, 120, 365], ["FIT-HYROX-COUPON-120", 18000, 120, 365],
  ];
  for (const [code, price, uses, days] of couponSeeds) {
    const row = lineFor(`'${code}'`);
    assert.ok(row, `missing coupon ${code}`);
    assert.match(row, new RegExp(`'${code}'.*, ${price}, ${uses}, ${days}, TRUE, \\d+, '\\{"tab":"coupon"`), `${code} terms`);
  }
  assert.match(lineFor("'FIT-COUPON-120'"), /"badge":"BEST SELLER"/);

  for (const marker of ["'fitness-12m'", "'FIT-COUPON-10'", "'package-pause'"]) {
    assert.match(statements.find((statement) => statement.includes(marker)), /^INSERT IGNORE INTO/, `${marker} must not overwrite admin edits`);
  }
  assert.match(schema, /CREATE TABLE IF NOT EXISTS group_members/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS membership_pauses/);
  for (const column of [
    /ALTER TABLE coupons ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0/,
    /ALTER TABLE coupons ADD COLUMN IF NOT EXISTS metadata JSON NULL/,
    /ALTER TABLE user_coupons ADD COLUMN IF NOT EXISTS total_uses INT NULL/,
    /ALTER TABLE user_coupons ADD COLUMN IF NOT EXISTS payment_id BIGINT UNSIGNED NULL/,
    /ALTER TABLE groups_clubs ADD COLUMN IF NOT EXISTS max_players INT NOT NULL DEFAULT 4/,
    /ALTER TABLE groups_clubs ADD COLUMN IF NOT EXISTS play_at DATETIME NULL/,
  ]) assert.match(schema, column);
  assert.match(schema, /INSERT IGNORE INTO group_members \(group_id, user_id, joined_at\)\s+SELECT id, owner_user_id, created_at FROM groups_clubs/);

  const legacyUpsert = statements.find((statement) => statement.includes("'hyrox-challenge-2026'"));
  assert.doesNotMatch(legacyUpsert, /'membership_plan', '(monthly|quarterly|annual)'/, "legacy plans must not be re-activated by db:init");
  assert.match(schema, /UPDATE app_content_items\s+SET active = FALSE\s+WHERE content_type = 'membership_plan'/);

  const adminSeed = statements.find((statement) => statement.includes("INTO admin_staff"));
  assert.doesNotMatch(adminSeed, /password_hash\s*=\s*VALUES\(password_hash\)/);
  assert.doesNotMatch(adminSeed, /ON DUPLICATE KEY UPDATE/);
  assert.doesNotMatch(readFileSync("scripts/db-init.mjs", "utf8"), /DB_(HOST|USER|PASSWORD|NAME)\s*\|\|/);
});

const monthlyPlans = [
  [7, 130, { group: "6m", variant: "base" }], [3, 112, { group: "12m", variant: "hyrox" }], [4, 120, { group: "1m", variant: "base" }],
  [1, 110, { group: "12m", variant: "base", featured: true }], [9, 132, { group: "6m", variant: "hyrox" }], [2, 111, { group: "12m", variant: "swim" }],
  [5, 121, { group: "1m", variant: "swim" }], [8, 131, { group: "6m", variant: "swim" }], [6, 122, { group: "1m", variant: "hyrox" }],
].map(([id, sortOrder, metadata]) => ({ id, sortOrder, metadata: JSON.stringify({ tab: "monthly", ...metadata }) }));

test("package helpers group extras under their base and format coupon validity", () => {
  const presentation = load("lib/package-presentation.ts");
  const groups = presentation.groupPackages(monthlyPlans);
  assert.deepEqual(groups.map((group) => group.key), ["12m", "1m", "6m"]);
  assert.equal(groups[0].base.id, 1);
  assert.deepEqual(groups[0].extras.map((item) => item.id), [2, 3]);
  assert.deepEqual(groups[2].extras.map((item) => item.id), [8, 9]);
  const ungrouped = presentation.groupPackages([{ id: 40, sortOrder: 5, metadata: null }, { id: 41, sortOrder: 1, metadata: "not-json" }]);
  assert.deepEqual(ungrouped.map((group) => [group.key, group.base.id, group.extras.length]), [["id-41", 41, 0], ["id-40", 40, 0]]);
  const baseless = presentation.groupPackages([{ id: 51, sortOrder: 9, metadata: { group: "x", variant: "hyrox" } }, { id: 50, sortOrder: 8, metadata: { group: "x", variant: "swim" } }]);
  assert.deepEqual([baseless[0].base.id, baseless[0].extras.map((item) => item.id)], [50, [51]]);

  assert.deepEqual(presentation.validityLabel(60), { amount: 2, unit: "month" });
  assert.deepEqual(presentation.validityLabel(120), { amount: 4, unit: "month" });
  assert.deepEqual(presentation.validityLabel(365), { amount: 1, unit: "year" });
  assert.deepEqual(presentation.validityLabel(45), { amount: 45, unit: "day" });
  assert.equal(presentation.perUnit(1000, 7), 143);
  assert.equal(presentation.perUnit(10885, 6), 1814);
  assert.equal(presentation.perUnit(1600, 0), 0);
  assert.equal(presentation.usedCount(10, 12), 0);
  assert.equal(presentation.usedCount(10, 7), 3);
  assert.equal(presentation.remainingPercent(7, 10), 70);
  assert.equal(presentation.remainingPercent(5, 0), 0);
  assert.equal(presentation.remainingPercent(12, 10), 100);
  const now = Date.parse("2026-05-13T12:00:00+07:00");
  assert.equal(presentation.daysLeft("2026-07-02T12:30:00+07:00", now), 51);
  assert.equal(presentation.daysLeft("2026-05-01T00:00:00+07:00", now), 0);
  assert.equal(presentation.daysLeft("invalid", now), 0);
});

test("grant metadata is validated and legacy names map to months", () => {
  const { normalizeGrant, legacyMembershipMonths } = load("lib/package-grant.ts");
  assert.deepEqual(normalizeGrant('{"months":12,"uses":null,"services":["fitness","bad value"]}'), { months: 12, uses: null, services: ["fitness"] });
  assert.deepEqual(normalizeGrant({ months: 99 }), {});
  assert.deepEqual(normalizeGrant({ days: 7, uses: 1, pausesAllowed: 2 }), { days: 7, uses: 1, pausesAllowed: 2 });
  assert.deepEqual(normalizeGrant({ days: 0, uses: 1000, pausesAllowed: 9, services: "fitness" }), {});
  assert.deepEqual(normalizeGrant("not-json"), {});
  assert.deepEqual(normalizeGrant(null), {});
  assert.deepEqual(normalizeGrant({ months: 1.5 }), {});
  assert.equal(legacyMembershipMonths("Fitness 6 เดือน"), 6);
  assert.equal(legacyMembershipMonths("Fitness (12 เดือน)"), 12);
  assert.equal(legacyMembershipMonths("แพ็กเกจ Annual"), 12);
  assert.equal(legacyMembershipMonths("PPA Premium Quarterly"), 3);
  assert.equal(legacyMembershipMonths("แพ็กเกจ Monthly"), 1);
});

test("open game slots show only joinable upcoming groups, soonest first", () => {
  const { openGameSlots, missingPlayers } = load("lib/package-presentation.ts");
  const now = Date.parse("2026-10-31T18:00:00+07:00");
  const groups = [
    { id: 1, maxPlayers: 4, memberCount: 4, playAt: "2026-10-31T19:00:00+07:00" },
    { id: 2, maxPlayers: 4, memberCount: 1, playAt: "2026-10-31T16:30:00+07:00" },
    { id: 3, maxPlayers: 6, memberCount: 2, playAt: null },
    { id: 4, maxPlayers: 4, memberCount: 3, playAt: "2026-11-01T09:00:00+07:00" },
    { id: 5, maxPlayers: 4, memberCount: 2, playAt: "2026-10-31T17:30:00+07:00" },
    { id: 6, maxPlayers: 10, memberCount: 8, playAt: "2026-10-31T20:00:00+07:00" },
    { id: 7, maxPlayers: 2, memberCount: 1, playAt: null },
  ];
  assert.deepEqual(openGameSlots(groups, now).map((group) => group.id), [5, 6, 4, 7]);
  assert.deepEqual(openGameSlots(groups, now, 3).map((group) => group.id), [5, 6, 4]);
  assert.equal(missingPlayers({ maxPlayers: 4, memberCount: 6 }), 0);
  assert.equal(missingPlayers({ maxPlayers: 4, memberCount: 1 }), 3);
});

test("catalog snapshots plan months and time-pass days from metadata", async () => {
  const seen = [];
  const rows = {
    1: { title: "Fitness (12 เดือน)", price: 19200, contentType: "membership_plan", metadata: '{"tab":"monthly","months":12,"pausesAllowed":2,"services":["fitness"]}' },
    2: { title: "Fitness 1 ครั้ง", price: 200, contentType: "time_pass", metadata: '{"tab":"time","days":1,"uses":1,"services":["fitness"]}' },
  };
  const catalog = load("lib/payment-catalog.ts", { "@/lib/db": { query: async (sql, params) => { seen.push(sql); return rows[params[0]] ? [rows[params[0]]] : []; } } });
  const plan = await catalog.resolvePaymentItem({ contentId: 1 });
  assert.deepEqual(plan, { amount: 19200, itemName: "Fitness (12 เดือน)", itemType: "membership", contentId: 1, grant: { months: 12, services: ["fitness"], pausesAllowed: 2 } });
  const pass = await catalog.resolvePaymentItem({ contentId: 2 });
  assert.equal(pass.itemType, "time_pass");
  assert.deepEqual(pass.grant, { days: 1, uses: 1, services: ["fitness"] });
  assert.ok(seen.every((sql) => sql.includes("'time_pass'") && !sql.includes("renewal_option")), "renewal options must go through their own endpoints");
});

function recordingConnection(handler) {
  const statements = [];
  let committed = false;
  let rolledBack = false;
  return {
    statements,
    get committed() { return committed; },
    get rolledBack() { return rolledBack; },
    beginTransaction: async () => {},
    commit: async () => { committed = true; },
    rollback: async () => { rolledBack = true; },
    release: () => {},
    execute: async (sql, params = []) => {
      statements.push([sql, params]);
      return handler(sql, params) ?? [{ affectedRows: 1, insertId: 99 }];
    },
  };
}

async function approve(metadata, extra = () => undefined) {
  const conn = recordingConnection((sql) => {
    if (sql.includes("FROM payments WHERE")) return [[{ id: 41, paymentNo: "PAYTEST", userId: 2, bookingId: null, status: "created", amount: 19200, metadataText: JSON.stringify(metadata) }]];
    const answer = extra(sql);
    if (answer) return answer;
    if (sql.startsWith("SELECT")) return [[{ paymentNo: "PAYTEST", status: "paid" }]];
    return undefined;
  });
  const route = load("app/api/admin/payments/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session" },
    "@/lib/db": { pool: { getConnection: async () => conn } },
  });
  const { NextRequest } = (await import("next/server.js")).default ?? (await import("next/server.js"));
  const response = await route.PUT(new NextRequest("http://localhost/api/admin/payments", { method: "PUT", body: JSON.stringify({ paymentNo: "PAYTEST", status: "paid" }) }));
  return { response, conn };
}

test("staff approval of a PromptPay 12-month plan grants 12 months", async () => {
  const yearly = await approve({ itemType: "membership", itemName: "Fitness (12 เดือน)", contentId: 1, grant: { months: 12, pausesAllowed: 2, services: ["fitness"] } });
  assert.equal(yearly.response.status, 200);
  const [, params] = yearly.conn.statements.find(([sql]) => sql.includes("INSERT INTO memberships"));
  assert.equal(params[3], 12, "membership interval months");
  assert.deepEqual(JSON.parse(params[4]), { amount: 19200, source: "payment", months: 12, pausesAllowed: 2, services: ["fitness"] });

  const legacy = await approve({ itemType: "membership", itemName: "Fitness 6 เดือน" });
  assert.equal(legacy.conn.statements.find(([sql]) => sql.includes("INSERT INTO memberships"))[1][3], 6);

  const timePass = await approve({ itemType: "time_pass", itemName: "Fitness 1 ครั้ง", contentId: 2, grant: { days: 1, uses: 1 } });
  const [passSql, passParams] = timePass.conn.statements.find(([sql]) => sql.includes("INSERT INTO user_entitlements"));
  assert.match(passSql, /INTERVAL \? DAY/);
  assert.deepEqual(passParams.slice(0, 6), [2, 41, "time_pass", "Fitness 1 ครั้ง", 1, 1]);
});

test("coupon approval stores the purchased quantity and payment on the member coupon", async () => {
  const { response, conn } = await approve({ itemType: "coupon", itemName: "คูปอง Fitness 10 ใบ", couponId: 3, totalUses: 10, validityDays: 60 }, (sql) => (
    sql.includes("FROM coupons") ? [[{ id: 3, totalUses: 30, validityDays: 120 }]] : undefined
  ));
  assert.equal(response.status, 200);
  const [sql, params] = conn.statements.find(([statement]) => statement.includes("INSERT INTO user_coupons"));
  assert.match(sql, /total_uses, payment_id/);
  assert.deepEqual(params, [2, 3, 10, 41, 10, 60], "snapshot terms win over later coupon edits");
});

test("wallet coupon purchase links the payment and records the purchased quantity", async () => {
  const conn = recordingConnection((sql) => {
    if (sql.includes("FROM coupons")) return [[{ id: 3, price: 1600, totalUses: 10, validityDays: 60, name: "คูปอง Fitness 10 ใบ" }]];
    if (sql.includes("FROM wallet_accounts")) return [[{ balance: 5000 }]];
    if (sql.startsWith("INSERT INTO payments")) return [{ insertId: 77 }];
    return undefined;
  });
  const route = load("app/api/coupons/buy/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => ({ couponId: 3, method: "wallet" }), validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": { createPublicId: (prefix) => `${prefix}TEST`, pool: { getConnection: async () => conn } },
  });
  const response = await route.POST(new Request("http://localhost/api/coupons/buy", { method: "POST" }));
  assert.equal(response.status, 200);
  const payment = conn.statements.find(([sql]) => sql.startsWith("INSERT INTO payments"));
  assert.deepEqual(JSON.parse(payment[1].find((value) => typeof value === "string" && value.startsWith("{"))), { itemName: "คูปอง Fitness 10 ใบ", itemType: "coupon", couponId: 3, totalUses: 10, validityDays: 60 });
  const [couponSql, couponParams] = conn.statements.find(([sql]) => sql.includes("INSERT INTO user_coupons"));
  assert.match(couponSql, /total_uses, payment_id/);
  assert.deepEqual(couponParams, [2, 3, 10, 77, 10, 60]);
  assert.equal(conn.committed, true);
});

function renewalConnection({ membership = {}, pauses = [], coupon = null, pending = [], balance = 5000 } = {}) {
  return recordingConnection((sql) => {
    if (sql.includes("FROM memberships")) return [[{ id: 5, startsAt: "2026-06-01 10:00:00", endsAt: "2027-06-01 10:00:00", status: "active", metadata: '{"months":12,"pausesAllowed":2}', isCurrent: 1, startsBeforeEnd: 1, ...membership }]];
    if (sql.includes("FROM membership_pauses")) return [pauses];
    if (sql.includes("FROM user_coupons")) return [coupon ? [coupon] : []];
    if (sql.includes("FROM payments")) return [pending];
    if (sql.includes("FROM wallet_accounts")) return [[{ balance }]];
    if (sql.startsWith("INSERT INTO payments")) return [{ insertId: 88 }];
    return undefined;
  });
}

const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

test("pause rules cap 60 days, block past or post-expiry starts and enforce the allowed count", async () => {
  const renewals = load("lib/renewals.ts", { "@/lib/db": { query: async () => [] } });
  const today = "2026-11-01";
  const request = { userId: 2, membershipId: 5, startDate: "2026-11-05", days: 30, today };
  const rejects = async (input, options, message) => {
    await assert.rejects(renewals.checkPauseRequest(renewalConnection(options), input), (error) => error instanceof renewals.RenewalError && error.status === 409, message);
  };
  await rejects({ ...request, days: 61 }, {}, "more than 60 days");
  await rejects({ ...request, days: 0 }, {}, "zero days");
  await rejects({ ...request, startDate: "2026-10-31" }, {}, "start in the past");
  await rejects({ ...request, startDate: "2026-12-02" }, {}, "start more than 30 days ahead");
  await rejects({ ...request, startDate: "2026-02-30" }, {}, "impossible date");
  await rejects(request, { membership: { startsBeforeEnd: 0 } }, "start after expiry");
  await rejects(request, { membership: { status: "expired" } }, "inactive membership");
  await rejects(request, { membership: { metadata: '{"months":6,"pausesAllowed":1}' }, pauses: [{ isOverlap: 0 }] }, "6-month plan already paused once");
  await rejects(request, { membership: { metadata: '{"months":1}' } }, "monthly plan cannot pause");
  await rejects(request, { pauses: [{ isOverlap: 1 }] }, "overlapping pause");
  await assert.rejects(renewals.checkPauseRequest(recordingConnection((sql) => (sql.includes("FROM memberships") ? [[]] : undefined)), request), (error) => error.status === 404);

  assert.deepEqual(await renewals.checkPauseRequest(renewalConnection({ pauses: [{ isOverlap: 0 }] }), request), { startsAt: "2026-11-05 00:00:00", endsAt: "2026-12-05 00:00:00" });
  const late = await renewals.checkPauseRequest(renewalConnection(), { ...request, startDate: "2026-10-28" }, { enforceLeadTime: false });
  assert.equal(late.startsAt, "2026-10-28 00:00:00", "staff approval after the requested start still applies the requested window");
  assert.equal(renewals.pausesAllowedFor({}, "2026-01-01 00:00:00", "2027-01-01 00:00:00"), 2);
  assert.equal(renewals.pausesAllowedFor({}, "2026-01-01 00:00:00", "2026-07-01 00:00:00"), 1);
  assert.equal(renewals.pausesAllowedFor({ pausesAllowed: 0, months: 12 }, "2026-01-01 00:00:00", "2027-01-01 00:00:00"), 0);
});

test("pause extends membership end by the paused days", async () => {
  const renewals = load("lib/renewals.ts", { "@/lib/db": { query: async () => [] } });
  const conn = renewalConnection();
  await renewals.applyMembershipPause(conn, { userId: 2, membershipId: 5, startDate: "2026-11-05", days: 30, paymentId: 88, today: "2026-11-01" });
  const insert = conn.statements.find(([sql]) => sql.includes("INSERT INTO membership_pauses"));
  assert.deepEqual(insert[1], [5, 2, 88, "2026-11-05 00:00:00", "2026-12-05 00:00:00", 30]);
  const update = conn.statements.find(([sql]) => sql.startsWith("UPDATE memberships"));
  assert.match(update[0], /ends_at = DATE_ADD\(ends_at, INTERVAL \? DAY\)/);
  assert.deepEqual(update[1], [30, 5, 2]);
  assert.ok(conn.statements.findIndex(([sql]) => sql.includes("FROM memberships")) < conn.statements.findIndex(([sql]) => sql.includes("INSERT INTO membership_pauses")), "membership row is locked before writing");
});

test("coupon renewal extends from the later of expiry and now and rejects exhausted coupons", async () => {
  const renewals = load("lib/renewals.ts", { "@/lib/db": { query: async () => [] } });
  const coupon = { id: 9, name: "คูปอง Fitness 10 ใบ", remainingUses: 3, status: "active", renewable: 1 };
  const conn = renewalConnection({ coupon });
  await renewals.applyCouponRenewal(conn, { userId: 2, userCouponId: 9, months: 1 });
  const [lockSql] = conn.statements.find(([sql]) => sql.includes("FROM user_coupons"));
  assert.match(lockSql, /FOR UPDATE/);
  const [sql, params] = conn.statements.find(([statement]) => statement.startsWith("UPDATE user_coupons"));
  assert.match(sql, /expires_at = DATE_ADD\(GREATEST\(expires_at, NOW\(\)\), INTERVAL \? MONTH\)/);
  assert.deepEqual(params, [1, 9, 2]);
  for (const blocked of [{ ...coupon, remainingUses: 0 }, { ...coupon, status: "used" }, { ...coupon, renewable: 0 }]) {
    await assert.rejects(renewals.applyCouponRenewal(renewalConnection({ coupon: blocked }), { userId: 2, userCouponId: 9, months: 1 }), (error) => error instanceof renewals.RenewalError && error.status === 409);
  }
  await assert.rejects(renewals.applyCouponRenewal(renewalConnection(), { userId: 2, userCouponId: 9, months: 1 }), (error) => error.status === 404);
});

function renewalRoute(file, body, conn) {
  return load(file, {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => body, validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": {
      query: async () => [
        { id: 31, title: "พักการใช้งานแพ็กเกจ", price: 500, metadata: '{"kind":"membership_pause","maxDays":60}' },
        { id: 32, title: "ต่ออายุคูปอง", price: 500, metadata: '{"kind":"coupon_renewal","months":1}' },
      ],
      createPublicId: (prefix) => `${prefix}TEST`,
      pool: { getConnection: async () => conn },
    },
  });
}

test("pause request with insufficient wallet rolls back without a pause", async () => {
  const { bangkokToday } = load("lib/court-availability.ts");
  const startDate = addDays(bangkokToday(), 2);
  const conn = renewalConnection({ balance: 100 });
  const route = renewalRoute("app/api/memberships/pause/route.ts", { membershipId: 5, startDate, days: 30, method: "wallet" }, conn);
  const response = await route.POST(new Request("http://localhost/api/memberships/pause", { method: "POST" }));
  assert.equal(response.status, 409);
  assert.equal(conn.rolledBack, true);
  assert.equal(conn.committed, false);
  assert.equal(conn.statements.some(([sql]) => sql.includes("INSERT INTO membership_pauses")), false);

  const paidConn = renewalConnection();
  const paid = await renewalRoute("app/api/memberships/pause/route.ts", { membershipId: 5, startDate, days: 30, method: "wallet" }, paidConn).POST(new Request("http://localhost/api/memberships/pause", { method: "POST" }));
  assert.equal(paid.status, 201);
  assert.deepEqual(await paid.json(), { paymentNo: "PAYTEST", status: "paid" });
  assert.equal(paidConn.committed, true);
  const payment = paidConn.statements.find(([sql]) => sql.startsWith("INSERT INTO payments"));
  assert.equal(payment[1][3], 500, "server-side renewal price");
  assert.deepEqual(JSON.parse(payment[1].find((value) => typeof value === "string" && value.startsWith("{"))), { itemType: "membership_pause", itemName: "พักการใช้งานแพ็กเกจ 30 วัน", contentId: 31, membershipId: 5, startDate, days: 30 });
  assert.ok(paidConn.statements.some(([sql]) => sql.includes("INSERT INTO membership_pauses")));
  assert.ok(paidConn.statements.some(([sql, params]) => sql.includes("INSERT INTO wallet_ledger") && params.includes(88)), "ledger links the payment");
});

test("duplicate pending pause or renewal request is rejected", async () => {
  const { bangkokToday } = load("lib/court-availability.ts");
  const pauseConn = renewalConnection({ pending: [{ id: 70 }] });
  const pause = await renewalRoute("app/api/memberships/pause/route.ts", { membershipId: 5, startDate: addDays(bangkokToday(), 1), days: 15, method: "promptpay" }, pauseConn).POST(new Request("http://localhost/api/memberships/pause", { method: "POST" }));
  assert.equal(pause.status, 409);
  assert.equal(pauseConn.statements.some(([sql]) => sql.startsWith("INSERT INTO payments")), false);
  const [pendingSql, pendingParams] = pauseConn.statements.find(([sql]) => sql.includes("FROM payments"));
  assert.match(pendingSql, /status = 'created'/);
  assert.deepEqual(pendingParams, [2, "membership_pause", "5"]);

  const coupon = { id: 9, name: "คูปอง Fitness 10 ใบ", remainingUses: 3, status: "active", renewable: 1 };
  const renewConn = renewalConnection({ coupon, pending: [{ id: 71 }] });
  const renew = await renewalRoute("app/api/coupons/renew/route.ts", { userCouponId: 9, method: "promptpay" }, renewConn).POST(new Request("http://localhost/api/coupons/renew", { method: "POST" }));
  assert.equal(renew.status, 409);

  const freshConn = renewalConnection({ coupon });
  const created = await renewalRoute("app/api/coupons/renew/route.ts", { userCouponId: 9, method: "promptpay" }, freshConn).POST(new Request("http://localhost/api/coupons/renew", { method: "POST" }));
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { paymentNo: "PAYTEST", status: "created" });
  assert.equal(freshConn.statements.some(([sql]) => sql.startsWith("UPDATE user_coupons")), false, "PromptPay renewal waits for staff approval");
  const payment = freshConn.statements.find(([sql]) => sql.startsWith("INSERT INTO payments"));
  assert.deepEqual(JSON.parse(payment[1].find((value) => typeof value === "string" && value.startsWith("{"))), { itemType: "coupon_renewal", itemName: "ต่ออายุคูปอง · คูปอง Fitness 10 ใบ", contentId: 32, userCouponId: 9, months: 1 });
});

test("staff approval applies paid pause and coupon renewal requests", async () => {
  const pause = await approve({ itemType: "membership_pause", itemName: "พักการใช้งานแพ็กเกจ 30 วัน", membershipId: 5, startDate: "2026-01-05", days: 30 }, (sql) => {
    if (sql.includes("FROM memberships")) return [[{ id: 5, startsAt: "2025-06-01 10:00:00", endsAt: "2026-06-01 10:00:00", status: "active", metadata: '{"months":12,"pausesAllowed":2}', isCurrent: 1, startsBeforeEnd: 1 }]];
    if (sql.includes("FROM membership_pauses")) return [[]];
    return undefined;
  });
  assert.equal(pause.response.status, 200);
  assert.ok(pause.conn.statements.some(([sql]) => sql.includes("INSERT INTO membership_pauses")));

  const used = await approve({ itemType: "coupon_renewal", itemName: "ต่ออายุคูปอง", userCouponId: 9, months: 1 }, (sql) => (
    sql.includes("FROM user_coupons") ? [[{ id: 9, name: "x", remainingUses: 0, status: "used", renewable: 1 }]] : undefined
  ));
  assert.equal(used.response.status, 409);
  assert.equal(used.conn.rolledBack, true);
});

test("member QR is refused during an active pause", () => {
  for (const file of ["app/api/qr/route.ts", "app/api/admin/qr/verify/route.ts"]) {
    const source = readFileSync(file, "utf8");
    const memberQueries = source.split("\n").filter((line) => line.includes("FROM memberships"));
    assert.ok(memberQueries.length, file);
    for (const line of memberQueries) assert.match(line, /MEMBERSHIP_NOT_PAUSED|membership_pauses/, `${file}: ${line.trim().slice(0, 60)}`);
  }
  const { MEMBERSHIP_NOT_PAUSED } = load("lib/renewals.ts", { "@/lib/db": { query: async () => [] } });
  assert.match(MEMBERSHIP_NOT_PAUSED, /NOT EXISTS \(SELECT 1 FROM membership_pauses mp WHERE mp\.membership_id = memberships\.id AND mp\.status = 'active' AND mp\.starts_at <= NOW\(\) AND mp\.ends_at > NOW\(\)\)/);
});

function groupConnection({ group = { id: 3, ownerUserId: 9, maxPlayers: 2, status: "active", isOpen: 1 }, members = [{ userId: 9 }] } = {}) {
  return recordingConnection((sql) => {
    if (sql.includes("FROM groups_clubs")) return [group ? [group] : []];
    if (sql.includes("FROM group_members")) return [members];
    if (sql.startsWith("INSERT INTO groups_clubs")) return [{ insertId: 55 }];
    return undefined;
  });
}

function groupRoute(file, body, conn, extraDb = {}) {
  return load(file, {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => body, validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": { query: async () => [{ id: 3 }], pool: { getConnection: async () => conn }, ...extraDb },
  });
}

const joinRequest = (method = "POST") => new Request("http://localhost/api/groups/join", { method });

test("joining a full group is rejected under the group row lock", async () => {
  const full = groupConnection({ members: [{ userId: 9 }, { userId: 10 }] });
  const rejected = await groupRoute("app/api/groups/join/route.ts", { groupId: 3 }, full).POST(joinRequest());
  assert.equal(rejected.status, 409);
  assert.match(full.statements[0][0], /FROM groups_clubs WHERE id = \? FOR UPDATE/);
  assert.equal(full.statements.some(([sql]) => sql.startsWith("INSERT INTO group_members")), false);
  assert.equal(full.rolledBack, true);

  const open = groupConnection();
  const joined = await groupRoute("app/api/groups/join/route.ts", { groupId: 3 }, open).POST(joinRequest());
  assert.equal(joined.status, 201);
  const lockIndex = open.statements.findIndex(([sql]) => sql.includes("FOR UPDATE"));
  const insertIndex = open.statements.findIndex(([sql]) => sql.startsWith("INSERT INTO group_members"));
  assert.ok(lockIndex === 0 && insertIndex > lockIndex, "lock the group before inserting");
  assert.deepEqual(open.statements[insertIndex][1], [3, 2]);
  assert.equal(open.committed, true);

  for (const group of [null, { id: 3, ownerUserId: 9, maxPlayers: 4, status: "archived", isOpen: 1 }, { id: 3, ownerUserId: 9, maxPlayers: 4, status: "active", isOpen: 0 }]) {
    const closed = await groupRoute("app/api/groups/join/route.ts", { groupId: 3 }, groupConnection({ group })).POST(joinRequest());
    assert.equal(closed.status, 404);
  }
});

test("joining twice is idempotent", async () => {
  const conn = groupConnection({ group: { id: 3, ownerUserId: 9, maxPlayers: 2, status: "active", isOpen: 1 }, members: [{ userId: 9 }, { userId: 2 }] });
  const response = await groupRoute("app/api/groups/join/route.ts", { groupId: 3 }, conn).POST(joinRequest());
  assert.equal(response.status, 200);
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT INTO group_members")), false);
});

test("owner cannot leave own group", async () => {
  const owner = groupConnection({ group: { id: 3, ownerUserId: 2, maxPlayers: 4, status: "active", isOpen: 1 } });
  assert.equal((await groupRoute("app/api/groups/join/route.ts", { groupId: 3 }, owner).DELETE(joinRequest("DELETE"))).status, 409);
  assert.equal(owner.statements.some(([sql]) => sql.startsWith("DELETE FROM group_members")), false);

  const member = groupConnection();
  assert.equal((await groupRoute("app/api/groups/join/route.ts", { groupId: 3 }, member).DELETE(joinRequest("DELETE"))).status, 200);
  assert.deepEqual(member.statements.find(([sql]) => sql.startsWith("DELETE FROM group_members"))[1], [3, 2]);
});

test("create stores owner as first member and rejects past playAt", async () => {
  const bangkokLocal = (offsetMs) => new Date(Date.now() + offsetMs + 7 * 3_600_000).toISOString().slice(0, 16);
  const past = groupConnection();
  const pastResponse = await groupRoute("app/api/groups/route.ts", { sportSlug: "badminton", name: "Evening", levelName: "มือใหม่", maxPlayers: 4, playAt: bangkokLocal(-3_600_000) }, past).POST(new Request("http://localhost/api/groups", { method: "POST" }));
  assert.equal(pastResponse.status, 400);
  assert.equal(past.statements.length, 0);
  const far = await groupRoute("app/api/groups/route.ts", { sportSlug: "badminton", name: "Evening", levelName: "มือใหม่", maxPlayers: 4, playAt: bangkokLocal(61 * 86_400_000) }, groupConnection()).POST(new Request("http://localhost/api/groups", { method: "POST" }));
  assert.equal(far.status, 400);

  const conn = groupConnection();
  const playAt = bangkokLocal(2 * 86_400_000);
  const response = await groupRoute("app/api/groups/route.ts", { sportSlug: "badminton", name: "Evening", levelName: "มือใหม่", maxPlayers: 6, playAt }, conn).POST(new Request("http://localhost/api/groups", { method: "POST" }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, groupId: 55 });
  const [groupSql, groupParams] = conn.statements.find(([sql]) => sql.startsWith("INSERT INTO groups_clubs"));
  assert.match(groupSql, /max_players, play_at/);
  assert.deepEqual(groupParams, [2, 3, "Evening", "มือใหม่", 6, `${playAt.replace("T", " ")}:00`, null]);
  assert.deepEqual(conn.statements.find(([sql]) => sql.startsWith("INSERT INTO group_members"))[1], [55, 2]);
  assert.equal(conn.committed, true);
});

test("group listing reports players, open spots and the caller's membership", async () => {
  let seen;
  const { listGroups } = load("lib/groups.ts", { "@/lib/db": { query: async (sql, params) => { seen = [sql, params]; return []; } } });
  await listGroups(2, 500);
  assert.match(seen[0], /COUNT\(\*\) FROM group_members gm WHERE gm\.group_id = g\.id\) memberCount/);
  assert.match(seen[0], /g\.play_at IS NULL OR g\.play_at > NOW\(\) - INTERVAL 1 HOUR/);
  assert.match(seen[0], /LIMIT 50$/);
  assert.deepEqual(seen[1], [2, 2]);
});

test("bootstrap returns coupon purchase date, total uses and new datasets", async () => {
  const seen = [];
  const route = load("app/api/bootstrap/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2, displayName: "Member", memberCode: "PPA-1" }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test" },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return []; } },
  });
  const response = await route.GET();
  const body = await response.json();
  for (const key of ["coupons", "expiredCoupons", "memberships", "membershipPauses", "pendingPayments", "walletLedger", "groups"]) assert.ok(Array.isArray(body[key]), key);
  const sqlFor = (pattern) => seen.filter(([sql]) => pattern.test(sql));
  const [activeCoupons] = sqlFor(/FROM user_coupons uc[\s\S]*uc\.expires_at > NOW\(\)/);
  assert.match(activeCoupons[0], /uc\.created_at purchasedAt/);
  assert.match(activeCoupons[0], /COALESCE\(uc\.total_uses, c\.total_uses\) totalUses/);
  const [expired] = sqlFor(/uc\.expires_at <= NOW\(\)/);
  assert.match(expired[0], /uc\.remaining_uses > 0/);
  assert.match(expired[0], /INTERVAL 30 DAY/);
  assert.match(sqlFor(/FROM memberships/)[0][0], /CAST\(metadata AS CHAR\) metadata/);
  // All pauses of still-active memberships (ended ones too) so the app can show used/allowed pauses.
  assert.match(sqlFor(/FROM membership_pauses/)[0][0], /JOIN memberships m ON m\.id = mp\.membership_id WHERE mp\.user_id = \? AND mp\.status = 'active' AND m\.status = 'active' AND m\.ends_at > NOW\(\)/);
  assert.match(sqlFor(/FROM payments/)[0][0], /status = 'created'/);
  assert.match(sqlFor(/FROM wallet_ledger/)[0][0], /LIMIT 20/);
  assert.ok(sqlFor(/FROM groups_clubs/).length, "groups use listGroups");
  for (const [sql, params] of seen) if (!/FROM sports|FROM trainers|FROM app_content_items/.test(sql)) assert.ok(params?.includes(2), `user scoped: ${sql.slice(0, 50)}`);
});

test("coupon admin persists sort order and metadata", async () => {
  const seen = [];
  const body = { code: "FIT-COUPON-10", name: "คูปอง Fitness 10 ใบ", category: "fitness", price: 1600, totalUses: 10, validityDays: 60, active: true, sortOrder: 15, metadata: { tab: "coupon", group: "c10", variant: "base", badge: "BEST SELLER" } };
  const mocks = (input) => ({
    "@/lib/admin-auth": { assertAdminRequest: async () => null },
    "@/lib/security": { parseJsonBody: async () => input, validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return []; } },
  });
  const { NextRequest } = require("next/server");
  await load("app/api/admin/coupons/route.ts", mocks(body)).POST(new NextRequest("http://localhost/api/admin/coupons", { method: "POST" }));
  const [insertSql, insertParams] = seen.find(([sql]) => sql.startsWith("INSERT INTO coupons"));
  assert.match(insertSql, /sort_order, metadata/);
  assert.deepEqual(insertParams.slice(-2), [15, JSON.stringify(body.metadata)]);
  await load("app/api/admin/coupons/route.ts", mocks({ ...body, id: 4, sortOrder: 20 })).PUT(new NextRequest("http://localhost/api/admin/coupons", { method: "PUT" }));
  const [updateSql, updateParams] = seen.find(([sql]) => sql.startsWith("UPDATE coupons SET code"));
  assert.match(updateSql, /sort_order = COALESCE\(\?, sort_order\), metadata = COALESCE\(\?, metadata\)/);
  assert.deepEqual(updateParams.slice(-3), [20, JSON.stringify(body.metadata), 4]);
  assert.match(seen.find(([sql]) => sql.startsWith("SELECT id, code"))[0], /sort_order sortOrder, CAST\(metadata AS CHAR\) metadata/);
});

test("coupon renewal preview adds months like SQL DATE_ADD, clamping to month end", () => {
  const { addMonthsClamped } = load("lib/package-presentation.ts");
  const at = (iso) => Date.parse(iso);
  assert.equal(new Date(addMonthsClamped(at("2027-01-31T10:00:00+07:00"), 1)).toISOString(), "2027-02-28T03:00:00.000Z");
  assert.equal(new Date(addMonthsClamped(at("2028-01-31T10:00:00+07:00"), 1)).toISOString(), "2028-02-29T03:00:00.000Z");
  assert.equal(new Date(addMonthsClamped(at("2026-11-15T23:30:00+07:00"), 1)).toISOString(), "2026-12-15T16:30:00.000Z");
  assert.equal(new Date(addMonthsClamped(at("2026-12-31T00:00:00+07:00"), 2)).toISOString(), "2027-02-27T17:00:00.000Z");
});

test("member screens only use translated message keys", () => {
  const { allMessages } = load("lib/i18n/index.ts");
  const keys = new Set(allMessages.map(([key]) => key));
  const files = ["components/ppa-app.tsx", "components/booking-calendar.tsx", ...readdirSync("components").filter((name) => /^(member-.*|gymnos-hub)\.tsx$/.test(name)).map((name) => `components/${name}`)];
  const missing = [];
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) if (!keys.has(match[1])) missing.push(`${file}: ${match[1]}`);
  }
  assert.deepEqual(missing, []);
});

test("slot times are labelled today, tomorrow or later in Bangkok time", () => {
  const { playDayKind } = load("lib/package-presentation.ts");
  const now = Date.parse("2026-10-31T23:30:00+07:00");
  assert.equal(playDayKind("2026-10-31T23:50:00+07:00", now), "today");
  assert.equal(playDayKind("2026-11-01T00:10:00+07:00", now), "tomorrow");
  assert.equal(playDayKind("2026-11-01T16:59:00Z", now), "tomorrow");
  assert.equal(playDayKind("2026-11-01T17:00:00Z", now), "later");
  assert.equal(playDayKind(null, now), null);
  assert.equal(playDayKind("not a date", now), null);
});

const richMenuButtons = [["หน้าหลัก", "home"], ["แพ็กเกจ", "plans"], ["คูปอง", "coupon"], ["จองสนาม", "sports"], ["วอลเล็ต", "wallet"], ["ช่วยเหลือ", "help"]];

test("rich menu has the six requested buttons in order", () => {
  const menu = JSON.parse(readFileSync("config/line-rich-menu-main.json", "utf8"));
  const buttons = menu.areas.map((area) => [area.action.label, new URL(area.action.uri.replace("__PPA_LIFF_URL__", "https://liff.line.me/test")).searchParams.get("screen")]);
  assert.deepEqual(buttons, richMenuButtons);
  assert.deepEqual(menu.areas.map((area) => [area.bounds.x, area.bounds.y]), [[0, 0], [834, 0], [1667, 0], [0, 843], [834, 843], [1667, 843]]);
  assert.equal(menu.areas.reduce((sum, area) => sum + area.bounds.width * area.bounds.height, 0), menu.size.width * menu.size.height, "areas tile the whole menu");
  const { richMenuScreens } = load("lib/rich-menu.ts");
  for (const [, screen] of richMenuButtons) assert.ok(richMenuScreens.includes(screen), `${screen} is a deep-link screen`);
  const svgTitles = [...readFileSync("public/line/rich-menu-main.svg", "utf8").matchAll(/class="title">([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(svgTitles, richMenuButtons.map(([label]) => label), "artwork matches the tap areas");
});

test("deep link reads screen from query or liff.state", () => {
  const { screenFromSearch, richMenuScreens } = load("lib/rich-menu.ts");
  assert.equal(screenFromSearch("?screen=plans", richMenuScreens), "plans");
  assert.equal(screenFromSearch("?liff.state=%3Fscreen%3Dplans", richMenuScreens), "plans");
  assert.equal(screenFromSearch("?liff.state=%2F%3Fscreen%3Dcoupon%26from%3Drichmenu", richMenuScreens), "coupon");
  assert.equal(screenFromSearch("?screen=admin", richMenuScreens), null);
  assert.equal(screenFromSearch("?liff.state=%3Fscreen%3Dadmin", richMenuScreens), null);
  assert.equal(screenFromSearch("", richMenuScreens), null);
  assert.equal(screenFromSearch("?liff.state=%E0%A4%A", richMenuScreens), null, "malformed liff.state is ignored");
});

test("rich menu PNG is 2500x1686 and under 1 MB", () => {
  const png = readFileSync("public/line/rich-menu-main.png");
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [2500, 1686]);
  assert.ok(png.length < 1024 * 1024, `PNG is ${png.length} bytes; LINE allows 1 MB`);
  assert.ok(statSync("public/line/rich-menu-main.png").mtimeMs >= statSync("public/line/rich-menu-main.svg").mtimeMs, "PNG was rendered from the current SVG");
});

test("closing a group rejects cross-site requests before any write", async () => {
  const seen = [];
  const security = load("lib/security.ts");
  const route = load("app/api/groups/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { ...security, checkRateLimit: () => null, clientIp: async () => "test" },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return { affectedRows: 1 }; }, pool: {} },
  });
  const { NextRequest } = require("next/server");
  const crossSite = await route.DELETE(new NextRequest("http://localhost/api/groups?id=5", { method: "DELETE", headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" } }));
  assert.equal(crossSite.status, 403);
  assert.equal(seen.length, 0);
  const sameSite = await route.DELETE(new NextRequest("http://localhost/api/groups?id=5", { method: "DELETE", headers: { "sec-fetch-site": "same-origin" } }));
  assert.equal(sameSite.status, 200);
  assert.deepEqual(seen[0][1], [5, 2]);
});

test("a waiting request blocks until it is resolved and members can cancel their own unpaid request", async () => {
  const renewals = load("lib/renewals.ts", { "@/lib/db": { query: async () => [] } });
  const conn = renewalConnection();
  await renewals.assertNoPendingRequest(conn, { userId: 2, itemType: "membership_pause", refKey: "membershipId", refId: 5 });
  assert.doesNotMatch(conn.statements[0][0], /created_at/, "no age window: an old request stays approvable, so it must keep blocking");
  const seen = [];
  const bootstrap = load("app/api/bootstrap/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test" },
    "@/lib/db": { query: async (sql) => { seen.push(sql); return []; } },
  });
  await bootstrap.GET();
  const pendingSql = seen.find((sql) => sql.includes("FROM payments"));
  assert.doesNotMatch(pendingSql, /created_at >/);
  assert.match(pendingSql, /slip_uploaded_at slipUploadedAt/);

  const writes = [];
  const rows = { PAYMINE1234: { id: 9, status: "created", slipUploadedAt: null }, PAYSLIP1234: { id: 10, status: "created", slipUploadedAt: "2026-10-31 10:00:00" }, PAYPAID1234: { id: 11, status: "paid", slipUploadedAt: null } };
  const cancel = load("app/api/payments/cancel/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async (request) => JSON.parse(await request.text()), validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": { query: async (sql, params) => {
      if (sql.startsWith("UPDATE")) { writes.push(params); return { affectedRows: 1 }; }
      return rows[params[0]] && params[1] === 2 ? [rows[params[0]]] : [];
    } },
  });
  const call = (paymentNo) => cancel.POST(new Request("http://localhost/api/payments/cancel", { method: "POST", body: JSON.stringify({ paymentNo }) }));
  assert.equal((await call("PAYMINE1234")).status, 200);
  assert.deepEqual(writes[0], [9, 2]);
  assert.equal((await call("PAYSLIP1234")).status, 409, "after a slip is sent only staff can resolve it");
  assert.equal((await call("PAYPAID1234")).status, 409);
  assert.equal((await call("PAYOTHER123")).status, 404);
  assert.equal(writes.length, 1);
});

test("editing a coupon without catalog fields keeps its package-page metadata and order", async () => {
  assert.match(readFileSync("app/AdminConsole/page.tsx", "utf8"), /FROM coupons[^"]*"|sort_order sortOrder, CAST\(metadata AS CHAR\) metadata FROM coupons/);
  assert.match(readFileSync("app/AdminConsole/page.tsx", "utf8"), /validity_days validityDays, active, sort_order sortOrder, CAST\(metadata AS CHAR\) metadata FROM coupons/, "AdminConsole loads coupon metadata so edits round-trip");
  const seen = [];
  const body = { id: 4, code: "FIT-COUPON-120", name: "คูปอง Fitness 120 ใบ", category: "fitness", price: 11000, totalUses: 120, validityDays: 365, active: true };
  const route = load("app/api/admin/coupons/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null },
    "@/lib/security": { parseJsonBody: async () => body, validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return []; } },
  });
  const { NextRequest } = require("next/server");
  await route.PUT(new NextRequest("http://localhost/api/admin/coupons", { method: "PUT" }));
  const [sql, params] = seen.find(([statement]) => statement.startsWith("UPDATE coupons SET code"));
  assert.match(sql, /sort_order = COALESCE\(\?, sort_order\), metadata = COALESCE\(\?, metadata\)/);
  assert.deepEqual(params.slice(-3), [null, null, 4], "absent fields leave the stored values untouched");
});

test("a retried wallet checkout replays the first result instead of charging twice", async () => {
  const schema = readFileSync("database/schema.sql", "utf8");
  assert.match(schema, /ALTER TABLE payments ADD COLUMN IF NOT EXISTS request_id VARCHAR\(64\) NULL/);
  assert.match(schema, /ALTER TABLE payments ADD UNIQUE KEY IF NOT EXISTS uq_payments_user_request \(user_id, request_id\)/);
  const coupon = { id: 9, name: "คูปอง Fitness 10 ใบ", remainingUses: 3, status: "active", renewable: 1 };
  const body = { userCouponId: 9, method: "wallet", requestId: "req-1234-abcd" };

  const replayConn = recordingConnection((sql) => {
    if (sql.includes("request_id = ?")) return [[{ paymentNo: "PAYFIRST123", status: "paid" }]];
    if (sql.includes("FROM user_coupons")) return [[coupon]];
    return undefined;
  });
  const replay = await renewalRoute("app/api/coupons/renew/route.ts", body, replayConn).POST(new Request("http://localhost/api/coupons/renew", { method: "POST" }));
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { paymentNo: "PAYFIRST123", status: "paid", replayed: true });
  assert.equal(replayConn.statements.some(([sql]) => sql.startsWith("INSERT INTO payments") || sql.includes("wallet_accounts")), false, "no second payment or debit");

  let lookups = 0;
  const raceConn = recordingConnection((sql) => {
    if (sql.includes("request_id = ?")) return [lookups++ ? [{ paymentNo: "PAYWINNER12", status: "paid" }] : []];
    if (sql.includes("FROM user_coupons")) return [[coupon]];
    if (sql.includes("FROM payments")) return [[]];
    if (sql.startsWith("INSERT INTO payments")) throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    return undefined;
  });
  const raced = await renewalRoute("app/api/coupons/renew/route.ts", body, raceConn).POST(new Request("http://localhost/api/coupons/renew", { method: "POST" }));
  assert.equal(raced.status, 200, "the unique key turns a concurrent duplicate into a replay");
  assert.deepEqual(await raced.json(), { paymentNo: "PAYWINNER12", status: "paid", replayed: true });
  assert.equal(raceConn.rolledBack, true);
  assert.equal(raceConn.statements.some(([sql]) => sql.includes("wallet_accounts")), false);

  const [insertSql, insertParams] = recordingFirstInsert(await (async () => {
    const conn = renewalConnection({ coupon });
    await renewalRoute("app/api/coupons/renew/route.ts", body, conn).POST(new Request("http://localhost/api/coupons/renew", { method: "POST" }));
    return conn;
  })());
  assert.match(insertSql, /request_id/);
  assert.ok(insertParams.includes("req-1234-abcd"));
});

function recordingFirstInsert(conn) {
  return conn.statements.find(([sql]) => sql.startsWith("INSERT INTO payments"));
}

test("package, coupon and top-up checkouts are idempotent per request id", async () => {
  const existing = (sql) => (sql.includes("request_id = ?") ? [[{ paymentNo: "PAYFIRST123", status: "paid" }]] : undefined);
  const security = (body) => ({ checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => body, validationErrorResponse: () => Response.json({}, { status: 400 }), secureResponse: (response) => response });
  const auth = { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) };

  const paymentsConn = recordingConnection(existing);
  const payments = load("app/api/payments/route.ts", {
    "@/lib/auth": auth,
    "@/lib/booking-rules": { expirePendingBookings: async () => {} },
    "@/lib/security": security({ contentId: 3, method: "wallet", requestId: "req-pay-0001" }),
    "@/lib/payment-catalog": { resolvePaymentItem: async () => ({ amount: 2000, itemName: "Fitness 1 เดือน", itemType: "membership", contentId: 3, grant: { months: 1 } }) },
    "@/lib/db": { query: async () => [], createPublicId: (prefix) => `${prefix}NEW`, pool: { getConnection: async () => paymentsConn } },
  });
  const paymentReplay = await payments.POST(new Request("http://localhost/api/payments", { method: "POST" }));
  assert.equal(paymentReplay.status, 200);
  assert.deepEqual(await paymentReplay.json(), { paymentNo: "PAYFIRST123", status: "paid", replayed: true });
  assert.equal(paymentsConn.statements.some(([sql]) => sql.includes("wallet_accounts") || sql.startsWith("INSERT")), false);

  const couponConn = recordingConnection(existing);
  const coupons = load("app/api/coupons/buy/route.ts", {
    "@/lib/auth": auth,
    "@/lib/security": security({ couponId: 3, method: "wallet", requestId: "req-cpn-0001" }),
    "@/lib/db": { createPublicId: (prefix) => `${prefix}NEW`, pool: { getConnection: async () => couponConn } },
  });
  const couponReplay = await coupons.POST(new Request("http://localhost/api/coupons/buy", { method: "POST" }));
  assert.deepEqual(await couponReplay.json(), { ok: true, paymentNo: "PAYFIRST123", status: "paid", replayed: true });
  assert.equal(couponConn.statements.some(([sql]) => sql.includes("wallet_accounts") || sql.startsWith("INSERT")), false);

  const topupConn = recordingConnection(existing);
  const topup = load("app/api/wallet/topup/route.ts", {
    "@/lib/auth": auth,
    "@/lib/security": security({ amount: 500, requestId: "req-top-0001" }),
    "@/lib/db": { createPublicId: (prefix) => `${prefix}NEW`, pool: { getConnection: async () => topupConn } },
  });
  assert.deepEqual(await (await topup.POST(new Request("http://localhost/api/wallet/topup", { method: "POST" }))).json(), { ok: true, paymentNo: "PAYFIRST123", status: "paid", replayed: true });
  assert.equal(topupConn.statements.some(([sql]) => sql.startsWith("INSERT INTO payments")), false);
});

test("db:init never overwrites operator-edited sports, courts, coupons, trainers or app content", () => {
  for (const marker of ["'gym', 'Gym & HYROX'", "CONCAT('สนาม ', n.n)", "'FIT-DROPIN'", "('alex', 'Alex Tan'", "'hyrox-challenge-2026'"]) {
    const statement = statements.find((item) => item.includes(marker));
    assert.ok(statement, marker);
    assert.match(statement, /^INSERT IGNORE INTO/, `${marker} must be insert-only`);
    assert.doesNotMatch(statement, /ON DUPLICATE KEY UPDATE/, marker);
  }
});

test("year-based plan names grant whole years when metadata is missing", () => {
  const { legacyMembershipMonths } = load("lib/package-grant.ts");
  assert.equal(legacyMembershipMonths("Fitness 1 ปี"), 12);
  assert.equal(legacyMembershipMonths("Swim 2 years"), 24);
  assert.equal(legacyMembershipMonths("Gold 5 ปี"), 1, "beyond the 36-month cap falls back to the safe default");
});

test("home Find Your Game lists open groups before full ones", async () => {
  let seen;
  const { listGroups } = load("lib/groups.ts", { "@/lib/db": { query: async (sql) => { seen = sql; return []; } } });
  await listGroups(2, 12);
  assert.match(seen, /ORDER BY \(SELECT COUNT\(\*\) FROM group_members gm2 WHERE gm2\.group_id = g\.id\) >= g\.max_players, g\.play_at IS NULL, g\.play_at/);
});

test("pause length follows the admin limit and the message does not hard-code 60 days", async () => {
  const renewals = load("lib/renewals.ts", { "@/lib/db": { query: async () => [] } });
  await assert.rejects(
    renewals.checkPauseRequest(renewalConnection(), { userId: 2, membershipId: 5, startDate: "2026-11-05", days: 45, today: "2026-11-01", maxDays: 30 }),
    (error) => error instanceof renewals.RenewalError && error.message === "จำนวนวันพักเกินกว่าที่กำหนด",
  );
  const { pauseDayChoices } = load("lib/package-presentation.ts");
  assert.deepEqual(pauseDayChoices(30), [7, 15, 30]);
  assert.deepEqual(pauseDayChoices(undefined), [7, 15, 30, 45, 60]);
  assert.deepEqual(pauseDayChoices(20), [7, 15, 20]);
});

test("member QR explains that access is paused instead of saying there is no package", async () => {
  const { qrErrorKey } = load("lib/qr-presentation.ts");
  assert.equal(qrErrorKey(404, "member", "MEMBERSHIP_PAUSED"), "qr.error.paused");
  assert.equal(qrErrorKey(404, "member"), "qr.error.membership");
  const route = load("app/api/qr/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 7 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", secureResponse: (response) => response },
    "@/lib/db": { query: async (sql) => (sql.includes("JOIN membership_pauses") ? [{ pausedUntil: "2026-12-05 00:00:00" }] : []), pool: {} },
  });
  const { NextRequest } = require("next/server");
  const response = await route.GET(new NextRequest("http://localhost/api/qr?purpose=member"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: "MEMBERSHIP_PAUSED", message: "แพ็กเกจอยู่ระหว่างพักการใช้งาน", pausedUntil: "2026-12-05 00:00:00" });
});
