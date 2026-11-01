"use client";
import { useState, type FormEvent } from "react";
import { Empty, SectionTitle, Top } from "@/components/member-ui";
import type { Group, Sport } from "@/components/member-types";
import { localeTag, t } from "@/lib/i18n";
import { missingPlayers, openGameSlots, playDayKind, wallClockTime } from "@/lib/package-presentation";

export const LEVEL_CHOICES = ["มือใหม่", "ฝึกหน้าบ้าน", "พอตัว", "แข่งขัน"];
const MAX_SLOTS_ON_HOME = 4;

export type NewGroup = { sportSlug: string; name: string; levelName: string; playAt?: string; maxPlayers: number };

function slotTime(group: Group, now: number) {
  const kind = playDayKind(group.playAt, now);
  if (!kind) return t(group.levelName);
  const time = new Date(wallClockTime(group.playAt));
  const clock = time.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
  if (kind === "today") return t("วันนี้ {{value0}}", { value0: clock });
  if (kind === "tomorrow") return t("พรุ่งนี้ {{value0}}", { value0: clock });
  return time.toLocaleString(localeTag(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

function LivePill() {
  return <span className="fyg-live-pill"><i aria-hidden="true" />LIVE</span>;
}

// แก้ 4: home "Find Your Game" — 3–4 open slots, LIVE badge and players still needed.
export function FindYourGameRow({ groups, now, onOpen, onCreate }: { groups: Group[]; now: number; onOpen: (group: Group) => void; onCreate: () => void }) {
  const slots = openGameSlots(groups, now, MAX_SLOTS_ON_HOME);
  return (
    <section className="fyg-section" aria-label={t("fyg.title")}>
      <div className="sec-head fyg-head"><strong>🎯 {t("fyg.title")}</strong>{slots.length ? <LivePill /> : null}</div>
      <div className={slots.length > 3 ? "fyg-row fyg-slots scroll" : "fyg-row fyg-slots"}>
        {slots.map((group) => (
          <button type="button" className="fyg-slot" key={group.id} onClick={() => onOpen(group)}>
            <b>{group.sportIcon ? `${group.sportIcon} ` : ""}{group.name}</b>
            <small className="fyg-need">{t("ขาดอีก {{value0}} คน", { value0: missingPlayers(group) })}</small>
            <small>{slotTime(group, now)}</small>
          </button>
        ))}
        {slots.length < 3 ? (
          <button type="button" className={slots.length ? "fyg-slot create" : "fyg-slot create alone"} onClick={onCreate}>
            <b>{t("＋ สร้างก๊วน")}</b>
            <small>{slots.length ? t("ชวนเพื่อนมาเล่นเพิ่ม") : t("ยังไม่มีก๊วนเปิดรับ")}</small>
          </button>
        ) : null}
      </div>
    </section>
  );
}

function GroupCard({ group, now, busy, onJoin, onLeave, onClose }: { group: Group; now: number; busy: boolean; onJoin: (group: Group) => void; onLeave: (group: Group) => void; onClose: (group: Group) => void }) {
  const missing = missingPlayers(group);
  const owner = Boolean(Number(group.isOwner));
  const joined = Boolean(Number(group.joined));
  return (
    <article className={missing ? "group-card" : "group-card full"}>
      <div className="group-card-head">
        <b>{group.sportIcon ? `${group.sportIcon} ` : ""}{group.name}</b>
        <span className={missing ? "group-need" : "group-need full"}>{missing ? t("ขาดอีก {{value0}} คน", { value0: missing }) : t("เต็มแล้ว")}</span>
      </div>
      <small>{t(group.sportName)} · {t(group.levelName)}{group.playAt ? ` · ${slotTime(group, now)}` : ""}</small>
      <div className="group-card-foot">
        <span className="group-players">{t("ผู้เล่น {{value0}}/{{value1}}", { value0: group.memberCount, value1: group.maxPlayers })}</span>
        {owner ? <button type="button" className="group-action secondary" disabled={busy} onClick={() => onClose(group)}>{t("ปิดก๊วน")}</button>
          : joined ? <button type="button" className="group-action secondary" disabled={busy} onClick={() => onLeave(group)}>{t("ออกจากก๊วน")}</button>
            : <button type="button" className="group-action" disabled={busy || !missing} onClick={() => onJoin(group)}>{missing ? t("เข้าร่วม") : t("เต็มแล้ว")}</button>}
      </div>
      {owner ? <small className="group-joined">{t("ก๊วนของคุณ")}</small> : joined ? <small className="group-joined">{t("คุณอยู่ในก๊วนนี้แล้ว")}</small> : null}
    </article>
  );
}

// Clamp only when leaving the field or submitting, so typing "12" is not cut to "1" → 2.
function clampPlayers(value: string) {
  return Math.min(20, Math.max(2, Math.round(Number(value)) || 2));
}

function localInputValue(time: number) {
  return new Date(time + 7 * 3_600_000).toISOString().slice(0, 16);
}

export function GroupsScreen({ groups, sports, now, busy, onBack, onCreate, onJoin, onLeave, onClose }: {
  groups: Group[];
  sports: Sport[];
  now: number;
  busy: boolean;
  onBack: () => void;
  onCreate: (input: NewGroup) => Promise<boolean>;
  onJoin: (group: Group) => void;
  onLeave: (group: Group) => void;
  onClose: (group: Group) => void;
}) {
  const [sportSlug, setSportSlug] = useState("");
  const [name, setName] = useState("");
  const [levelName, setLevelName] = useState(LEVEL_CHOICES[0]);
  const [playAt, setPlayAt] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const live = openGameSlots(groups, now, groups.length).length > 0;
  const sorted = [...groups].sort((a, b) => Number(!missingPlayers(a)) - Number(!missingPlayers(b)));
  const selectedSport = sportSlug || sports.find((sport) => sport.requiresBooking)?.slug || sports[0]?.slug || "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const players = clampPlayers(maxPlayers);
    setMaxPlayers(String(players));
    const created = await onCreate({ sportSlug: selectedSport, name: name.trim(), levelName, playAt: playAt || undefined, maxPlayers: players });
    if (created) {
      setName("");
      setPlayAt("");
    }
  }

  return (
    <div className="page groups-page">
      <Top title="Find Your Game" onBack={onBack} />
      <div className="fyg-screen-head"><span>{t("ก๊วนที่เปิดรับตอนนี้")}</span>{live ? <LivePill /> : null}</div>
      <div className="group-list">
        {sorted.length ? sorted.map((group) => <GroupCard key={group.id} group={group} now={now} busy={busy} onJoin={onJoin} onLeave={onLeave} onClose={onClose} />) : <Empty text={t("ยังไม่มีก๊วนเปิดรับ")} />}
      </div>
      <SectionTitle title={t("สร้างก๊วนใหม่")} />
      <form className="field-stack group-form" onSubmit={submit}>
        <label className="field">{t("กีฬา")}<select value={selectedSport} onChange={(event) => setSportSlug(event.target.value)}>{sports.map((sport) => <option key={sport.slug} value={sport.slug}>{sport.icon} {t(sport.name)}</option>)}</select></label>
        <label className="field">{t("ชื่อก๊วน")}<input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("เช่น PPA Evening Badminton")} /></label>
        <label className="field">{t("ระดับ")}<select value={levelName} onChange={(event) => setLevelName(event.target.value)}>{LEVEL_CHOICES.map((level) => <option key={level} value={level}>{t(level)}</option>)}</select></label>
        <label className="field">{t("วันและเวลาเล่น (ไม่บังคับ)")}<input type="datetime-local" min={localInputValue(now)} max={localInputValue(now + 60 * 86_400_000)} value={playAt} onChange={(event) => setPlayAt(event.target.value)} /></label>
        <label className="field">{t("จำนวนผู้เล่นทั้งหมด (รวมคุณ)")}<input type="number" inputMode="numeric" min={2} max={20} value={maxPlayers} onChange={(event) => setMaxPlayers(event.target.value)} onBlur={() => setMaxPlayers(String(clampPlayers(maxPlayers)))} /></label>
        <button type="submit" className="primary" disabled={busy || name.trim().length < 2 || !selectedSport}>{t("👥 สร้างก๊วน")}</button>
      </form>
    </div>
  );
}
