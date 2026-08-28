"use client";

import liff from "@line/liff";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type Sport = {
  id: number;
  slug: string;
  name: string;
  icon: string;
  description: string;
  requiresBooking: number | boolean;
  baseRate: number;
};

type Slot = {
  courtId: number;
  courtName: string;
  time: string;
  available: boolean;
  rate: number;
};

type Booking = {
  booking_no?: string;
  bookingNo?: string;
  title: string;
  startsAt?: string;
  starts_at?: string;
  amount: number;
  status: string;
  qr_secret?: string;
};

type Coupon = {
  id: number;
  code?: string;
  name: string;
  category: string;
  price?: number;
  totalUses?: number;
  validityDays?: number;
  remainingUses?: number;
  expiresAt?: string;
};

type Trainer = {
  id: number;
  slug: string;
  name: string;
  nickname: string;
  role: string;
  avatar: string;
  imageUrl?: string | null;
  experience: string;
  zodiac?: string | null;
  birthYear?: number | null;
  bloodType?: string | null;
  contactPhone?: string | null;
  startPrice: number;
  certifications?: string[] | string;
};

type Group = { id: number; name: string; levelName: string; sportName: string; sportSlug?: string; description?: string };
type NotificationItem = { id: number; title: string; body: string; status: string; createdAt?: string };

type Bootstrap = {
  user: { displayName: string; memberCode: string; avatar?: string; avatarTier?: string };
  wallet: { balance: number; coinBalance: number; pointBalance: number };
  sports: Sport[];
  bookings: Booking[];
  coupons: Coupon[];
  trainers: Trainer[];
  groups: Group[];
  notifications: NotificationItem[];
};

type Screen =
  | "splash"
  | "login"
  | "home"
  | "sports"
  | "courts"
  | "datetime"
  | "summary"
  | "payment"
  | "success"
  | "scan"
  | "checkin"
  | "mybooking"
  | "gymnos"
  | "fitness"
  | "swim"
  | "hyrox"
  | "pilates"
  | "airfit"
  | "promotion"
  | "livetv"
  | "wallet"
  | "coupon"
  | "reward"
  | "membership"
  | "plans"
  | "trainer"
  | "groups"
  | "notifications"
  | "help"
  | "profile"
  | "admin";

type TabIcon = "home" | "trainer" | "scan" | "history" | "profile";

const tabs: [Screen, TabIcon, string][] = [
  ["home", "home", "หน้าหลัก"],
  ["trainer", "trainer", "เทรนเนอร์"],
  ["scan", "scan", "สแกน"],
  ["mybooking", "history", "ประวัติ"],
  ["profile", "profile", "โปรไฟล์"],
];

const richMenuScreens: Screen[] = ["sports", "membership", "wallet", "coupon", "trainer", "help"];

function initialScreenFromUrl(): Screen {
  if (typeof window === "undefined") return "home";
  const screenParam = new URLSearchParams(window.location.search).get("screen");
  return richMenuScreens.includes(screenParam as Screen) ? (screenParam as Screen) : "home";
}

const homeSlides = [
  {
    tag: "EVENT",
    title: "🏆 PPA HYROX Challenge 2026",
    text: "สมัครแข่งวันนี้ - 30 มิ.ย. · รับเสื้อ Finisher ฟรี",
    action: "สมัคร",
    target: "hyrox" as Screen,
    tone: "event",
  },
  {
    tag: "PROMOTION",
    title: "🛍️ รองเท้าแบด ลดสูงสุด 40%",
    text: "PPA Pro Shop · เฉพาะสมาชิก ถึง 31 พ.ค.",
    action: "ดูดีล",
    target: "promotion" as Screen,
    tone: "shop",
  },
  {
    tag: "FOOD",
    title: "🍜 ส่วนลดร้านอาหาร 15%",
    text: "PPA Cafe & Restaurant · โชว์ QR สมาชิกรับสิทธิ์",
    action: "รับสิทธิ์",
    target: "coupon" as Screen,
    tone: "food",
  },
  {
    tag: "NEW",
    title: "🪂 เปิดคลาส Airfit ใหม่!",
    text: "ทดลองเรียนครั้งแรก 199 ฿ · จองผ่านแอปเท่านั้น",
    action: "จอง",
    target: "airfit" as Screen,
    tone: "airfit",
  },
] as const;

const serviceShortcuts: { icon: string; title: string; text: string; screen: Screen }[] = [
  { icon: "🏋️", title: "Gymnos Hub", text: "Fitness, HYROX, Airfit", screen: "gymnos" },
  { icon: "🏊", title: "Swim Pack", text: "สระและแพ็กเกจ", screen: "swim" },
  { icon: "🤸", title: "Pilates", text: "Private / Group", screen: "pilates" },
  { icon: "🎁", title: "Promotion", text: "ดีลสมาชิก", screen: "promotion" },
  { icon: "📺", title: "Live TV", text: "แมตช์สดในคลับ", screen: "livetv" },
  { icon: "🎫", title: "Coupon", text: "ซื้อและใช้คูปอง", screen: "coupon" },
  { icon: "🏆", title: "Reward", text: "Coins / Points", screen: "reward" },
  { icon: "👥", title: "Find Your Game", text: "ก๊วนและ Open Run", screen: "groups" },
];

const classPacks = [
  { key: "fitness", icon: "💪", name: "Fitness Pack", price: 299, desc: "Day pass, monthly access และ PT starter" },
  { key: "hyrox", icon: "🔥", name: "HYROX Simulation", price: 1300, desc: "แข่งจำลองพร้อม coach station" },
  { key: "pilates", icon: "🤸", name: "Pilates Group 10", price: 8500, desc: "Reformer group class 10 ครั้ง" },
  { key: "airfit", icon: "🪂", name: "Airfit Trial", price: 199, desc: "ทดลองเรียน 1 ครั้ง" },
];

const timeChoices = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00"];
const levelChoices = ["มือใหม่", "ฝึกหน้าบ้าน", "พอตัว", "แข่งขัน"];
const trainerDays = [
  { day: "จันทร์", date: "13" },
  { day: "อังคาร", date: "14" },
  { day: "พุธ", date: "15" },
  { day: "พฤหัสฯ", date: "16" },
  { day: "ศุกร์", date: "17" },
  { day: "เสาร์", date: "18" },
  { day: "อาทิตย์", date: "19" },
];
const trainerSlots = ["08:00", "09:30", "11:00", "14:00", "16:00", "18:00", "19:30", "20:30"];

const findYourGame = [
  { icon: "🏀", title: "Basketball Open Run", text: "เหลือ 2 ที่เท่านั้น", screen: "groups" as Screen },
  { icon: "🏸", title: "Badminton", text: "ขาดคู่ดับเบิ้ลอีก 1 คน", screen: "groups" as Screen },
  { icon: "🥒", title: "Pickleball", text: "เปิดรับเพิ่มอีก 2 คน", screen: "groups" as Screen },
];

const quickBooking = [
  { icon: "🎾", label: "เทนนิส", slug: "tennis" },
  { icon: "🏸", label: "แบดมินตัน", slug: "badminton" },
  { icon: "🏀", label: "บาสเกตบอล", slug: "basketball" },
  { icon: "🎯", label: "พาเดล", slug: "padel" },
  { icon: "🥒", label: "Pickleball", slug: "pickleball" },
];

const coinRewards = [
  { name: "น้ำเปล่า PPA", detail: "1 ขวด", icon: "💧", cost: 5 },
  { name: "ผ้าขนหนูกีฬา", detail: "ลาย PPA สุดพิเศษ", icon: "🧺", cost: 15 },
  { name: "ลูกแบดมินตัน", detail: "1 หลอด (12 ลูก)", icon: "🏸", cost: 20 },
  { name: "คูปองเช่าคอร์ทฟรี", detail: "ใช้ได้ 1 ชม. ทุกกีฬา", icon: "🎫", cost: 30 },
  { name: "เสื้อกีฬา PPA", detail: "เลือกไซส์ได้ที่เคาน์เตอร์", icon: "👕", cost: 50 },
];

const titleIcons: [string, string][] = [
  ["เลือกกีฬา", "🏟️"],
  ["จองสนาม", "📅"],
  ["วันที่", "⏱️"],
  ["สรุป", "🧾"],
  ["Check In", "✅"],
  ["ประวัติ", "📋"],
  ["Gymnos", "🏋️"],
  ["Fitness", "💪"],
  ["Swim", "🏊"],
  ["HYROX", "🔥"],
  ["Pilates", "🤸"],
  ["Airfit", "🪂"],
  ["Promotion", "🎁"],
  ["Live TV", "📺"],
  ["Wallet", "👛"],
  ["Coupon", "🎫"],
  ["Points", "🏆"],
  ["Membership", "💎"],
  ["Plans", "📦"],
  ["Trainer", "🧑‍🏫"],
  ["Find Your Game", "👥"],
  ["Notification", "🔔"],
  ["Profile", "👤"],
  ["Admin", "⚙️"],
];

const sectionIcons: [string, string][] = [
  ["วันนี้", "📍"],
  ["บริการ", "🧭"],
  ["คลาส", "🗓️"],
  ["เวลา", "⏱️"],
  ["ดีล", "🎁"],
  ["เติมเงิน", "💳"],
  ["คูปอง", "🎫"],
  ["ก๊วน", "👥"],
  ["Schedule", "📅"],
];

const statIcons: Record<string, string> = {
  Bookings: "📋",
  Coupons: "🎫",
  Groups: "👥",
  Unread: "🔔",
};

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function money(amount: number | string | undefined) {
  return Number(amount || 0).toLocaleString("th-TH");
}

function bookingNo(booking: Booking | null) {
  return booking?.booking_no || booking?.bookingNo || "";
}

async function api<T>(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const error = new Error((await res.json().catch(() => null))?.message || "เกิดข้อผิดพลาด");
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return (await res.json()) as T;
}

export function PpaApp() {
  const [screen, setScreen] = useState<Screen>(initialScreenFromUrl);
  const [lineReady, setLineReady] = useState(false);
  const [lineBlocked, setLineBlocked] = useState(false);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [couponStore, setCouponStore] = useState<Coupon[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedTime, setSelectedTime] = useState("18:30");
  const [players, setPlayers] = useState(2);
  const [pendingBooking, setPendingBooking] = useState<Booking | null>(null);
  const [pendingItem, setPendingItem] = useState<{ title: string; amount: number; back: Screen; save?: "coupon" | "topup" | "class"; couponId?: number } | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [qrSeconds, setQrSeconds] = useState(20);
  const [groupName, setGroupName] = useState("");
  const [groupLevel, setGroupLevel] = useState(levelChoices[0]);
  const [profileName, setProfileName] = useState("");
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [trainerDetail, setTrainerDetail] = useState(false);
  const [myTrainerSlug, setMyTrainerSlug] = useState("");
  const [trainerContactOpen, setTrainerContactOpen] = useState(false);
  const [trainerPlanIndex, setTrainerPlanIndex] = useState<number | null>(null);
  const [trainerDayIndex, setTrainerDayIndex] = useState(0);
  const [tutorial, setTutorial] = useState(0);
  const [bookingTab, setBookingTab] = useState<"up" | "his">("up");

  const requireLine = process.env.NEXT_PUBLIC_REQUIRE_LINE === "true" || process.env.NODE_ENV === "production";

  useEffect(() => {
    async function bootLine() {
      if (!process.env.NEXT_PUBLIC_LINE_LIFF_ID) {
        if (requireLine) setLineBlocked(true);
        setLineReady(true);
        return;
      }
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LINE_LIFF_ID });
      if (!liff.isInClient()) {
        setLineBlocked(true);
        return;
      }
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      const idToken = liff.getIDToken();
      if (idToken) await api("/api/auth/line", { method: "POST", body: JSON.stringify({ idToken }) });
      setLineReady(true);
    }
    bootLine().catch(() => setLineReady(true));
  }, [requireLine]);

  useEffect(() => {
    if (!lineReady) return;
    Promise.all([refresh(), loadCoupons()]).catch((error) => {
      if ((error as Error & { status?: number }).status === 401 && requireLine) {
        setLineBlocked(true);
        return;
      }
      notice((error as Error).message);
    });
  }, [lineReady]);

  useEffect(() => {
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % homeSlides.length), 4200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (screen !== "scan") return;
    setQrSeconds(20);
    const timer = window.setInterval(() => setQrSeconds((current) => (current <= 1 ? 20 : current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if (!selectedSport) return;
    const params = new URLSearchParams({ sport: selectedSport.slug, date });
    api<{ slots: Slot[] }>(`/api/courts/availability?${params.toString()}`)
      .then((res) => setSlots(res.slots))
      .catch((error) => notice(error.message));
  }, [selectedSport, date]);

  const slotGroups = useMemo(() => {
    const map = new Map<string, Slot[]>();
    slots.forEach((slot) => map.set(slot.time, [...(map.get(slot.time) || []), slot]));
    return [...map.entries()];
  }, [slots]);

  const selectedSportSlots = selectedSport?.requiresBooking ? slotGroups : [];
  const unreadCount = data?.notifications.filter((item) => item.status === "unread").length ?? 0;

  function notice(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function go(next: Screen) {
    setScreen(next);
  }

  async function refresh() {
    const next = await api<Bootstrap>("/api/bootstrap");
    setData(next);
    setProfileName(next.user.displayName);
    setSelectedTrainer((current) => current || next.trainers[0] || null);
    setSelectedSport((current) => current || next.sports.find((s) => s.requiresBooking) || next.sports[0] || null);
  }

  async function loadCoupons() {
    const res = await api<{ coupons: Coupon[] }>("/api/coupons");
    setCouponStore(res.coupons);
  }

  function pickSport(sport: Sport) {
    setSelectedSport(sport);
    setSelectedSlot(null);
    go(sport.requiresBooking ? "courts" : "summary");
  }

  function selectClass(item: (typeof classPacks)[number]) {
    setPendingItem({ title: `${item.icon} ${item.name}`, amount: item.price, back: item.key as Screen, save: "class" });
    go("payment");
  }

  async function createBooking() {
    if (!selectedSport) return;
    if (selectedSport.requiresBooking && !selectedSlot) {
      notice("กรุณาเลือกสนามและเวลา");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ booking: Booking }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          sportSlug: selectedSport.slug,
          courtId: selectedSlot?.courtId ?? null,
          date,
          time: selectedSlot?.time || selectedTime,
          players,
          title: `${selectedSport.icon} ${selectedSport.name}${selectedSlot ? ` · ${selectedSlot.courtName}` : ""}`,
        }),
      });
      setPendingBooking(res.booking);
      setPendingItem(null);
      go("payment");
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pay(method: "wallet" | "promptpay") {
    if (!pendingBooking && !pendingItem) return;
    setBusy(true);
    try {
      if (pendingBooking) {
        await api("/api/payments", {
          method: "POST",
          body: JSON.stringify({
            bookingNo: bookingNo(pendingBooking),
            method,
            markPaid: method === "promptpay",
            itemName: pendingBooking.title,
          }),
        });
      } else if (pendingItem?.save === "coupon" && pendingItem.couponId) {
        await api("/api/coupons/buy", {
          method: "POST",
          body: JSON.stringify({ couponId: pendingItem.couponId, method }),
        });
      } else if (pendingItem?.save === "topup") {
        await api("/api/wallet/topup", { method: "POST", body: JSON.stringify({ amount: pendingItem.amount }) });
      } else if (pendingItem) {
        await api("/api/payments", {
          method: "POST",
          body: JSON.stringify({ amount: pendingItem.amount, method, markPaid: method === "promptpay", itemName: pendingItem.title }),
        });
      }
      await refresh();
      if (pendingItem?.save === "coupon") await loadCoupons();
      go("success");
      notice("ชำระเงินสำเร็จ");
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function topup(amount: number) {
    if (amount < 50 || amount > 50000) return;
    setPendingBooking(null);
    setPendingItem({ title: "เติมเงิน PPA Wallet", amount, back: "wallet", save: "topup" });
    go("payment");
  }

  function buyCoupon(coupon: Coupon) {
    setPendingBooking(null);
    setPendingItem({ title: coupon.name, amount: Number(coupon.price || 0), back: "coupon", save: "coupon", couponId: coupon.id });
    go("payment");
  }

  async function createGroup() {
    if (!selectedSport || groupName.trim().length < 2) {
      notice("กรุณาตั้งชื่อก๊วนอย่างน้อย 2 ตัวอักษร");
      return;
    }
    setBusy(true);
    try {
      await api("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          sportSlug: selectedSport.slug,
          name: groupName.trim().slice(0, 160),
          levelName: groupLevel,
          description: `สร้างจาก PPA App สำหรับ ${selectedSport.name}`,
        }),
      });
      setGroupName("");
      await refresh();
      notice("สร้างก๊วนสำเร็จ");
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(booking: Booking) {
    const no = bookingNo(booking);
    if (!no || !booking.qr_secret) {
      notice("รายการนี้ไม่มี QR สำหรับ check-in");
      return;
    }
    setBusy(true);
    try {
      await api("/api/checkin", { method: "POST", body: JSON.stringify({ bookingNo: no, qrSecret: booking.qr_secret }) });
      await refresh();
      notice("Check-in สำเร็จ");
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openSupport(kind: "tel" | "mail" | "line") {
    if (kind === "tel") {
      window.location.href = "tel:021234567";
      notice("📞 กำลังโทร 02-123-4567");
      return;
    }
    if (kind === "mail") {
      window.location.href = "mailto:support@ppapowerplay.com?subject=PPA%20Support";
      notice("✉️ เปิดอีเมลถึง support@ppapowerplay.com");
      return;
    }
    window.location.href = "https://line.me/R/ti/p/@ppapowerplay";
    notice("💬 เปิด LINE @ppapowerplay");
  }

  if (lineBlocked || (requireLine && !lineReady)) {
    return (
      <main className="line-block">
        <div className="brand">PPA<span>.</span></div>
        <h1>กรุณาเปิดผ่าน LINE เท่านั้น</h1>
        <p>ระบบนี้ถูกออกแบบเป็น LINE LIFF App เพื่อยืนยันตัวตนและความปลอดภัยของสมาชิก</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="phone-wrap">
        <section className="phone loading">
          <div className="brand">PPA<span>.</span></div>
          <p>กำลังเชื่อมต่อ PPA Power Play</p>
        </section>
      </main>
    );
  }

  const fallbackBookings: Booking[] = [
    { title: "🏸 แบดมินตัน · สนาม 1", startsAt: "2026-05-15T09:00:00+07:00", amount: 200, status: "upcoming", bookingNo: "PPA-DEMO-001" },
    { title: "🔥 HYROX Class", startsAt: "2026-05-16T08:00:00+07:00", amount: 700, status: "upcoming", bookingNo: "PPA-DEMO-002" },
    { title: "🎾 เทนนิส · สนาม 2", startsAt: "2026-05-18T18:00:00+07:00", amount: 400, status: "upcoming", bookingNo: "PPA-DEMO-003" },
    { title: "🥒 พิคเคิลบอล · สนาม 1", startsAt: "2026-05-20T17:00:00+07:00", amount: 250, status: "upcoming", bookingNo: "PPA-DEMO-004" },
  ];
  const fallbackHistory: Booking[] = [
    { title: "🏸 แบดมินตัน · สนาม 4", startsAt: "2026-05-10T19:00:00+07:00", amount: 200, status: "done", bookingNo: "PPA-DEMO-101" },
    { title: "🧘 Yoga Class", startsAt: "2026-05-06T14:00:00+07:00", amount: 0, status: "done", bookingNo: "PPA-DEMO-102" },
  ];
  const realUpcoming = data.bookings.filter((booking) => !["done", "completed", "used", "checked_in", "cancelled"].includes(booking.status));
  const realHistory = data.bookings.filter((booking) => ["done", "completed", "used", "checked_in", "cancelled"].includes(booking.status));
  const upcomingBookings = realUpcoming.length ? realUpcoming : fallbackBookings;
  const historyBookings = realHistory.length ? realHistory : fallbackHistory;
  const myTrainer = data.trainers.find((trainer) => trainer.slug === myTrainerSlug);

  return (
    <main className="phone-wrap">
      <section className="phone">
        <div className="statusbar">
          <span>9:41</span>
          <span>▮▮▮ ⚡</span>
        </div>
        <div className="content">
          {screen === "splash" && (
            <div className="page centered splash">
              <div className="brand">PPA<span>.</span></div>
              <p>Power Play Asia Sport Complex</p>
              <button className="primary" onClick={() => go("home")}>🚀 เลื่อนเพื่อเริ่มต้น</button>
            </div>
          )}

          {screen === "login" && (
            <div className="page centered">
              <div className="brand">PPA<span>.</span></div>
              <p>เข้าสู่ระบบสมาชิกเพื่อจองและใช้งาน QR เข้าใช้บริการ</p>
              <button className="primary" onClick={() => go("home")}>💬 Continue with LINE</button>
              <button className="ghost" onClick={() => go("home")}>👤 ใช้งานแบบสมาชิกเดโม</button>
            </div>
          )}

          {screen === "home" && (
            <div className="page home-page">
              <header className="greet">
                <div className="greet-copy">
                  <div className="g1">สวัสดีตอนเย็น 🌆</div>
                  <div className="g2">{data.user.displayName || "PPA Member"}</div>
                </div>
                <button className="home-bubble reward" onClick={() => go("reward")}>
                  <span>🪙</span>
                  <small>แลกรางวัล</small>
                </button>
                <button className="home-bubble level" onClick={() => go("profile")}>
                  <span>{data.user.avatar || "💪"}</span>
                  <small>ระดับ</small>
                </button>
              </header>

              <button className="member-card premium-card" onClick={() => go("membership")}>
                <div>
                  <span className="m1">Premium Member</span>
                  <small className="m2">หมดอายุ 25 ธ.ค. 2568 · สุดพิเศษไม่จำกัด</small>
                </div>
                <div className="mini-qr">
                  <div className="qr-mini-grid">{Array.from({ length: 81 }).map((_, i) => <i key={i} className={(i * 7 + qrSeconds) % 5 === 0 ? "w" : ""} />)}</div>
                </div>
              </button>

              <div className="ad-carousel home-carousel">
                <div className="ad-track" style={{ transform: `translateX(-${activeSlide * 100}%)` }}>
                  {homeSlides.map((slide) => (
                    <button className={`ad-slide ${slide.tone}`} key={slide.title} onClick={() => go(slide.target)}>
                      <span className="ad-tag">{slide.tag}</span>
                      <strong>{slide.title}</strong>
                      <small>{slide.text}</small>
                    </button>
                  ))}
                </div>
                <div className="ad-dots">
                  {homeSlides.map((slide, index) => (
                    <button aria-label={`ดูสไลด์ ${index + 1}`} className={index === activeSlide ? "on" : ""} key={slide.title} onClick={() => setActiveSlide(index)} />
                  ))}
                </div>
              </div>

              <button className="live-banner" onClick={() => go("livetv")}>
                <div className="lb-head">
                  <span className="live-pill"><i />LIVE</span>
                  <strong>BIG SCREEN LIVE 📺</strong>
                </div>
                <div className="ticker-wrap" aria-label="รายการถ่ายทอดสด">
                  <div className="live-ticker-track">
                    {[
                      "🔴 คืนนี้ 20:00 · FIFA World Cup รอบรองฯ · Zone A",
                      "🏸 พรุ่งนี้ 18:00 · BWF World Tour Finals · Zone A",
                      "🔥 เสาร์นี้ 14:00 · PPA HYROX Challenge รอบชิง · Arena",
                      "🎾 ตอนนี้ · Wimbledon รอบ 8 คน · Zone B",
                      "🏀 22:30 · NBA Finals Game 3 · Zone B",
                    ].concat([
                      "🔴 คืนนี้ 20:00 · FIFA World Cup รอบรองฯ · Zone A",
                      "🏸 พรุ่งนี้ 18:00 · BWF World Tour Finals · Zone A",
                      "🔥 เสาร์นี้ 14:00 · PPA HYROX Challenge รอบชิง · Arena",
                      "🎾 ตอนนี้ · Wimbledon รอบ 8 คน · Zone B",
                      "🏀 22:30 · NBA Finals Game 3 · Zone B",
                    ]).map((text, index) => (
                      <span key={`${text}-${index}`}>{text}</span>
                    ))}
                  </div>
                </div>
                <small>ถ่ายทอดสดคู่สำคัญ & การแข่งขันในโครงการ บนจอยักษ์ PPA</small>
              </button>

              <div className="sec-head">
                <strong>🎯 Find Your Game</strong>
                <span className="fyg-live"><i />LIVE</span>
              </div>
              <div className="fyg-row">
                {findYourGame.map((item) => (
                  <button key={item.title} onClick={() => go(item.screen)}>
                    <strong>{item.icon} {item.title}</strong>
                    <small>{item.text}</small>
                  </button>
                ))}
              </div>

              <div className="sec-head"><strong>Quick Booking</strong></div>
              <div className="quick-booking-row">
                {quickBooking.map((item) => {
                  const sport = data.sports.find((entry) => entry.slug === item.slug);
                  return (
                    <button
                      key={item.slug}
                      onClick={() => sport ? pickSport(sport) : go("sports")}
                    >
                      <span>{item.icon}</span>
                      <small>{item.label}</small>
                    </button>
                  );
                })}
              </div>

              <div className="sec-head"><strong>กีฬา & บริการ</strong></div>
              <button className="gymnos-banner" onClick={() => go("gymnos")}>
                <div><strong>GYMNOS</strong><small>Fitness · Swim · HYROX · Pilates · Airfit · Promotion</small></div>
                <span>›</span>
              </button>
              <div className="svc-grid">
                {data.sports.slice(0, 8).map((sport) => (
                  <button key={sport.slug} onClick={() => pickSport(sport)}>
                    <span>{sport.icon}</span>
                    <div><strong>{sport.name}</strong><small>{sport.description}</small></div>
                  </button>
                ))}
              </div>

              <div className="sec-head"><strong>Statistics</strong></div>
              <div className="stat-row">
                <div><strong>48</strong><small>Players Today</small></div>
                <div><strong>{data.groups.length || 12}</strong><small>Games</small></div>
                <div><strong>{Math.max(9, data.bookings.length)}</strong><small>Courts In Use</small></div>
              </div>
            </div>
          )}

          {screen === "sports" && (
            <div className="page">
              <Top title="เลือกกีฬา" onBack={() => go("home")} />
              <div className="prototype-list">
                {data.sports.map((sport) => (
                  <SportRow
                    key={sport.slug}
                    icon={sport.icon}
                    title={sport.name}
                    text={`${sport.description}${sport.requiresBooking ? ` · เริ่ม ${money(sport.baseRate)} ฿/ชม.` : " · ใช้ได้ทันที"}`}
                    onClick={() => pickSport(sport)}
                  />
                ))}
              </div>
              <SectionTitle title="คลาสและบริการเสริม" />
              <div className="prototype-list">
                {serviceShortcuts.slice(0, 6).map((item) => (
                  <SportRow key={item.title} icon={item.icon} title={item.title} text={item.text} onClick={() => go(item.screen)} />
                ))}
              </div>
            </div>
          )}

          {screen === "courts" && (
            <div className="page">
              <Top title={selectedSport ? `${selectedSport.icon} ${selectedSport.name}` : "จองสนาม"} onBack={() => go("sports")} />
              <div className="booking-focus">
                <span>เลือกบริการ</span>
                <strong>{selectedSport?.icon} {selectedSport?.name}</strong>
                <small>{selectedSport?.description}</small>
              </div>
              <div className="sport-strip">
                {data.sports.map((sport) => (
                  <button className={selectedSport?.slug === sport.slug ? "on" : ""} key={sport.slug} onClick={() => pickSport(sport)}>
                    {sport.icon}<span>{sport.name}</span>
                  </button>
                ))}
              </div>
              <label className="field">วันที่<input type="date" min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <div className="slot-toolbar"><span>เวลาว่าง</span><strong>{selectedSportSlots.length} ช่วงเวลา</strong></div>
              <div className="slot-list">
                {selectedSportSlots.map(([time, group]) => (
                  <article key={time}>
                    <strong>{time}</strong>
                    <div>
                      {group.map((slot) => (
                        <button disabled={!slot.available} className={selectedSlot === slot ? "on" : ""} key={`${slot.courtId}-${slot.time}`} onClick={() => setSelectedSlot(slot)}>
                          {slot.courtName}<small>{slot.available ? `${money(slot.rate)} ฿` : "เต็ม"}</small>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              {!selectedSportSlots.length && <Empty text="ไม่พบช่วงเวลาว่างของบริการนี้" />}
              {selectedSlot && (
                <div className="sticky-summary">
                  <Summary sport={selectedSport} slot={selectedSlot} players={players} />
                  <button className="primary" disabled={busy} onClick={() => go("datetime")}>👥 เลือกจำนวนผู้เล่นและสรุป</button>
                </div>
              )}
            </div>
          )}

          {screen === "datetime" && (
            <div className="page">
              <Top title="วันที่และเวลา" onBack={() => go("courts")} />
              <label className="field">วันที่<input type="date" min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label className="field">จำนวนผู้เล่น<input type="number" min={1} max={20} value={players} onChange={(event) => setPlayers(Math.min(20, Math.max(1, Number(event.target.value))))} /></label>
              <SectionTitle title="เวลายอดนิยม" />
              <div className="chip-grid">
                {timeChoices.map((time) => (
                  <button className={(selectedSlot?.time || selectedTime) === time ? "on" : ""} key={time} onClick={() => setSelectedTime(time)}>{time}</button>
                ))}
              </div>
              <button className="primary" onClick={() => go("summary")}>🧾 ไปหน้าสรุป</button>
            </div>
          )}

          {screen === "summary" && (
            <div className="page">
              <Top title="สรุปรายการ" onBack={() => selectedSport?.requiresBooking ? go("courts") : go("sports")} />
              <Summary sport={selectedSport} slot={selectedSlot} players={players} />
              <div className="secure-note">
                <strong>ตรวจสอบก่อนชำระเงิน</strong>
                <small>ระบบจะกันสนามหลังสร้าง booking และ QR จะใช้งานได้เมื่อชำระเงินสำเร็จเท่านั้น</small>
              </div>
              <button className="primary" disabled={busy || (Boolean(selectedSport?.requiresBooking) && !selectedSlot)} onClick={createBooking}>🔐 ยืนยันและชำระเงิน</button>
            </div>
          )}

          {screen === "payment" && (
            <PaymentScreen
              busy={busy}
              booking={pendingBooking}
              item={pendingItem}
              wallet={data.wallet.balance}
              onBack={() => go(pendingItem?.back || "summary")}
              onPay={pay}
            />
          )}

          {screen === "success" && (
            <div className="page centered">
              <div className="check">✓</div>
              <h2>สำเร็จแล้ว</h2>
              <p>รายการถูกบันทึกแล้ว คุณสามารถดูประวัติหรือเปิด QR สำหรับเข้าใช้บริการได้ทันที</p>
              <button className="primary" onClick={() => go("mybooking")}>📋 ดูรายการของฉัน</button>
              <button className="ghost" onClick={() => go("scan")}>▣ เปิด QR เข้าใช้บริการ</button>
            </div>
          )}

          {screen === "scan" && <ScanScreen data={data} qrSeconds={qrSeconds} onCheckin={() => go("checkin")} />}

          {screen === "checkin" && (
            <div className="page">
              <Top title="Check In" onBack={() => go("scan")} />
              <div className="scan-ring"><div className="icn">▣</div></div>
              <p className="center-text">เลือก booking ที่ชำระแล้วเพื่อ check-in อย่างปลอดภัย</p>
              <div className="list">
                {data.bookings.filter((booking) => booking.status === "paid").map((booking) => (
                  <button key={bookingNo(booking)} disabled={busy} onClick={() => checkIn(booking)}>
                    {booking.title}<small>{bookingNo(booking)} · แตะเพื่อ check-in</small>
                  </button>
                ))}
                {!data.bookings.some((booking) => booking.status === "paid") && <Empty text="ยังไม่มี booking ที่พร้อม check-in" />}
              </div>
            </div>
          )}

          {screen === "mybooking" && (
            <div className="page mybooking-page">
              <Top title="การจองของฉัน" />
              <div className="seg booking-seg">
                <button className={bookingTab === "up" ? "on" : ""} onClick={() => setBookingTab("up")}>Upcoming</button>
                <button className={bookingTab === "his" ? "on" : ""} onClick={() => setBookingTab("his")}>History</button>
              </div>
              <div className="booking-list">
                {(bookingTab === "up" ? upcomingBookings : historyBookings).map((booking, index) => (
                  <BookingRow key={`${bookingNo(booking)}-${index}`} booking={booking} onClick={() => { setPendingBooking(booking); go("scan"); }} />
                ))}
              </div>
            </div>
          )}

          {screen === "gymnos" && <HubScreen title="Gymnos Hub" back={() => go("home")} items={classPacks.slice(0, 2)} onSelect={selectClass} extra={<button className="primary" onClick={() => go("fitness")}>💪 ดู Fitness Pack</button>} />}
          {screen === "fitness" && <HubScreen title="Fitness Pack" back={() => go("gymnos")} items={[classPacks[0]]} onSelect={selectClass} extra={<TrainerStrip trainers={data.trainers} onOpen={(trainer) => { setSelectedTrainer(trainer); setTrainerDetail(true); go("trainer"); }} />} />}
          {screen === "swim" && <SimplePack title="Swim Pack" icon="🏊" price={1200} back={() => go("home")} onBuy={(title, amount) => { setPendingItem({ title, amount, back: "swim", save: "class" }); setPendingBooking(null); go("payment"); }} />}
          {screen === "hyrox" && <HubScreen title="HYROX" back={() => go("home")} items={[classPacks[1]]} onSelect={selectClass} extra={<Schedule title="HYROX Class Schedule" onBook={(time) => { setPendingItem({ title: `HYROX Class · ${time}`, amount: 700, back: "hyrox", save: "class" }); setPendingBooking(null); go("payment"); }} />} />}
          {screen === "pilates" && <HubScreen title="Pilates" back={() => go("home")} items={[classPacks[2]]} onSelect={selectClass} extra={<Schedule title="Reformer Schedule" onBook={(time) => { setPendingItem({ title: `Pilates Reformer · ${time}`, amount: 950, back: "pilates", save: "class" }); setPendingBooking(null); go("payment"); }} />} />}
          {screen === "airfit" && <HubScreen title="Airfit" back={() => go("home")} items={[classPacks[3]]} onSelect={selectClass} extra={<Schedule title="Airfit Slots" onBook={(time) => { setPendingItem({ title: `Airfit · ${time}`, amount: 199, back: "airfit", save: "class" }); setPendingBooking(null); go("payment"); }} />} />}

          {screen === "promotion" && (
            <div className="page">
              <Top title="Promotion" onBack={() => go("home")} />
              <div className="promo-card"><span>🎁 MEMBER DEAL</span><strong>สมัคร Premium รับ coin x2 และส่วนลดคลาส</strong><button onClick={() => go("plans")}>📦 ดูแพ็กเกจ</button></div>
              <SectionTitle title="ดีลประจำสัปดาห์" />
              <div className="list">
                {classPacks.map((item) => <button key={item.key} onClick={() => selectClass(item)}>{item.icon} {item.name}<small>{item.desc} · {money(item.price)} ฿</small></button>)}
              </div>
            </div>
          )}

          {screen === "livetv" && (
            <div className="page">
              <Top title="Live TV" onBack={() => go("home")} />
              <div className="tv-stage"><span>LIVE</span><strong>PPA Arena Channel</strong><small>Basketball Open Run · Court A</small></div>
              <div className="list compact">
                <button>🏀 Court A Live<small>กำลังถ่ายทอด</small></button>
                <button>🏸 Badminton Buffet Rank<small>เริ่ม 18:00</small></button>
                <button>🔥 HYROX Training<small>Replay ล่าสุด</small></button>
              </div>
            </div>
          )}

          {screen === "wallet" && (
            <div className="page">
              <Top title="กระเป๋าเงิน" onBack={() => go("profile")} />
              <BigBalance label="ยอดเงินคงเหลือ" value={`${money(data.wallet.balance)}`} unit="฿" />
              <div className="wallet-actions">
                <button className="primary green" disabled={busy} onClick={() => topup(500)}>เติมเงิน</button>
              </div>
              <div className="reward-label">ประวัติการทำรายการ</div>
              <div className="tx-list">
                <TxRow title="เติมเงิน" detail="วันนี้ · PromptPay" amount={`+${money(1000)} ฿`} plus />
                <TxRow title={pendingBooking?.title || "จองสนามแบดมินตัน"} detail="15 พ.ค. 2569" amount={`-${money(200)} ฿`} />
                <TxRow title="ซื้อคูปอง 10 ครั้ง" detail="12 พ.ค. 2569" amount={`-${money(2400)} ฿`} />
                <TxRow title="คืนเงิน - ยกเลิกการจอง" detail="10 พ.ค. 2569" amount={`+${money(400)} ฿`} plus />
                <TxRow title="เติมเงิน" detail="8 พ.ค. 2569 · บัตรเครดิต" amount={`+${money(3000)} ฿`} plus />
              </div>
            </div>
          )}

          {screen === "coupon" && (
            <div className="page">
              <Top title="คูปอง" onBack={() => go("home")} />
              <SectionTitle title="คูปองที่ซื้อได้" />
              <div className="coupon-list">
                {couponStore.map((coupon) => (
                  <CouponRow key={coupon.id} coupon={coupon} onClick={() => buyCoupon(coupon)} />
                ))}
              </div>
              <SectionTitle title="คูปองของฉัน" />
              <div className="prototype-list">
                {data.coupons.length ? data.coupons.map((coupon) => <MenuItem key={coupon.id} icon="🎟️" title={coupon.name} meta={`เหลือ ${coupon.remainingUses} ครั้ง`} />) : <Empty text="ยังไม่มีคูปอง" />}
              </div>
            </div>
          )}

          {screen === "reward" && (
            <div className="page">
              <Top title="แลกรางวัล" icon="🪙" onBack={() => go("home")} />
              <div className="coin-balance-card">
                <span>Coin สะสมของฉัน</span>
                <strong>🪙 {data.wallet.coinBalance}</strong>
              </div>
              <div className="reward-label">รางวัลที่แลกได้</div>
              <div className="coin-reward-list">
                {coinRewards.map((reward) => {
                  const disabled = data.wallet.coinBalance < reward.cost;
                  return (
                    <button
                      className={disabled ? "disabled" : ""}
                      key={reward.name}
                      onClick={() => notice(disabled ? `🪙 Coin ไม่พอ - ต้องการอีก ${reward.cost - data.wallet.coinBalance} เหรียญ` : `🎁 รับ QR สำหรับ ${reward.name}`)}
                    >
                      <div>
                        <b>{reward.icon} {reward.name}</b>
                        <small>{reward.detail}</small>
                      </div>
                      <span>🪙 {reward.cost}</span>
                    </button>
                  );
                })}
              </div>
              <p className="reward-hint">แตะรางวัลเพื่อรับ QR/โค้ดยื่นให้เจ้าหน้าที่หน้าคลับ</p>
            </div>
          )}

          {screen === "membership" && (
            <div className="page">
              <Top title="สมาชิกของฉัน" onBack={() => go("home")} />
              <button className="member-card premium-card" onClick={() => go("scan")}>
                <div><span>PREMIUM MEMBER</span><strong>{data.user.memberCode}</strong><small>QR เข้าใช้บริการและสิทธิ์ส่วนลด</small></div><div className="mini-qr">▦</div>
              </button>
              <div className="prototype-list">
                <MenuItem icon="📦" title="แพ็กเกจของฉัน" onClick={() => go("plans")} />
                <MenuItem icon="🧾" title="ประวัติการซื้อ" onClick={() => go("mybooking")} />
                <MenuItem icon="🚪" title="การเข้าใช้บริการ" onClick={() => go("checkin")} />
                <MenuItem icon="🎟️" title="คูปองของฉัน" onClick={() => go("coupon")} />
                <MenuItem icon="⭐" title="คะแนนสะสม" onClick={() => go("reward")} />
              </div>
            </div>
          )}

          {screen === "plans" && (
            <div className="page">
              <Top title="เลือกแพ็กเกจ" onBack={() => go("membership")} />
              <div className="fit-list">
                {[["Monthly", 1900], ["Quarterly", 5100], ["Annual", 18000]].map(([name, amount]) => (
                  <FitItem key={name} title={`แพ็กเกจ ${name}`} text="เข้าใช้บริการตามสิทธิ์สมาชิก" price={`${money(amount)} ฿`} onClick={() => { setPendingBooking(null); setPendingItem({ title: `PPA Premium ${name}`, amount: Number(amount), back: "plans", save: "class" }); go("payment"); }} />
                ))}
              </div>
            </div>
          )}

          {screen === "trainer" && (
            <div className="page trainer-page">
              {!trainerDetail ? (
                <>
                  <Top title="เทรนเนอร์" icon="🧑‍🏫" />
                  <div className="reward-label">เทรนเนอร์ประจำของฉัน</div>
                  {myTrainer ? (
                    <button className="my-trainer-card" onClick={() => { setSelectedTrainer(myTrainer); setTrainerDetail(true); }}>
                      <TrainerAvatar trainer={myTrainer} className="my-trainer-ava" />
                      <span className="my-trainer-info"><b>{myTrainer.name}</b><small>{myTrainer.role} · {myTrainer.nickname}</small></span>
                      <em>ประจำ</em>
                      <i onClick={(event) => { event.stopPropagation(); setMyTrainerSlug(""); notice("ยกเลิกเทรนเนอร์ประจำแล้ว"); }}>×</i>
                    </button>
                  ) : (
                    <div className="trainer-empty">
                      <div>🧑‍🏫</div>
                      <b>ยังไม่มีเทรนเนอร์ประจำ</b>
                      <small>เลือกเทรนเนอร์ที่ต้องการจากรายชื่อด้านล่าง</small>
                    </div>
                  )}
                  <div className="sec-head"><strong>เลือกเทรนเนอร์</strong></div>
                  <div className="prototype-list">
                    {data.trainers.map((trainer) => (
                      <button
                        className="trainer-list-card"
                        key={trainer.slug}
                        onClick={() => { setSelectedTrainer(trainer); setTrainerDetail(true); setTrainerContactOpen(false); setTrainerPlanIndex(null); }}
                      >
                        <TrainerAvatar trainer={trainer} />
                        <span><b>{trainer.name} ({trainer.nickname})</b><small>{trainer.role} · ประสบการณ์ {trainer.experience} · เริ่มต้น {money(trainer.startPrice)} ฿</small></span>
                      </button>
                    ))}
                  </div>
                </>
              ) : selectedTrainer && (
                <>
                  <Top title="โปรไฟล์เทรนเนอร์" onBack={() => setTrainerDetail(false)} />
                  <div className="trainer-hero">
                    <TrainerAvatar trainer={selectedTrainer} className="trainer-ava" />
                    <div>
                      <b>{selectedTrainer.name}</b>
                      <div>ชื่อเล่น: {selectedTrainer.nickname} · {selectedTrainer.role}</div>
                    </div>
                  </div>
                  <div className="trainer-stats">
                    <div><b>{selectedTrainer.experience}</b><small>ประสบการณ์</small></div>
                    <div><b>{selectedTrainer.zodiac || "-"}</b><small>ราศี · เกิด {selectedTrainer.birthYear || "-"}</small></div>
                    <div><b>{selectedTrainer.bloodType || "-"}</b><small>กรุ๊ปเลือด</small></div>
                  </div>
                  <div className="cert-card">
                    <div className="reward-label">สถาบันที่มีเกียรติบัตร</div>
                    <ul>
                      {trainerCerts(selectedTrainer).map((cert) => <li key={cert}>{cert}</li>)}
                    </ul>
                  </div>
                  <button
                    className={myTrainerSlug === selectedTrainer.slug ? "ghost trainer-set danger" : "ghost trainer-set"}
                    onClick={() => {
                      const isMine = myTrainerSlug === selectedTrainer.slug;
                      setMyTrainerSlug(isMine ? "" : selectedTrainer.slug);
                      notice(isMine ? `ยกเลิก ${selectedTrainer.name} จากเทรนเนอร์ประจำแล้ว` : `ตั้ง ${selectedTrainer.name} เป็นเทรนเนอร์ประจำแล้ว`);
                    }}
                  >
                    {myTrainerSlug === selectedTrainer.slug ? "✕ ยกเลิกเทรนเนอร์ประจำ" : "ตั้งเป็นเทรนเนอร์ประจำ"}
                  </button>
                  <button className="primary green" onClick={() => setTrainerContactOpen((open) => !open)}>📞 ติดต่อแอดมิน</button>
                  {trainerContactOpen && (
                    <div className="trainer-contact-card">
                      <span>เบอร์ติดต่อแอดมิน PPA Power Play</span>
                      <b>{selectedTrainer.contactPhone || "02-123-4567"}</b>
                      <p>แจ้งชื่อเทรนเนอร์ที่สนใจกับแอดมิน เพื่อสอบถามแพ็กเกจและนัดเวลาเทรน</p>
                    </div>
                  )}
                  <div className="sec-head"><strong>แพ็กเกจเทรนส่วนตัว</strong></div>
                  <div className="fit-list">
                    {trainerPlans(selectedTrainer).map((plan, index) => (
                      <button
                        className={trainerPlanIndex === index ? "fit-item-ui sel-pkg" : "fit-item-ui"}
                        key={plan.title}
                        onClick={() => { setTrainerPlanIndex(index); notice(`เลือกแพ็กเกจ ${plan.title} แล้ว - เลือกเวลาที่ว่างด้านล่าง`); }}
                      >
                        <div><b>{plan.title}</b><small>{plan.text}</small></div>
                        <strong>{money(plan.price)} ฿</strong>
                      </button>
                    ))}
                  </div>
                  <div className="sec-head"><strong>ตารางว่าง</strong></div>
                  <div className="trainer-day-strip">
                    {trainerDays.map((item, index) => (
                      <button className={trainerDayIndex === index ? "on" : ""} key={item.day} onClick={() => setTrainerDayIndex(index)}>
                        <small>{item.day}</small><b>{item.date}</b>
                      </button>
                    ))}
                  </div>
                  <div className="trainer-slot-grid">
                    {trainerSlots.map((slot, index) => {
                      const full = (trainerDayIndex + index) % 5 === 2;
                      return (
                        <button
                          className={full ? "full" : ""}
                          disabled={full}
                          key={slot}
                          onClick={() => {
                            if (trainerPlanIndex === null) {
                              notice("กรุณาเลือกแพ็กเกจก่อน");
                              return;
                            }
                            const plan = trainerPlans(selectedTrainer)[trainerPlanIndex];
                            setPendingBooking(null);
                            setPendingItem({ title: `PT ${selectedTrainer.name} · ${trainerDays[trainerDayIndex].day} ${slot} · ${plan.title}`, amount: plan.price, back: "trainer", save: "class" });
                            go("payment");
                          }}
                        >
                          {slot}<small>{full ? "ไม่ว่าง" : "ว่าง"}</small>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {screen === "groups" && (
            <div className="page">
              <Top title="Find Your Game" onBack={() => go("home")} />
              <div className="field-stack">
                <label className="field">ชื่อก๊วน<input maxLength={160} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="เช่น PPA Evening Badminton" /></label>
                <label className="field">ระดับ<select value={groupLevel} onChange={(event) => setGroupLevel(event.target.value)}>{levelChoices.map((level) => <option key={level}>{level}</option>)}</select></label>
                <button className="primary" disabled={busy} onClick={createGroup}>👥 สร้างก๊วน</button>
              </div>
              <SectionTitle title="ก๊วนล่าสุด" />
              <div className="list">
                {data.groups.length ? data.groups.map((group) => <button key={group.id}>👥 {group.name}<small>{group.sportName} · {group.levelName}</small></button>) : <Empty text="ยังไม่มีก๊วน" />}
              </div>
            </div>
          )}

          {screen === "notifications" && (
            <div className="page">
              <Top title="การแจ้งเตือน" onBack={() => go("home")} />
              <div className="seg">
                <button className="on">ทั้งหมด</button><button>ระบบ</button><button>โปรโมชั่น</button>
              </div>
              <div className="noti-list">
                {data.notifications.length ? data.notifications.map((item) => (
                  <NotiRow key={item.id} icon={item.status === "unread" ? "🔔" : "✓"} title={item.title} body={item.body} unread={item.status === "unread"} />
                )) : <Empty text="ยังไม่มีแจ้งเตือน" />}
              </div>
            </div>
          )}

          {screen === "profile" && (
            <div className="page">
              <Top title="โปรไฟล์" />
              <div className="profile-head">
                <button className="avatar profile-avatar" onClick={() => notice("แตะที่ข้อมูลส่วนตัวเพื่อแก้ไขรูป/ชื่อ")}>
                  {data.user.avatar || "💪"}<span>📷</span>
                </button>
                <button className="profile-name" onClick={() => notice("แก้ไขข้อมูลได้ที่เมนูข้อมูลส่วนตัว")}>{profileName || data.user.displayName} ✏️</button>
                <small>📞 081-234-5678</small>
                <em>MEMBER ID · {data.user.memberCode}</em>
              </div>
              <div className="prototype-list">
                <MenuItem icon="👤" title="ข้อมูลส่วนตัว" onClick={() => notice("แก้ไขข้อมูลในช่องชื่อที่แสดงได้เลย")} />
                <MenuItem icon="👛" title="กระเป๋าเงิน & การชำระเงิน" onClick={() => go("wallet")} />
                <MenuItem icon="🎖️" title="สมาชิกและแพ็กเกจ" onClick={() => go("membership")} />
                <MenuItem icon="📅" title="การจองของฉัน" onClick={() => go("mybooking")} />
                <MenuItem icon="🎓" title="คู่มือการใช้งาน" meta="Buffet Rank · ก๊วน · เหรียญ" onClick={() => setTutorial(1)} />
                <MenuItem icon="🔔" title="การแจ้งเตือน" onClick={() => go("notifications")} />
                <MenuItem icon="❓" title="ช่วยเหลือ & ติดต่อเรา" onClick={() => go("help")} />
                <MenuItem icon="🚪" title="ออกจากระบบ" onClick={() => go("splash")} />
              </div>
            </div>
          )}

          {screen === "help" && (
            <div className="page help-page">
              <Top title="ช่วยเหลือ & ติดต่อเรา" icon="❓" onBack={() => go("profile")} />
              <div className="prototype-list">
                <MenuItem icon="📞" title="โทรหาเรา" meta="02-123-4567 · 08:00-21:00" onClick={() => openSupport("tel")} />
                <MenuItem icon="✉️" title="อีเมล" meta="support@ppapowerplay.com" onClick={() => openSupport("mail")} />
                <MenuItem icon="🎓" title="คู่มือการใช้งาน" meta="จอง · ก๊วน · เหรียญ" onClick={() => { go("home"); window.setTimeout(() => setTutorial(1), 250); }} />
                <MenuItem icon="💬" title="LINE Official" meta="@ppapowerplay" onClick={() => openSupport("line")} />
              </div>
              <div className="help-info">
                <b>PPA Power Play Sport Club</b>
                <small>เปิดทุกวัน 08:00 - 21:00 น.</small>
              </div>
              <div className="help-faq">
                <div className="reward-label">คำถามที่พบบ่อย</div>
                <details>
                  <summary>QR เข้าใช้บริการหมดอายุทำอย่างไร?</summary>
                  <p>เปิดหน้า Scan ใหม่ ระบบจะสร้าง QR อายุ 20 วินาทีเพื่อป้องกันการแชร์ต่อ</p>
                </details>
                <details>
                  <summary>จองแล้วต้องชำระภายในกี่นาที?</summary>
                  <p>ระบบกันสนามไว้ 15 นาที หากไม่ชำระเงิน รายการจะหมดอายุอัตโนมัติ</p>
                </details>
                <details>
                  <summary>ต้องการเปลี่ยนรอบหรือยกเลิกติดต่อที่ไหน?</summary>
                  <p>ติดต่อ LINE Official หรือโทรหาแอดมิน พร้อมแจ้งเลข booking ในหน้าประวัติ</p>
                </details>
              </div>
            </div>
          )}

          {screen === "admin" && (
            <div className="page">
              <Top title="Admin" onBack={() => go("profile")} />
              <div className="admin-grid">
                <Stat label="Bookings" value={data.bookings.length} />
                <Stat label="Coupons" value={data.coupons.length} />
                <Stat label="Groups" value={data.groups.length} />
                <Stat label="Unread" value={unreadCount} />
              </div>
              <div className="secure-note"><strong>Read-only operation panel</strong><small>หน้านี้แสดงภาพรวมใน client เท่านั้น งานจัดการจริงควรทำผ่าน backend role-based access control</small></div>
              <button className="primary" disabled={busy} onClick={() => refresh().then(() => notice("อัปเดตข้อมูลแล้ว"))}>↻ Refresh data</button>
            </div>
          )}
        </div>
        <nav className="tabbar" id="tabbar">
          {tabs.map(([id, icon, label]) => (
            <button className={screen === id ? "on" : ""} key={id} onClick={() => { if (id === "trainer") setTrainerDetail(false); go(id); }}>
              <TabBarIcon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {tutorial > 0 && <Tutorial step={tutorial} onNext={() => setTutorial(tutorial >= 4 ? 0 : tutorial + 1)} onSkip={() => setTutorial(0)} />}
        {toast && <div className="toast">{toast}</div>}
        {!tutorial && screen === "home" && <button className="guide-btn" onClick={() => setTutorial(1)}>?</button>}
      </section>
    </main>
  );
}

function TabBarIcon({ name }: { name: TabIcon }) {
  if (name === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 10.5 12 3l8.5 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
      </svg>
    );
  }
  if (name === "trainer") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z" />
        <path d="M5 21c.8-4.1 3.1-6.2 7-6.2s6.2 2.1 7 6.2" />
      </svg>
    );
  }
  if (name === "scan") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h6v6H4z" />
        <path d="M14 4h6v6h-6z" />
        <path d="M4 14h6v6H4z" />
        <path d="M15 15h2v2h-2z" />
        <path d="M19 15h1v5h-5v-1" />
      </svg>
    );
  }
  if (name === "history") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 4.5h11v16L12 16.8l-5.5 3.7z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 11.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z" />
      <path d="M4.8 21c.8-4.3 3.2-6.4 7.2-6.4s6.4 2.1 7.2 6.4" />
    </svg>
  );
}

function iconFor(title: string, options: [string, string][]) {
  return options.find(([key]) => title.includes(key))?.[1] || "•";
}

function Top({ title, onBack, icon }: { title: string; onBack?: () => void; icon?: string }) {
  const marker = icon || iconFor(title, titleIcons);
  return (
    <header className="top">
      {onBack ? <button className="back-btn" onClick={onBack}>‹</button> : <span />}
      <div className="top-title">
        <i>{marker}</i>
        <h1>{icon ? `${icon} ${title}` : title}</h1>
      </div>
      <span />
    </header>
  );
}

function SectionTitle({ title, action, onClick, icon }: { title: string; action?: string; onClick?: () => void; icon?: string }) {
  const marker = icon || iconFor(title, sectionIcons);
  return (
    <div className="section-title">
      <h2><span>{marker}</span>{title}</h2>
      {action && <button onClick={onClick}>{action}</button>}
    </div>
  );
}

function SportRow({ icon, title, text, onClick }: { icon: string; title: string; text?: string; onClick?: () => void }) {
  return (
    <button className="sport-row-ui" onClick={onClick}>
      <span className="si">{icon}</span>
      <div>
        <b>{title}</b>
        {text && <small>{text}</small>}
      </div>
      <span className="chev">›</span>
    </button>
  );
}

function MenuItem({ icon, title, meta, onClick }: { icon: string; title: string; meta?: string; onClick?: () => void }) {
  return (
    <button className="menu-item-ui" onClick={onClick}>
      <span className="mi">{icon}</span>
      <span className="menu-title">{title}</span>
      {meta && <small>{meta}</small>}
      <span className="chev">›</span>
    </button>
  );
}

function FitItem({ title, text, price, onClick }: { title: string; text?: string; price: string; onClick?: () => void }) {
  return (
    <button className="fit-item-ui" onClick={onClick}>
      <div>
        <b>{title}</b>
        {text && <small>{text}</small>}
      </div>
      <strong>{price}</strong>
    </button>
  );
}

function BigBalance({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="big-balance-ui">
      <small>{label}</small>
      <b>{value} <em>{unit}</em></b>
    </div>
  );
}

function CouponRow({ coupon, onClick }: { coupon: Coupon; onClick?: () => void }) {
  const qty = coupon.totalUses || coupon.remainingUses || 1;
  return (
    <button className="coupon-row-ui" onClick={onClick}>
      <span className="cn">{qty}<small>ใบ</small></span>
      <span className="ci">
        <b>{coupon.name}</b>
        <small>{money(coupon.price)} ฿ · ใช้ได้ {coupon.validityDays || 30} วัน</small>
      </span>
      <span className="add">+</span>
    </button>
  );
}

function BookingRow({ booking, onClick }: { booking: Booking; onClick?: () => void }) {
  const start = booking.startsAt || booking.starts_at || "";
  const day = start ? new Date(start).getDate().toString().padStart(2, "0") : "--";
  const month = start ? new Date(start).toLocaleDateString("th-TH", { month: "short" }) : "PPA";
  const time = start ? new Date(start).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";
  const done = ["done", "completed", "used", "checked_in", "cancelled"].includes(booking.status);
  return (
    <button className="booking-row-ui" onClick={onClick}>
      <span className="date"><b>{day}</b><small>{month}</small></span>
      <span className="inf"><b>{booking.title}</b><small>{time ? `${time} · ` : ""}{money(booking.amount)} ฿</small></span>
      <span className={done ? "tag gray" : "tag"}>{done ? "DONE" : "UPCOMING"}</span>
    </button>
  );
}

function TxRow({ title, detail, amount, plus }: { title: string; detail: string; amount: string; plus?: boolean }) {
  return (
    <div className="tx-row">
      <div className="t1">
        {title}
        <small>{detail}</small>
      </div>
      <span className={plus ? "amt plus" : "amt minus"}>{amount}</span>
    </div>
  );
}

function NotiRow({ icon, title, body, unread }: { icon: string; title: string; body: string; unread?: boolean }) {
  return (
    <div className={unread ? "noti-row unread" : "noti-row"}>
      <span className="ni">{icon}</span>
      <div>
        <b>{title}</b>
        <p>{body}</p>
        <small>{unread ? "ใหม่" : "อ่านแล้ว"}</small>
      </div>
    </div>
  );
}

function trainerCerts(trainer: Trainer) {
  if (Array.isArray(trainer.certifications)) return trainer.certifications;
  if (trainer.certifications) {
    try {
      const parsed = JSON.parse(trainer.certifications) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return trainer.certifications.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [
    "NASM - Certified Personal Trainer",
    "Functional Training Institute",
    "PPA Sport Complex Coach Program",
  ];
}

function trainerPlans(trainer: Trainer) {
  const base = Number(trainer.startPrice || 1200);
  return [
    { title: "รายวัน", text: "1 ครั้ง · 1 ชม.", price: base },
    { title: "รายสัปดาห์", text: "5 ครั้ง/สัปดาห์", price: Math.round(base * 4.5) },
    { title: "รายเดือน", text: "20 ครั้ง/เดือน", price: Math.round(base * 16.7) },
    { title: "ราย 6 เดือน", text: "120 ครั้ง", price: Math.round(base * 92) },
    { title: "ราย 1 ปี", text: "240 ครั้ง", price: Math.round(base * 168) },
  ];
}

function Summary({ sport, slot, players }: { sport: Sport | null; slot: Slot | null; players: number }) {
  const rate = slot?.rate ?? sport?.baseRate ?? 0;
  return (
    <div className="summary">
      <div><span>🏷️ บริการ</span><strong>{sport ? `${sport.icon} ${sport.name}` : "-"}</strong></div>
      <div><span>🏟️ สนาม/เวลา</span><strong>{slot ? `${slot.courtName} · ${slot.time}` : "ใช้ QR เข้าได้ทันที"}</strong></div>
      <div><span>👥 ผู้เล่น</span><strong>{players} คน</strong></div>
      <div><span>💳 ยอดรวม</span><strong>{money(rate)} ฿</strong></div>
    </div>
  );
}

function PaymentScreen({
  busy,
  booking,
  item,
  wallet,
  onBack,
  onPay,
}: {
  busy: boolean;
  booking: Booking | null;
  item: { title: string; amount: number } | null;
  wallet: number;
  onBack: () => void;
  onPay: (method: "wallet" | "promptpay") => void;
}) {
  const title = booking?.title || item?.title || "-";
  const amount = Number(booking?.amount ?? item?.amount ?? 0);
  return (
    <div className="page pay-screen">
      <div className="pay-backdrop" />
      <div className="pay-sheet">
        <div className="sheet-handle" />
        <span className="eyebrow">CONFIRM PAYMENT</span>
        <h2>ยืนยันการชำระเงิน</h2>
        <div className="pay-card"><span>🧾 {title}</span><strong>{money(amount)} ฿</strong><small>{booking ? `Booking: ${bookingNo(booking)}` : "PPA secure checkout"}</small></div>
        <button className="pay-method primary-pay" onClick={() => onPay("wallet")} disabled={busy || wallet < amount}>👛 จ่ายด้วย Wallet <span>{money(wallet)} ฿</span></button>
        <button className="pay-method" onClick={() => onPay("promptpay")} disabled={busy}>📱 PromptPay QR <span>ยืนยันหลังชำระ</span></button>
        <button className="ghost" onClick={onBack} disabled={busy}>‹ ย้อนกลับ</button>
      </div>
    </div>
  );
}

function ScanScreen({ data, qrSeconds, onCheckin }: { data: Bootstrap; qrSeconds: number; onCheckin: () => void }) {
  return (
    <div className="page centered">
      <span className="eyebrow">FAST ACCESS</span>
      <h1 className="scan-title">สแกนเข้าใช้บริการ</h1>
      <div className="qr-box"><div className="qr-grid">{Array.from({ length: 121 }).map((_, i) => <i key={i} className={(i + qrSeconds) % 3 ? "" : "off"} />)}</div></div>
      <h2>{data.user.memberCode}</h2>
      <p>QR อายุสั้นสำหรับสแกนเข้าคลับและใช้คูปอง</p>
      <div className="scan-meta"><span>หมดอายุใน</span><strong>{qrSeconds}s</strong></div>
      <button className="primary" onClick={onCheckin}>✅ ไปหน้า Check-in</button>
    </div>
  );
}

function HubScreen({
  title,
  back,
  items,
  onSelect,
  extra,
}: {
  title: string;
  back: () => void;
  items: typeof classPacks;
  onSelect: (item: (typeof classPacks)[number]) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="page">
      <Top title={title} onBack={back} />
      <div className="list">
        {items.map((item) => (
          <button key={item.key} onClick={() => onSelect(item)}>{item.icon} {item.name}<small>💳 {item.desc} · {money(item.price)} ฿</small></button>
        ))}
      </div>
      {extra}
    </div>
  );
}

function SimplePack({ title, icon, price, back, onBuy }: { title: string; icon: string; price: number; back: () => void; onBuy: (title: string, amount: number) => void }) {
  return (
    <div className="page">
      <Top title={title} onBack={back} />
      <div className="promo-card"><span>{icon} PACKAGE</span><strong>{title}</strong><small>▣ ใช้บริการ sport complex ได้อย่างรวดเร็วผ่าน QR สมาชิก</small><button onClick={() => onBuy(title, price)}>💳 ซื้อแพ็กเกจ {money(price)} ฿</button></div>
    </div>
  );
}

function Schedule({ title, onBook }: { title: string; onBook: (time: string) => void }) {
  return (
    <>
      <SectionTitle title={title} />
      <div className="chip-grid">
        {timeChoices.slice(2).map((time, index) => <button key={time} className={index === 4 ? "full" : ""} disabled={index === 4} onClick={() => onBook(time)}>⏱️ {time}<small>{index === 4 ? "เต็ม" : "ว่าง"}</small></button>)}
      </div>
    </>
  );
}

function TrainerStrip({ trainers, onOpen }: { trainers: Trainer[]; onOpen: (trainer: Trainer) => void }) {
  return (
    <div className="trainer-strip">
      {trainers.map((trainer) => <button key={trainer.slug} onClick={() => onOpen(trainer)}><TrainerAvatar trainer={trainer} /><strong>{trainer.nickname}</strong><small>{trainer.role}</small></button>)}
    </div>
  );
}

function TrainerAvatar({ className = "", trainer }: { className?: string; trainer: Trainer }) {
  if (trainer.imageUrl) return <img alt={trainer.name} className={`trainer-photo ${className}`} src={trainer.imageUrl} />;
  return <span className={`trainer-photo fallback ${className}`}>{trainer.avatar}</span>;
}

function WalletSummary({ wallet }: { wallet: Bootstrap["wallet"] }) {
  return (
    <div className="wallet">
      <div><span>👛 Wallet</span><strong>{money(wallet.balance)} ฿</strong></div>
      <div><span>⭐ Points</span><strong>{money(wallet.pointBalance)}</strong></div>
      <div><span>🪙 Coin</span><strong>{wallet.coinBalance}</strong></div>
    </div>
  );
}

function Tutorial({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {
  const steps = [
    ["👋", "ยินดีต้อนรับ", "หน้าแรกมีทางลัดจองสนาม, QR, Wallet และคูปอง"],
    ["🎫", "บัตรสมาชิก", "แตะการ์ดสมาชิกเพื่อดูสิทธิ์และ QR"],
    ["◫", "จองบริการ", "เลือกกีฬา สนาม เวลา ตรวจสรุป แล้วชำระเงิน"],
    ["▣", "QR อายุสั้น", "QR รีเฟรชอัตโนมัติเพื่อลดการแชร์สิทธิ์"],
  ];
  const current = steps[step - 1] || steps[0];
  return (
    <div className="tut-overlay">
      <div className="tut-card">
        <span>{step}/4</span><div className="tut-icon">{current[0]}</div><strong>{current[1]}</strong><p>{current[2]}</p>
        <div><button className="ghost" onClick={onSkip}>ข้าม</button><button className="primary" onClick={onNext}>{step >= 4 ? "จบ" : "ถัดไป"}</button></div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{statIcons[label] || "•"} {label}</span><strong>{value}</strong></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="empty small">∅ {text}</div>;
}
