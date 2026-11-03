"use client";

import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { AdminNotice } from "@/components/admin-notice";
import type { Cashup } from "@/lib/cashup";

// Reports → ปิดยอดประจำวัน: count the drawer against what the system recorded, then print and sign.

type Lang = "th" | "en";

const copy = {
  th: {
    title: "ปิดยอดประจำวัน",
    intro: "เงินที่รับเข้าในวันที่เลือก แยกตามช่องทางและพนักงานที่รับเงิน ใช้ตรวจนับเงินในลิ้นชักก่อนปิดร้าน",
    date: "วันที่", reload: "โหลดใหม่", print: "พิมพ์", loading: "กำลังรวมยอด…", failed: "โหลดยอดไม่สำเร็จ", retry: "ลองใหม่",
    cash: "เงินสดรับเข้า", cashHint: "ใช้ตรวจนับลิ้นชัก (ไม่รวมเงินทอนตั้งต้น)",
    cashIn: "รับเงินรวมทุกช่องทาง", wallet: "ตัดจากเครดิตในแอป", walletHint: "ไม่ใช่เงินเข้าวันนี้", refunds: "คืนเงิน",
    items: (count: number) => `${count} รายการ`,
    byChannel: "แยกตามช่องทาง", byStaff: "แยกตามพนักงานที่รับเงิน", refundList: "คืนเงินวันนี้", transactions: "รายการรับเงิน",
    channel: "ช่องทาง", count: "จำนวน", amount: "ยอด", staff: "พนักงาน", total: "รวม", time: "เวลา", reference: "เลขที่", item: "รายการ", customer: "ลูกค้า", note: "หมายเหตุ",
    unattributed: "ไม่ระบุผู้รับ", none: "ไม่มีรายการ", noRefunds: "ไม่มีการคืนเงิน", service: "ค่าบริการ",
    capped: "แสดง 500 รายการแรก ดูทั้งหมดได้ที่รายงานการเงิน",
    methods: { cash: "เงินสด", card: "บัตร", promptpay: "โอน / พร้อมเพย์", line_pay: "LINE Pay", wallet: "เครดิตในแอป" } as Record<string, string>,
    printedAt: "พิมพ์เมื่อ", closedBy: "ผู้ปิดยอด", checkedBy: "ผู้ตรวจสอบ", counted: "นับเงินสดได้จริง",
  },
  en: {
    title: "Daily cash-up",
    intro: "Money taken on the chosen day, by channel and by the staff member who took it. Use it to count the drawer before closing.",
    date: "Date", reload: "Reload", print: "Print", loading: "Adding up the day…", failed: "Could not load the cash-up", retry: "Try again",
    cash: "Cash received", cashHint: "Count the drawer against this (opening float not included)",
    cashIn: "All channels", wallet: "Paid from app credit", walletHint: "Not money received today", refunds: "Refunds",
    items: (count: number) => `${count} ${count === 1 ? "payment" : "payments"}`,
    byChannel: "By channel", byStaff: "By staff member", refundList: "Refunds today", transactions: "Payments",
    channel: "Channel", count: "Count", amount: "Amount", staff: "Staff", total: "Total", time: "Time", reference: "Ref.", item: "Item", customer: "Customer", note: "Note",
    unattributed: "Not recorded", none: "No payments", noRefunds: "No refunds", service: "Service",
    capped: "Showing the first 500 payments. See Finance for all of them.",
    methods: { cash: "Cash", card: "Card", promptpay: "Transfer / PromptPay", line_pay: "LINE Pay", wallet: "App credit" } as Record<string, string>,
    printedAt: "Printed", closedBy: "Closed by", checkedBy: "Checked by", counted: "Cash counted",
  },
};

const bangkokDate = (now: number) => new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
const baht = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dayLabel = (date: string, lang: Lang) => new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const clock = (stamp: string) => stamp.slice(11, 16);
// refund.at is UTC ISO; show it on the Bangkok clock.
const bangkokClock = (iso: string) => {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time + 7 * 3_600_000).toISOString().slice(11, 16) : "-";
};

export function AdminCashup({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [today] = useState(() => bangkokDate(Date.now()));
  const [date, setDate] = useState(today);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Cashup; error?: string } | null>(null);
  const [printedAt, setPrintedAt] = useState("");
  const key = `${date}|${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/reports/cashup?${new URLSearchParams({ date })}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
        setResult({ key, data: body as Cashup });
      })
      .catch((error: Error) => { if (!controller.signal.aborted) setResult({ key, error: error.message }); });
    return () => controller.abort();
  }, [key, date]);

  const loading = result?.key !== key;
  const data = result?.data?.date === date ? result.data : null;
  const error = !loading && result?.error ? result.error : "";
  const cash = data?.cashIn.find((row) => row.method === "cash");
  const cashInCount = data ? data.cashIn.reduce((total, row) => total + row.count, 0) : 0;
  const print = () => {
    setPrintedAt(new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date()));
    // Let React paint the print header first.
    requestAnimationFrame(() => window.print());
  };

  return (
    <section className="admin-panel cashup" aria-labelledby="cashup-title" aria-busy={loading}>
      <header className="cashup-head">
        <div>
          <h2 id="cashup-title">{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <div className="cashup-tools">
          <label><span className="admin-sr-only">{t.date}</span><input type="date" value={date} max={today} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} /></label>
          <button className="admin-button" type="button" onClick={() => setRevision((value) => value + 1)}><RefreshCw aria-hidden="true" />{t.reload}</button>
          <button className="primary" type="button" disabled={!data} onClick={print}><Printer aria-hidden="true" />{t.print}</button>
        </div>
      </header>
      <p className="cashup-day">{dayLabel(date, lang)}{printedAt ? <span className="cashup-print-only"> · {t.printedAt} {printedAt}</span> : null}</p>
      {error ? (
        <AdminNotice tone="error" lang={lang} className="cashup-notice" action={<button className="admin-button" type="button" onClick={() => setRevision((value) => value + 1)}>{t.retry}</button>}>{t.failed}: {error}</AdminNotice>
      ) : !data ? (
        <p className="cashup-state" role="status">{t.loading}</p>
      ) : (
        <>
          <dl className="cashup-figures">
            <div className="lead"><dt>{t.cash}</dt><dd>{baht(cash?.amount ?? 0)} ฿</dd><small>{t.items(cash?.count ?? 0)} · {t.cashHint}</small></div>
            <div><dt>{t.cashIn}</dt><dd>{baht(data.cashInTotal)} ฿</dd><small>{t.items(cashInCount)}</small></div>
            <div><dt>{t.wallet}</dt><dd>{baht(data.walletFunded.amount)} ฿</dd><small>{t.items(data.walletFunded.count)} · {t.walletHint}</small></div>
            <div><dt>{t.refunds}</dt><dd>{baht(data.refundTotal)} ฿</dd><small>{t.items(data.refunds.length)}</small></div>
          </dl>
          <div className="cashup-grid">
            <section className="cashup-block">
              <h3>{t.byChannel}</h3>
              {data.cashIn.length ? (
                <table>
                  <thead><tr><th>{t.channel}</th><th className="num">{t.count}</th><th className="num">{t.amount}</th></tr></thead>
                  <tbody>{data.cashIn.map((row) => <tr key={row.method}><td>{t.methods[row.method] || row.method}</td><td className="num">{row.count}</td><td className="num">{baht(row.amount)}</td></tr>)}</tbody>
                  <tfoot><tr><th>{t.total}</th><td className="num">{cashInCount}</td><td className="num">{baht(data.cashInTotal)}</td></tr></tfoot>
                </table>
              ) : <p className="cashup-empty">{t.none}</p>}
            </section>
            <section className="cashup-block">
              <h3>{t.byStaff}</h3>
              {data.byStaff.length ? (
                <table>
                  <thead><tr><th>{t.staff}</th><th>{t.channel}</th><th className="num">{t.count}</th><th className="num">{t.amount}</th></tr></thead>
                  <tbody>{data.byStaff.map((row) => <tr key={`${row.staffId ?? "none"}-${row.method}`}><td>{row.staffName || t.unattributed}</td><td>{t.methods[row.method] || row.method}</td><td className="num">{row.count}</td><td className="num">{baht(row.amount)}</td></tr>)}</tbody>
                </table>
              ) : <p className="cashup-empty">{t.none}</p>}
            </section>
          </div>
          <section className="cashup-block">
            <h3>{t.refundList}</h3>
            {data.refunds.length ? (
              <div className="admin-table-scroll">
                <table>
                  <thead><tr><th>{t.time}</th><th>{t.reference}</th><th>{t.staff}</th><th>{t.note}</th><th className="num">{t.amount}</th></tr></thead>
                  <tbody>{data.refunds.map((row) => <tr key={row.paymentNo}><td>{bangkokClock(row.refundedAt)}</td><td>{row.paymentNo}</td><td>{row.staffName || t.unattributed}</td><td>{row.note || "-"}</td><td className="num">{baht(row.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="cashup-empty">{t.noRefunds}</p>}
          </section>
          <section className="cashup-block">
            <h3>{t.transactions} <small>{t.items(data.rows.length)}</small></h3>
            {data.rows.length ? (
              <div className="admin-table-scroll">
                <table>
                  <thead><tr><th>{t.time}</th><th>{t.reference}</th><th>{t.item}</th><th>{t.customer}</th><th>{t.channel}</th><th>{t.staff}</th><th className="num">{t.amount}</th></tr></thead>
                  <tbody>{data.rows.map((row) => <tr key={row.paymentNo}><td>{clock(row.paidAt)}</td><td>{row.paymentNo}</td><td>{row.itemName || t.service}</td><td>{row.customer}</td><td>{t.methods[row.method] || row.method}</td><td>{row.staffName || "-"}</td><td className="num">{baht(row.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="cashup-empty">{t.none}</p>}
            {data.rows.length >= 500 ? <p className="cashup-empty">{t.capped}</p> : null}
          </section>
          <footer className="cashup-sign cashup-print-only">
            <div><span>{t.counted}</span><i /></div>
            <div><span>{t.closedBy}</span><i /></div>
            <div><span>{t.checkedBy}</span><i /></div>
          </footer>
        </>
      )}
    </section>
  );
}
