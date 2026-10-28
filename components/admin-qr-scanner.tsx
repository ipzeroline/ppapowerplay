"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Result = { valid: boolean; consumed: boolean; qr: { displayName: string; memberCode: string; purpose: string; refId: string | null } };

export function AdminQrScanner({ lang }: { lang: "th" | "en" }) {
  const th = lang === "th";
  const [token, setToken] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);

  function stopCamera() {
    generation.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
  }

  useEffect(() => {
    const lifecycle = generation;
    const stop = () => { if (document.hidden) stopCamera(); };
    document.addEventListener("visibilitychange", stop);
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
    setMessage("");
    setResult(null);
    stopCamera();
    try {
      const response = await fetch("/api/admin/qr/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value.trim(), consume }), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || (th ? "ตรวจสอบไม่สำเร็จ" : "Verification failed"));
      setResult(data);
      if (data.consumed) setMessage(th ? "บันทึกการใช้สิทธิ์เรียบร้อยแล้ว" : "Redemption recorded successfully");
    } catch (error) {
      setMessage(error instanceof Error && error.name === "Error" ? error.message : th ? "เชื่อมต่อไม่สำเร็จ หากกดยืนยันแล้ว กรุณาตรวจประวัติก่อนลองใหม่" : "Connection failed. If you confirmed redemption, check the audit log before retrying.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function startCamera() {
    stopCamera();
    const current = generation.current;
    setResult(null);
    setMessage("");
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
      setMessage(th ? "เปิดกล้องไม่ได้ กรุณาอนุญาตกล้องและใช้ HTTPS หรือกรอกรหัสจากเครื่องอ่าน" : "Cannot open camera. Allow camera access over HTTPS, or enter a scanner code.");
    }
  }

  return <section className="admin-panel qr-scanner" aria-label={th ? "สแกน QR" : "QR scanner"}>
    <h2>{th ? "สแกน QR เข้าใช้บริการ" : "Scan access QR"}</h2>
    <p>{th ? "สแกน QR จากหน้าจอสมาชิก ตรวจสอบชื่อและสิทธิ์ แล้วกดยืนยันหนึ่งครั้ง" : "Scan the member’s QR, review their identity and access, then confirm once."}</p>
    <div className="qr-scanner-actions">
      <button type="button" className="primary" disabled={busy} onClick={camera ? stopCamera : startCamera}>{camera ? (th ? "ปิดกล้อง" : "Stop camera") : (th ? "เปิดกล้องสแกน" : "Start camera")}</button>
    </div>
    <video ref={video} hidden={!camera} muted playsInline aria-label={th ? "ภาพจากกล้อง" : "Camera preview"} />
    <form onSubmit={(event) => { event.preventDefault(); void verify(token); }}>
      <label htmlFor="scan-token">{th ? "QR URL หรือรหัสจากเครื่องอ่าน" : "QR URL or scanner code"}</label>
      <input id="scan-token" autoComplete="off" maxLength={500} value={token} disabled={busy || camera} onChange={(event) => { setToken(event.target.value); setResult(null); setMessage(""); }} />
      <button className="primary" disabled={busy || camera || !token.trim()}>{busy ? (th ? "กำลังตรวจสอบ…" : "Checking…") : (th ? "ตรวจสอบ QR" : "Verify QR")}</button>
    </form>
    {message && <p role="status">{message}</p>}
    {result && <div className="qr-scanner-result">
      <h3>{result.qr.displayName}</h3><p>{result.qr.memberCode}</p>
      <p>{result.qr.purpose} · {result.qr.refId}</p>
      {result.valid && !result.consumed && result.qr.purpose !== "payment" && <button className="primary" disabled={busy} onClick={() => void verify(token, true)}>{th ? "ยืนยันใช้สิทธิ์ / เช็คอิน" : "Confirm redemption / check-in"}</button>}
      {result.qr.purpose === "payment" && <p>{th ? "QR การชำระเงินไม่ใช่สิทธิ์เข้าใช้บริการ กรุณาตรวจรายการในระบบการเงิน" : "Payment QR is not an access pass. Review it in payments."}</p>}
    </div>}
  </section>;
}
