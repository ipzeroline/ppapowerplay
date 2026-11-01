import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load, require } from "./load-ts.mjs";

void require;

// Expected payloads were computed with Python's binascii.crc_hqx (CRC-16/CCITT, init 0xFFFF),
// an implementation independent of lib/promptpay.ts.
test("PromptPay payload matches EMVCo/BOT format for phone, tax ID and e-wallet targets", () => {
  const { promptPayPayload, promptPayTargetValid } = load("lib/promptpay.ts");
  assert.equal(promptPayPayload("0812345678", 2000), "00020101021229370016A000000677010111011300668123456785802TH530376454072000.006304D3EA");
  assert.equal(promptPayPayload("081-234-5678", 4.22), "00020101021229370016A000000677010111011300668123456785802TH530376454044.2263045D49");
  assert.equal(promptPayPayload("0105556001234"), "00020101021129370016A000000677010111021301055560012345802TH53037646304EBF8");
  assert.equal(promptPayPayload("004999000123456", 150.5), "00020101021229390016A00000067701011103150049990001234565802TH53037645406150.506304A0D3");
  for (const valid of ["0812345678", "0105556001234", "004999000123456"]) assert.equal(promptPayTargetValid(valid), true, valid);
  for (const invalid of ["", "12345", "08123456789", "abc0812345678", "01055560012345"]) assert.equal(promptPayTargetValid(invalid), false, invalid);
  assert.throws(() => promptPayPayload("12345", 10));
  assert.throws(() => promptPayPayload("0812345678", -1));
});

test("members see only the last four digits of the receiving PromptPay account", () => {
  const { maskPromptPayTarget } = load("lib/promptpay.ts");
  assert.equal(maskPromptPayTarget("081-234-5678"), "••••••5678");
  assert.equal(maskPromptPayTarget("0105556001234"), "••••••1234");
  assert.equal(maskPromptPayTarget("123"), "123");
});

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const memberMocks = (db, extra = {}) => ({
  "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
  "@/lib/security": { ...load("lib/security.ts"), checkRateLimit: () => null, clientIp: async () => "test" },
  "@/lib/db": db,
  ...extra,
});

test("slip images are recognised by magic bytes and stored names cannot escape the slip folder", async () => {
  const { detectImageType, readSlip } = load("lib/slips.ts");
  assert.equal(detectImageType(png), "png");
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "jpg");
  assert.equal(detectImageType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")])), "webp");
  assert.equal(detectImageType(Buffer.from("%PDF-1.7")), null);
  assert.equal(detectImageType(Buffer.from("<svg onload=alert(1)>")), null);
  await assert.rejects(readSlip("../../.env.local"));
  await assert.rejects(readSlip("PAYX-..%2F.png"));
});

test("PromptPay QR is issued only for the member's own unpaid PromptPay payment", async () => {
  const rows = { PAYMINE1234: { paymentNo: "PAYMINE1234", amount: 2000, status: "created", method: "promptpay", itemName: "Fitness 1 เดือน" }, PAYPAID1234: { paymentNo: "PAYPAID1234", amount: 500, status: "paid", method: "promptpay" } };
  const seen = [];
  const route = load("app/api/payments/promptpay/route.ts", memberMocks({ query: async (sql, params) => { seen.push(params); return rows[params[0]] ? [rows[params[0]]] : []; } }));
  const { NextRequest } = require("next/server");
  const call = (paymentNo) => route.GET(new NextRequest(`http://localhost/api/payments/promptpay?paymentNo=${paymentNo}`));
  delete process.env.PROMPTPAY_ID;
  const unconfigured = await call("PAYMINE1234");
  assert.equal(unconfigured.status, 404);
  assert.equal((await unconfigured.json()).code, "PROMPTPAY_NOT_CONFIGURED");
  process.env.PROMPTPAY_ID = "0812345678";
  const ok = await call("PAYMINE1234");
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.amount, 2000);
  assert.match(body.qr, /^data:image\/png;base64,/, "PNG so members can long-press to save it for their banking app");
  assert.equal(body.payee.account, "••••••5678");
  assert.deepEqual(seen.at(-1), ["PAYMINE1234", 2], "lookup is scoped to the signed-in member");
  assert.equal((await call("PAYPAID1234")).status, 409);
  assert.equal((await call("PAYOTHER123")).status, 404);
  assert.equal((await call("bad'value")).status, 400);
  delete process.env.PROMPTPAY_ID;
});

function slipConnection({ payment, booking = null, taken = [] }) {
  const statements = [];
  const state = { committed: false, rolledBack: false };
  return {
    statements, state,
    beginTransaction: async () => {}, commit: async () => { state.committed = true; }, rollback: async () => { state.rolledBack = true; }, release: () => {},
    execute: async (sql, params) => {
      statements.push([sql, params]);
      if (sql.includes("FROM payments WHERE")) return [payment && params[0] === payment.paymentNo ? [payment] : []];
      if (sql.includes("FROM bookings WHERE id = ?")) return [booking ? [booking] : []];
      if (sql.includes("FROM bookings WHERE court_id = ?")) return [taken];
      return [{ affectedRows: 1 }];
    },
  };
}
const slipRoute = (conn) => load("app/api/payments/slip/route.ts", memberMocks({ pool: { getConnection: async () => conn }, query: async () => { throw new Error("slip uploads run in a transaction"); } }));
const uploadSlip = (route, paymentNo, file = png, headers = {}) => {
  const form = new FormData();
  form.set("paymentNo", paymentNo);
  form.set("file", new File([file], "slip", { type: "image/png" }));
  return route.POST(new Request("http://localhost/api/payments/slip", { method: "POST", body: form, headers }));
};
async function withSlipDir(run) {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const dir = mkdtempSync("/tmp/ppa-slip-test-");
  process.env.SLIP_STORAGE_DIR = dir;
  try {
    await run(dir);
  } finally {
    delete process.env.SLIP_STORAGE_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("slip upload accepts an image for the member's unpaid payment and rejects everything else", async () => {
  const { readdirSync } = await import("node:fs");
  await withSlipDir(async (dir) => {
    const payment = { id: 9, paymentNo: "PAYMINE1234", status: "created", method: "promptpay", slipPath: null, bookingId: null, metadataText: null };
    let conn = slipConnection({ payment });
    assert.equal((await uploadSlip(slipRoute(conn), "PAYMINE1234", Buffer.from("not an image"))).status, 415);
    assert.equal((await uploadSlip(slipRoute(conn), "PAYOTHER123")).status, 404);
    assert.equal((await uploadSlip(slipRoute(conn), "PAYMINE1234", png, { "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal(conn.statements.some(([sql]) => sql.startsWith("UPDATE")), false, "nothing stored for rejected uploads");
    assert.equal(readdirSync(dir).length, 0);
    conn = slipConnection({ payment });
    const ok = await uploadSlip(slipRoute(conn), "PAYMINE1234");
    assert.equal(ok.status, 200);
    const stored = readdirSync(dir);
    assert.equal(stored.length, 1);
    assert.match(stored[0], /^PAYMINE1234-[0-9a-f-]{36}\.png$/);
    assert.match(conn.statements[0][0], /FROM payments WHERE payment_no = \? AND user_id = \? FOR UPDATE/, "the member's own payment, locked");
    assert.deepEqual(conn.statements[0][1], ["PAYMINE1234", 2]);
    assert.deepEqual(conn.statements.find(([sql]) => sql.startsWith("UPDATE payments")), ["UPDATE payments SET slip_path = ?, slip_uploaded_at = NOW() WHERE id = ?", [stored[0], 9]]);
    assert.equal(conn.state.committed, true);
    conn = slipConnection({ payment: { ...payment, status: "paid" } });
    assert.equal((await uploadSlip(slipRoute(conn), "PAYMINE1234")).status, 409);
    assert.equal(readdirSync(dir).length, 1, "no file for a payment that is no longer waiting");
  });
});

test("PromptPay QR for a court booking shows the hold deadline and stops once the hold has lapsed", async () => {
  const base = { amount: 300, status: "created", method: "promptpay", itemName: "Badminton - Court 3", bookingId: 5, bookingStatus: "pending_payment", slipUploadedAt: null };
  const rows = {
    PAYBOOK1234: { ...base, paymentNo: "PAYBOOK1234", holdSeconds: 600 },
    PAYLATE1234: { ...base, paymentNo: "PAYLATE1234", holdSeconds: -30 },
    PAYGONE1234: { ...base, paymentNo: "PAYGONE1234", bookingStatus: "expired", holdSeconds: -900 },
    PAYSLIP1234: { ...base, paymentNo: "PAYSLIP1234", holdSeconds: 7200, slipUploadedAt: "2026-11-01 17:04:00" },
  };
  const seen = [];
  const route = load("app/api/payments/promptpay/route.ts", memberMocks({ query: async (sql, params) => { seen.push(sql); return rows[params[0]] ? [rows[params[0]]] : []; } }));
  const { NextRequest } = require("next/server");
  const call = (paymentNo) => route.GET(new NextRequest(`http://localhost/api/payments/promptpay?paymentNo=${paymentNo}`));
  process.env.PROMPTPAY_ID = "0812345678";
  try {
    const open = await call("PAYBOOK1234");
    assert.equal(open.status, 200);
    assert.equal((await open.json()).holdSeconds, 600, "the screen shows the payment deadline");
    assert.match(seen[0], /LEFT JOIN bookings b ON b\.id = p\.booking_id/);
    assert.match(seen[0], /TIMESTAMPDIFF\(SECOND, NOW\(\), b\.expires_at\) holdSeconds/);
    for (const lapsed of ["PAYLATE1234", "PAYGONE1234"]) {
      const response = await call(lapsed);
      assert.equal(response.status, 409, lapsed);
      assert.equal((await response.json()).code, "BOOKING_EXPIRED", "no QR once the court is no longer held");
    }
    const sent = await call("PAYSLIP1234");
    assert.equal(sent.status, 200, "a sent slip keeps the court held");
    assert.equal((await sent.json()).holdSeconds, null);
  } finally {
    delete process.env.PROMPTPAY_ID;
  }
});

const heldBooking = { id: 5, courtId: 3, status: "pending_payment", holdValid: 1, notEnded: 1, startsAt: "2026-11-01 19:00:00", endsAt: "2026-11-01 20:00:00" };
const bookingPayment = { id: 9, paymentNo: "PAYBOOK1234", status: "created", method: "promptpay", slipPath: null, bookingId: 5, metadataText: null };
const keepCourt = "UPDATE bookings SET expires_at = ends_at, status = IF(status = 'expired', 'pending_payment', status) WHERE id = ?";

test("a slip sent while the court is held keeps it reserved until staff decide", async () => {
  const { readdirSync } = await import("node:fs");
  await withSlipDir(async (dir) => {
    const conn = slipConnection({ payment: bookingPayment, booking: heldBooking });
    const response = await uploadSlip(slipRoute(conn), "PAYBOOK1234");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).bookingHeld, true);
    assert.match(conn.statements[1][0], /FROM bookings WHERE id = \? AND user_id = \? FOR UPDATE/);
    assert.deepEqual(conn.statements[1][1], [5, 2]);
    assert.deepEqual(conn.statements.find(([sql]) => sql.startsWith("UPDATE bookings")), [keepCourt, [5]]);
    assert.equal(conn.statements.some(([sql]) => sql.includes("FROM bookings WHERE court_id = ?")), false, "a live hold needs no slot check");
    assert.equal(conn.state.committed, true);
    assert.equal(readdirSync(dir).length, 1);
  });
});

test("a late slip re-reserves the court only while the slot is still free", async () => {
  const { readdirSync } = await import("node:fs");
  await withSlipDir(async (dir) => {
    const late = { ...heldBooking, status: "expired", holdValid: 0 };
    let conn = slipConnection({ payment: bookingPayment, booking: late, taken: [] });
    assert.equal((await uploadSlip(slipRoute(conn), "PAYBOOK1234")).status, 200);
    const overlap = conn.statements.find(([sql]) => sql.includes("FROM bookings WHERE court_id = ?"));
    assert.match(overlap[0], /court_id = \? AND id <> \? AND \(status IN \('paid','checked_in'\) OR \(status IN \('hold','pending_payment'\) AND \(expires_at IS NULL OR expires_at > NOW\(\)\)\)\) AND starts_at < \? AND ends_at > \?/);
    assert.deepEqual(overlap[1], [3, 5, late.endsAt, late.startsAt]);
    assert.deepEqual(conn.statements.find(([sql]) => sql.startsWith("UPDATE bookings")), [keepCourt, [5]]);
    conn = slipConnection({ payment: bookingPayment, booking: { ...late, courtId: null } });
    assert.equal((await uploadSlip(slipRoute(conn), "PAYBOOK1234")).status, 200, "bookings without a court have no slot to lose");
    const kept = readdirSync(dir).length;
    for (const [booking, taken, reason] of [[late, [{ id: 8 }], "slot taken"], [{ ...late, status: "cancelled" }, [], "cancelled"], [{ ...late, notEnded: 0 }, [], "session over"], [null, [], "missing booking"]]) {
      conn = slipConnection({ payment: bookingPayment, booking, taken });
      const response = await uploadSlip(slipRoute(conn), "PAYBOOK1234");
      assert.equal(response.status, 409, reason);
      assert.equal((await response.json()).code, "BOOKING_EXPIRED", reason);
      assert.equal(conn.statements.some(([sql]) => sql.startsWith("UPDATE")), false, reason);
      assert.equal(conn.state.committed, false, reason);
      assert.equal(readdirSync(dir).length, kept, `${reason}: no slip stored`);
    }
  });
});

test("staff cancelling a court booking payment releases the court at once", async () => {
  const statements = [];
  const conn = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, params) => {
      statements.push([sql, params]);
      if (sql.includes("FROM payments WHERE")) return [[{ id: 41, paymentNo: "PAYBOOK1234", userId: 2, bookingId: 5, status: "created", amount: 300, metadataText: JSON.stringify({ itemType: "booking", itemName: "Badminton - Court 3" }) }]];
      if (sql.includes("FROM bookings WHERE id = ?")) return [[{ status: "pending_payment", valid: 1 }]];
      if (sql.startsWith("SELECT")) return [[]];
      return [{ affectedRows: 1, insertId: 5 }];
    } };
  const route = load("app/api/admin/payments/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session" },
    "@/lib/db": { pool: { getConnection: async () => conn }, query: async () => [] },
  });
  const { NextRequest } = require("next/server");
  const decide = (status) => route.PUT(new NextRequest("http://localhost/api/admin/payments", { method: "PUT", body: JSON.stringify({ paymentNo: "PAYBOOK1234", status }) }));
  assert.equal((await decide("cancelled")).status, 200);
  assert.deepEqual(statements.find(([sql]) => sql.startsWith("UPDATE bookings")), ["UPDATE bookings SET expires_at = NOW() WHERE id = ? AND status IN ('hold','pending_payment')", [5]]);
  statements.length = 0;
  assert.equal((await decide("paid")).status, 200);
  assert.deepEqual(statements.filter(([sql]) => sql.startsWith("UPDATE bookings")).map(([sql]) => sql), ["UPDATE bookings SET status = 'paid' WHERE id = ? AND status IN ('hold','pending_payment')"]);
});

test("staff read slips through the admin route with private caching", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const dir = mkdtempSync("/tmp/ppa-slip-admin-");
  process.env.SLIP_STORAGE_DIR = dir;
  const name = "PAYMINE1234-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.png";
  writeFileSync(`${dir}/${name}`, png);
  try {
    const route = load("app/api/admin/payments/slip/route.ts", {
      "@/lib/admin-auth": { assertAdminRequest: async () => null },
      "@/lib/db": { query: async (sql, params) => (params[0] === "PAYMINE1234" ? [{ slipPath: name }] : []) },
    });
    const { NextRequest } = require("next/server");
    const response = await route.GET(new NextRequest("http://localhost/api/admin/payments/slip?paymentNo=PAYMINE1234"));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    assert.equal((await route.GET(new NextRequest("http://localhost/api/admin/payments/slip?paymentNo=PAYNONE1234"))).status, 404);
  } finally {
    delete process.env.SLIP_STORAGE_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("payments keep the slip reference and staff lists show which payments have slips", async () => {
  const schema = readFileSync("database/schema.sql", "utf8");
  assert.match(schema, /ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_path VARCHAR\(255\) NULL/);
  assert.match(schema, /ALTER TABLE payments ADD COLUMN IF NOT EXISTS slip_uploaded_at DATETIME NULL/);
  assert.match(load("lib/admin-payment-list.ts").adminPaymentListSql, /p\.slip_uploaded_at slipUploadedAt/);
  assert.match(readFileSync(".gitignore", "utf8"), /^storage\/$/m, "slips never enter git");
  const conn = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, execute: async () => [{ insertId: 1 }] };
  const route = load("app/api/wallet/topup/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => ({ amount: 500 }), validationErrorResponse: () => Response.json({}, { status: 400 }), secureResponse: (response) => response },
    "@/lib/db": { createPublicId: (prefix) => `${prefix}TEST123`, pool: { getConnection: async () => conn } },
  });
  assert.deepEqual(await (await route.POST(new Request("http://localhost/api/wallet/topup", { method: "POST" }))).json(), { ok: true, status: "created", paymentNo: "PAYTEST123" });
});

test("staff payment decisions notify the member in the app", async () => {
  const statements = [];
  const conn = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, params) => {
      statements.push([sql, params]);
      if (sql.includes("FROM payments WHERE")) return [[{ id: 41, paymentNo: "PAYTEST", userId: 2, bookingId: null, status: "created", amount: 2000, metadataText: JSON.stringify({ itemType: "membership", itemName: "Fitness 1 เดือน", grant: { months: 1 } }) }]];
      if (sql.startsWith("SELECT")) return [[{ paymentNo: "PAYTEST", status: "paid" }]];
      return [{ affectedRows: 1, insertId: 5 }];
    } };
  const route = load("app/api/admin/payments/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session" },
    "@/lib/db": { pool: { getConnection: async () => conn }, query: async () => [] },
  });
  const { NextRequest } = require("next/server");
  for (const status of ["paid", "cancelled"]) {
    statements.length = 0;
    await route.PUT(new NextRequest("http://localhost/api/admin/payments", { method: "PUT", body: JSON.stringify({ paymentNo: "PAYTEST", status }) }));
    const [sql, params] = statements.find(([statement]) => statement.startsWith("INSERT INTO notifications"));
    assert.match(sql, /INSERT INTO notifications \(user_id, title, body\)/);
    assert.equal(params[0], 2);
    assert.equal(params[1], status === "paid" ? "ชำระเงินสำเร็จ" : "ยกเลิกรายการชำระเงิน");
    assert.match(params[2], /Fitness 1 เดือน/);
  }
});

test("members mark only their own notifications as read", async () => {
  const seen = [];
  const route = load("app/api/notifications/read/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { ...load("lib/security.ts"), checkRateLimit: () => null, clientIp: async () => "test" },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return { affectedRows: 3 }; } },
  });
  const response = await route.POST(new Request("http://localhost/api/notifications/read", { method: "POST", headers: { "sec-fetch-site": "same-origin" } }));
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [["UPDATE notifications SET status = 'read' WHERE user_id = ? AND status = 'unread'", [2]]]);
  assert.equal((await route.POST(new Request("http://localhost/api/notifications/read", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }))).status, 403);
});

function saleConnection({ user = { id: 2, status: "active" }, replay = null, coupon = null } = {}) {
  const statements = [];
  let committed = false;
  return {
    statements,
    get committed() { return committed; },
    beginTransaction: async () => {}, commit: async () => { committed = true; }, rollback: async () => {}, release: () => {},
    execute: async (sql, params) => {
      statements.push([sql, params]);
      if (sql.includes("request_id = ?")) return [replay ? [replay] : []];
      if (sql.includes("FROM users")) return [user ? [user] : []];
      if (sql.includes("FROM coupons")) return [coupon ? [coupon] : []];
      if (sql.startsWith("INSERT INTO payments")) return [{ insertId: 77 }];
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}

function salesRoute(body, conn) {
  return load("app/api/admin/sales/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session" },
    "@/lib/security": { parseJsonBody: async () => body, validationErrorResponse: () => Response.json({}, { status: 400 }), secureResponse: (response) => response },
    "@/lib/payment-catalog": { resolvePaymentItem: async ({ contentId }) => (contentId === 101 ? { amount: 19200, itemName: "Fitness (12 เดือน)", itemType: "membership", contentId: 101, grant: { months: 12, pausesAllowed: 2 } } : null) },
    "@/lib/db": { query: async () => [], createPublicId: (prefix) => `${prefix}SALE1`, pool: { getConnection: async () => conn } },
  });
}

test("counter sale records a paid staff-attributed payment and grants the plan at the server price", async () => {
  const { NextRequest } = require("next/server");
  const conn = saleConnection();
  const response = await salesRoute({ userId: 2, kind: "content", itemId: 101, method: "cash", requestId: "sale-req-0001", amount: 1, expectedAmount: 19200 }, conn).POST(new NextRequest("http://localhost/api/admin/sales", { method: "POST" }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { paymentNo: "PAYSALE1", status: "paid" });
  const [paySql, payParams] = conn.statements.find(([sql]) => sql.startsWith("INSERT INTO payments"));
  assert.match(paySql, /request_id/);
  assert.deepEqual(payParams.slice(1, 5), [2, "cash", 19200, "paid"], "server price, cash, paid");
  const metadata = JSON.parse(payParams.find((value) => typeof value === "string" && value.startsWith("{")));
  assert.deepEqual({ channel: metadata.channel, soldBy: metadata.soldBy, months: metadata.grant.months }, { channel: "counter", soldBy: 7, months: 12 });
  assert.equal(conn.statements.find(([sql]) => sql.includes("INSERT INTO memberships"))[1][3], 12);
  assert.ok(conn.statements.some(([sql]) => sql.startsWith("INSERT INTO notifications")));
  assert.ok(conn.statements.some(([sql, params]) => sql.includes("admin_audit_logs") && params.includes("PAYSALE1")));
  assert.ok(conn.statements.findIndex(([sql]) => sql.includes("FROM users") && sql.includes("FOR UPDATE")) < conn.statements.findIndex(([sql]) => sql.startsWith("INSERT INTO payments")));
  assert.equal(conn.committed, true);
});

test("counter sale is idempotent, refuses inactive members and sells coupons with their terms", async () => {
  const { NextRequest } = require("next/server");
  const request = () => new NextRequest("http://localhost/api/admin/sales", { method: "POST" });
  const replay = saleConnection({ replay: { paymentNo: "PAYFIRST1", status: "paid" } });
  const replayed = await salesRoute({ userId: 2, kind: "content", itemId: 101, method: "card", requestId: "sale-req-0002" }, replay).POST(request());
  assert.deepEqual(await replayed.json(), { paymentNo: "PAYFIRST1", status: "paid", replayed: true });
  assert.equal(replay.statements.some(([sql]) => sql.startsWith("INSERT")), false);
  const suspended = saleConnection({ user: { id: 2, status: "suspended" } });
  assert.equal((await salesRoute({ userId: 2, kind: "content", itemId: 101, method: "cash", requestId: "sale-req-0003" }, suspended).POST(request())).status, 409);
  assert.equal((await salesRoute({ userId: 2, kind: "content", itemId: 999, method: "cash", requestId: "sale-req-0004" }, saleConnection()).POST(request())).status, 404);
  const couponConn = saleConnection({ coupon: { id: 3, name: "คูปอง Fitness 10 ใบ", price: 1600, totalUses: 10, validityDays: 60 } });
  assert.equal((await salesRoute({ userId: 2, kind: "coupon", itemId: 3, method: "promptpay", requestId: "sale-req-0005", expectedAmount: 1600 }, couponConn).POST(request())).status, 201);
  assert.deepEqual(couponConn.statements.find(([sql]) => sql.includes("INSERT INTO user_coupons"))[1], [2, 3, 10, 77, 10, 60]);
});

test("counter sales have their own permission, granted to desk, manager and finance roles", () => {
  assert.deepEqual(load("lib/admin-permissions.ts").requiredPermissions("sales", "POST"), ["sales.manage"]);
  const schema = readFileSync("database/schema.sql", "utf8");
  assert.match(schema, /\('sales\.manage', 'ขายหน้าเคาน์เตอร์', 'Counter sales', 'sales'\)/);
  for (const role of ["manager", "front_desk", "finance"]) {
    const grant = schema.split(";").find((statement) => statement.includes(`WHERE r.code = '${role}'`) && statement.includes("admin_role_permissions"));
    assert.match(grant, /'sales\.manage'/, role);
  }
});

test("staff see a member's packages, coupons, rights and waiting payments", async () => {
  const seen = [];
  const route = load("app/api/admin/members/rights/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return [{ id: 1 }]; } },
  });
  const { NextRequest } = require("next/server");
  const response = await route.GET(new NextRequest("http://localhost/api/admin/members/rights?userId=2"));
  assert.deepEqual(Object.keys(await response.json()).sort(), ["coupons", "entitlements", "memberships", "pauses", "pending"]);
  assert.ok(seen.every(([, params]) => params[0] === 2), "every query is scoped to the member");
  assert.equal((await route.GET(new NextRequest("http://localhost/api/admin/members/rights?userId=abc"))).status, 400);
});

const rewardItem = { id: 61, title: "น้ำเปล่า PPA", subtitle: "1 ขวด", metadata: '{"cost":5}' };
function rewardConnection({ coins = 12, replay = null } = {}) {
  const statements = [];
  return {
    statements,
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, params) => {
      statements.push([sql, params]);
      if (sql.includes("FROM wallet_accounts")) return [[{ coinBalance: coins }]];
      if (sql.includes("FROM user_entitlements")) return [replay ? [replay] : []];
      if (sql.startsWith("INSERT INTO user_entitlements")) return [{ insertId: 300 }];
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
}
function rewardRoute(body, conn) {
  return load("app/api/rewards/redeem/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => body, validationErrorResponse: () => Response.json({}, { status: 400 }) },
    "@/lib/db": { query: async (sql, params) => (params[0] === 61 ? [rewardItem] : []), pool: { getConnection: async () => conn } },
  });
}

test("seeded rewards keep their coin costs and are insert-only", () => {
  const schema = readFileSync("database/schema.sql", "utf8");
  for (const [slug, cost] of [["reward-water", 5], ["reward-towel", 15], ["reward-shuttlecock", 20], ["reward-court-hour", 30], ["reward-shirt", 50]]) {
    const line = schema.split("\n").find((row) => row.includes(`'${slug}'`));
    assert.ok(line, slug);
    assert.match(line, new RegExp(`'reward', '${slug}'.*"cost":${cost}`));
  }
  const statement = schema.split(";").find((part) => part.includes("'reward-water'"));
  assert.match(statement.trim().split("\n").filter((row) => !row.trim().startsWith("--")).join("\n"), /^INSERT IGNORE INTO app_content_items/);
});

test("redeeming a reward spends coins once and issues a one-use reward right", async () => {
  const request = () => new Request("http://localhost/api/rewards/redeem", { method: "POST" });
  const poor = rewardConnection({ coins: 3 });
  assert.equal((await rewardRoute({ contentId: 61, requestId: "reward-req-01" }, poor).POST(request())).status, 409);
  assert.equal(poor.statements.some(([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT")), false);

  const conn = rewardConnection();
  const response = await rewardRoute({ contentId: 61, requestId: "reward-req-02" }, conn).POST(request());
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { entitlementId: 300, title: "น้ำเปล่า PPA" });
  assert.ok(conn.statements.findIndex(([sql]) => sql.includes("FROM wallet_accounts") && sql.includes("FOR UPDATE")) === 0, "wallet locked first");
  assert.deepEqual(conn.statements.find(([sql]) => sql.startsWith("UPDATE wallet_accounts"))[1], [5, 2]);
  const [ledgerSql, ledgerParams] = conn.statements.find(([sql]) => sql.includes("INSERT INTO wallet_ledger"));
  assert.match(ledgerSql, /'coin_redeem'/);
  assert.equal(ledgerParams[1], -5);
  const [rightSql, rightParams] = conn.statements.find(([sql]) => sql.startsWith("INSERT INTO user_entitlements"));
  assert.match(rightSql, /'reward'/);
  assert.match(rightSql, /INTERVAL 30 DAY/);
  assert.deepEqual(JSON.parse(rightParams.at(-1)), { contentId: 61, cost: 5, requestId: "reward-req-02", source: "coin_redeem" });
  assert.ok(conn.statements.some(([sql]) => sql.startsWith("INSERT INTO notifications")));

  const replay = rewardConnection({ replay: { id: 299, title: "น้ำเปล่า PPA", contentId: "61" } });
  const replayed = await rewardRoute({ contentId: 61, requestId: "reward-req-02" }, replay).POST(request());
  assert.deepEqual(await replayed.json(), { entitlementId: 299, title: "น้ำเปล่า PPA", replayed: true });
  assert.equal(replay.statements.some(([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT")), false);
  assert.equal((await rewardRoute({ contentId: 99, requestId: "reward-req-03" }, rewardConnection()).POST(request())).status, 404);
});

const settingItem = (slug, metadata, extra = {}) => ({ id: 9, contentType: "site_setting", slug, title: "Setting", subtitle: null, body: null, metadata: JSON.stringify(metadata), ...extra });

test("support contact comes from the site setting with safe fallbacks", () => {
  const { supportContact, telHref } = load("lib/site-settings.ts");
  const defaults = supportContact([]);
  assert.deepEqual(defaults, { phone: "02-123-4567", email: "support@ppapowerplay.com", line: "@ppapowerplay", lineUrl: "https://line.me/R/ti/p/@ppapowerplay", hours: "08:00-21:00" });
  const custom = { phone: "081-111-2222", email: "desk@club.example", line: "@club.desk", lineUrl: "https://lin.ee/AbC123", hours: "06:00-23:00" };
  assert.deepEqual(supportContact([settingItem("support-contact", custom)]), custom);
  // Malformed or unsafe values never reach tel:/mailto:/links. The LINE link follows a valid LINE ID.
  assert.deepEqual(supportContact([settingItem("support-contact", { phone: "<b>call</b>", email: "not-an-email", line: "@club", lineUrl: "javascript:alert(1)", hours: "x".repeat(80) })]), { ...defaults, line: "@club", lineUrl: "https://line.me/R/ti/p/@club" });
  assert.equal(supportContact([settingItem("support-contact", { lineUrl: "https://evil.example/line" })]).lineUrl, defaults.lineUrl);
  assert.equal(supportContact([settingItem("other-setting", custom)]).phone, defaults.phone);
  assert.equal(supportContact([{ ...settingItem("support-contact", custom), contentType: "home_slide" }]).phone, defaults.phone);
  assert.equal(telHref("02-123-4567"), "tel:021234567");
  assert.equal(telHref("+66 81 234 5678"), "tel:+66812345678");
});

test("privacy consent is asked only for an active policy version the member has not accepted", () => {
  const { privacyPolicy, needsConsent } = load("lib/site-settings.ts");
  const item = settingItem("privacy-policy", { version: "2026-11-01" }, { title: "นโยบายความเป็นส่วนตัว", subtitle: "สรุป", body: "เนื้อหา" });
  assert.equal(privacyPolicy([]), null);
  assert.equal(privacyPolicy([{ ...item, metadata: "{}" }]), null, "a policy needs a version");
  assert.equal(privacyPolicy([{ ...item, metadata: JSON.stringify({ version: "<v1>" }) }]), null);
  assert.deepEqual(privacyPolicy([item]), { id: 9, title: "นโยบายความเป็นส่วนตัว", summary: "สรุป", body: "เนื้อหา", version: "2026-11-01", url: null });
  assert.equal(privacyPolicy([settingItem("privacy-policy", { version: "v2", url: "https://club.example/privacy" })]).url, "https://club.example/privacy");
  assert.equal(privacyPolicy([settingItem("privacy-policy", { version: "v2", url: "javascript:alert(1)" })]).url, null);
  const policy = privacyPolicy([item]);
  assert.equal(needsConsent(policy, { acceptedAt: null, version: null }), true);
  assert.equal(needsConsent(policy, undefined), true);
  assert.equal(needsConsent(policy, { acceptedAt: "2026-11-01 10:00:00", version: "2026-11-01" }), false);
  assert.equal(needsConsent(policy, { acceptedAt: "2026-10-01 10:00:00", version: "2026-10-01" }), true, "a new version asks again");
  assert.equal(needsConsent(null, { acceptedAt: null, version: null }), false);
});

test("members can accept only the active privacy policy version", async () => {
  const seen = [];
  let policyVersion = "2026-11-01";
  const route = load("app/api/consent/route.ts", memberMocks({
    query: async (sql, params) => {
      seen.push([sql, params]);
      if (sql.includes("FROM app_content_items")) return policyVersion ? [{ metadata: JSON.stringify({ version: policyVersion }) }] : [];
      return { affectedRows: 1 };
    },
  }));
  const post = (body, site = "same-origin") => route.POST(new Request("http://localhost/api/consent", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": site }, body: JSON.stringify(body) }));
  const accepted = await post({ version: "2026-11-01" });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).version, "2026-11-01");
  assert.match(seen.find(([sql]) => sql.includes("FROM app_content_items"))[0], /content_type = 'site_setting' AND slug = 'privacy-policy' AND active = TRUE/);
  assert.deepEqual(seen.find(([sql]) => sql.startsWith("UPDATE users")), ["UPDATE users SET pdpa_accepted_at = NOW(), pdpa_version = ? WHERE id = ?", ["2026-11-01", 2]]);
  seen.length = 0;
  assert.equal((await post({ version: "2026-10-01" })).status, 409, "an outdated version is refused");
  assert.equal(seen.some(([sql]) => sql.startsWith("UPDATE users")), false);
  policyVersion = null;
  assert.equal((await post({ version: "2026-11-01" })).status, 404, "no active policy");
  assert.equal((await post({ version: "2026-11-01" }, "cross-site")).status, 403);
  assert.equal((await post({ version: "<script>" })).status, 400);
});

test("bootstrap tells the app which privacy policy version the member accepted", async () => {
  const seen = [];
  const bootstrap = (row) => load("app/api/bootstrap/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2, displayName: "Member", memberCode: "PPA-1" }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test" },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return sql.includes("pdpa_version") && row ? [row] : []; } },
  });
  const body = await (await bootstrap({ acceptedAt: "2026-11-01 10:00:00", version: "2026-11-01" }).GET()).json();
  assert.deepEqual(body.consent, { acceptedAt: "2026-11-01 10:00:00", version: "2026-11-01" });
  const [sql, params] = seen.find(([text]) => text.includes("pdpa_version"));
  assert.match(sql, /SELECT pdpa_accepted_at acceptedAt, pdpa_version version FROM users WHERE id = \? LIMIT 1/);
  assert.deepEqual(params, [2]);
  assert.deepEqual((await (await bootstrap(null).GET()).json()).consent, { acceptedAt: null, version: null });
});

test("consent columns and site settings are insert-only, with the privacy policy off until reviewed", () => {
  const schema = readFileSync("database/schema.sql", "utf8");
  assert.match(schema, /ALTER TABLE users ADD COLUMN IF NOT EXISTS pdpa_accepted_at DATETIME NULL/);
  assert.match(schema, /ALTER TABLE users ADD COLUMN IF NOT EXISTS pdpa_version VARCHAR\(20\) NULL/);
  const statement = (slug) => schema.split(";").find((part) => part.includes(`'${slug}'`)).trim().split("\n").filter((row) => !row.trim().startsWith("--")).join("\n");
  const contact = statement("support-contact");
  assert.match(contact, /^INSERT IGNORE INTO app_content_items/);
  assert.match(contact, /'site_setting', 'support-contact'.*"phone":"02-123-4567".*"lineUrl":"https:\/\/line\.me\/R\/ti\/p\/@ppapowerplay"/s);
  const policy = statement("privacy-policy");
  assert.match(policy, /^INSERT IGNORE INTO app_content_items \(content_type, slug, title, subtitle, body, icon, action_label, target_screen, price, metadata, active, sort_order\)/);
  assert.match(policy, /'site_setting', 'privacy-policy'[\s\S]*'\{"version":"2026-11-01"\}', FALSE, \d+\)$/);
});

test("staff see which privacy policy version a member accepted and when", async () => {
  const seen = [];
  const route = load("app/api/admin/members/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 9 }), adminSessionCookieName: () => "session" },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return sql.includes("FROM users u") ? [{ id: 4, displayName: "Member", pdpaAcceptedAt: "2026-11-01 10:00:00", pdpaVersion: "2026-11-01" }] : []; }, pool: {} },
  });
  const { NextRequest } = require("next/server");
  const response = await route.GET(new NextRequest("http://localhost/api/admin/members?id=4"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.member.pdpaVersion, "2026-11-01");
  assert.match(seen.find(([sql]) => sql.includes("FROM users u"))[0], /u\.pdpa_accepted_at pdpaAcceptedAt, u\.pdpa_version pdpaVersion/);
});

test("consuming a QR records a visit with the right's title for the member's history", async () => {
  const titleQueries = {
    member: /\(SELECT plan_name FROM memberships WHERE id = \? AND user_id = \? AND NOT EXISTS \(SELECT 1 FROM membership_pauses .* LIMIT 1\)/,
    booking: /\(SELECT title FROM bookings WHERE booking_no = \? AND user_id = \? LIMIT 1\)/,
    coupon: /\(SELECT c\.name FROM user_coupons uc JOIN coupons c ON c\.id = uc\.coupon_id WHERE uc\.id = \? AND uc\.user_id = \? LIMIT 1\)/,
    entitlement: /\(SELECT title FROM user_entitlements WHERE id = \? AND user_id = \? LIMIT 1\)/,
  };
  const { NextRequest } = require("next/server");
  for (const [purpose, titleQuery] of Object.entries(titleQueries)) {
    const visits = [];
    let consumable = true;
    const conn = {
      beginTransaction: async () => {}, rollback: async () => {}, commit: async () => {}, release: () => {},
      execute: async (sql, params) => {
        if (sql.includes("FROM qr_tokens")) return [[{ id: 11, userId: 2, purpose, refId: "3", usedAt: null, expired: 0 }]];
        if (sql.startsWith("INSERT INTO member_visits")) visits.push([sql, params]);
        if (sql.startsWith("SELECT")) return [consumable ? [{ id: 3 }] : []];
        return [{ affectedRows: consumable ? 1 : 0 }];
      },
    };
    const route = load("app/api/admin/qr/verify/route.ts", {
      "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session", hasAdminPermission: () => true },
      "@/lib/db": { pool: { getConnection: async () => conn } },
    });
    const call = (consume) => route.POST(new NextRequest("http://localhost/api/admin/qr/verify", { method: "POST", body: JSON.stringify({ token: "a".repeat(43), consume }) }));
    assert.equal((await call(false)).status, 200);
    assert.equal(visits.length, 0, `${purpose}: a preview is not a visit`);
    assert.equal((await call(true)).status, 200);
    assert.equal(visits.length, 1, purpose);
    const [sql, params] = visits[0];
    assert.match(sql, /^INSERT INTO member_visits \(user_id, purpose, ref_id, title, staff_id, qr_token_id\) VALUES \(\?, \?, \?, \(SELECT/);
    assert.match(sql, titleQuery);
    assert.deepEqual(params, [2, purpose, "3", "3", 2, 7, 11]);
    consumable = false;
    visits.length = 0;
    assert.equal((await call(true)).status, 409);
    assert.equal(visits.length, 0, `${purpose}: a refused scan is not a visit`);
  }
});

test("bootstrap returns the member's 20 most recent visits", async () => {
  const seen = [];
  const visit = { id: 1, purpose: "member", title: "Fitness (12 เดือน)", createdAt: "2026-11-01 09:00:00" };
  const route = load("app/api/bootstrap/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2, displayName: "Member", memberCode: "PPA-1" }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test" },
    "@/lib/db": { query: async (sql, params) => { seen.push([sql, params]); return sql.includes("FROM member_visits") ? [visit] : []; } },
  });
  const body = await (await route.GET()).json();
  assert.deepEqual(body.visits, [visit]);
  assert.deepEqual(seen.find(([sql]) => sql.includes("FROM member_visits")), ["SELECT id, purpose, title, created_at createdAt FROM member_visits WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20", [2]]);
});

test("visits are stored per member with the scanning staff and QR token", () => {
  const schema = readFileSync("database/schema.sql", "utf8");
  const table = schema.split(";").find((part) => part.includes("CREATE TABLE IF NOT EXISTS member_visits"));
  assert.ok(table, "member_visits table");
  for (const column of [/user_id BIGINT UNSIGNED NOT NULL/, /purpose VARCHAR\(20\) NOT NULL/, /ref_id VARCHAR\(80\) NULL/, /title VARCHAR\(180\) NULL/, /staff_id BIGINT UNSIGNED NULL/, /qr_token_id BIGINT UNSIGNED NULL/, /KEY idx_member_visits_user \(user_id, created_at\)/, /FOREIGN KEY \(user_id\) REFERENCES users\(id\)/]) assert.match(table, column);
});

test("staff always see every payment awaiting confirmation, pending first", () => {
  const { adminPaymentListSql } = load("lib/admin-payment-list.ts");
  assert.match(adminPaymentListSql, /p\.created_at createdAt/);
  assert.match(adminPaymentListSql, /ORDER BY p\.status = 'created' DESC, p\.created_at DESC LIMIT 200$/, "pending payments never drop off behind newer paid ones");
  for (const file of ["app/AdminConsole/page.tsx", "app/api/admin/payments/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /adminPaymentListSql/, `${file} uses the shared staff payment list`);
    assert.doesNotMatch(source, /FROM payments p JOIN users u ON u\.id = p\.user_id ORDER BY/, `${file} has no separate payment list query`);
  }
});

test("app and server read the privacy policy version the same way", async () => {
  const { policyVersionOf, privacyPolicy } = load("lib/site-settings.ts");
  assert.equal(policyVersionOf(JSON.stringify({ version: "2026-12-01 " })), "2026-12-01");
  assert.equal(policyVersionOf({ version: 2 }), "2");
  for (const bad of [{}, { version: "" }, { version: "<v1>" }, { version: -1 }, { version: 1.5 }, "not json", null]) assert.equal(policyVersionOf(bad), null, JSON.stringify(bad));
  // A trailing space or a numeric version must not lock members out: the server accepts what the app sends.
  for (const [stored, sent] of [["2026-12-01 ", "2026-12-01"], [2, "2"]]) {
    assert.equal(privacyPolicy([settingItem("privacy-policy", { version: stored })]).version, sent);
    const route = load("app/api/consent/route.ts", memberMocks({ query: async (sql) => (sql.includes("FROM app_content_items") ? [{ metadata: JSON.stringify({ version: stored }) }] : { affectedRows: 1 }) }));
    const response = await route.POST(new Request("http://localhost/api/consent", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" }, body: JSON.stringify({ version: sent }) }));
    assert.equal(response.status, 200, JSON.stringify(stored));
  }
});

test("staff cannot save a privacy policy, contact setting or reward the app would ignore", async () => {
  const { contentProblem } = load("lib/site-settings.ts");
  assert.equal(contentProblem("site_setting", "privacy-policy", { version: "2026-12-01" }), null);
  assert.match(contentProblem("site_setting", "privacy-policy", {}), /version/);
  assert.match(contentProblem("site_setting", "privacy-policy", { version: "v 2" }), /version/);
  assert.equal(contentProblem("site_setting", "support-contact", { phone: "081-111-2222", email: "desk@club.example", line: "@club", lineUrl: "https://lin.ee/x", hours: "06:00-23:00" }), null);
  assert.match(contentProblem("site_setting", "support-contact", { phone: "call me" }), /phone/);
  assert.match(contentProblem("site_setting", "support-contact", { email: "desk" }), /email/);
  assert.match(contentProblem("site_setting", "support-contact", { lineUrl: "http://line.me/x" }), /lineUrl/);
  assert.equal(contentProblem("reward", "reward-water", { cost: 5 }), null);
  for (const cost of [0, -5, 2.5, "5", undefined]) assert.match(contentProblem("reward", "reward-x", { cost }), /cost/, String(cost));
  assert.equal(contentProblem("home_slide", "any", {}), null);
  const writes = [];
  const route = load("app/api/admin/content/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null },
    "@/lib/db": { query: async (sql) => { writes.push(sql); return []; } },
  });
  const { NextRequest } = require("next/server");
  const save = (method, body) => route[method](new NextRequest("http://localhost/api/admin/content", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  const policy = { contentType: "site_setting", slug: "privacy-policy", title: "นโยบายความเป็นส่วนตัว", icon: "🔒", metadata: { version: "<v1>" }, active: true, sortOrder: 20 };
  const refused = await save("POST", policy);
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /version/);
  assert.equal((await save("PUT", { ...policy, id: 3 })).status, 400);
  assert.equal(writes.length, 0, "nothing saved");
  assert.equal((await save("PUT", { ...policy, id: 3, metadata: { version: "2026-12-01" } })).status, 200);
});

test("production check warns when payment slips would be stored inside the app folder", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const path = await import("node:path");
  const appDir = mkdtempSync("/tmp/ppa-prodcheck-");
  try {
    const env = { PATH: process.env.PATH, DB_HOST: "db", DB_NAME: "ppa", DB_USER: "ppa", DB_PASSWORD: "secret", NEXT_PUBLIC_LINE_LIFF_ID: "liff", LINE_CHANNEL_ID: "1", APP_REQUIRE_LINE: "true", NEXT_PUBLIC_REQUIRE_LINE: "true", APP_BASE_URL: "https://club.example", ADMIN_ACCESS_KEY: "k".repeat(40), PROMPTPAY_ID: "0812345678" };
    const run = (extra) => spawnSync(process.execPath, [path.resolve("scripts/production-check.mjs")], { cwd: appDir, env: { ...env, ...extra }, encoding: "utf8" });
    for (const extra of [{}, { SLIP_STORAGE_DIR: path.join(appDir, "storage", "payment-slips") }]) {
      const result = run(extra);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stderr, /SLIP_STORAGE_DIR/, JSON.stringify(extra));
    }
    const outside = run({ SLIP_STORAGE_DIR: "/var/lib/ppa/payment-slips" });
    assert.equal(outside.status, 0, outside.stderr);
    assert.doesNotMatch(outside.stderr, /SLIP_STORAGE_DIR/);
  } finally {
    rmSync(appDir, { recursive: true, force: true });
  }
});

test("slips are accepted only for PromptPay payments and a replaced slip is kept for staff", async () => {
  const { readdirSync, writeFileSync } = await import("node:fs");
  await withSlipDir(async (dir) => {
    const base = { id: 9, paymentNo: "PAYMINE1234", status: "created", method: "promptpay", slipPath: null, bookingId: null, metadataText: JSON.stringify({ itemName: "Fitness 1 เดือน" }) };
    let conn = slipConnection({ payment: { ...base, method: "cash" } });
    const cash = await uploadSlip(slipRoute(conn), "PAYMINE1234");
    assert.equal(cash.status, 409);
    assert.equal((await cash.json()).code, "NOT_PROMPTPAY");
    assert.equal(readdirSync(dir).length, 0);
    const earlier = "PAYMINE1234-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.png";
    writeFileSync(`${dir}/${earlier}`, png);
    conn = slipConnection({ payment: { ...base, slipPath: earlier } });
    assert.equal((await uploadSlip(slipRoute(conn), "PAYMINE1234")).status, 200);
    const files = readdirSync(dir);
    assert.equal(files.length, 2, "the earlier slip stays on disk as evidence");
    const [sql, params] = conn.statements.find(([text]) => text.startsWith("UPDATE payments"));
    assert.equal(sql, "UPDATE payments SET slip_path = ?, slip_uploaded_at = NOW(), metadata = ? WHERE id = ?");
    const metadata = JSON.parse(params[1]);
    assert.deepEqual(metadata.previousSlips, [earlier]);
    assert.equal(metadata.itemName, "Fitness 1 เดือน", "other metadata is preserved");
  });
});

test("staff can open earlier slips and the list says how many there are", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const dir = mkdtempSync("/tmp/ppa-slip-admin-");
  process.env.SLIP_STORAGE_DIR = dir;
  const current = "PAYMINE1234-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.png";
  const earlier = "PAYMINE1234-11111111-2222-3333-4444-555555555555.png";
  writeFileSync(`${dir}/${current}`, png);
  writeFileSync(`${dir}/${earlier}`, Buffer.concat([png, Buffer.from([7])]));
  try {
    const route = load("app/api/admin/payments/slip/route.ts", {
      "@/lib/admin-auth": { assertAdminRequest: async () => null },
      "@/lib/db": { query: async (sql, params) => (params[0] === "PAYMINE1234" ? [{ slipPath: current, metadataText: JSON.stringify({ previousSlips: [earlier] }) }] : []) },
    });
    const { NextRequest } = require("next/server");
    const get = (query) => route.GET(new NextRequest(`http://localhost/api/admin/payments/slip?paymentNo=PAYMINE1234${query}`));
    const old = await get("&previous=0");
    assert.equal(old.status, 200);
    assert.equal(Buffer.from(await old.arrayBuffer()).length, png.length + 1);
    assert.equal((await get("&previous=3")).status, 404);
    assert.equal((await get("&previous=x")).status, 400);
  } finally {
    delete process.env.SLIP_STORAGE_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
  assert.match(load("lib/admin-payment-list.ts").adminPaymentListSql, /JSON_LENGTH\(p\.metadata, '\$\.previousSlips'\) previousSlipCount/);
});

test("a zero-amount PromptPay payment gets a clear answer instead of a server error", async () => {
  const route = load("app/api/payments/promptpay/route.ts", memberMocks({ query: async () => [{ paymentNo: "PAYZERO1234", amount: 0, status: "created", method: "promptpay", bookingId: null, slipUploadedAt: null }] }));
  const { NextRequest } = require("next/server");
  process.env.PROMPTPAY_ID = "0812345678";
  try {
    const response = await route.GET(new NextRequest("http://localhost/api/payments/promptpay?paymentNo=PAYZERO1234"));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "NOTHING_TO_PAY");
  } finally {
    delete process.env.PROMPTPAY_ID;
  }
});

test("the wallet offers PromptPay payment only where it can work", async () => {
  const { pendingPaymentAction } = load("lib/payment-presentation.ts");
  assert.equal(pendingPaymentAction({ method: "promptpay", slipUploadedAt: null }, true), "pay");
  assert.equal(pendingPaymentAction({ method: "promptpay", slipUploadedAt: "2026-11-01 10:00:00" }, true), "slip-sent");
  assert.equal(pendingPaymentAction({ method: "promptpay", slipUploadedAt: null }, false), "counter");
  assert.equal(pendingPaymentAction({ method: "cash", slipUploadedAt: null }, true), "counter");
  assert.equal(pendingPaymentAction({ slipUploadedAt: null }, true), "pay", "older API rows without a method keep the old behaviour");
  const seen = [];
  const route = load("app/api/bootstrap/route.ts", {
    "@/lib/auth": { assertApiUser: async () => ({ id: 2, displayName: "Member", memberCode: "PPA-1" }), authErrorResponse: () => Response.json({}, { status: 401 }) },
    "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test" },
    "@/lib/db": { query: async (sql) => { seen.push(sql); return []; } },
  });
  process.env.PROMPTPAY_ID = "0812345678";
  try {
    assert.equal((await (await route.GET()).json()).promptPayEnabled, true);
  } finally {
    delete process.env.PROMPTPAY_ID;
  }
  assert.equal((await (await route.GET()).json()).promptPayEnabled, false);
  assert.match(seen.find((sql) => sql.includes("status = 'created'")), /SELECT payment_no paymentNo, method, amount/);
});

test("only staff who manage payments get the slip link", () => {
  const { canViewSlips } = load("lib/admin-permissions.ts");
  assert.equal(canViewSlips({ roleCode: "super_admin", permissionCodes: [] }), true);
  assert.equal(canViewSlips({ roleCode: "finance", permissionCodes: ["payments.manage"] }), true);
  assert.equal(canViewSlips({ roleCode: "manager", permissionCodes: ["reports.view"] }), false);
  assert.equal(canViewSlips(null), false);
});

test("one reward request id can never redeem a different reward", async () => {
  const request = () => new Request("http://localhost/api/rewards/redeem", { method: "POST" });
  // reward-req-02 already redeemed reward 62; reusing it for reward 61 must not return or spend anything.
  const conn = rewardConnection({ replay: { id: 299, title: "ผ้าขนหนูกีฬา", contentId: "62" } });
  const response = await rewardRoute({ contentId: 61, requestId: "reward-req-02" }, conn).POST(request());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "REQUEST_REUSED");
  assert.match(conn.statements.find(([sql]) => sql.includes("FROM user_entitlements"))[0], /JSON_VALUE\(metadata, '\$\.contentId'\) contentId/);
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT")), false);
});

test("the server redeems only rewards whose price the app offers", async () => {
  const request = () => new Request("http://localhost/api/rewards/redeem", { method: "POST" });
  // The app disables these (rewardCost() is null); a crafted request must not redeem them either.
  for (const cost of ["5", true, 2.5, 0, 1e21]) {
    const conn = rewardConnection({ coins: 99 });
    const route = load("app/api/rewards/redeem/route.ts", {
      "@/lib/auth": { assertApiUser: async () => ({ id: 2 }), authErrorResponse: () => Response.json({}, { status: 401 }) },
      "@/lib/security": { checkRateLimit: () => null, clientIp: async () => "test", parseJsonBody: async () => ({ contentId: 61, requestId: "reward-req-09" }), validationErrorResponse: () => Response.json({}, { status: 400 }) },
      "@/lib/db": { query: async () => [{ ...rewardItem, metadata: JSON.stringify({ cost }) }], pool: { getConnection: async () => conn } },
    });
    assert.equal((await route.POST(request())).status, 404, JSON.stringify(cost));
    assert.equal(conn.statements.length, 0, `nothing is locked or spent for cost ${JSON.stringify(cost)}`);
  }
});

test("reward retries reuse one request id and rewards without a whole-number price cannot be redeemed", () => {
  const { rewardCost, keepRequestForRetry } = load("lib/payment-presentation.ts");
  assert.equal(rewardCost(JSON.stringify({ cost: 5 })), 5);
  assert.equal(rewardCost({ cost: 50 }), 50);
  for (const bad of [{ cost: 2.5 }, { cost: 0 }, { cost: -3 }, { cost: "5" }, {}, null, "not json"]) assert.equal(rewardCost(bad), null, JSON.stringify(bad));
  assert.equal(keepRequestForRetry(new Error("network down")), true, "unknown outcome: the retry must reuse the id");
  assert.equal(keepRequestForRetry(Object.assign(new Error("busy"), { status: 503 })), true);
  assert.equal(keepRequestForRetry(Object.assign(new Error("not enough coins"), { status: 409 })), false);
  const { contentProblem } = load("lib/site-settings.ts");
  assert.equal(contentProblem("reward", "reward-x", { cost: 5 }), null, "admin save uses the same price rule");
  assert.match(contentProblem("reward", "reward-x", { cost: 2.5 }), /cost/);
});

test("finance can open members to sell at the counter but cannot edit them", () => {
  const { canAccessSection, requiredPermissions } = load("lib/admin-permissions.ts");
  const salesOnly = (permission) => ["dashboard.view", "sales.manage"].includes(permission);
  assert.equal(canAccessSection("members", salesOnly), true);
  assert.equal(canAccessSection("members", (permission) => permission === "dashboard.view"), false);
  assert.deepEqual(requiredPermissions("members", "GET"), ["members.manage", "sales.manage"], "list, detail and rights");
  assert.deepEqual(requiredPermissions("members", "PUT"), ["members.manage"], "profile edits");
  assert.deepEqual(requiredPermissions("members", "POST"), ["members.manage"], "credit adjustments");
  assert.deepEqual(requiredPermissions("profile", "GET"), []);
  assert.equal(requiredPermissions("unknown", "GET"), null);
  assert.match(readFileSync("lib/admin-auth.ts", "utf8"), /requiredPermissions\(resource, request\.method\)/);
});

test("counter sale charges only the price the staff confirmed and reads the catalog before locking rows", async () => {
  const events = [];
  const conn = saleConnection();
  conn.beginTransaction = async () => { events.push("begin"); };
  const route = (body) => load("app/api/admin/sales/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session" },
    "@/lib/security": { parseJsonBody: async () => body, validationErrorResponse: () => Response.json({}, { status: 400 }), secureResponse: (response) => response },
    "@/lib/payment-catalog": { resolvePaymentItem: async () => { events.push("catalog"); return { amount: 19200, itemName: "Fitness (12 เดือน)", itemType: "membership", contentId: 101, grant: { months: 12 } }; } },
    "@/lib/db": { query: async () => [], createPublicId: (prefix) => `${prefix}SALE9`, pool: { getConnection: async () => conn } },
  });
  const { NextRequest } = require("next/server");
  const response = await route({ userId: 2, kind: "content", itemId: 101, method: "cash", requestId: "sale-req-0100", expectedAmount: 19000 }).POST(new NextRequest("http://localhost/api/admin/sales", { method: "POST" }));
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "PRICE_CHANGED");
  assert.equal(body.amount, 19200);
  assert.equal(conn.statements.some(([sql]) => sql.startsWith("INSERT INTO payments")), false, "nothing sold at a price the staff did not confirm");
  assert.deepEqual(events.slice(0, 2), ["catalog", "begin"], "catalog read before the transaction locks the member row");
  for (const file of ["app/api/admin/sales/route.ts", "app/api/admin/payments/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /grantCoupon\(/, `${file} uses the shared coupon grant`);
    assert.doesNotMatch(source, /INSERT INTO user_coupons/, file);
  }
});

function decisionConnection(row) {
  const statements = [];
  return {
    statements,
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql, params) => {
      statements.push([sql, params]);
      if (sql.includes("FROM payments WHERE")) return [[row]];
      if (sql.startsWith("SELECT")) return [[]];
      return [{ affectedRows: 1, insertId: 5 }];
    },
  };
}
const decisionRoute = (conn) => load("app/api/admin/payments/route.ts", {
  "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7 }), adminSessionCookieName: () => "session" },
  "@/lib/db": { pool: { getConnection: async () => conn }, query: async () => [] },
});
const decide = (route, body) => {
  const { NextRequest } = require("next/server");
  return route.PUT(new NextRequest("http://localhost/api/admin/payments", { method: "PUT", body: JSON.stringify(body) }));
};

test("staff cancel records a reason, and a cancelled payment with a slip waits for a recorded refund", async () => {
  const slipRow = { id: 41, paymentNo: "PAYSLIP1234", userId: 2, bookingId: null, status: "created", amount: 2000, slipPath: "PAYSLIP1234-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.png", metadataText: JSON.stringify({ itemType: "membership", itemName: "Fitness 1 เดือน" }) };
  let conn = decisionConnection(slipRow);
  assert.equal((await decide(decisionRoute(conn), { paymentNo: "PAYSLIP1234", status: "cancelled", reason: "ยอดโอนไม่ตรง" })).status, 200);
  const [sql, params] = conn.statements.find(([text]) => text.startsWith("UPDATE payments"));
  assert.equal(sql, "UPDATE payments SET status = ?, metadata = ? WHERE id = ?");
  assert.equal(params[0], "cancelled");
  const metadata = JSON.parse(params[1]);
  assert.equal(metadata.cancelReason, "ยอดโอนไม่ตรง");
  assert.deepEqual(metadata.refund, { status: "pending" });
  assert.equal(metadata.itemName, "Fitness 1 เดือน", "existing metadata is kept");
  assert.match(conn.statements.find(([text]) => text.startsWith("INSERT INTO notifications"))[1][2], /ยอดโอนไม่ตรง/);
  conn = decisionConnection({ ...slipRow, slipPath: null });
  await decide(decisionRoute(conn), { paymentNo: "PAYSLIP1234", status: "cancelled", reason: "ลูกค้าขอยกเลิก" });
  assert.equal(JSON.parse(conn.statements.find(([text]) => text.startsWith("UPDATE payments"))[1][1]).refund, undefined, "no slip, nothing to refund");
  conn = decisionConnection({ ...slipRow, status: "cancelled", metadataText: JSON.stringify({ itemName: "Fitness 1 เดือน", refund: { status: "pending" } }) });
  assert.equal((await decide(decisionRoute(conn), { paymentNo: "PAYSLIP1234", status: "refunded", reason: "โอนคืนแล้ว 1/11" })).status, 200);
  const [refundSql, refundParams] = conn.statements.find(([text]) => text.startsWith("UPDATE payments"));
  assert.equal(refundSql, "UPDATE payments SET status = 'refunded', metadata = ? WHERE id = ?");
  const refund = JSON.parse(refundParams[0]).refund;
  assert.equal(refund.status, "done");
  assert.equal(refund.by, 7);
  assert.equal(refund.note, "โอนคืนแล้ว 1/11");
  assert.equal(conn.statements.find(([text]) => text.startsWith("INSERT INTO notifications"))[1][1], "คืนเงินแล้ว");
  for (const row of [{ ...slipRow, status: "cancelled", metadataText: "{}" }, slipRow]) {
    conn = decisionConnection(row);
    assert.equal((await decide(decisionRoute(conn), { paymentNo: "PAYSLIP1234", status: "refunded" })).status, 409);
    assert.equal(conn.statements.some(([text]) => text.startsWith("UPDATE")), false);
  }
  assert.match(load("lib/admin-payment-list.ts").adminPaymentListSql, /JSON_VALUE\(p\.metadata, '\$\.refund\.status'\) refundStatus, JSON_VALUE\(p\.metadata, '\$\.cancelReason'\) cancelReason/);
});

test("staff decide a waiting payment as paid or cancelled only, so every refund owed can be recorded", async () => {
  // A "failed" decision used to mark a slip-backed payment refund-pending in a state the refund
  // action and the dashboard never pick up; staff reject a payment by cancelling it with a reason.
  const slipRow = { id: 42, paymentNo: "PAYSLIP5678", userId: 2, bookingId: null, status: "created", amount: 500, slipPath: "PAYSLIP5678-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.png", metadataText: "{}" };
  const conn = decisionConnection(slipRow);
  assert.equal((await decide(decisionRoute(conn), { paymentNo: "PAYSLIP5678", status: "failed", reason: "สลิปปลอม" })).status, 400);
  assert.equal(conn.statements.length, 0, "nothing is read or changed");
});

test("LINE push runs after the response and carries Thai and English", () => {
  const scheduled = [];
  const notify = load("lib/notify.ts", { "next/server": { after: (task) => scheduled.push(task) } });
  const { resources } = load("lib/i18n/index.ts");
  assert.equal(notify.pushText("ชำระเงินสำเร็จ", "Fitness 1 เดือน · 2,000 ฿"), `ชำระเงินสำเร็จ / ${resources.en.translation["ชำระเงินสำเร็จ"]}\nFitness 1 เดือน · 2,000 ฿`);
  assert.equal(notify.pushText("หัวข้อที่ไม่มีคำแปล", "x"), "หัวข้อที่ไม่มีคำแปล\nx");
  notify.pushAfterResponse(2, "text");
  assert.equal(scheduled.length, 1, "scheduled with after()");
  const outside = load("lib/notify.ts", { "next/server": { after: () => { throw new Error("outside a request"); } } });
  assert.doesNotThrow(() => outside.pushAfterResponse(2, "text"));
  for (const file of ["app/api/admin/payments/route.ts", "app/api/admin/sales/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /pushAfterResponse\(/, file);
    assert.doesNotMatch(source, /void pushLineMessage/, file);
  }
});

test("every notification title the server writes has app translations", () => {
  const { allMessages } = load("lib/i18n/index.ts");
  const keys = new Set(allMessages.map(([key]) => key));
  const titles = new Set(["ชำระเงินสำเร็จ", "ยกเลิกรายการชำระเงิน", "คืนเงินแล้ว"]);
  for (const file of ["app/api/rewards/redeem/route.ts", "app/api/admin/sales/route.ts"]) {
    for (const match of readFileSync(file, "utf8").matchAll(/notifyMember\(conn, [^,]+, "([^"]+)"/g)) titles.add(match[1]);
  }
  assert.ok(titles.size >= 5);
  assert.deepEqual([...titles].filter((title) => !keys.has(title)), []);
});

test("members cannot check themselves in and new bookings never expose the check-in secret", async () => {
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync("app/api/checkin/route.ts"), false, "check-in happens only when staff scan the member QR");
  const source = readFileSync("app/api/bookings/route.ts", "utf8");
  assert.doesNotMatch(source, /SELECT \* FROM bookings/);
  const returned = source.match(/"SELECT ([^"]+) FROM bookings WHERE booking_no = \? LIMIT 1"/);
  assert.ok(returned, "the created booking is read back with an explicit column list");
  assert.doesNotMatch(returned[1], /qr_secret/);
  assert.match(returned[1], /booking_no, title, starts_at, ends_at/);
  assert.doesNotMatch(readFileSync("components/member-types.ts", "utf8"), /qr_secret/);
});

test("bursts of app opens queue for a database connection instead of failing", () => {
  const saved = globalThis.ppaPool;
  const configs = [];
  const loadDb = () => {
    delete globalThis.ppaPool;
    return load("lib/db.ts", { "mysql2/promise": { createPool: (config) => { configs.push(config); return {}; } } });
  };
  try {
    loadDb();
    assert.equal(configs[0].queueLimit, 1000, "bootstrap fires ~16 queries per app open; 100 queued requests failed at ~7 opens");
    assert.equal(configs[0].connectionLimit, 10);
    process.env.DB_QUEUE_LIMIT = "250";
    process.env.DB_CONNECTION_LIMIT = "20";
    loadDb();
    assert.equal(configs[1].queueLimit, 250);
    assert.equal(configs[1].connectionLimit, 20);
    process.env.DB_QUEUE_LIMIT = "zero";
    loadDb();
    assert.equal(configs[2].queueLimit, 1000, "invalid values fall back to the default");
  } finally {
    delete process.env.DB_QUEUE_LIMIT;
    delete process.env.DB_CONNECTION_LIMIT;
    delete globalThis.ppaPool;
    if (saved) globalThis.ppaPool = saved;
  }
});

test("placeholder plans are retired once and stay active after an administrator re-activates them", () => {
  const schema = readFileSync("database/schema.sql", "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS schema_markers \(\s*name VARCHAR\(96\) NOT NULL/);
  const retire = schema.split(";").find((part) => part.includes("UPDATE app_content_items") && part.includes("slug = 'monthly'"));
  assert.match(retire, /AND NOT EXISTS \(SELECT 1 FROM schema_markers WHERE name = 'retire-placeholder-plans'\)/);
  const marker = schema.indexOf("INSERT IGNORE INTO schema_markers (name) VALUES ('retire-placeholder-plans')");
  assert.ok(marker > schema.indexOf("slug = 'monthly' AND title"), "the marker is written after the one-time retire");
  assert.ok(schema.indexOf("CREATE TABLE IF NOT EXISTS schema_markers") < schema.indexOf("slug = 'monthly' AND title"), "table exists before it is read");
});

function dashboardRows(sql) {
  if (sql.includes("'%Y-%m-%d') today")) return [{ today: "2026-11-01" }];
  if (sql.includes("FROM member_visits")) return [{ total: 12 }];
  if (sql.includes("awaiting")) return [{ awaiting: 3, withSlip: 2, oldestSlipMinutes: 95, refundsDue: 1 }];
  if (sql.includes("JOIN users u ON u.id = p.user_id WHERE p.status = 'created'")) return [{ paymentNo: "PAYQ1", displayName: "สมาชิก A", method: "promptpay", amount: 2000, status: "created" }];
  if (sql.includes("salesMonth")) return [{ salesToday: 2400, salesMonth: 48200, salesMonthCount: 31, salesPreviousToDate: 40000, cashInMonth: 52000, topupsMonth: 6000 }];
  if (sql.includes("GROUP BY DATE_FORMAT(paid_at")) return [{ day: "2026-10-31", total: 1600, count: 1 }, { day: "2026-11-01", total: 2400, count: 2 }];
  if (sql.includes("GROUP BY category")) return [{ category: "membership", total: 30000, count: 3 }, { category: "coupon", total: 18200, count: 9 }];
  if (sql.includes("GROUP BY method")) return [{ method: "promptpay", total: 40000, count: 20 }, { method: "cash", total: 12000, count: 6 }];
  if (sql.includes("FROM courts")) return [{ total: 12, available: 11, maintenance: 1 }];
  if (sql.includes("FROM bookings b") && sql.includes("checkedIn")) return [{ total: 75, checkedIn: 20 }];
  if (sql.includes("FROM bookings b")) return [{ bookingNo: "BK1", displayName: "สมาชิก A", sportName: "แบดมินตัน", courtName: "Court 1", startsAt: "2026-11-01T11:00:00.000Z", endsAt: "2026-11-01T12:00:00.000Z", status: "paid" }];
  if (sql.includes("FROM users WHERE status = 'active'")) return [{ total: 420, newToday: 2, newMonth: 15 }];
  if (sql.includes("COUNT(DISTINCT user_id)")) return [{ total: 180 }];
  if (sql.includes("INTERVAL 7 DAY")) return [{ id: 9, displayName: "สมาชิก B", memberCode: "PPA-9", phone: "0811111111", planName: "Fitness 1 เดือน", endsAt: "2026-11-04T10:00:00.000Z" }];
  return [];
}

test("dashboard figures come from SQL for stated periods and only for roles allowed to see them", async () => {
  const { loadDashboard, percentChange } = load("lib/admin-dashboard.ts", { "@/lib/db": { query: async () => [] } });
  const seen = [];
  const run = async (sql) => { seen.push(sql); return dashboardRows(sql); };
  const only = (...codes) => (permission) => codes.includes(permission);

  const desk = await loadDashboard(only("dashboard.view"), run);
  assert.deepEqual(Object.keys(desk).sort(), ["generatedAt", "today", "visitsToday"]);
  assert.equal(desk.visitsToday, 12);
  assert.equal(seen.some((sql) => sql.includes("FROM payments")), false, "no money figures without permission");

  seen.length = 0;
  const owner = await loadDashboard(only("dashboard.view", "reports.view"), run);
  assert.deepEqual({ ...owner.queue, rows: owner.queue.rows.map((row) => row.paymentNo) }, { awaiting: 3, withSlip: 2, oldestSlipMinutes: 95, refundsDue: 1, rows: ["PAYQ1"] });
  assert.match(seen.find((sql) => sql.includes("awaiting")), /TIMESTAMPDIFF\(MINUTE, MIN\(CASE WHEN status = 'created' AND slip_uploaded_at IS NOT NULL THEN slip_uploaded_at END\), NOW\(\)\) oldestSlipMinutes/, "the slip wait counts from when the member sent the slip");
  // Unpaid requests without a slip never expire, so they must not push slips or refunds off the 50-row queue.
  assert.match(seen.find((sql) => sql.includes("WHERE p.status = 'created'")), /OR \(p\.status = 'cancelled' AND JSON_VALUE\(p\.metadata, '\$\.refund\.status'\) = 'pending'\) ORDER BY CASE WHEN p\.status = 'created' AND p\.slip_uploaded_at IS NOT NULL THEN 0 WHEN p\.status = 'cancelled' THEN 1 ELSE 2 END, p\.slip_uploaded_at, p\.created_at DESC LIMIT 50$/, "slips to check (oldest slip first), then refunds due, then requests without a slip (newest first)");
  assert.equal(owner.sales.month, 48200);
  assert.equal(owner.sales.change, 20.5);
  assert.equal(owner.sales.cashInMonth, 52000);
  assert.equal(owner.sales.daily.length, 30);
  assert.deepEqual(owner.sales.daily.at(-1), { day: "2026-11-01", total: 2400, count: 2 });
  assert.equal(owner.sales.daily.at(-2).total, 1600);
  assert.equal(owner.sales.daily[0].day, "2026-10-03");
  assert.equal(owner.sales.daily[5].total, 0, "days without sales are zero, not missing");
  assert.deepEqual(owner.sales.byCategory.map((row) => row.key), ["membership", "coupon"]);
  assert.deepEqual(owner.sales.byChannel.map((row) => row.key), ["promptpay", "cash"]);
  assert.deepEqual(owner.courts, { total: 12, available: 11, maintenance: 1 });
  assert.equal(owner.schedule.length, 1);
  assert.deepEqual(owner.bookingsToday, { total: 75, checkedIn: 20 }, "today's figures count every booking, not the schedule rows shown");
  assert.equal(owner.members.expiring[0].memberCode, "PPA-9");
  assert.equal(owner.members.withMembership, 180);
  const sales = seen.find((sql) => sql.includes("salesMonth"));
  assert.match(sales, /COALESCE\(JSON_VALUE\(metadata, '\$\.kind'\), ''\) <> 'wallet_topup'/, "sales exclude wallet top-ups");
  assert.match(sales, /method <> 'wallet'/, "cash-in excludes wallet-funded payments");
  assert.match(sales, /paid_at < NOW\(\) - INTERVAL 1 MONTH/, "last month compared up to the same point in time");
  assert.match(seen.find((sql) => sql.includes("GROUP BY category")), /CASE WHEN booking_id IS NOT NULL THEN 'booking' ELSE COALESCE\(JSON_VALUE\(metadata, '\$\.itemType'\), 'other'\) END category/);
  const bookingCounts = seen.find((sql) => sql.includes("FROM bookings b") && sql.includes("checkedIn"));
  const scheduleRows = seen.find((sql) => sql.includes("FROM bookings b") && !sql.includes("checkedIn"));
  for (const text of [bookingCounts, scheduleRows]) {
    assert.match(text, /b\.starts_at >= CURDATE\(\) AND b\.starts_at < CURDATE\(\) \+ INTERVAL 1 DAY/);
    assert.match(text, /b\.status IN \('hold', 'pending_payment'\) AND b\.expires_at > NOW\(\)/, "lapsed holds are not counted or listed");
  }
  assert.match(bookingCounts, /COUNT\(CASE WHEN b\.status = 'checked_in' THEN 1 END\) checkedIn/);
  assert.doesNotMatch(bookingCounts, /LIMIT/, "the day's count is not capped");
  assert.match(scheduleRows, /AND b\.ends_at > NOW\(\) ORDER BY b\.starts_at, c\.name LIMIT 60$/, "the schedule lists what is playing now and next, not the morning's finished games");
  assert.match(seen.find((sql) => sql.includes("INTERVAL 7 DAY")), /NOT EXISTS \(SELECT 1 FROM memberships n WHERE n\.user_id = m\.user_id AND n\.status = 'active' AND n\.ends_at > m\.ends_at\)/, "members who already renewed are not listed");

  const finance = await loadDashboard(only("dashboard.view", "payments.manage"), run);
  assert.ok(finance.queue && finance.sales);
  assert.equal(finance.schedule, undefined);
  assert.equal(finance.bookingsToday, undefined);
  assert.equal(finance.members, undefined);
  const frontDesk = await loadDashboard(only("dashboard.view", "bookings.manage", "members.manage"), run);
  assert.equal(frontDesk.sales, undefined);
  assert.ok(frontDesk.schedule && frontDesk.bookingsToday && frontDesk.members && frontDesk.courts);

  assert.equal(percentChange(48200, 40000), 20.5);
  assert.equal(percentChange(100, 0), null, "no baseline, no percentage");
});

test("the dashboard refreshes through a staff-only endpoint", async () => {
  const route = load("app/api/admin/dashboard/route.ts", {
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: 7, roleCode: "finance", permissionCodes: ["dashboard.view", "payments.manage"] }), adminSessionCookieName: () => "session", hasAdminPermission: (admin, code) => admin.roleCode === "super_admin" || admin.permissionCodes.includes(code) },
    "@/lib/admin-dashboard": { loadDashboard: async (can) => ({ sales: can("payments.manage") ? { month: 1 } : undefined, schedule: can("bookings.manage") ? [] : undefined }) },
  });
  const { NextRequest } = require("next/server");
  const response = await route.GET(new NextRequest("http://localhost/api/admin/dashboard"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual(await response.json(), { sales: { month: 1 } });
  assert.deepEqual(load("lib/admin-permissions.ts").requiredPermissions("dashboard", "GET"), ["dashboard.view"]);
});
