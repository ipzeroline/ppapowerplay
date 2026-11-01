"use client";
import { useState } from "react";
import { formatDate } from "@/components/member-packages";
import type { PendingPayment, WalletLedgerEntry } from "@/components/member-types";
import { Empty, money } from "@/components/member-ui";
import { t } from "@/lib/i18n";
import { pendingPaymentAction } from "@/lib/payment-presentation";

export const TOPUP_CHOICES = [300, 500, 1000, 2000];

const ledgerKinds: Record<string, [string, string]> = {
  topup: ["💳", "เติมเงิน"],
  payment: ["🧾", "ชำระเงิน"],
  refund: ["↩️", "คืนเงิน"],
  coin_earn: ["🪙", "ได้รับเหรียญ"],
  coin_redeem: ["🪙", "ใช้เหรียญ"],
  point_earn: ["⭐", "ได้รับคะแนน"],
  point_redeem: ["⭐", "ใช้คะแนน"],
};

const pendingLabels: Record<string, string> = {
  wallet_topup: "เติมเงิน Wallet",
  membership_pause: "พักการใช้งานแพ็กเกจ",
  coupon_renewal: "ต่ออายุคูปอง",
  coupon: "ซื้อคูปอง",
};

function signedMoney(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))} ฿`;
}

function LedgerRow({ entry }: { entry: WalletLedgerEntry }) {
  const [icon, label] = ledgerKinds[entry.kind] || ["•", entry.kind];
  const amount = Number(entry.amount || 0);
  const extras = [entry.coinDelta ? t("{{value0}} เหรียญ", { value0: entry.coinDelta > 0 ? `+${money(entry.coinDelta)}` : `−${money(Math.abs(entry.coinDelta))}` }) : "", entry.pointDelta ? t("{{value0}} คะแนน", { value0: entry.pointDelta > 0 ? `+${money(entry.pointDelta)}` : `−${money(Math.abs(entry.pointDelta))}` }) : ""].filter(Boolean).join(" · ");
  return (
    <div className="ledger-row">
      <span className="ledger-ic" aria-hidden="true">{icon}</span>
      <div>
        <b>{t(label)}</b>
        <small>{[entry.note ? t(entry.note) : "", formatDate(entry.createdAt, true)].filter(Boolean).join(" · ")}</small>
        {extras ? <small>{extras}</small> : null}
      </div>
      {amount ? <strong className={amount > 0 ? "plus" : "minus"}>{signedMoney(amount)}</strong> : null}
    </div>
  );
}

export function WalletPanel({ coinBalance, pointBalance, ledger, pending, promptPayEnabled = true, busy, onTopup, onPayPending, onCancelPending }: {
  coinBalance: number;
  pointBalance: number;
  ledger: WalletLedgerEntry[];
  pending: PendingPayment[];
  busy: boolean;
  onTopup: (amount: number) => void;
  onPayPending: (paymentNo: string) => void;
  promptPayEnabled?: boolean;
  onCancelPending: (paymentNo: string) => void;
}) {
  const [amount, setAmount] = useState(500);
  return (
    <>
      <div className="wallet-coins">
        <span>🪙 {t("{{value0}} เหรียญ", { value0: money(coinBalance) })}</span>
        <span>⭐ {t("{{value0}} คะแนน", { value0: money(pointBalance) })}</span>
      </div>
      <div className="reward-label">{t("เลือกจำนวนเงินที่ต้องการเติม")}</div>
      <div className="topup-chips" role="group" aria-label={t("เลือกจำนวนเงินที่ต้องการเติม")}>
        {TOPUP_CHOICES.map((choice) => (
          <button type="button" key={choice} aria-pressed={amount === choice} className={amount === choice ? "on" : ""} onClick={() => setAmount(choice)}>{money(choice)} ฿</button>
        ))}
      </div>
      <div className="wallet-actions">
        <button type="button" className="primary green" disabled={busy} onClick={() => onTopup(amount)}>{t("เติมเงิน {{value0}} ฿", { value0: money(amount) })}</button>
      </div>
      {pending.length ? (
        <>
          <div className="reward-label">{t("รอยืนยันการชำระเงิน")}</div>
          <div className="ledger-list">
            {pending.map((payment) => (
              <div className="ledger-row pending" key={payment.paymentNo}>
                <span className="ledger-ic" aria-hidden="true">⏳</span>
                <div>
                  <b>{t(payment.itemName || pendingLabels[payment.itemType || ""] || "รายการชำระเงิน")}</b>
                  <small>{formatDate(payment.createdAt, true)} · {payment.paymentNo}</small>
                </div>
                <span className="ledger-pay">
                  <strong>{money(payment.amount)} ฿</strong>
                  {(() => {
                    const action = pendingPaymentAction(payment, promptPayEnabled);
                    if (action === "counter") return <small className="ledger-counter">{t("ชำระที่เคาน์เตอร์ · รอเจ้าหน้าที่ยืนยัน")}</small>;
                    return <button type="button" onClick={() => onPayPending(payment.paymentNo)}>{action === "slip-sent" ? t("ส่งสลิปแล้ว · ดูรายการ") : t("ชำระ / แนบสลิป")}</button>;
                  })()}
                  {!payment.slipUploadedAt ? <button type="button" className="ledger-cancel" disabled={busy} onClick={() => onCancelPending(payment.paymentNo)}>{t("ยกเลิก")}</button> : null}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div className="reward-label">{t("ประวัติการทำรายการ")}</div>
      {ledger.length ? <div className="ledger-list">{ledger.map((entry) => <LedgerRow key={entry.id} entry={entry} />)}</div> : <Empty text={t("ยังไม่มีข้อมูลประวัติธุรกรรมให้แสดง")} />}
    </>
  );
}
