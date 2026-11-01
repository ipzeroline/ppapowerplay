"use client";
import { Empty, Top } from "@/components/member-ui";
import type { ContentItem } from "@/components/member-types";
import { t } from "@/lib/i18n";
import { parseMeta } from "@/lib/package-presentation";

export type GymnosTarget = "fitness" | "swim" | "hyrox" | "pilates" | "airfit" | "svcclass" | "promotion";

const tiles: { target: GymnosTarget; title: string; sub: string; icon: string; tone: string }[] = [
  { target: "fitness", title: "FITNESS", sub: "แพ็กเกจ & คูปอง", icon: "🏋️", tone: "#3a2416" },
  { target: "swim", title: "SWIM", sub: "แพ็กเกจ & คูปอง", icon: "🏊", tone: "#0e3348" },
  { target: "hyrox", title: "HYROX", sub: "Simulation & Class", icon: "🔥", tone: "#42160f" },
  { target: "pilates", title: "PILATES", sub: "Private & Group", icon: "🤸", tone: "#33203f" },
  { target: "airfit", title: "AIRFIT", sub: "Private & Class", icon: "🪂", tone: "#123a3f" },
  { target: "svcclass", title: "SERVICE CLASS", sub: "ฟรี! เฉพาะสมาชิก", icon: "🧘", tone: "#1d3a28" },
];

// แก้ 5: GYMNOS opens 7 blocks — six services plus the largest Promotion (Hot Deals) block.
export function GymnosHub({ onBack, onOpen }: { onBack: () => void; onOpen: (target: GymnosTarget) => void }) {
  return (
    <div className="page gymnos-page">
      <Top title="GYMNOS" onBack={onBack} />
      <p className="gymnos-lead">{t("เลือกบริการที่ต้องการ")}</p>
      <div className="gx-grid">
        {tiles.map((tile) => (
          <button type="button" className="gx" key={tile.target} onClick={() => onOpen(tile.target)}>
            <span className="gi" style={{ background: tile.tone }} aria-hidden="true">{tile.icon}</span>
            <b>{tile.title}</b>
            <small>{t(tile.sub)}</small>
          </button>
        ))}
      </div>
      <button type="button" className="promo-hero" onClick={() => onOpen("promotion")}>
        <span className="promo-hero-glow" aria-hidden="true" />
        <span className="promo-hero-badge">🔥 HOT DEALS</span>
        <span className="promo-hero-ic" aria-hidden="true">🎁</span>
        <b>PROMOTION</b>
        <small>{t("ดีลประจำสัปดาห์ & Member ราคาพิเศษ")}</small>
        <span className="promo-hero-arrow" aria-hidden="true">›</span>
      </button>
    </div>
  );
}

// Free classes for members with an active package (class_schedule items with metadata.category = "service").
export function ServiceClassScreen({ items, hasActiveMembership, onBack, onSchedule }: { items: ContentItem[]; hasActiveMembership: boolean; onBack: () => void; onSchedule: () => void }) {
  const classes = items.filter((item) => item.contentType === "class_schedule" && parseMeta(item.metadata).category === "service");
  return (
    <div className="page">
      <Top title="Service Class" icon="🧘" onBack={onBack} />
      <div className="renew-card coupon">
        <b>{t("คลาสฟรี · ไม่ต้องใช้คูปอง")}</b>
        <p>{t("เฉพาะสมาชิกที่มีแพ็กเกจใช้งานอยู่ แสดง QR สมาชิกที่เคาน์เตอร์ก่อนเข้าคลาส")}</p>
      </div>
      {!hasActiveMembership ? <p className="renew-note">{t("ต้องมีแพ็กเกจสมาชิกที่ใช้งานอยู่จึงจะเข้าคลาสฟรีได้")}</p> : null}
      <div className="svc-class-list">
        {classes.length ? classes.map((item) => {
          const meta = parseMeta(item.metadata);
          const detail = [typeof meta.time === "string" ? meta.time : "", t(item.subtitle)].filter(Boolean).join(" · ");
          return (
            <div className="svc-class-row" key={item.id}>
              <span aria-hidden="true">{item.icon}</span>
              <div><b>{t(item.title)}</b>{detail ? <small>{detail}</small> : null}</div>
            </div>
          );
        }) : <Empty text={t("ยังไม่มีตารางคลาสฟรีประกาศ")} />}
      </div>
      <button type="button" className="ghost" onClick={onSchedule}>{t("ดูตารางคลาสทั้งหมด")}</button>
    </div>
  );
}
