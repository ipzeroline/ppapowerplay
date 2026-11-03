"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import jsQR from "jsqr";
import { AdminNotice } from "@/components/admin-notice";
import type { NoticeTone } from "@/lib/admin-notices";

type Purpose = "member" | "booking" | "coupon" | "entitlement" | "payment";
type Detail = { title?: string; startsAt?: string; endsAt?: string; checkInOpen?: boolean; remainingUses?: number | null; expiresAt?: string | null; amount?: number; status?: string };
type Result = { valid: boolean; consumed: boolean; qr: { displayName: string; memberCode: string; purpose: Purpose; refId: string | null }; detail?: Detail };

// What each QR grants and what confirming does, in the staff member's language.
const purposeLabels: Record<Purpose, [string, string]> = {
  member: ["แพ็กเกจสมาชิก", "Membership"],
  booking: ["การจองสนาม", "Court booking"],
  coupon: ["คูปอง", "Coupon"],
  entitlement: ["สิทธิ์/รางวัล", "Reward or right"],
  payment: ["การชำระเงิน", "Payment"],
};
const confirmLabels: Record<Exclude<Purpose, "payment">, [string, string]> = {
  member: ["ยืนยันเข้าใช้บริการ", "Confirm entry"],
  booking: ["เช็คอินการจอง", "Check in booking"],
  coupon: ["ใช้คูปอง 1 ครั้ง", "Use 1 coupon"],
  entitlement: ["ใช้สิทธิ์ / รับรางวัล", "Use right / hand over reward"],
};

export function AdminQrScanner({ lang }: { lang: "th" | "en" }) {
  const th = lang === "th";
  const say = ([thai, english]: [string, string]) => (th ? thai : english);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState<{ tone: NoticeTone; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);

  function stopCamera() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
  }

  // Ready for the next scan: a USB scanner types into the field, replacing what is there.
  function focusField() {
    window.setTimeout(() => {
      if (!field.current || !window.matchMedia("(pointer: fine)").matches) return;
      field.current.focus();
      field.current.select();
    }, 0);
  }

  useEffect(() => {
    const lifecycle = generation;
    const stop = () => { if (document.hidden) stopCamera(); };
    document.addEventListener("visibilitychange", stop);
    focusField();
    return () => {
      lifecycle.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      document.removeEventListener("visibilitychange", stop);
    };
  }, []);

  async function verify(value: string, consume = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage(null);
    setResult(null);
    stopCamera();
    let done = false;
    try {
      const response = await fetch("/api/admin/qr/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value.trim(), consume }), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || (th ? "ตรวจสอบไม่สำเร็จ" : "Verification failed"));
      setResult(data);
      if (data.consumed) {
        done = true;
        setMessage({ tone: "success", text: th ? "บันทึกการใช้สิทธิ์เรียบร้อยแล้ว" : "Redemption recorded successfully" });
      }
    } catch (error) {
      // A refusal from the server is an error; no answer at all leaves the result unknown.
      setMessage(error instanceof Error && error.name === "Error" ? { tone: "error", text: error.message } : { tone: "warning", text: th ? "เชื่อมต่อไม่สำเร็จ หากกดยืนยันแล้ว กรุณาตรวจประวัติก่อนลองใหม่" : "Connection failed. If you confirmed redemption, check the audit log before retrying." });
    } finally {
      lock.current = false;
      setBusy(false);
      if (done) setToken("");
      focusField();
    }
  }

  // A member QR opened from a phone camera lands here with ?token=: check it at once, and take the
  // code out of the address so a reload does not check it again.
  const verifyFromAddress = useEffectEvent((value: string) => {
    setToken(value);
    void verify(value);
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAddress = params.get("token");
    if (!fromAddress) return;
    params.delete("token");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    const timer = window.setTimeout(() => verifyFromAddress(fromAddress), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function startCamera() {
    stopCamera();
    const current = generation.current;
    setResult(null);
    setMessage(null);
    setCamera(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      if (current !== generation.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const player = video.current;
      if (!player) { stopCamera(); return; }
      player.srcObject = media;
      await player.play();
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas unavailable");
      const scan = () => {
        if (current !== generation.current) return;
        if (player.readyState >= 2 && player.videoWidth) {
          canvas.width = Math.min(player.videoWidth, 960);
          canvas.height = Math.round(canvas.width * player.videoHeight / player.videoWidth);
          context.drawImage(player, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
          if (code?.data) { setToken(code.data); void verify(code.data); return; }
        }
        window.setTimeout(scan, 150);
      };
      scan();
    } catch {
      if (current !== generation.current) return;
      stopCamera();
      setMessage({ tone: "error", text: th ? "เปิดกล้องไม่ได้ กรุณาอนุญาตกล้องและใช้ HTTPS หรือกรอกรหัสจากเครื่องอ่าน" : "Cannot open camera. Allow camera access over HTTPS, or enter a scanner code." });
    }
  }

  const purpose = result?.qr.purpose;
  const detail = result?.detail;
  const notToday = purpose === "booking" && detail?.checkInOpen === false;
  const usesLeft = typeof detail?.remainingUses === "number" ? detail.remainingUses : null;

  return <section className="admin-panel qr-scanner" aria-label={th ? "สแกน QR" : "QR scanner"}>
    <h2>{th ? "สแกน QR เข้าใช้บริการ" : "Scan access QR"}</h2>
    <p>{th ? "สแกน QR จากหน้าจอสมาชิก ตรวจสอบชื่อและสิทธิ์ แล้วกดยืนยันหนึ่งครั้ง" : "Scan the member’s QR, review their identity and access, then confirm once."}</p>
    <div className="qr-scanner-actions">
      <button type="button" className="primary" disabled={busy} onClick={camera ? stopCamera : startCamera}>{camera ? (th ? "ปิดกล้อง" : "Stop camera") : (th ? "เปิดกล้องสแกน" : "Start camera")}</button>
    </div>
    <video ref={video} hidden={!camera} muted playsInline aria-label={th ? "ภาพจากกล้อง" : "Camera preview"} />
    <form onSubmit={(event) => { event.preventDefault(); void verify(token); }}>
      <label htmlFor="scan-token">{th ? "QR URL หรือรหัสจากเครื่องอ่าน" : "QR URL or scanner code"}</label>
      <input id="scan-token" ref={field} autoComplete="off" maxLength={500} value={token} disabled={busy || camera} onChange={(event) => { setToken(event.target.value); setResult(null); setMessage(null); }} />
      <button className="primary" disabled={busy || camera || !token.trim()}>{busy ? (th ? "กำลังตรวจสอบ…" : "Checking…") : (th ? "ตรวจสอบ QR" : "Verify QR")}</button>
    </form>
    {message ? <AdminNotice tone={message.tone}>{message.text}</AdminNotice> : null}
    {result && purpose && <div className="qr-scanner-result">
      <span className="admin-badge neutral">{say(purposeLabels[purpose] || [purpose, purpose])}</span>
      <h3>{result.qr.displayName}</h3>
      <p>{result.qr.memberCode}</p>
      {detail?.title ? <p className="qr-scanner-grant">{detail.title}</p> : null}
      {purpose === "booking" && detail?.startsAt ? <p>{th ? "เวลา" : "Time"} {detail.startsAt}{detail.endsAt ? `–${detail.endsAt}` : ""} {th ? "น." : ""}</p> : null}
      {usesLeft !== null ? <p>{th ? `เหลือ ${usesLeft} ครั้ง` : `${usesLeft} uses left`}</p> : null}
      {detail?.expiresAt && purpose !== "booking" ? <p>{th ? "ใช้ได้ถึง" : "Valid until"} {detail.expiresAt}</p> : null}
      {notToday ? <AdminNotice tone="warning">{th ? "เช็คอินได้ในวันที่จอง" : "Check-in opens on the booking day"}</AdminNotice> : null}
      {result.valid && !result.consumed && purpose !== "payment" && !notToday && <button className="primary" disabled={busy} onClick={() => void verify(token, true)}>{say(confirmLabels[purpose])}</button>}
      {purpose === "payment" && <AdminNotice tone="info">{th ? "QR การชำระเงินไม่ใช่สิทธิ์เข้าใช้บริการ กรุณาตรวจรายการในระบบการเงิน" : "Payment QR is not an access pass. Review it in payments."}</AdminNotice>}
    </div>}
  </section>;
}
