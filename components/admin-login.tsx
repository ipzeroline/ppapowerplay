"use client";

import { useState, type FormEvent } from "react";

export function AdminLogin() {
  const [key, setKey] = useState("");
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
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error("Admin access denied");
      window.location.href = "/AdminConsole";
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-login-form" onSubmit={submit}>
      <input
        autoComplete="current-password"
        placeholder="ADMIN_ACCESS_KEY"
        type="password"
        value={key}
        onChange={(event) => setKey(event.target.value)}
      />
      <button disabled={busy || key.length < 20} type="submit">
        {busy ? "Checking..." : "Sign in"}
      </button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}
