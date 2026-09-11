"use client";

import { useEffect, useState } from "react";
import { bangkokToday, datesInMonth, type CalendarDay } from "@/lib/court-availability";
import { t, localeTag } from "@/lib/i18n";
import { useMemberLocale } from "@/components/language-switcher";

const labels = { available: "ว่าง", full: "เต็ม", past: "ผ่านแล้ว", closed: "ปิด" };

export function BookingCalendar({ sport, value, onChange, revision }: { sport: string; value: string; onChange: (date: string) => void; revision: number }) {
  useMemberLocale();
  const [month, setMonth] = useState(value.slice(0, 7));
  const [attempt, setAttempt] = useState(0);
  const key = `${sport}:${month}:${revision}:${attempt}`;
  const [result, setResult] = useState<{ key: string; days: CalendarDay[]; error?: string } | null>(null);
  const days = datesInMonth(month);
  const loading = result?.key !== key;
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/courts/availability?${new URLSearchParams({ sport, month })}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) throw new Error("โหลดปฏิทินไม่สำเร็จ");
        const data = await response.json() as { days: CalendarDay[] };
        if (!controller.signal.aborted) setResult({ key, days: data.days });
      } catch {
        if (!controller.signal.aborted) setResult({ key, days: [], error: "โหลดปฏิทินไม่สำเร็จ" });
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [sport, month, key]);

  function moveMonth(offset: number) {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    setMonth(date.toISOString().slice(0, 7));
  }

  return (
    <section className="booking-calendar" aria-label={t("ปฏิทินจองสนาม")} aria-busy={loading}>
      <div className="booking-calendar-heading">
        <button type="button" title={t("เดือนก่อนหน้า")} aria-label={t("เดือนก่อนหน้า")} disabled={month <= bangkokToday().slice(0, 7)} onClick={() => moveMonth(-1)}>‹</button>
        <strong aria-live="polite">{new Date(`${month}-01T00:00:00+07:00`).toLocaleDateString(localeTag(), { month: "long", year: "numeric", timeZone: "Asia/Bangkok" })}</strong>
        <button type="button" title={t("เดือนถัดไป")} aria-label={t("เดือนถัดไป")} disabled={month === "9999-12"} onClick={() => moveMonth(1)}>›</button>
      </div>
      <div className="booking-calendar-grid">
        {[t("อา"), t("จ"), t("อ"), t("พ"), t("พฤ"), t("ศ"), t("ส")].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
        {Array.from({ length: new Date(`${month}-01T00:00:00Z`).getUTCDay() }, (_, i) => <span key={`empty-${i}`} />)}
        {days.map((date) => {
          const day = !loading ? result?.days.find((item) => item.date === date) : undefined;
          const label = day ? t(labels[day.status]) : loading ? "…" : "—";
          return <button type="button" key={date} data-date={date} data-status={day?.status} aria-label={`${date} ${t(label)}`} aria-pressed={value === date}
            disabled={!day || day.status !== "available"} onClick={() => onChange(date)}>
            <strong>{Number(date.slice(-2))}</strong><small>{t(label)}</small>
          </button>;
        })}
      </div>
      {!loading && result?.error && <div role="alert" className="calendar-error">{t(result.error)}<button type="button" onClick={() => setAttempt((n) => n + 1)}>{t("ลองใหม่")}</button></div>}
    </section>
  );
}
