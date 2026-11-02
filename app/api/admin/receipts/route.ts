import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminSessionCookieName, assertAdminRequest, getAdminIdentity } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { beYear, formatReceiptNo, vatIncluded } from "@/lib/receipts";
import { parseJsonBody, secureResponse, validationErrorResponse } from "@/lib/security";
import { receiptInfo } from "@/lib/site-settings";
import { WALK_IN_LINE_ID } from "@/lib/walk-in";

const schema = z.object({ paymentNo: z.string().trim().regex(/^[A-Za-z0-9-]{4,64}$/) });
type Detail = { paymentNo: string; paidAt: string | null; method: string; amount: number | string; itemName: string | null; guestName: string | null; guestPhone: string | null; staffId: string | null; displayName: string; memberCode: string | null; phone: string | null; lineUserId: string };
const json = (body: unknown, status = 200) => secureResponse(NextResponse.json(body, { status }));

// Issue (or show again) the receipt of a paid payment. The first request takes the next number for
// the Bangkok Buddhist year; every later request returns that same number, marked as a copy.
export async function POST(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const admin = await getAdminIdentity(request.cookies.get(adminSessionCookieName())?.value || "");
  if (!admin) return json({ message: "Admin access denied" }, 401);
  let input: z.infer<typeof schema>;
  try {
    input = await parseJsonBody(request, schema);
  } catch (error) {
    return validationErrorResponse(error);
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [paymentRows] = await conn.execute("SELECT p.id, p.status FROM payments p WHERE p.payment_no = ? FOR UPDATE", [input.paymentNo]);
    const payment = (paymentRows as { id: number; status: string }[])[0];
    if (!payment || payment.status !== "paid") {
      await conn.rollback();
      return payment ? json({ message: "ออกใบเสร็จได้เฉพาะรายการที่ชำระแล้ว" }, 409) : json({ message: "ไม่พบรายการชำระเงิน" }, 404);
    }
    const [existingRows] = await conn.execute("SELECT receipt_no receiptNo, DATE_FORMAT(issued_at, '%Y-%m-%d %H:%i:%s') issuedAt FROM payment_receipts WHERE payment_id = ? LIMIT 1", [payment.id]);
    let receipt = (existingRows as { receiptNo: string; issuedAt: string }[])[0];
    const firstIssue = !receipt;
    if (!receipt) {
      const year = beYear();
      await conn.execute("INSERT INTO receipt_sequences (year, last_no) VALUES (?, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)", [year]);
      const [sequenceRows] = await conn.execute("SELECT LAST_INSERT_ID() seq");
      const receiptNo = formatReceiptNo(year, Number((sequenceRows as { seq: number }[])[0]?.seq));
      await conn.execute("INSERT INTO payment_receipts (payment_id, receipt_no, issued_by) VALUES (?, ?, ?)", [payment.id, receiptNo, admin.id]);
      await conn.execute(
        "INSERT INTO admin_audit_logs (staff_id, action, target_type, target_id, metadata) VALUES (?, 'receipt.issue', 'payment', ?, ?)",
        [admin.id, input.paymentNo, JSON.stringify({ receiptNo })],
      );
      const [issuedRows] = await conn.execute("SELECT DATE_FORMAT(issued_at, '%Y-%m-%d %H:%i:%s') issuedAt FROM payment_receipts WHERE payment_id = ?", [payment.id]);
      receipt = { receiptNo, issuedAt: (issuedRows as { issuedAt: string }[])[0]?.issuedAt ?? "" };
    }
    const [detailRows] = await conn.execute(
      "SELECT p.payment_no paymentNo, DATE_FORMAT(p.paid_at, '%Y-%m-%d %H:%i:%s') paidAt, p.method, p.amount, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.metadata, '$.itemName')), b.title) itemName, JSON_VALUE(p.metadata, '$.guestName') guestName, JSON_VALUE(p.metadata, '$.guestPhone') guestPhone, COALESCE(JSON_VALUE(p.metadata, '$.soldBy'), JSON_VALUE(p.metadata, '$.confirmedBy')) staffId, u.display_name displayName, u.member_code memberCode, u.phone, u.line_user_id lineUserId FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN bookings b ON b.id = p.booking_id WHERE p.id = ?",
      [payment.id],
    );
    const detail = (detailRows as Detail[])[0];
    const [settingRows] = await conn.execute("SELECT content_type contentType, slug, title, CAST(metadata AS CHAR) metadata FROM app_content_items WHERE content_type = 'site_setting' AND slug = 'receipt-info' LIMIT 1");
    const business = receiptInfo(settingRows as { id: number; contentType: string; slug: string; title: string; metadata: unknown }[]);
    let staffName: string | null = null;
    if (detail.staffId && /^\d+$/.test(detail.staffId)) {
      const [staffRows] = await conn.execute("SELECT display_name displayName FROM admin_staff WHERE id = ? LIMIT 1", [Number(detail.staffId)]);
      staffName = (staffRows as { displayName: string }[])[0]?.displayName ?? null;
    }
    await conn.commit();
    const amount = Number(detail.amount);
    const walkIn = detail.lineUserId === WALK_IN_LINE_ID;
    return json({
      receiptNo: receipt.receiptNo,
      issuedAt: receipt.issuedAt,
      firstIssue,
      business,
      payment: { paymentNo: detail.paymentNo, paidAt: detail.paidAt, method: detail.method, amount, itemName: detail.itemName },
      customer: detail.guestName
        ? { name: detail.guestName, memberCode: null, phone: detail.guestPhone }
        : { name: walkIn ? "ลูกค้าทั่วไป" : detail.displayName, memberCode: walkIn ? null : detail.memberCode, phone: walkIn ? null : detail.phone },
      staffName,
      vat: business.vatRegistered ? vatIncluded(amount) : null,
    });
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}
