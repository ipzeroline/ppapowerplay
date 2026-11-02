import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load, require } from "./load-ts.mjs";

// Phase 4 (docs/superpowers/plans/2026-11-02-ppa-counter-operations.md): counter bookings, court blocks,
// cash-up, receipts, reminders, report periods, backups.

const schema = () => readFileSync("database/schema.sql", "utf8");

test("schema adds the walk-in system user, guest columns on bookings and court blocks", () => {
  const sql = schema();
  assert.match(sql, /INSERT IGNORE INTO users \(line_user_id, display_name, member_code, status\)\s*VALUES \('system:walk-in', 'ลูกค้าหน้าเคาน์เตอร์', 'WALK-IN', 'active'\)/);
  for (const column of ["guest_name VARCHAR\\(160\\) NULL", "guest_phone VARCHAR\\(32\\) NULL", "series_key VARCHAR\\(64\\) NULL", "created_by BIGINT UNSIGNED NULL"]) {
    assert.match(sql, new RegExp(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ${column}`));
  }
  assert.match(sql, /ALTER TABLE bookings ADD INDEX IF NOT EXISTS idx_bookings_series \(series_key\)/);
  const blocks = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS court_blocks"));
  assert.match(blocks, /court_id BIGINT UNSIGNED NOT NULL/);
  assert.match(blocks, /reason VARCHAR\(160\) NOT NULL/);
  assert.match(blocks, /cancelled_at DATETIME NULL/);
  assert.match(blocks, /KEY idx_court_blocks_slot \(court_id, starts_at, ends_at\)/);
  assert.match(blocks, /FOREIGN KEY \(court_id\) REFERENCES courts\(id\)/);
});

test("availability treats an active court block like a booked slot", async () => {
  const statements = [];
  const route = load("app/api/courts/availability/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 1 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", secureResponse: (response) => response, validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": { query: async (sql) => {
      statements.push(sql);
      if (sql.includes("FROM sports")) return [{ id: 1, baseRate: 200 }];
      if (sql.includes("FROM courts WHERE sport_id")) return [{ id: 1, name: "Court A", capacity: 4 }];
      return [{ courtId: 1, startsAt: "2099-02-01 18:00:00", endsAt: "2099-02-01 20:00:00" }];
    } },
  });
  const body = await (await route.GET(new Request("http://localhost/api/courts/availability?sport=badminton&date=2099-02-01"))).json();
  const at = (time) => body.slots.find((slot) => slot.time === time);
  assert.equal(at("18:00").available, false);
  assert.equal(at("19:00").available, false);
  assert.equal(at("20:00").available, true);
  const occupancy = statements.at(-1);
  assert.match(occupancy, /UNION ALL SELECT court_id courtId, .* FROM court_blocks WHERE court_id IN \(\?\) AND cancelled_at IS NULL AND starts_at < \? AND ends_at > \?/);
  assert.equal(statements.length, 3, "blocks come with the booking occupancy query, not an extra query");
});

function memberBookingConnection(blockRows) {
  const statements = [];
  let rolledBack = false;
  return {
    statements,
    get rolledBack() { return rolledBack; },
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => { rolledBack = true; }, release: () => {},
    execute: async (sql, params) => {
      statements.push([sql, params]);
      if (sql.includes("FROM courts")) return [[{ id: 1, capacity: 4, hourlyRate: 200 }]];
      if (sql.includes("FROM court_blocks")) return [blockRows];
      if (sql.includes("FROM bookings")) return [[]];
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}

test("a member cannot book a blocked slot", async () => {
  const conn = memberBookingConnection([{ id: 5 }]);
  const route = load("app/api/bookings/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 1 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => ({ sportSlug: "badminton", courtId: 1, date: "2099-02-01", time: "18:00", durationHours: 1, players: 2 }) },
    "@/lib/db": { createPublicId: (prefix) => `${prefix}TEST`, pool: { getConnection: async () => conn }, query: async (sql) => sql.includes("FROM sports") ? [{ id: 1, requiresBooking: true, baseRate: 200, name: "Badminton" }] : [{ id: 1, capacity: 4, name: "Court A" }] },
  });
  const response = await route.POST(new Request("http://localhost/api/bookings", { method: "POST" }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).message, "ช่วงเวลานี้ไม่เปิดให้จอง");
  assert.ok(conn.rolledBack);
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT")), false);
  const blockCheck = conn.statements.find(([sql]) => sql.includes("FROM court_blocks"));
  assert.match(blockCheck[0], /cancelled_at IS NULL AND starts_at < \? AND ends_at > \? .*FOR UPDATE/);
  assert.deepEqual(blockCheck[1], [1, "2099-02-01 19:00:00", "2099-02-01 18:00:00"]);
});

test("the walk-in user is never counted or listed as a member", async () => {
  const { WALK_IN_LINE_ID, notWalkIn } = load("lib/walk-in.ts", { "@/lib/db": {} });
  assert.equal(WALK_IN_LINE_ID, "system:walk-in");
  assert.equal(notWalkIn(), "u.line_user_id <> 'system:walk-in'");
  assert.equal(notWalkIn("users"), "users.line_user_id <> 'system:walk-in'");

  const seen = [];
  const { loadDashboard } = load("lib/admin-dashboard.ts", { "@/lib/db": { query: async () => [] } });
  await loadDashboard((code) => ["dashboard.view", "members.manage"].includes(code), async (sql) => { seen.push(sql); return []; });
  assert.match(seen.find((sql) => sql.includes("newToday")), /line_user_id <> 'system:walk-in'/);

  const memberSql = [];
  const route = load("app/api/admin/members/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => null, adminSessionCookieName: () => "session" },
    "@/lib/db": { pool: {}, query: async (sql) => { memberSql.push(sql); return []; } },
  });
  const { NextRequest } = require("next/server");
  await route.GET(new NextRequest("http://localhost/api/admin/members?search=PPA&page=1"));
  assert.match(memberSql.at(-1), /line_user_id <> 'system:walk-in'/);
  assert.match(readFileSync("app/AdminConsole/page.tsx", "utf8"), /FROM users u WHERE u\.line_user_id <> 'system:walk-in' ORDER BY/);
});

test("courtConflict reports a booked slot before a blocked one and locks both reads", async () => {
  const { courtConflict } = load("lib/court-schedule.ts", { "@/lib/db": {} });
  const run = (bookings, blocks) => {
    const statements = [];
    const conn = { execute: async (sql, params) => { statements.push([sql, params]); return [sql.includes("FROM court_blocks") ? blocks : bookings]; } };
    return { statements, verdict: courtConflict(conn, 3, "2099-02-01 19:00:00", "2099-02-01 20:00:00") };
  };
  const booked = run([{ id: 1 }], [{ id: 2 }]);
  assert.equal(await booked.verdict, "booked");
  assert.equal(booked.statements.length, 1);
  assert.match(booked.statements[0][0], /status IN \('paid','checked_in'\) OR \(status IN \('hold','pending_payment'\) AND \(expires_at IS NULL OR expires_at > NOW\(\)\)\).*FOR UPDATE/);
  assert.deepEqual(booked.statements[0][1], [3, "2099-02-01 20:00:00", "2099-02-01 19:00:00"]);
  const blocked = run([], [{ id: 2 }]);
  assert.equal(await blocked.verdict, "blocked");
  assert.equal((await run([], []).verdict), null);
});

// ---------- Task 2: counter booking API ----------

test("weeklyDates gives one date per week across month and year ends", () => {
  const { weeklyDates } = load("lib/counter-booking.ts");
  assert.deepEqual(weeklyDates("2099-01-25", 3), ["2099-01-25", "2099-02-01", "2099-02-08"]);
  assert.deepEqual(weeklyDates("2099-12-28", 2), ["2099-12-28", "2100-01-04"]);
  assert.deepEqual(weeklyDates("2099-03-01", 1), ["2099-03-01"]);
});

test("counter booking requests are validated: guest phone, weeks, duration", () => {
  const { counterBookingSchema } = load("lib/counter-booking.ts");
  const base = { courtId: 3, date: "2099-02-02", time: "18:00", durationHours: 1, players: 2, customer: { kind: "guest", name: "คุณเอ", phone: "081-234-5678" }, repeatWeeks: 1, payNow: null, requestId: "req-counter-0001" };
  assert.equal(counterBookingSchema.safeParse(base).success, true);
  assert.equal(counterBookingSchema.safeParse({ ...base, customer: { kind: "guest", name: "คุณเอ", phone: "abc" } }).success, false);
  assert.equal(counterBookingSchema.safeParse({ ...base, customer: { kind: "guest", name: " ", phone: "0812345678" } }).success, false);
  assert.equal(counterBookingSchema.safeParse({ ...base, repeatWeeks: 13 }).success, false);
  assert.equal(counterBookingSchema.safeParse({ ...base, durationHours: 5 }).success, false);
  assert.equal(counterBookingSchema.safeParse({ ...base, payNow: { method: "wallet" } }).success, false);
  assert.equal(counterBookingSchema.safeParse({ ...base, customer: { kind: "member", userId: 12 }, payNow: { method: "cash" } }).success, true);
});

function counterConnection({ member = { id: 12, status: "active", displayName: "นภัสสร", lineUserId: "U123" }, booked = [], blocked = [], replay = [] } = {}) {
  const statements = [];
  let insertId = 100;
  let rolledBack = false;
  let committed = false;
  return {
    statements,
    get rolledBack() { return rolledBack; },
    get committed() { return committed; },
    beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => { rolledBack = true; }, release: () => {},
    execute: async (sql, params = []) => {
      statements.push([sql, params]);
      if (sql.includes("FROM courts c JOIN sports s")) return [[{ id: 3, name: "Court A", capacity: 4, hourlyRate: 200, status: "available", sportId: 1, sportName: "แบดมินตัน", baseRate: 150 }]];
      if (sql.includes("WHERE series_key = ?")) return [replay];
      if (sql.includes("FROM users WHERE line_user_id = ?")) return [[{ id: 99 }]];
      if (sql.includes("FROM users WHERE id = ?")) return [member ? [member] : []];
      if (sql.includes("FROM bookings WHERE court_id")) return [booked.some((day) => String(params[1]).startsWith(day)) ? [{ id: 1 }] : []];
      if (sql.includes("FROM court_blocks")) return [blocked.some((day) => String(params[1]).startsWith(day)) ? [{ id: 2 }] : []];
      if (sql.startsWith("INSERT")) return [{ affectedRows: 1, insertId: insertId++ }];
      return [[]];
    },
  };
}

function counterRoute(conn, body, record = { notices: [], pushes: [] }) {
  let id = 0;
  return load("app/api/admin/bookings/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7, displayName: "ปวีณา" }), adminSessionCookieName: () => "session" },
    "@/lib/db": {
      createPublicId: (prefix) => `${prefix}${String(++id).padStart(4, "0")}`,
      pool: { getConnection: async () => conn },
      query: async () => [],
      transaction: async (fn) => fn(conn),
    },
    "@/lib/security": { parseJsonBody: async () => body, validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/notify": {
      notifyMember: async (_conn, userId, title, text) => { record.notices.push({ userId, title, text }); },
      pushAfterResponse: (userId, text) => { record.pushes.push({ userId, text }); },
      pushText: (title, text) => `${title}\n${text}`,
    },
  });
}
const counterPost = (route) => {
  const { NextRequest } = require("next/server");
  return route.POST(new NextRequest("http://localhost/api/admin/bookings", { method: "POST", body: "{}" }));
};
const counterBody = (extra = {}) => ({ courtId: 3, date: "2099-02-02", time: "18:00", durationHours: 1, players: 2, customer: { kind: "member", userId: 12 }, repeatWeeks: 1, payNow: null, requestId: "req-counter-0001", ...extra });

test("counter booking locks the court and books each free week, skipping taken and blocked weeks", async () => {
  const conn = counterConnection({ booked: ["2099-02-09"], blocked: ["2099-02-16"] });
  const response = await counterPost(counterRoute(conn, counterBody({ repeatWeeks: 4 })));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body.created.map((row) => row.startsAt), ["2099-02-02 18:00:00", "2099-02-23 18:00:00"]);
  assert.deepEqual(body.skipped, [{ date: "2099-02-09", reason: "booked" }, { date: "2099-02-16", reason: "blocked" }]);
  const sqls = conn.statements.map(([sql]) => sql);
  const lock = sqls.findIndex((sql) => sql.includes("FROM courts c JOIN sports s") && sql.includes("FOR UPDATE"));
  assert.ok(lock >= 0 && lock < sqls.findIndex((sql) => sql.startsWith("INSERT INTO bookings")), "court locked before any booking is written");
  const inserts = conn.statements.filter(([sql]) => sql.startsWith("INSERT INTO bookings"));
  assert.equal(inserts.length, 2);
  const [insertSql, params] = inserts[0];
  assert.match(insertSql, /expires_at, series_key, created_by\) VALUES \(.*NULL, \?, \?\)/, "a counter booking holds the court until staff act");
  assert.ok(params.includes("2099-02-02 18:00:00") && params.includes("2099-02-02 19:00:00"), "Bangkok wall-clock times");
  assert.ok(params.includes("pending_payment") && params.includes("req-counter-0001") && params.includes(7));
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT INTO payments")), false, "pay later records no payment");
  assert.ok(conn.committed);
  assert.match(conn.statements.find(([sql]) => sql.includes("admin_audit_logs"))[0], /'booking\.create'/);
});

test("a walk-in booking uses the walk-in user and keeps the guest name and phone", async () => {
  const record = { notices: [], pushes: [] };
  const conn = counterConnection();
  const response = await counterPost(counterRoute(conn, counterBody({ customer: { kind: "guest", name: "คุณบี", phone: "081-111-2222" } }), record));
  assert.equal(response.status, 201);
  const params = conn.statements.find(([sql]) => sql.startsWith("INSERT INTO bookings"))[1];
  assert.equal(params[1], 99, "walk-in system user");
  assert.equal(params[2], "คุณบี");
  assert.equal(params[3], "081-111-2222");
  assert.deepEqual(record.notices, [], "guests get no in-app notice");
  assert.deepEqual(record.pushes, [], "and no LINE push");
});

test("pay now records one paid counter payment per booking at the slot price", async () => {
  const conn = counterConnection();
  const response = await counterPost(counterRoute(conn, counterBody({ repeatWeeks: 2, payNow: { method: "cash" } })));
  assert.equal(response.status, 201);
  const bookings = conn.statements.filter(([sql]) => sql.startsWith("INSERT INTO bookings"));
  assert.ok(bookings.every(([, params]) => params.includes("paid")));
  const payments = conn.statements.filter(([sql]) => sql.startsWith("INSERT INTO payments"));
  assert.equal(payments.length, 2);
  for (const [index, [sql, params]] of payments.entries()) {
    assert.match(sql, /'paid'/);
    assert.equal(params.includes(300), true, "rateForSlot: court rate 200 × 1.5 after 17:00");
    assert.ok(params.includes("cash"));
    assert.ok(params.includes(`req-counter-0001-${index}`), "one request id per payment");
    const metadata = JSON.parse(params.find((value) => typeof value === "string" && value.startsWith("{")));
    assert.equal(metadata.channel, "counter");
    assert.equal(metadata.soldBy, 7);
    assert.equal(metadata.itemType, "booking");
    assert.equal(metadata.itemName, "แบดมินตัน - Court A");
  }
});

test("a member counter booking notifies the member once", async () => {
  const record = { notices: [], pushes: [] };
  await counterPost(counterRoute(counterConnection(), counterBody({ repeatWeeks: 2 }), record));
  assert.equal(record.notices.length, 1);
  assert.equal(record.notices[0].userId, 12);
  assert.equal(record.notices[0].title, "จองสนามจากเคาน์เตอร์");
  assert.match(record.notices[0].text, /2 ก\.พ\.|2099-02-02/);
  assert.equal(record.pushes.length, 1);
});

test("a replayed counter booking request returns the bookings it made", async () => {
  const conn = counterConnection({ replay: [{ bookingNo: "BK0001", startsAt: "2099-02-02 18:00:00", endsAt: "2099-02-02 19:00:00", amount: 300, status: "pending_payment" }] });
  const response = await counterPost(counterRoute(conn, counterBody()));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.replayed, true);
  assert.equal(body.created[0].bookingNo, "BK0001");
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT")), false);
});

test("a counter booking needs an active member or guest details, and a free slot", async () => {
  for (const member of [null, { id: 12, status: "suspended", displayName: "x", lineUserId: "U1" }, { id: 99, status: "active", displayName: "walk-in", lineUserId: "system:walk-in" }]) {
    const conn = counterConnection({ member });
    const response = await counterPost(counterRoute(conn, counterBody()));
    assert.ok([404, 409].includes(response.status), JSON.stringify(member));
    assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT")), false);
  }
  const taken = counterConnection({ booked: ["2099-02-02"] });
  const response = await counterPost(counterRoute(taken, counterBody()));
  assert.equal(response.status, 409);
  assert.deepEqual((await response.json()).skipped, [{ date: "2099-02-02", reason: "booked" }]);
  assert.ok(taken.rolledBack);
});

test("every notification title written by Phase 4 routes has app translations", () => {
  const { allMessages } = load("lib/i18n/index.ts");
  const keys = new Set(allMessages.map(([key]) => key));
  const titles = new Set();
  for (const file of ["app/api/admin/bookings/route.ts", "app/api/admin/bookings/pay/route.ts", "lib/scheduled-jobs.ts"]) {
    let text = "";
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const match of text.matchAll(/notifyMember\(conn, [^,]+, "([^"]+)"/g)) titles.add(match[1]);
    for (const match of text.matchAll(/title: "([^"]+)"/g)) titles.add(match[1]);
  }
  assert.ok(titles.has("จองสนามจากเคาน์เตอร์"));
  assert.deepEqual([...titles].filter((title) => !keys.has(title)), []);
});

// ---------- Task 3: take payment, court blocks, calendar data ----------

function adminMocks(conn, record = { notices: [], pushes: [] }, rows = {}) {
  let id = 0;
  return {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7, displayName: "ปวีณา" }), adminSessionCookieName: () => "session" },
    "@/lib/db": {
      createPublicId: (prefix) => `${prefix}${String(++id).padStart(4, "0")}`,
      pool: { getConnection: async () => conn },
      query: async (sql, params) => { (rows.seen ||= []).push([sql, params]); for (const [needle, value] of Object.entries(rows)) if (needle !== "seen" && sql.includes(needle)) return value; return []; },
    },
    "@/lib/notify": {
      notifyMember: async (_conn, userId, title, text) => { record.notices.push({ userId, title, text }); },
      pushAfterResponse: (userId, text) => { record.pushes.push({ userId, text }); },
      pushText: (title, text) => `${title}\n${text}`,
    },
  };
}
function txConnection(responder) {
  const statements = [];
  let rolledBack = false;
  return {
    statements,
    get rolledBack() { return rolledBack; },
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => { rolledBack = true; }, release: () => {},
    execute: async (sql, params = []) => { statements.push([sql, params]); return responder(sql, params) ?? (sql.startsWith("INSERT") || sql.startsWith("UPDATE") ? [{ affectedRows: 1, insertId: 500 }] : [[]]); },
  };
}
const adminRequest = (url, method, body) => {
  const { NextRequest } = require("next/server");
  return new NextRequest(url, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
};

const securityMock = (body) => ({ parseJsonBody: async () => body, secureResponse: (response) => response, validationErrorResponse: () => Response.json({}, { status: 400 }) });

const heldBooking = { id: 50, bookingNo: "BK0050", userId: 12, status: "pending_payment", amount: 300, title: "แบดมินตัน - Court A", guestName: null, guestPhone: null, held: 1 };

test("taking payment for a held counter booking records the money and marks it paid", async () => {
  const record = { notices: [], pushes: [] };
  const conn = txConnection((sql) => (sql.includes("FROM bookings b WHERE b.booking_no = ?") ? [[heldBooking]] : null));
  const route = load("app/api/admin/bookings/pay/route.ts", { ...adminMocks(conn, record), "@/lib/security": securityMock({ bookingNo: "BK0050", method: "card", requestId: "req-pay-000001" }) });
  const response = await route.POST(adminRequest("http://localhost/api/admin/bookings/pay", "POST", {}));
  assert.equal(response.status, 200);
  assert.match(conn.statements[0][0], /FOR UPDATE/, "the booking is locked first");
  const [paySql, payParams] = conn.statements.find(([sql]) => sql.startsWith("INSERT INTO payments"));
  assert.match(paySql, /'paid'/);
  assert.ok(payParams.includes(300) && payParams.includes("card") && payParams.includes(50) && payParams.includes("req-pay-000001"));
  assert.equal(JSON.parse(payParams.find((value) => typeof value === "string" && value.startsWith("{"))).soldBy, 7);
  assert.deepEqual(conn.statements.find(([sql]) => sql.startsWith("UPDATE bookings"))[1], [50]);
  assert.match(conn.statements.find(([sql]) => sql.startsWith("UPDATE bookings"))[0], /SET status = 'paid'/);
  assert.equal(record.notices[0].title, "ชำระเงินสำเร็จ");
  assert.match(conn.statements.find(([sql]) => sql.includes("admin_audit_logs"))[0], /'booking\.pay'/);
});

test("a booking with an open app payment request must be confirmed through the payment queue", async () => {
  const conn = txConnection((sql) => (sql.includes("FROM bookings b WHERE b.booking_no = ?") ? [[heldBooking]] : sql.includes("status = 'created'") ? [[{ id: 9 }]] : null));
  const route = load("app/api/admin/bookings/pay/route.ts", { ...adminMocks(conn), "@/lib/security": securityMock({ bookingNo: "BK0050", method: "cash", requestId: "req-pay-000002" }) });
  const response = await route.POST(adminRequest("http://localhost/api/admin/bookings/pay", "POST", {}));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).message, "มีรายการรอชำระของการจองนี้ กรุณายืนยันผ่านรายการชำระเงิน");
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT") || sql.startsWith("UPDATE")), false);
  for (const booking of [{ ...heldBooking, status: "paid" }, { ...heldBooking, held: 0 }]) {
    const closed = txConnection((sql) => (sql.includes("FROM bookings b WHERE b.booking_no = ?") ? [[booking]] : null));
    const again = load("app/api/admin/bookings/pay/route.ts", { ...adminMocks(closed), "@/lib/security": securityMock({ bookingNo: "BK0050", method: "cash", requestId: "req-pay-000003" }) });
    assert.equal((await again.POST(adminRequest("http://localhost/api/admin/bookings/pay", "POST", {}))).status, 409);
  }
});

test("court block requests are validated: whole hours inside opening hours, end after start", () => {
  const { courtBlockSchema } = load("lib/court-blocks.ts");
  const base = { courtId: 3, date: "2099-02-02", from: "18:00", to: "20:00", reason: "ซ่อมพื้น" };
  assert.equal(courtBlockSchema.safeParse(base).success, true);
  assert.equal(courtBlockSchema.safeParse({ ...base, to: "18:00" }).success, false);
  assert.equal(courtBlockSchema.safeParse({ ...base, from: "07:00" }).success, false);
  assert.equal(courtBlockSchema.safeParse({ ...base, to: "23:30" }).success, false);
  assert.equal(courtBlockSchema.safeParse({ ...base, reason: " " }).success, false);
  assert.equal(courtBlockSchema.safeParse({ ...base, date: "2099-02-30" }).success, false);
});

test("blocking a court over active bookings is refused and lists them", async () => {
  const conn = txConnection((sql) => (sql.includes("FROM courts WHERE id = ?") ? [[{ id: 3 }]] : sql.includes("FROM bookings b") ? [[{ bookingNo: "BK1", startsAt: "2099-02-02 18:00:00", name: "คุณเอ" }]] : null));
  const route = load("app/api/admin/courts/blocks/route.ts", { ...adminMocks(conn), "@/lib/security": securityMock({ courtId: 3, date: "2099-02-02", from: "18:00", to: "20:00", reason: "ซ่อมพื้น" }) });
  const response = await route.POST(adminRequest("http://localhost/api/admin/courts/blocks", "POST", {}));
  assert.equal(response.status, 409);
  assert.deepEqual((await response.json()).bookings.map((row) => row.bookingNo), ["BK1"]);
  assert.ok(conn.rolledBack);
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT")), false);
  assert.match(conn.statements[0][0], /FROM courts WHERE id = \? FOR UPDATE/);
});

test("a block over free time is saved and can be lifted", async () => {
  const conn = txConnection((sql) => (sql.includes("FROM courts WHERE id = ?") ? [[{ id: 3 }]] : null));
  const route = load("app/api/admin/courts/blocks/route.ts", { ...adminMocks(conn), "@/lib/security": securityMock({ courtId: 3, date: "2099-02-02", from: "18:00", to: "20:00", reason: "ซ่อมพื้น" }) });
  assert.equal((await route.POST(adminRequest("http://localhost/api/admin/courts/blocks", "POST", {}))).status, 201);
  assert.deepEqual(conn.statements.find(([sql]) => sql.startsWith("INSERT INTO court_blocks"))[1], [3, "2099-02-02 18:00:00", "2099-02-02 20:00:00", "ซ่อมพื้น", 7]);
  assert.match(conn.statements.find(([sql]) => sql.includes("admin_audit_logs"))[0], /'court\.block'/);
  const lifted = txConnection(() => null);
  const unblock = load("app/api/admin/courts/blocks/route.ts", { ...adminMocks(lifted), "@/lib/security": securityMock({}) });
  assert.equal((await unblock.DELETE(adminRequest("http://localhost/api/admin/courts/blocks?id=4", "DELETE"))).status, 200);
  assert.match(lifted.statements.find(([sql]) => sql.startsWith("UPDATE court_blocks"))[0], /SET cancelled_at = NOW\(\) WHERE id = \? AND cancelled_at IS NULL/);
  assert.match(lifted.statements.find(([sql]) => sql.includes("admin_audit_logs"))[0], /'court\.unblock'/);
});

test("the calendar returns one Bangkok day of courts, bookings with names and blocks", async () => {
  const rows = {
    "FROM courts c JOIN sports s": [{ id: 3, name: "Court A", sportId: 1, sportName: "แบดมินตัน", status: "available", hourlyRate: 200 }],
    "FROM bookings b JOIN users u": [{ bookingNo: "BK1", courtId: 3, startsAt: "2099-02-02 18:00:00", endsAt: "2099-02-02 19:00:00", status: "pending_payment", name: "คุณบี", phone: "081-111-2222", guest: 1, amount: 300, title: "แบดมินตัน - Court A", seriesKey: "req-1", paymentNo: null }],
    "FROM court_blocks": [{ id: 4, courtId: 3, startsAt: "2099-02-02 20:00:00", endsAt: "2099-02-02 22:00:00", reason: "ซ่อมพื้น" }],
  };
  const route = load("app/api/admin/bookings/calendar/route.ts", adminMocks(txConnection(() => null), undefined, rows));
  const response = await route.GET(adminRequest("http://localhost/api/admin/bookings/calendar?date=2099-02-02", "GET"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const body = await response.json();
  assert.equal(body.date, "2099-02-02");
  assert.equal(body.bookings[0].guest, true);
  assert.equal(body.bookings[0].name, "คุณบี");
  assert.equal(body.blocks[0].reason, "ซ่อมพื้น");
  const [bookingSql, bookingParams] = rows.seen.find(([sql]) => sql.includes("FROM bookings b JOIN users u"));
  assert.deepEqual(bookingParams, ["2099-02-02 00:00:00", "2099-02-03 00:00:00"]);
  assert.match(bookingSql, /b\.starts_at >= \? AND b\.starts_at < \?/);
  assert.match(bookingSql, /b\.status IN \('paid','checked_in'\) OR \(b\.status IN \('hold','pending_payment'\) AND \(b\.expires_at IS NULL OR b\.expires_at > NOW\(\)\)\)/);
  assert.match(bookingSql, /SELECT p\.payment_no FROM payments p WHERE p\.booking_id = b\.id AND p\.status = 'paid'/);
  assert.deepEqual(rows.seen.find(([sql]) => sql.includes("FROM court_blocks"))[1], ["2099-02-03 00:00:00", "2099-02-02 00:00:00"]);
  const bad = load("app/api/admin/bookings/calendar/route.ts", adminMocks(txConnection(() => null)));
  assert.equal((await bad.GET(adminRequest("http://localhost/api/admin/bookings/calendar?date=2099-02-30", "GET"))).status, 400);
});

// ---------- Task 5: sequential receipts ----------

const bangkokBeYear = () => new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear() + 543;
const paidPayment = { id: 81, status: "paid" };
const paymentDetail = { paymentNo: "PAY0081", paidAt: "2099-02-02 18:42:00", method: "cash", amount: 300, itemName: "แบดมินตัน - Court A", guestName: null, guestPhone: null, staffId: "7", displayName: "คุณเอ", memberCode: "PPA-0001", phone: "0812345678", lineUserId: "U1" };
const receiptSetting = { contentType: "site_setting", slug: "receipt-info", title: "ข้อมูลใบเสร็จ", metadata: JSON.stringify({ businessName: "PPA Power Play Sport Club", branch: "สำนักงานใหญ่", address: "1 ถนนกีฬา", taxId: "0105561234567", phone: "02-123-4567", vatRegistered: true, footer: "ขอบคุณที่ใช้บริการ" }) };
function receiptConnection({ payment = paidPayment, existing = null, seq = 124 } = {}) {
  return txConnection((sql) => {
    if (sql.includes("FROM payments p WHERE p.payment_no = ?")) return [payment ? [payment] : []];
    if (sql.startsWith("SELECT receipt_no receiptNo")) return [existing ? [existing] : []];
    if (sql.startsWith("SELECT LAST_INSERT_ID()")) return [[{ seq }]];
    if (sql.includes("FROM payment_receipts WHERE payment_id = ?")) return [[{ issuedAt: "2099-02-02 18:45:00" }]];
    if (sql.includes("JOIN users u ON u.id = p.user_id")) return [[paymentDetail]];
    if (sql.includes("FROM app_content_items")) return [[receiptSetting]];
    if (sql.includes("FROM admin_staff")) return [[{ displayName: "ปวีณา" }]];
    return null;
  });
}
const receiptRoute = (conn) => load("app/api/admin/receipts/route.ts", { ...adminMocks(conn), "@/lib/security": securityMock({ paymentNo: "PAY0081" }) });

test("receipt numbers count up per Buddhist year and keep six digits", async () => {
  const { formatReceiptNo, beYear } = load("lib/receipts.ts");
  assert.equal(formatReceiptNo(2569, 123), "RC2569-000123");
  assert.equal(formatReceiptNo(2570, 1), "RC2570-000001");
  assert.equal(beYear(Date.parse("2026-12-31T16:59:00Z")), 2569, "23:59 on 31 Dec in Bangkok is still 2569");
  assert.equal(beYear(Date.parse("2026-12-31T17:00:00Z")), 2570, "00:00 on 1 Jan in Bangkok starts 2570");
  const conn = receiptConnection({ seq: 124 });
  const response = await receiptRoute(conn).POST(adminRequest("http://localhost/api/admin/receipts", "POST", {}));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.receiptNo, `RC${bangkokBeYear()}-000124`);
  assert.equal(body.firstIssue, true);
  assert.match(conn.statements[0][0], /FOR UPDATE/, "the payment is locked before a number is taken");
  const [seqSql, seqParams] = conn.statements.find(([sql]) => sql.startsWith("INSERT INTO receipt_sequences"));
  assert.match(seqSql, /ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID\(last_no \+ 1\)/);
  assert.deepEqual(seqParams, [bangkokBeYear()]);
  assert.deepEqual(conn.statements.find(([sql]) => sql.startsWith("INSERT INTO payment_receipts"))[1], [81, `RC${bangkokBeYear()}-000124`, 7]);
  assert.match(conn.statements.find(([sql]) => sql.includes("admin_audit_logs"))[0], /'receipt\.issue'/);
  assert.equal(body.business.taxId, "0105561234567");
  assert.deepEqual(body.vat, { net: 280.37, vat: 19.63 });
  assert.deepEqual(body.customer, { name: "คุณเอ", memberCode: "PPA-0001", phone: "0812345678" });
  assert.equal(body.staffName, "ปวีณา");
  assert.equal(body.payment.itemName, "แบดมินตัน - Court A");
});

test("VAT-included breakdown adds back to the amount", () => {
  const { vatIncluded } = load("lib/receipts.ts");
  assert.deepEqual(vatIncluded(107), { net: 100, vat: 7 });
  assert.deepEqual(vatIncluded(300), { net: 280.37, vat: 19.63 });
  for (const amount of [1, 9.99, 19200, 2700.5, 12345.67]) {
    const { net, vat } = vatIncluded(amount);
    assert.equal(Math.round(net * 100) + Math.round(vat * 100), Math.round(amount * 100), `${amount}`);
  }
});

test("issuing a receipt twice returns the same number", async () => {
  const conn = receiptConnection({ existing: { receiptNo: "RC2569-000007", issuedAt: "2099-02-02 18:45:00" } });
  const response = await receiptRoute(conn).POST(adminRequest("http://localhost/api/admin/receipts", "POST", {}));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.receiptNo, "RC2569-000007");
  assert.equal(body.firstIssue, false, "a reprint is marked as a copy");
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT")), false, "no new number, no new audit row");
});

test("only paid payments get receipts", async () => {
  for (const payment of [{ id: 81, status: "created" }, { id: 81, status: "cancelled" }]) {
    const conn = receiptConnection({ payment });
    const response = await receiptRoute(conn).POST(adminRequest("http://localhost/api/admin/receipts", "POST", {}));
    assert.equal(response.status, 409);
    assert.ok(conn.rolledBack);
    assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT")), false);
  }
  const missing = receiptConnection({ payment: null });
  assert.equal((await receiptRoute(missing).POST(adminRequest("http://localhost/api/admin/receipts", "POST", {}))).status, 404);
  const { requiredPermissions } = load("lib/admin-permissions.ts");
  assert.deepEqual(requiredPermissions("receipts", "POST"), ["payments.manage", "sales.manage", "reports.view"]);
  assert.deepEqual(requiredPermissions("reports", "GET"), ["reports.view", "payments.manage"]);
});

test("the receipt setting rejects a tax ID that is not 13 digits", () => {
  const { contentProblem, receiptInfo } = load("lib/site-settings.ts");
  assert.match(contentProblem("site_setting", "receipt-info", { taxId: "12345" }), /13/);
  assert.match(contentProblem("site_setting", "receipt-info", { taxId: "01055612345678" }), /13/);
  assert.equal(contentProblem("site_setting", "receipt-info", { taxId: "" }), null, "no tax ID yet is allowed");
  assert.equal(contentProblem("site_setting", "receipt-info", { taxId: "0-1055-61234-56-7" }), null, "dashes and spaces as printed on the certificate");
  assert.match(contentProblem("site_setting", "receipt-info", { vatRegistered: true, taxId: "" }), /VAT/, "a tax invoice needs the tax ID");
  const defaults = receiptInfo([]);
  assert.equal(defaults.businessName, "PPA Power Play Sport Club");
  assert.equal(defaults.vatRegistered, false);
  const set = receiptInfo([{ ...receiptSetting, metadata: JSON.stringify({ taxId: "0-1055-61234-56-7", vatRegistered: true }) }]);
  assert.equal(set.taxId, "0105561234567");
  assert.equal(set.vatRegistered, true);
  assert.equal(receiptInfo([{ ...receiptSetting, metadata: JSON.stringify({ taxId: "bad", vatRegistered: true }) }]).vatRegistered, false, "never a tax invoice without a valid tax ID");
});

// ---------- Task 6: daily cash-up ----------

function cashupRun(responses) {
  const seen = [];
  const run = async (sql, params) => {
    seen.push([sql, params]);
    for (const [needle, rows] of responses) if (sql.includes(needle)) return rows;
    return [];
  };
  return { seen, run };
}
const cashupResponses = [
  ["GROUP BY method", [{ method: "cash", amount: "1500.00", count: 4 }, { method: "promptpay", amount: "900.00", count: 2 }]],
  ["method = 'wallet'", [{ amount: "600.00", count: 2 }]],
  ["GROUP BY staffId", [{ staffId: "7", staffName: "ปวีณา", method: "cash", amount: "1500.00", count: 4 }, { staffId: null, staffName: null, method: "promptpay", amount: "900.00", count: 2 }]],
  ["p.status = 'refunded'", [{ paymentNo: "PAYR1", amount: "200.00", refundedAt: "2099-02-02T03:00:00.000Z", staffName: "ปวีณา", note: "โอนคืนแล้ว" }]],
  ["ORDER BY p.paid_at", [{ paidAt: "2099-02-02 09:15:00", paymentNo: "PAY1", itemName: "Fitness 1 ครั้ง", customer: "คุณเอ", method: "cash", amount: "200.00", staffName: "ปวีณา" }]],
];

test("cash-up totals one Bangkok day by channel and staff, wallet-funded apart", async () => {
  const { loadCashup } = load("lib/cashup.ts", { "@/lib/db": { query: async () => [] } });
  const { seen, run } = cashupRun(cashupResponses);
  const cashup = await loadCashup("2099-02-02", run);
  assert.equal(cashup.date, "2099-02-02");
  assert.deepEqual(cashup.cashIn, [{ method: "cash", amount: 1500, count: 4 }, { method: "promptpay", amount: 900, count: 2 }]);
  assert.equal(cashup.cashInTotal, 2400);
  assert.deepEqual(cashup.walletFunded, { amount: 600, count: 2 });
  assert.deepEqual(cashup.byStaff[0], { staffId: 7, staffName: "ปวีณา", method: "cash", amount: 1500, count: 4 });
  assert.equal(cashup.byStaff[1].staffId, null, "payments nobody at the counter recorded stay unattributed");
  assert.equal(cashup.rows[0].amount, 200);
  const dayQueries = seen.filter(([sql]) => sql.includes("paid_at >= ?"));
  assert.ok(dayQueries.length >= 4);
  for (const [sql, params] of dayQueries) {
    assert.deepEqual(params.slice(0, 2), ["2099-02-02 00:00:00", "2099-02-03 00:00:00"], sql);
    assert.match(sql, /status = 'paid' AND p?\.?paid_at >= \? AND p?\.?paid_at < \?/);
  }
  assert.match(seen.find(([sql]) => sql.includes("GROUP BY method"))[0], /method <> 'wallet'/, "cash-in leaves out purchases paid from app credit");
  assert.match(seen.find(([sql]) => sql.includes("GROUP BY staffId"))[0], /COALESCE\(JSON_VALUE\(p\.metadata, '\$\.soldBy'\), JSON_VALUE\(p\.metadata, '\$\.confirmedBy'\)\)/);
});

test("staff confirmation of a payment records who confirmed it", async () => {
  const statements = [];
  const route = load("app/api/admin/payments/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session" },
    "@/lib/db": { pool: { getConnection: async () => ({
      beginTransaction: async () => {}, rollback: async () => {}, release: () => {}, commit: async () => {},
      execute: async (sql, params) => {
        statements.push([sql, params]);
        if (sql.includes("FROM payments WHERE")) return [[{ id: 1, paymentNo: "PAYTEST", userId: 2, status: "created", amount: 100, metadataText: JSON.stringify({ kind: "wallet_topup", itemName: "เติมเงิน" }) }]];
        if (sql.startsWith("SELECT")) return [[{ paymentNo: "PAYTEST", status: "paid" }]];
        return [{ affectedRows: 1 }];
      },
    }) } },
  });
  const { NextRequest } = require("next/server");
  const response = await route.PUT(new NextRequest("http://localhost/api/admin/payments", { method: "PUT", body: JSON.stringify({ paymentNo: "PAYTEST", status: "paid" }) }));
  assert.equal(response.status, 200);
  const [sql, params] = statements.find(([text]) => text.startsWith("UPDATE payments"));
  assert.match(sql, /status = 'paid', paid_at = NOW\(\), metadata = \?/);
  const metadata = JSON.parse(params[0]);
  assert.equal(metadata.confirmedBy, 7);
  assert.equal(metadata.itemName, "เติมเงิน", "the rest of the metadata is kept");
});

test("cash-up lists refunds recorded that day", async () => {
  const { loadCashup } = load("lib/cashup.ts", { "@/lib/db": { query: async () => [] } });
  const { seen, run } = cashupRun(cashupResponses);
  const cashup = await loadCashup("2099-02-02", run);
  assert.deepEqual(cashup.refunds, [{ paymentNo: "PAYR1", amount: 200, refundedAt: "2099-02-02T03:00:00.000Z", staffName: "ปวีณา", note: "โอนคืนแล้ว" }]);
  assert.equal(cashup.refundTotal, 200);
  const [refundSql, refundParams] = seen.find(([sql]) => sql.includes("p.status = 'refunded'"));
  assert.match(refundSql, /JSON_VALUE\(p\.metadata, '\$\.refund\.status'\) = 'done'/);
  assert.deepEqual(refundParams, ["2099-02-01T17:00:00.000Z", "2099-02-02T17:00:00.000Z"], "refund.at is UTC ISO: the Bangkok day starts 17:00Z the day before");
  const rows = { "GROUP BY method": [], "method = 'wallet'": [{ amount: 0, count: 0 }] };
  const route = load("app/api/admin/reports/cashup/route.ts", adminMocks(txConnection(() => null), undefined, rows));
  const ok = await route.GET(adminRequest("http://localhost/api/admin/reports/cashup?date=2099-02-02", "GET"));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control"), /private, no-store/);
  assert.equal((await ok.json()).date, "2099-02-02");
  assert.equal((await route.GET(adminRequest("http://localhost/api/admin/reports/cashup?date=2099-13-01", "GET"))).status, 400);
});

// ---------- Task 7: scheduled job (auto-cancel, reminders) ----------

const staleRows = [
  { id: 91, paymentNo: "PAY91", userId: 12, bookingId: null, amount: "2000.00", metadataText: JSON.stringify({ itemName: "Fitness 1 เดือน", itemType: "membership" }), itemName: "Fitness 1 เดือน", lineUserId: "U12" },
  { id: 92, paymentNo: "PAY92", userId: 13, bookingId: 50, amount: "300.00", metadataText: null, itemName: "แบดมินตัน - Court A", lineUserId: "U13" },
];

test("unpaid requests without a slip are cancelled after 3 days and court bookings once the session has ended", async () => {
  const record = { notices: [], pushes: [] };
  const conn = txConnection((sql) => (sql.includes("FROM payments p") && sql.includes("FOR UPDATE") ? [staleRows] : null));
  const { cancelStalePayments } = load("lib/scheduled-jobs.ts", adminMocks(conn, record));
  const notices = await cancelStalePayments(conn);
  const [selectSql] = conn.statements[0];
  assert.match(selectSql, /p\.status = 'created' AND p\.slip_uploaded_at IS NULL/, "a request with a slip waits for staff");
  assert.match(selectSql, /p\.booking_id IS NULL AND p\.created_at < NOW\(\) - INTERVAL 3 DAY/);
  assert.match(selectSql, /p\.booking_id IS NOT NULL AND b\.ends_at < NOW\(\)/);
  assert.match(selectSql, /FOR UPDATE/);
  const cancels = conn.statements.filter(([sql]) => sql.startsWith("UPDATE payments"));
  assert.equal(cancels.length, 2);
  for (const [sql, params] of cancels) {
    assert.match(sql, /SET status = 'cancelled', metadata = \? WHERE id = \? AND status = 'created'/);
    const metadata = JSON.parse(params[0]);
    assert.equal(metadata.autoCancelled, true);
    assert.ok(metadata.cancelReason);
  }
  assert.equal(JSON.parse(cancels[0][1][0]).itemType, "membership", "the rest of the metadata is kept");
  assert.deepEqual(conn.statements.filter(([sql]) => sql.startsWith("UPDATE bookings")), [["UPDATE bookings SET status = 'expired' WHERE id = ? AND status IN ('hold','pending_payment')", [50]]]);
  assert.deepEqual(notices.map((notice) => notice.userId), [12, 13]);
  assert.ok(notices.every((notice) => notice.title === "รายการชำระหมดเวลา"));
  assert.match(notices[1].body, /แบดมินตัน - Court A[\s\S]*ไม่มีการเรียกเก็บเงิน/);
  assert.equal(record.notices.length, 2, "in-app notices are written in the same transaction");
  assert.match(conn.statements.find(([sql]) => sql.includes("admin_audit_logs"))[0], /'payment\.auto_cancel'/);
});

test("reminders are sent once per booking and per membership", async () => {
  const record = { notices: [], pushes: [] };
  const conn = txConnection((sql, params) => {
    if (sql.includes("FROM bookings b")) return [[{ id: 1, userId: 12, title: "แบดมินตัน - Court A", startTime: "18:00" }]];
    if (sql.includes("FROM memberships m")) return [[{ id: 5, userId: 13, planName: "Fitness 1 เดือน", endsOn: "2099-02-04" }]];
    if (sql.startsWith("INSERT IGNORE INTO member_reminders")) return [{ affectedRows: params[0] === "booking_soon" ? 1 : 0 }];
    return null;
  });
  const { sendReminders } = load("lib/scheduled-jobs.ts", adminMocks(conn, record));
  const notices = await sendReminders(conn);
  assert.equal(notices.length, 1, "the membership reminder was already sent");
  assert.equal(notices[0].userId, 12);
  assert.equal(notices[0].title, "ใกล้ถึงเวลาจองสนาม");
  assert.match(notices[0].body, /แบดมินตัน - Court A[\s\S]*18:00/);
  assert.equal(record.notices.length, 1);
  const [bookingSql] = conn.statements.find(([sql]) => sql.includes("FROM bookings b"));
  assert.match(bookingSql, /b\.status = 'paid' AND b\.starts_at > NOW\(\) AND b\.starts_at <= NOW\(\) \+ INTERVAL 2 HOUR/);
  assert.match(bookingSql, /system:walk-in/, "walk-in guests have no app to remind");
  const [membershipSql] = conn.statements.find(([sql]) => sql.includes("FROM memberships m"));
  assert.match(membershipSql, /m\.ends_at > NOW\(\) AND m\.ends_at <= NOW\(\) \+ INTERVAL 3 DAY/);
  assert.match(membershipSql, /NOT EXISTS \(SELECT 1 FROM memberships n WHERE n\.user_id = m\.user_id AND n\.status = 'active' AND n\.ends_at > m\.ends_at\)/, "members who already renewed are not reminded");
  const inserts = conn.statements.filter(([sql]) => sql.startsWith("INSERT IGNORE INTO member_reminders"));
  assert.deepEqual(inserts.map(([, params]) => params), [["booking_soon", 1, 12], ["membership_ending", 5, 13]]);
  const { allMessages } = load("lib/i18n/index.ts");
  const keys = new Set(allMessages.map(([key]) => key));
  for (const title of ["รายการชำระหมดเวลา", "ใกล้ถึงเวลาจองสนาม", "แพ็กเกจใกล้หมดอายุ"]) assert.ok(keys.has(title), `catalog row for ${title}`);
});

test("the scheduled job needs the secret", async () => {
  const record = { notices: [], pushes: [] };
  const route = load("app/api/cron/run/route.ts", adminMocks(txConnection(() => null), record));
  const { NextRequest } = require("next/server");
  const call = (authorization) => route.POST(new NextRequest("http://localhost/api/cron/run", { method: "POST", headers: authorization ? { authorization } : {} }));
  const saved = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    assert.equal((await call("Bearer anything")).status, 404, "off until a secret is configured");
    process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
    assert.equal((await call()).status, 401);
    assert.equal((await call("Bearer wrong-secret")).status, 401);
    const ok = await call("Bearer cron-secret-for-tests-0123456789");
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { cancelled: 0, reminders: 0 });
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = saved;
  }
});

// ---------- Task 8: reports with stated periods ----------

test("report figures come from SQL for the month to date and only for permitted sections", async () => {
  const { loadReportFigures } = load("lib/report-figures.ts", { "@/lib/db": { query: async () => [] } });
  const seen = [];
  const answers = [
    ["monthStart", [{ monthStart: "2026-11-01", today: "2026-11-02" }]],
    ["FROM payments", [{ salesMonth: "48200.00", paymentsMonth: 31, avgBookingValueMonth: "295.24" }]],
    ["FROM bookings", [{ month: 40, paidMonth: 30, cancelledMonth: 6, checkedInMonth: 12, pendingNow: 3 }]],
    ["FROM users", [{ total: 420, active: 410, newMonth: 15, checkinsMonth: 380 }]],
    ["FROM courts", [{ total: 12, available: 11, maintenance: 1 }]],
    ["FROM coupons", [{ total: 8, active: 6, soldMonth: 21 }]],
    ["FROM trainers", [{ total: 5, active: 4, avgPrice: "1250.00" }]],
    ["FROM admin_audit_logs", [{ eventsMonth: 140, sensitiveMonth: 3 }]],
  ];
  const run = async (sql) => { seen.push(sql); for (const [needle, rows] of answers) if (sql.includes(needle)) return rows; return []; };
  const financeOnly = await loadReportFigures((permission) => permission === "payments.manage", run);
  assert.deepEqual(financeOnly.period, { from: "2026-11-01", to: "2026-11-02" });
  assert.deepEqual(financeOnly.finance, { salesMonth: 48200, paymentsMonth: 31, avgBookingValueMonth: 295.24 });
  assert.equal(financeOnly.bookings, undefined);
  assert.equal(financeOnly.members, undefined);
  assert.equal(seen.length, 2, "only the period and the permitted section are queried");
  assert.match(seen[1], /paid_at >= DATE_FORMAT\(CURDATE\(\), '%Y-%m-01'\)/);
  assert.match(seen[1], /wallet_topup/, "sales leave out wallet top-ups, as on the dashboard");
  seen.length = 0;
  const reports = await loadReportFigures((permission) => permission === "reports.view", run);
  assert.equal(reports.bookings.paidRate, 75);
  assert.equal(reports.bookings.pendingNow, 3);
  assert.equal(reports.bookings.checkedInMonth, 12);
  assert.deepEqual(reports.members, { total: 420, active: 410, newMonth: 15, checkinsMonth: 380 });
  assert.deepEqual(reports.courts, { total: 12, available: 11, maintenance: 1 });
  assert.deepEqual(reports.coupons, { total: 8, active: 6, soldMonth: 21 });
  assert.equal(reports.trainers.avgPrice, 1250);
  assert.equal(reports.audit, undefined, "audit figures need settings.manage, like the audit log itself");
  assert.match(seen.find((sql) => sql.includes("FROM users")), /system:walk-in/, "the walk-in account is not a member");
  assert.match(seen.find((sql) => sql.includes("FROM bookings")), /created_at >= DATE_FORMAT\(CURDATE\(\), '%Y-%m-01'\)/);
  const admin = await loadReportFigures(() => true, run);
  assert.deepEqual(admin.audit, { eventsMonth: 140, sensitiveMonth: 3 });
  const quiet = await loadReportFigures(() => true, async (sql) => (sql.includes("monthStart") ? [{ monthStart: "2026-11-01", today: "2026-11-01" }] : sql.includes("FROM bookings") ? [{ month: 0, paidMonth: 0, cancelledMonth: 0, checkedInMonth: 0, pendingNow: 0 }] : []));
  assert.equal(quiet.bookings.paidRate, null, "no bookings yet is not 0% paid");
  assert.equal(quiet.finance.avgBookingValueMonth, null);
});

test("report lists say how many recent rows they cover", () => {
  const { coverageLabel, periodLabel } = load("lib/report-periods.ts");
  assert.equal(coverageLabel(200, "2026-10-05T03:00:00.000Z", "th"), "ข้อมูล 200 รายการล่าสุด ตั้งแต่ 5 ต.ค. 2569");
  assert.equal(coverageLabel(200, "2026-10-05T03:00:00.000Z", "en"), "Latest 200 records, since 5 Oct 2026");
  assert.equal(coverageLabel(3, null, "th"), "ข้อมูล 3 รายการล่าสุด");
  assert.equal(periodLabel("month", { from: "2026-11-01", to: "2026-11-02" }, "th"), "เดือนนี้ 1–2 พ.ย.");
  assert.equal(periodLabel("month", { from: "2026-11-01", to: "2026-11-01" }, "en"), "This month, 1 Nov");
  assert.equal(periodLabel("now", undefined, "th"), "ตอนนี้");
  assert.equal(periodLabel("all", undefined, "en"), "All time");
  const source = readFileSync("components/admin-console.tsx", "utf8");
  assert.match(source, /coverageLabel\(/, "report lists state their coverage");
  assert.match(source, /periodLabel\(/, "report cards state their period");
});

// ---------- Task 10: the analysis page reflects what is built ----------

test("the analysis checklist marks counter booking, court calendar, cash-up, receipts, reminders and backups as ready", () => {
  const { completionChecklist, recommendations, roadmap } = load("lib/admin-analysis.ts");
  const texts = (lang, ready) => completionChecklist[lang].flatMap((group) => group.items.filter((item) => item.ready === ready).map((item) => item.text)).join("\n");
  for (const pattern of [/ตารางสนาม/, /จองจากเคาน์เตอร์/, /ปิดยอดประจำวัน/, /ใบเสร็จ/, /แจ้งเตือนก่อนเวลาจอง/, /สำรองข้อมูล/]) assert.match(texts("th", true), pattern);
  for (const pattern of [/court calendar/i, /counter booking/i, /cash-up/i, /receipt/i, /reminder/i, /backup/i]) assert.match(texts("en", true), pattern);
  assert.doesNotMatch(texts("th", false), /ตารางสนาม|ใบเสร็จ|ปิดยอด|สำรองข้อมูล|calendar|recurring|backup/i, "nothing built is still listed as missing");
  assert.doesNotMatch(texts("en", false), /calendar|recurring|receipt|backup|cash-up/i);
  for (const lang of ["th", "en"]) {
    assert.equal(completionChecklist[lang].length, completionChecklist.th.length, "same menus in both languages");
    assert.equal(recommendations[lang].length, 7, "the seven 'later' items");
    assert.equal(roadmap[lang].length, 3, "built, later, not worth doing now");
  }
  assert.match(roadmap.th[2].items.join("\n"), /หลายสาขา/);
  assert.match(roadmap.en[2].items.join("\n"), /Multi-branch/i);
});

// ---------- Final review fixes ----------

test("the dashboard counts counter bookings held for payment at the counter as today's bookings", async () => {
  const { loadDashboard } = load("lib/admin-dashboard.ts", { "@/lib/db": { query: async () => [] } });
  const seen = [];
  await loadDashboard(() => true, async (sql) => { seen.push(sql); return []; });
  const bookingQueries = seen.filter((sql) => sql.includes("FROM bookings b"));
  assert.equal(bookingQueries.length, 2, "the day's count and the court schedule");
  for (const sql of bookingQueries) assert.match(sql, /b\.status IN \('hold', 'pending_payment'\) AND \(b\.expires_at IS NULL OR b\.expires_at > NOW\(\)\)/, "a pay-later hold has no expiry and still occupies its court");
});

test("a block over an existing block is refused, so every block stays visible and removable", async () => {
  const conn = txConnection((sql) => (sql.includes("FROM courts WHERE id = ?") ? [[{ id: 3 }]] : sql.includes("FROM court_blocks") ? [[{ id: 4, startsAt: "18:00", endsAt: "20:00", reason: "ซ่อมพื้น" }]] : null));
  const route = load("app/api/admin/courts/blocks/route.ts", { ...adminMocks(conn), "@/lib/security": securityMock({ courtId: 3, date: "2099-02-02", from: "19:00", to: "21:00", reason: "จัดแข่งขัน" }) });
  const response = await route.POST(adminRequest("http://localhost/api/admin/courts/blocks", "POST", {}));
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /บล็อก[\s\S]*18:00–20:00[\s\S]*ซ่อมพื้น/);
  assert.ok(conn.rolledBack);
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT")), false);
  assert.deepEqual(conn.statements.find(([sql]) => sql.includes("FROM court_blocks"))[1], [3, "2099-02-02 21:00:00", "2099-02-02 19:00:00"]);
});

test("a database that misses this release's migration gets a clear message instead of a crash", () => {
  const { missingSchema } = load("lib/schema-check.ts");
  const dbError = (code, sqlMessage) => Object.assign(new Error(sqlMessage), { code, sqlMessage });
  assert.equal(missingSchema(dbError("ER_BAD_FIELD_ERROR", "Unknown column 'b.guest_name' in 'field list'")), "Unknown column 'b.guest_name' in 'field list'");
  assert.equal(missingSchema(dbError("ER_NO_SUCH_TABLE", "Table 'ppa.court_blocks' doesn't exist")), "Table 'ppa.court_blocks' doesn't exist");
  assert.equal(missingSchema(dbError("ECONNREFUSED", "connect ECONNREFUSED 10.0.0.5:3306")), null, "other failures keep the normal error page");
  assert.equal(missingSchema("boom"), null);
  const page = readFileSync("app/AdminConsole/page.tsx", "utf8");
  assert.match(page, /missingSchema\(/);
  assert.match(page, /npm run db:init/);
});
