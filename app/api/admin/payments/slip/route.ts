import { NextRequest, NextResponse } from "next/server";
import { assertAdminRequest } from "@/lib/admin-auth";
import { query } from "@/lib/db";
import { readSlip } from "@/lib/slips";

const notFound = () => NextResponse.json({ message: "ไม่พบสลิป" }, { status: 404 });

// Staff with payments.manage view the member's transfer slip before confirming payment.
// ?previous=n opens a slip the member replaced (kept as evidence, oldest first).
export async function GET(request: NextRequest) {
  const denied = await assertAdminRequest(request);
  if (denied) return denied;
  const paymentNo = request.nextUrl.searchParams.get("paymentNo") || "";
  const previous = request.nextUrl.searchParams.get("previous");
  if (previous !== null && !/^\d{1,2}$/.test(previous)) return NextResponse.json({ message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });
  const [payment] = await query<{ slipPath: string | null; metadataText: string | null }>(
    "SELECT slip_path slipPath, CAST(metadata AS CHAR) metadataText FROM payments WHERE payment_no = ? LIMIT 1",
    [paymentNo],
  );
  if (!payment) return notFound();
  let name = payment.slipPath;
  if (previous !== null) {
    let earlier: unknown = [];
    try {
      earlier = (JSON.parse(payment.metadataText || "{}") as { previousSlips?: unknown }).previousSlips;
    } catch {
      earlier = [];
    }
    const value = Array.isArray(earlier) ? earlier[Number(previous)] : null;
    name = typeof value === "string" ? value : null;
  }
  if (!name) return notFound();
  try {
    const slip = await readSlip(name);
    return new NextResponse(new Uint8Array(slip.bytes), {
      headers: { "Content-Type": slip.contentType, "Cache-Control": "private, no-store", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return notFound();
  }
}
