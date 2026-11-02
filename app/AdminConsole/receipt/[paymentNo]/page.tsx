import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminReceipt } from "@/components/admin-receipt";
import { adminSessionCookieName, getAdminIdentity, hasAdminPermission } from "@/lib/admin-auth";
import { adminLangCookie, readAdminLang } from "@/lib/admin-preferences";

export const metadata: Metadata = { title: "ใบเสร็จรับเงิน · PPA", robots: { index: false, follow: false } };

// Printable receipt of one paid payment (opened from the payment list, the counter sale and the
// court calendar). Staff who take or report payments only; the API issues the number.
export default async function ReceiptPage({ params }: { params: Promise<{ paymentNo: string }> }) {
  const { paymentNo } = await params;
  const cookieStore = await cookies();
  const admin = await getAdminIdentity(cookieStore.get(adminSessionCookieName())?.value || "");
  if (!admin) redirect("/AdminConsole");
  const lang = readAdminLang(cookieStore.get(adminLangCookie)?.value);
  const allowed = ["payments.manage", "sales.manage", "reports.view"].some((permission) => hasAdminPermission(admin, permission));
  return (
    <main className="receipt-page">
      {allowed ? <AdminReceipt paymentNo={paymentNo} lang={lang} /> : <p className="receipt-state" role="alert">{lang === "th" ? "บัญชีนี้ไม่มีสิทธิ์พิมพ์ใบเสร็จ" : "This account cannot print receipts."}</p>}
    </main>
  );
}
