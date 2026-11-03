"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminNotice } from "@/components/admin-notice";

export function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error(res.status === 429 ? "ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่" : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      router.replace("/AdminConsole");
      router.refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={submit}>
      <label>
        ชื่อผู้ใช้ (Username)
        <input
          autoComplete="username"
          required
          maxLength={80}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        รหัสผ่าน (Password)
        <input
          autoComplete="current-password"
          required
          maxLength={200}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button disabled={busy || username.trim().length < 3 || password.length < 8} type="submit">
        {busy ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
      </button>
      {message ? <AdminNotice tone="error" lang="th">{message}</AdminNotice> : null}
    </form>
  );
}
