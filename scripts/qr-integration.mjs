// Real SQL + QR encoding/decoding with fixture rows rolled back on completion.
// Authentication is isolated here; HTTP auth is covered by security-smoke.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import ts from "typescript";
import nextEnv from "@next/env";
import mysql from "mysql2/promise";
import sharp from "sharp";
import jsQR from "jsqr";
import { NextRequest } from "next/server.js";

nextEnv.loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = { exports: {} };
  cache.set(filename, compiled);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id === "server-only") return {};
    if (id.startsWith("@/")) return load(`${id.slice(2)}.ts`, mocks, cache);
    return require(id);
  };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}
const env = process.env;
const conn = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, timezone: "+07:00", connectTimeout: 10000 });
try {
  const [engines] = await conn.execute("SELECT TABLE_NAME name, ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users','memberships','user_entitlements','qr_tokens','admin_audit_logs','coupons','user_coupons','bookings','payments','wallet_accounts','wallet_ledger')");
  assert.equal(engines.length, 11);
  assert.ok(engines.every((row) => row.engine === "InnoDB"), "Fixture rollback requires transactional tables");
  await conn.beginTransaction();
  const marker = randomUUID();
  const [user] = await conn.execute("INSERT INTO users (line_user_id, display_name, member_code) VALUES (?, 'QR integration fixture', ?)", [`test-${marker}`, `TEST-${marker.slice(0, 20)}`]);
  const userId = user.insertId;
  const [staff] = await conn.execute("SELECT id FROM admin_staff WHERE status = 'active' LIMIT 1");
  assert.ok(staff.length, "Active staff required for audit FK");
  // Keep all route transactions inside our outer rollback transaction.
  const scoped = {
    execute: (...args) => conn.execute(...args),
    beginTransaction: () => conn.query("SAVEPOINT qr_route"),
    commit: () => conn.query("RELEASE SAVEPOINT qr_route"),
    rollback: () => conn.query("ROLLBACK TO SAVEPOINT qr_route"),
    release: () => {},
  };
  const mocks = {
    "next/headers": { headers: async () => new Headers() },
    "@/lib/db": { createPublicId: (prefix) => `${prefix}${randomUUID().replaceAll("-", "").slice(0, 24)}`, query: async (...args) => (await conn.execute(...args))[0], pool: { getConnection: async () => scoped } },
    "@/lib/auth": { assertApiUser: async () => ({ id: userId }) },
    "@/lib/admin-auth": { assertAdminRequest: async () => null, getAdminIdentity: async () => ({ id: staff[0].id }), adminSessionCookieName: () => "test", hasAdminPermission: () => true },
  };
  const issue = load("app/api/qr/route.ts", mocks);
  const verify = load("app/api/admin/qr/verify/route.ts", mocks);
  const [membership] = await conn.execute("INSERT INTO memberships (user_id, plan_name, starts_at, ends_at) VALUES (?, 'Integration only', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY))", [userId]);
  const [entitlement] = await conn.execute("INSERT INTO user_entitlements (user_id, entitlement_type, title, remaining_uses, ends_at) VALUES (?, 'class', 'Integration only', 1, DATE_ADD(NOW(), INTERVAL 1 DAY))", [userId]);
  const [coupon] = await conn.execute("INSERT INTO coupons (code, name, category, price) VALUES (?, 'Integration only', 'test', 100)", [marker]);
  const [userCoupon] = await conn.execute("INSERT INTO user_coupons (user_id, coupon_id, remaining_uses, expires_at) VALUES (?, ?, 1, DATE_ADD(NOW(), INTERVAL 1 DAY))", [userId, coupon.insertId]);
  const [sports] = await conn.execute("SELECT id FROM sports LIMIT 1");
  assert.ok(sports.length);
  const bookingNo = `TEST-${marker.slice(0, 20)}`;
  await conn.execute("INSERT INTO bookings (booking_no, user_id, sport_id, title, starts_at, ends_at, amount, status, qr_secret) VALUES (?, ?, ?, 'Integration only', NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR), 100, 'paid', ?)", [bookingNo, userId, sports[0].id, marker]);
  for (const purpose of ["member", "entitlement", "coupon", "booking"]) {
    const issued = await issue.GET(new NextRequest(`http://localhost/api/qr?purpose=${purpose}&entitlementId=${entitlement.insertId}&couponId=${userCoupon.insertId}&bookingNo=${bookingNo}`));
    assert.equal(issued.status, 200);
    const qr = await issued.json();
    const { data, info } = await sharp(Buffer.from(qr.svg)).resize(660, 660).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    assert.equal(decoded.data, qr.verifyUrl);
    const call = (consume) => verify.POST(new NextRequest("http://localhost/api/admin/qr/verify", { method: "POST", body: JSON.stringify({ token: decoded.data, consume }) }));
    assert.equal((await call(false)).status, 200);
    const consumed = await call(true);
    assert.equal(consumed.status, 200);
    assert.equal((await consumed.json()).consumed, true);
    assert.equal((await call(true)).status, 409);
    console.log(`PASS real SQL ${purpose}: issue → decode pixels → preview → consume → reject replay`);
  }
  const [bookingRows] = await conn.execute("SELECT status FROM bookings WHERE booking_no = ?", [bookingNo]);
  assert.equal(bookingRows[0].status, "checked_in");
  const [couponRows] = await conn.execute("SELECT remaining_uses remainingUses, status FROM user_coupons WHERE id = ?", [userCoupon.insertId]);
  assert.equal(couponRows[0].remainingUses, 0);
  assert.equal(couponRows[0].status, "used");
  const [remaining] = await conn.execute("SELECT remaining_uses remainingUses, status FROM user_entitlements WHERE id = ?", [entitlement.insertId]);
  assert.equal(remaining[0].remainingUses, 0);
  assert.equal(remaining[0].status, "used");
  await conn.execute("UPDATE memberships SET status = 'cancelled' WHERE id = ?", [membership.insertId]);
  assert.equal((await issue.GET(new NextRequest("http://localhost/api/qr?purpose=member"))).status, 404);
  console.log("PASS revoked membership cannot issue QR; entitlement decremented exactly once");
  const approve = load("app/api/admin/payments/route.ts", mocks);
  for (const kind of ["wallet_topup", "membership", "coupon"]) {
    const paymentNo = `TEST-${randomUUID().slice(0, 20)}`;
    const metadata = kind === "wallet_topup" ? { kind } : { itemType: kind, itemName: "Monthly integration only", couponId: coupon.insertId };
    const [payment] = await conn.execute("INSERT INTO payments (payment_no, user_id, method, amount, status, metadata) VALUES (?, ?, 'promptpay', 100, 'created', ?)", [paymentNo, userId, JSON.stringify(metadata)]);
    const request = () => new NextRequest("http://localhost/api/admin/payments", { method: "PUT", body: JSON.stringify({ paymentNo, status: "paid" }) });
    assert.equal((await approve.PUT(request())).status, 200);
    assert.equal((await approve.PUT(request())).status, 409);
    const [audit] = await conn.execute("SELECT staff_id staffId FROM admin_audit_logs WHERE target_id = ? AND action = 'payment.status'", [paymentNo]);
    assert.equal(audit.length, 1);
    assert.equal(Number(audit[0].staffId), Number(staff[0].id));
    if (kind === "wallet_topup") {
      const [wallet] = await conn.execute("SELECT balance FROM wallet_accounts WHERE user_id = ?", [userId]);
      assert.equal(Number(wallet[0].balance), 100);
      const [ledger] = await conn.execute("SELECT id FROM wallet_ledger WHERE ref_type = 'payment' AND ref_id = ?", [payment.insertId]);
      assert.equal(ledger.length, 1);
    } else {
      const [rights] = await conn.execute(kind === "membership" ? "SELECT id FROM memberships WHERE payment_id = ?" : "SELECT id FROM user_coupons WHERE user_id = ? AND status = 'active'", [kind === "membership" ? payment.insertId : userId]);
      assert.equal(rights.length, 1);
      const purpose = kind === "membership" ? "member" : "coupon";
      const issued = await issue.GET(new NextRequest(`http://localhost/api/qr?purpose=${purpose}&couponId=${rights[0].id}`));
      assert.equal(issued.status, 200);
      const qr = await issued.json();
      const redeemed = await verify.POST(new NextRequest("http://localhost/api/admin/qr/verify", { method: "POST", body: JSON.stringify({ token: qr.verifyUrl, consume: true }) }));
      assert.equal(redeemed.status, 200);
    }
    console.log(`PASS payment ${kind}: approve → grant once → reject repeat → staff audit${kind !== "wallet_topup" ? " → access QR redemption" : ""}`);
  }
  const buyCoupon = load("app/api/coupons/buy/route.ts", mocks);
  const bought = await buyCoupon.POST(new Request("http://localhost/api/coupons/buy", { method: "POST", body: JSON.stringify({ couponId: coupon.insertId, method: "wallet" }) }));
  assert.equal(bought.status, 200);
  const boughtBody = await bought.json();
  const [recorded] = await conn.execute("SELECT id, amount, status FROM payments WHERE payment_no = ?", [boughtBody.paymentNo]);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].status, "paid");
  const [debits] = await conn.execute("SELECT amount FROM wallet_ledger WHERE user_id = ? AND ref_type = 'payment' AND ref_id = ?", [userId, recorded[0].id]);
  assert.equal(debits.length, 1);
  assert.equal(Number(debits[0].amount), -100);
  const [walletAfter] = await conn.execute("SELECT balance FROM wallet_accounts WHERE user_id = ?", [userId]);
  assert.equal(Number(walletAfter[0].balance), 0);
  const insufficient = await buyCoupon.POST(new Request("http://localhost/api/coupons/buy", { method: "POST", body: JSON.stringify({ couponId: coupon.insertId, method: "wallet" }) }));
  assert.equal(insufficient.status, 409);
  const [walletPayments] = await conn.execute("SELECT COUNT(*) total FROM payments WHERE user_id = ? AND method = 'wallet'", [userId]);
  assert.equal(Number(walletPayments[0].total), 1);
  console.log("PASS wallet coupon purchase records payment and ledger; insufficient funds rolls back");
  await conn.execute("UPDATE coupons SET active = FALSE WHERE id = ?", [coupon.insertId]);
  const blockedNo = `TEST-${randomUUID().slice(0, 20)}`;
  await conn.execute("INSERT INTO payments (payment_no, user_id, method, amount, status, metadata) VALUES (?, ?, 'promptpay', 100, 'created', ?)", [blockedNo, userId, JSON.stringify({ itemType: "coupon", couponId: coupon.insertId })]);
  assert.equal((await approve.PUT(new NextRequest("http://localhost/api/admin/payments", { method: "PUT", body: JSON.stringify({ paymentNo: blockedNo, status: "paid" }) }))).status, 409);
  const [blocked] = await conn.execute("SELECT status FROM payments WHERE payment_no = ?", [blockedNo]);
  assert.equal(blocked[0].status, "created");
  console.log("PASS unavailable coupon approval rolls back to pending payment");

} finally {
  await conn.rollback();
  await conn.end();
  console.log("Fixture transaction rolled back; no member rights or check-ins committed.");
}
