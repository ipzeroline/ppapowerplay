"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminDialog } from "@/components/admin-dialog";

type Member = { id: number; displayName: string; memberCode: string; phone: string | null; email: string | null; status: string; balance: number | string };
type Entry = { id: number; amount: number | string; kind: string; note: string | null; createdAt: string; staffName: string | null; balanceBefore: string | null; balanceAfter: string | null; refType: string | null };
type Detail = { member: Member; history: Entry[]; nextCursor: number | null };
const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" }, signal: init?.signal || AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
  return body;
}

export function AdminMembers({ search, lang }: { search: string; lang: "th" | "en" }) {
  const th = lang === "th";
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Member[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [currentSearch, setCurrentSearch] = useState(search);
  if (currentSearch !== search) { setCurrentSearch(search); setPage(1); }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      request<{ members: Member[]; hasMore: boolean }>(`/api/admin/members?${new URLSearchParams({ search, page: String(page) })}`, { signal: controller.signal })
        .then((data) => { setRows(data.members); setHasMore(data.hasMore); })
        .catch((error) => { if (!controller.signal.aborted) setError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, page, revision]);
  return <section className="admin-panel">
    <h2>{th ? "จัดการสมาชิกและเครดิต" : "Members and credit"}</h2>
    <div className="member-toolbar"><span>{th ? "เครดิต = ยอดเงิน Wallet (บาท)" : "Credit = wallet balance (THB)"}</span><button onClick={() => setRevision((value) => value + 1)}>{th ? "โหลดใหม่" : "Reload"}</button></div>
    {error ? <p role="alert" className="admin-message">{error}</p> : null}
    {loading ? <p role="status" className="admin-message">{th ? "กำลังโหลดสมาชิก…" : "Loading members…"}</p> : !error && <>
      <div className="member-table-scroll"><table><thead><tr><th>{th ? "สมาชิก" : "Member"}</th><th>{th ? "ติดต่อ" : "Contact"}</th><th>{th ? "สถานะ" : "Status"}</th><th>{th ? "เครดิต" : "Credit"}</th><th>{th ? "จัดการ" : "Manage"}</th></tr></thead>
        <tbody>{rows.map((member) => <tr key={member.id}><td>{member.displayName}<small>{member.memberCode}</small></td><td>{member.phone || "-"}<small>{member.email || "-"}</small></td><td>{member.status === "active" ? (th ? "ใช้งาน" : "Active") : member.status === "suspended" ? (th ? "ระงับ" : "Suspended") : (th ? "ลบแล้ว" : "Deleted")}</td><td>{money(member.balance)} ฿</td><td><button onClick={() => setSelected(member.id)}>{th ? "ข้อมูล / เครดิต / ประวัติ" : "Profile / Credit / History"}</button></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="admin-message">{th ? "ไม่พบสมาชิก" : "No members found"}</p>}
      <div className="member-toolbar"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>{th ? "ก่อนหน้า" : "Previous"}</button><span>{th ? "หน้า" : "Page"} {page}</span><button disabled={!hasMore} onClick={() => setPage(page + 1)}>{th ? "ถัดไป" : "Next"}</button></div>
    </>}
    {selected !== null && <MemberEditor key={selected} id={selected} th={th} onClose={() => setSelected(null)} onChange={() => setRevision((value) => value + 1)} />}
  </section>;
}

function MemberEditor({ id, th, onClose, onChange }: { id: number; th: boolean; onClose: () => void; onChange: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState({ displayName: "", phone: "", email: "", status: "active" });
  const [direction, setDirection] = useState("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const attempt = useRef<{ memberId: number; direction: string; amount: string; reason: string; requestId: string } | null>(null);
  const reload = useCallback(async () => {
    const data = await request<Detail>(`/api/admin/members?id=${id}`);
    setDetail(data);
    setForm({ displayName: data.member.displayName, phone: data.member.phone || "", email: data.member.email || "", status: data.member.status });
  }, [id]);
  // Fetch the selected member whenever the dialog opens or the selected ID changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload().catch((error) => setMessage(error.message)); }, [reload]);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      await request("/api/admin/members", { method: "PUT", body: JSON.stringify({ id, ...form }) });
      setMessage(th ? "บันทึกข้อมูลสมาชิกแล้ว" : "Member profile saved");
      onChange();
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
    finally { pending.current = false; setBusy(false); }
  }
  async function adjustCredit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setMessage("");
    attempt.current ||= { memberId: id, direction, amount, reason, requestId: crypto.randomUUID() };
    try {
      await request("/api/admin/members/credit", { method: "POST", body: JSON.stringify(attempt.current) });
      attempt.current = null; setUncertain(false); setAmount(""); setReason("");
      setMessage(th ? "บันทึกการปรับเครดิตแล้ว" : "Credit adjustment recorded");
      onChange();
      await reload();
    } catch (error) {
      // Preserve the request ID after an uncertain result so retry cannot apply twice.
      setUncertain(Boolean(attempt.current));
      setMessage((error instanceof Error ? error.message : "Request failed") + (attempt.current ? (th ? " — ลองรายการเดิมซ้ำได้โดยไม่ปรับเครดิตซ้ำ" : " — Retry the same request safely") : ""));
    } finally { pending.current = false; setBusy(false); }
  }
  async function moreHistory() {
    if (!detail?.nextCursor || pending.current) return;
    pending.current = true; setBusy(true);
    try {
      const data = await request<Detail>(`/api/admin/members?id=${id}&before=${detail.nextCursor}`);
      setDetail({ ...detail, history: [...detail.history, ...data.history], nextCursor: data.nextCursor });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Request failed"); }
    finally { pending.current = false; setBusy(false); }
  }
  const editable = detail?.member.status !== "deleted";
  return <AdminDialog onClose={() => { if (!busy) onClose(); }}><section className="admin-modal member-editor">
    <header><div><small>{detail?.member.memberCode}</small><h2>{th ? "จัดการสมาชิก" : "Manage member"}</h2></div><button disabled={busy} onClick={onClose} aria-label={th ? "ปิด" : "Close"}>×</button></header>
    {message && <p className="admin-message" role="status">{message}</p>}
    {!detail ? <div className="member-toolbar"><button onClick={() => void reload().catch((error) => setMessage(error.message))}>{th ? "โหลดข้อมูล / ลองใหม่" : "Load / Retry"}</button></div> : <>
      <form onSubmit={saveProfile} className="admin-form">
        <label>{th ? "ชื่อสมาชิก" : "Member name"}<input required maxLength={160} value={form.displayName} disabled={busy || !editable} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
        <label>{th ? "เบอร์โทร" : "Phone"}<input type="tel" maxLength={32} value={form.phone} disabled={busy || !editable} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>{th ? "อีเมล" : "Email"}<input type="email" maxLength={180} value={form.email} disabled={busy || !editable} onChange={(event) => setForm({ ...form, email: event.target.value.trim() })} /></label>
        <label>{th ? "สถานะสมาชิก" : "Member status"}<select value={form.status} disabled={busy || !editable} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">{th ? "ใช้งาน" : "Active"}</option><option value="suspended">{th ? "ระงับ" : "Suspended"}</option>{!editable && <option value="deleted">Deleted</option>}</select></label>
        <div className="admin-form-actions"><button disabled={busy || !editable}>{th ? "บันทึกข้อมูลสมาชิก" : "Save member"}</button></div>
      </form>
      <section className="member-credit"><h3>{th ? "เครดิต Wallet" : "Wallet credit"}: <strong>{money(detail.member.balance)} ฿</strong></h3>
        <p>{th ? "ปรับยอดเงินเท่านั้น ไม่เพิ่ม Coin หรือ Point และต้องระบุเหตุผลทุกครั้ง" : "Adjusts money only, without coins or points. A reason is required."}</p>
        <form onSubmit={adjustCredit} className="admin-form">
          <label>{th ? "ประเภทการปรับ" : "Adjustment"}<select value={direction} disabled={busy || uncertain || !editable} onChange={(event) => setDirection(event.target.value)}><option value="add">{th ? "เพิ่มเครดิต" : "Add credit"}</option><option value="deduct">{th ? "ลดเครดิต" : "Deduct credit"}</option></select></label>
          <label>{th ? "จำนวนเงิน (บาท)" : "Amount (THB)"}<input required type="number" min="0.01" max="50000" step="0.01" value={amount} disabled={busy || uncertain || !editable} onChange={(event) => setAmount(event.target.value)} /></label>
          <label className="wide">{th ? "เหตุผลการปรับเครดิต" : "Adjustment reason"}<textarea required minLength={3} maxLength={255} value={reason} disabled={busy || uncertain || !editable} onChange={(event) => setReason(event.target.value)} /></label>
          <div className="admin-form-actions"><button disabled={busy || !editable}>{uncertain ? (th ? "ลองรายการเดิมอีกครั้ง" : "Retry same adjustment") : (th ? "ยืนยันปรับเครดิต" : "Confirm adjustment")}</button>{uncertain && <button type="button" disabled={busy} onClick={() => { attempt.current = null; setUncertain(false); void reload().catch((error) => setMessage(error.message)); }}>{th ? "ตรวจประวัติก่อนเริ่มรายการใหม่" : "Check history before a new adjustment"}</button>}</div>
        </form>
      </section>
      <section className="member-history"><h3>{th ? "ประวัติเพิ่ม–ลดเครดิต" : "Credit history"}</h3><div className="member-table-scroll"><table><thead><tr>{(th ? ["วันเวลา", "เพิ่ม / ลด", "ก่อน → หลัง", "เหตุผล", "เจ้าหน้าที่"] : ["Date", "Change", "Before → After", "Reason", "Staff"]).map((label) => <th key={label}>{label}</th>)}</tr></thead><tbody>{detail.history.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString(th ? "th-TH" : "en-GB", { timeZone: "Asia/Bangkok" })}<small>#{entry.id}</small></td><td>{Number(entry.amount) > 0 ? "+" : ""}{money(entry.amount)} ฿</td><td>{entry.balanceBefore !== null && entry.balanceAfter !== null ? `${money(entry.balanceBefore)} → ${money(entry.balanceAfter)}` : "—"}</td><td>{entry.note || entry.kind}<small>{entry.refType === "admin_credit" ? (th ? "ปรับโดยเจ้าหน้าที่" : "Staff adjustment") : entry.kind}</small></td><td>{entry.staffName || "—"}</td></tr>)}</tbody></table></div>{!detail.history.length && <p>{th ? "ยังไม่มีประวัติ" : "No history yet"}</p>}{detail.nextCursor && <button disabled={busy} onClick={moreHistory}>{th ? "โหลดประวัติเพิ่ม" : "More history"}</button>}</section>
    </>}
  </section></AdminDialog>;
}
