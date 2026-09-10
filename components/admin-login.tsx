"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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
      <input
        autoComplete="username"
        aria-label="Username"
        required
        maxLength={80}
        placeholder="Username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <input
        autoComplete="current-password"
        aria-label="Password"
        required
        maxLength={200}
        placeholder="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <button disabled={busy || username.trim().length < 3 || password.length < 8} type="submit">
        {busy ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </form>
  );
}
