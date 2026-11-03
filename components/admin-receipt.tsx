"use client";

import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { AdminNotice } from "@/components/admin-notice";
import type { ReceiptInfo } from "@/lib/site-settings";

type Lang = "th" | "en";
type Receipt = {
  receiptNo: string;
  issuedAt: string;
  firstIssue: boolean;
  business: ReceiptInfo;
  payment: { paymentNo: string; paidAt: string | null; method: string; amount: number; itemName: string | null };
  customer: { name: string; memberCode: string | null; phone: string | null };
  staffName: string | null;
  vat: { net: number; vat: number } | null;
};

const copy = {
  th: {
    receipt: "ใบเสร็จรับเงิน", taxInvoice: "ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ", taxId: "เลขประจำตัวผู้เสียภาษี", phone: "โทร",
    number: "เลขที่", date: "วันที่", customer: "ลูกค้า", item: "รายการ", amount: "จำนวนเงิน", service: "ค่าบริการ",
    net: "มูลค่าก่อนภาษี", vat: "ภาษีมูลค่าเพิ่ม 7%", total: "รวมทั้งสิ้น", vatIncluded: "ราคารวมภาษีมูลค่าเพิ่มแล้ว",
    paidBy: "ชำระโดย", receivedBy: "ผู้รับเงิน", paymentNo: "อ้างอิง",
    methods: { cash: "เงินสด", card: "บัตร", promptpay: "โอน / พร้อมเพย์", wallet: "เครดิตในแอป", line_pay: "LINE Pay" } as Record<string, string>,
    print: "พิมพ์ใบเสร็จ", close: "ปิด", loading: "กำลังออกใบเสร็จ…", failed: "ออกใบเสร็จไม่สำเร็จ", retry: "ลองใหม่",
    reprint: (issuedAt: string) => `ใบเสร็จนี้ออกแล้วเมื่อ ${issuedAt} พิมพ์ซ้ำได้ด้วยเลขที่เดิม`,
  },
  en: {
    receipt: "Receipt", taxInvoice: "Receipt / abbreviated tax invoice", taxId: "Tax ID", phone: "Tel.",
    number: "No.", date: "Date", customer: "Customer", item: "Item", amount: "Amount", service: "Service",
    net: "Before VAT", vat: "VAT 7%", total: "Total", vatIncluded: "Prices include VAT",
    paidBy: "Paid by", receivedBy: "Received by", paymentNo: "Ref.",
    methods: { cash: "Cash", card: "Card", promptpay: "Transfer / PromptPay", wallet: "App credit", line_pay: "LINE Pay" } as Record<string, string>,
    print: "Print receipt", close: "Close", loading: "Issuing the receipt…", failed: "Could not issue the receipt", retry: "Try again",
    reprint: (issuedAt: string) => `Issued on ${issuedAt}. Reprints keep the same number.`,
  },
};

// One request per payment even when React runs the effect twice in development.
const pending = new Map<string, Promise<Receipt>>();
function issue(paymentNo: string) {
  let request = pending.get(paymentNo);
  if (!request) {
    request = fetch("/api/admin/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentNo }), signal: AbortSignal.timeout(15000) })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || `Request failed (${response.status})`);
        return body as Receipt;
      })
      .finally(() => setTimeout(() => pending.delete(paymentNo), 0));
    pending.set(paymentNo, request);
  }
  return request;
}

// "YYYY-MM-DD HH:MM:SS" Bangkok wall clock, shown as it is (th-TH prints the Buddhist year).
const stamp = (value: string | null, lang: Lang) => value
  ? new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(`${value.replace(" ", "T")}Z`))
  : "-";
const baht = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AdminReceipt({ paymentNo, lang }: { paymentNo: string; lang: Lang }) {
  const t = copy[lang];
  const [state, setState] = useState<{ attempt: number; receipt?: Receipt; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    issue(paymentNo)
      .then((receipt) => { if (live) setState({ attempt, receipt }); })
      .catch((error: Error) => { if (live) setState({ attempt, error: error.message }); });
    return () => { live = false; };
  }, [paymentNo, attempt]);

  const current = state?.attempt === attempt ? state : null;
  if (!current) return <p className="receipt-state" role="status">{t.loading}</p>;
  if (current.error || !current.receipt) {
    return (
      <AdminNotice tone="error" lang={lang} className="receipt-notice" action={<button type="button" onClick={() => setAttempt((value) => value + 1)}>{t.retry}</button>}>{t.failed}: {current.error}</AdminNotice>
    );
  }
  const { receipt } = current;
  const { business, payment, customer, vat } = receipt;
  return (
    <>
      <div className="receipt-toolbar">
        <button type="button" onClick={() => window.close()}><X aria-hidden="true" />{t.close}</button>
        <button className="primary" type="button" onClick={() => window.print()}><Printer aria-hidden="true" />{t.print}</button>
        {receipt.firstIssue ? null : <p>{t.reprint(stamp(receipt.issuedAt, lang))}</p>}
      </div>
      <article className="receipt-paper" aria-label={`${business.vatRegistered ? t.taxInvoice : t.receipt} ${receipt.receiptNo}`}>
        <header>
          <strong>{business.businessName}</strong>
          {business.branch ? <span>{business.branch}</span> : null}
          {business.address ? <span>{business.address}</span> : null}
          {business.phone ? <span>{t.phone} {business.phone}</span> : null}
          {business.taxId ? <span>{t.taxId} {business.taxId}</span> : null}
        </header>
        <h1>{business.vatRegistered ? t.taxInvoice : t.receipt}</h1>
        <dl className="receipt-meta">
          <div><dt>{t.number}</dt><dd>{receipt.receiptNo}</dd></div>
          <div><dt>{t.date}</dt><dd>{stamp(payment.paidAt, lang)}</dd></div>
          <div><dt>{t.customer}</dt><dd>{customer.name}{customer.memberCode ? ` (${customer.memberCode})` : ""}{customer.phone ? ` · ${customer.phone}` : ""}</dd></div>
        </dl>
        <table>
          <thead><tr><th>{t.item}</th><th>{t.amount}</th></tr></thead>
          <tbody><tr><td>{payment.itemName || t.service}</td><td>{baht(payment.amount)}</td></tr></tbody>
        </table>
        <dl className="receipt-totals">
          {vat ? <div><dt>{t.net}</dt><dd>{baht(vat.net)}</dd></div> : null}
          {vat ? <div><dt>{t.vat}</dt><dd>{baht(vat.vat)}</dd></div> : null}
          <div className="grand"><dt>{t.total}</dt><dd>{baht(payment.amount)} ฿</dd></div>
        </dl>
        {vat ? <p className="receipt-note">{t.vatIncluded}</p> : null}
        <dl className="receipt-meta">
          <div><dt>{t.paidBy}</dt><dd>{t.methods[payment.method] || payment.method}</dd></div>
          <div><dt>{t.paymentNo}</dt><dd>{payment.paymentNo}</dd></div>
          {receipt.staffName ? <div><dt>{t.receivedBy}</dt><dd>{receipt.staffName}</dd></div> : null}
        </dl>
        {business.footer ? <footer>{business.footer}</footer> : null}
      </article>
    </>
  );
}
