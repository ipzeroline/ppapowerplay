"use client";
import type { Visit } from "@/components/member-types";
import { formatDate } from "@/components/member-packages";
import { Empty, Top } from "@/components/member-ui";
import { t } from "@/lib/i18n";

const purposeLabel: Record<string, [string, string]> = {
  member: ["🎫", "สมาชิก"],
  booking: ["🏸", "การจอง"],
  coupon: ["🎟️", "คูปอง"],
  entitlement: ["🎁", "สิทธิ์/รางวัล"],
};

// Visit history: a row is recorded each time staff scan the member's QR at the counter.
export function VisitsScreen({ visits, onBack, onShowQr }: { visits: Visit[]; onBack: () => void; onShowQr: () => void }) {
  return (
    <div className="page visits-page">
      <Top title={t("การเข้าใช้บริการ")} icon="🚪" onBack={onBack} />
      <button type="button" className="primary" onClick={onShowQr}>{t("แสดง QR เข้าใช้บริการ")}</button>
      <p className="center-text">{t("แสดง QR ให้เจ้าหน้าที่สแกนที่เคาน์เตอร์ ระบบจะบันทึกการเข้าใช้ให้อัตโนมัติ")}</p>
      <div className="reward-label">{t("ประวัติการเข้าใช้ล่าสุด")}</div>
      <div className="visit-list">
        {visits.map((visit) => {
          const [icon, label] = purposeLabel[visit.purpose] || ["✅", "เข้าใช้บริการ"];
          return (
            <div className="visit-row" key={visit.id}>
              <span className="visit-icon">{icon}</span>
              <div>
                <b>{visit.title ? t(visit.title) : t(label)}</b>
                <small>{t(label)} · {formatDate(visit.createdAt, true)}</small>
              </div>
            </div>
          );
        })}
      </div>
      {!visits.length ? <Empty text={t("ยังไม่มีประวัติการเข้าใช้บริการ")} /> : null}
    </div>
  );
}
