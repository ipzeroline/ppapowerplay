"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { money, Top } from "@/components/member-ui";
import { localeTag, t } from "@/lib/i18n";

type PromptPayQr = { paymentNo: string; amount: number; itemName?: string | null; qr: string; payee: { name: string; account: string }; slipUploadedAt?: string | null; holdSeconds?: number | null };
type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: PromptPayQr; payBy: number | null }
  | { status: "expired" }
  | { status: "unconfigured" }
  | { status: "closed" }
  | { status: "error" };

// PromptPay checkout: QR with the exact amount, then the member attaches the transfer slip
// for staff to confirm (rights are granted only after confirmation). Court bookings show the
// 15-minute deadline; a slip sent in time keeps the court reserved until staff decide.
const clock = (time: number) => new Date(time).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

export function PromptPayScreen({ paymentNo, onBack, onDone }: { paymentNo: string; onBack: () => void; onDone: () => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/payments/promptpay?paymentNo=${encodeURIComponent(paymentNo)}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (response.ok) {
          const data = body as PromptPayQr;
          setState({ status: "ready", data, payBy: typeof data.holdSeconds === "number" && data.holdSeconds > 0 ? Date.now() + data.holdSeconds * 1000 : null });
          setUploaded(Boolean(body.slipUploadedAt));
        } else if (response.status === 409 && body.code === "BOOKING_EXPIRED") setState({ status: "expired" });
        else if (response.status === 404 && body.code === "PROMPTPAY_NOT_CONFIGURED") setState({ status: "unconfigured" });
        else if (response.status === 409) setState({ status: "closed" });
        else setState({ status: "error" });
      })
      .catch(() => { if (!controller.signal.aborted) setState({ status: "error" }); });
    return () => controller.abort();
  }, [paymentNo, revision]);

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      setMessage("ไฟล์สลิปต้องไม่เกิน 5 MB");
      return;
    }
    setUploading(true);
    setMessage("");
    const form = new FormData();
    form.set("paymentNo", paymentNo);
    form.set("file", file);
    try {
      const response = await fetch("/api/payments/slip", { method: "POST", body: form, cache: "no-store", signal: AbortSignal.timeout(30_000) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(response.status === 413 ? "ไฟล์สลิปต้องไม่เกิน 5 MB" : body.message || "อัปโหลดสลิปไม่สำเร็จ");
        return;
      }
      setUploaded(true);
      setMessage(body.bookingHeld ? "ส่งสลิปแล้ว สนามถูกกันไว้ให้จนกว่าเจ้าหน้าที่จะยืนยัน" : "ส่งสลิปแล้ว เจ้าหน้าที่จะตรวจสอบและยืนยันโดยเร็ว");
    } catch {
      setMessage("network.error");
    } finally {
      setUploading(false);
    }
  }

  const slipInput = (
    <label className={uploaded ? "slip-upload done" : "slip-upload"}>
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} />
      <span>{uploading ? t("กำลังอัปโหลด...") : uploaded ? t("✓ ส่งสลิปแล้ว (แตะเพื่อเปลี่ยนรูป)") : t("📎 แนบสลิปการโอน")}</span>
    </label>
  );
  const slipMessage = message ? <p role="status" className="slip-message">{t(message)}</p> : null;

  return (
    <div className="page pay-qr-page">
      <Top title={t("ชำระเงินด้วยพร้อมเพย์")} onBack={onBack} />
      {state.status === "loading" ? <p className="center-text">{t("กำลังโหลด QR...")}</p> : null}
      {state.status === "ready" ? (
        <>
          <div className="pay-qr-card">
            <span className="pay-qr-brand">PromptPay</span>
            <strong>{money(state.data.amount)} ฿</strong>
            {state.data.itemName ? <small>{t(state.data.itemName)}</small> : null}
            <Image unoptimized width={240} height={240} className="pay-qr-image" alt={t("QR พร้อมเพย์สำหรับชำระเงิน")} src={state.data.qr} />
            <small>{state.data.payee.name ? `${state.data.payee.name} · ` : ""}{t("พร้อมเพย์ {{value0}}", { value0: state.data.payee.account })}</small>
            <small>{t("เลขที่รายการ {{value0}}", { value0: state.data.paymentNo })}</small>
            <a className="pay-qr-save" href={state.data.qr} download={`PPA-${state.data.paymentNo}.png`}>{t("⬇ บันทึกรูป QR")}</a>
          </div>
          {state.payBy && !uploaded ? <p className="pay-deadline" role="note">{t("⏱ ชำระและแนบสลิปภายใน {{value0}} น. ระบบจะกันสนามไว้ให้จนเจ้าหน้าที่ยืนยัน", { value0: clock(state.payBy) })}</p> : null}
          <ol className="pay-qr-steps">
            <li>{t("บันทึกรูป QR หรือกดค้างที่รูปเพื่อบันทึก แล้วสแกนจากแอปธนาคาร")}</li>
            <li>{t("ตรวจยอดเงินให้ตรงก่อนโอน")}</li>
            <li>{t("แนบสลิปด้านล่าง เจ้าหน้าที่จะยืนยันและเปิดสิทธิ์ให้")}</li>
          </ol>
          {slipInput}
          {slipMessage}
        </>
      ) : null}
      {state.status === "expired" ? (
        <>
          <div className="secure-note"><strong>{t("หมดเวลาชำระของการจองนี้แล้ว")}</strong><small>{t("กรุณาอย่าโอนเงินเพิ่ม หากโอนไปแล้วให้แนบสลิปด้านล่าง ระบบจะกันสนามให้หากช่วงเวลานั้นยังว่าง")}</small></div>
          {slipInput}
          {slipMessage}
        </>
      ) : null}
      {state.status === "unconfigured" ? (
        <div className="secure-note"><strong>{t("รอการยืนยัน")}</strong><small>{t("ระบบบันทึกรายการแล้ว กรุณาชำระที่เคาน์เตอร์หรือช่องทางที่เจ้าหน้าที่แจ้ง สิทธิ์จะเปิดเมื่อยืนยันการชำระเงิน")}</small></div>
      ) : null}
      {state.status === "closed" ? <div className="secure-note"><strong>{t("รายการนี้ไม่ได้รอชำระแล้ว")}</strong><small>{t("ได้รับการยืนยันหรือยกเลิกแล้ว ตรวจสอบได้ในรายการของฉัน")}</small></div> : null}
      {state.status === "error" ? <div role="alert" className="calendar-error">{t("โหลด QR ไม่สำเร็จ")}<button type="button" onClick={() => { setState({ status: "loading" }); setRevision((value) => value + 1); }}>{t("ลองใหม่")}</button></div> : null}
      <button type="button" className="primary" onClick={onDone}>{t("👛 ดูสถานะในวอลเล็ต")}</button>
    </div>
  );
}
