"use client";
import Image from "next/image";
import { Bell, House, Dumbbell, QrCode, CalendarDays, UserRound, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { safeImageSource } from "@/lib/media";
import { qrErrorKey } from "@/lib/qr-presentation";
import { bangkokToday, type AvailabilityStatus } from "@/lib/court-availability";
import { BookingCalendar } from "@/components/booking-calendar";
import { AdminDialog } from "@/components/admin-dialog";
import { upcomingBooking, bookingStatusLabel } from "@/lib/booking-presentation";
import { t, localeTag, localizedContent, courtName } from "@/lib/i18n";
import { LanguageSwitcher, MemberLocaleSync, useMemberLocale } from "@/components/language-switcher";
import { Empty, money, SectionTitle, Top } from "@/components/member-ui";
import { CouponPacks, PackagePlansScreen, type PlanTab, type RenewTab } from "@/components/member-packages";
import { MyCouponList } from "@/components/member-coupons";
import { FindYourGameRow, GroupsScreen, type NewGroup } from "@/components/member-groups";
import { GymnosHub, ServiceClassScreen, type GymnosTarget } from "@/components/gymnos-hub";
import { WalletPanel } from "@/components/member-wallet";
import { PromptPayScreen } from "@/components/member-promptpay";
import { RewardsScreen } from "@/components/member-rewards";
import { VisitsScreen } from "@/components/member-visits";
import { PrivacyPolicyDialog } from "@/components/member-consent";
import { needsConsent, privacyPolicy, supportContact, telHref } from "@/lib/site-settings";
import { keepRequestForRetry } from "@/lib/payment-presentation";
import { parseMeta } from "@/lib/package-presentation";
import { richMenuScreens as deepLinkScreens, screenFromSearch } from "@/lib/rich-menu";
import type { Booking, Bootstrap, ContentItem, Coupon, Group, Screen, Sport, Trainer, TrainerPackage, TrainerScheduleDay } from "@/components/member-types";

import liff from "@line/liff";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";

type Slot = {
  courtId: number;
  courtName: string;
  time: string;
  available: boolean;
  rate: number;
  capacity: number;
  status: AvailabilityStatus;
};

type AppPack = { contentId?: number; key: string; icon: string; name: string; price: number; desc: string; screen?: Screen };

type QrPayload = {
  svg: string;
  expiresIn: number;
  title: string;
};

type AccessQr =
  | { purpose: "member"; title?: string }
  | { purpose: "coupon"; couponId: number; title?: string }
  | { purpose: "entitlement"; entitlementId: number; title?: string };

type TabIcon = "home" | "trainer" | "scan" | "history" | "profile";

const tabs: [Screen, TabIcon, string][] = [
  ["home", "home", "หน้าหลัก"],
  ["trainer", "trainer", "เทรนเนอร์"],
  ["scan", "scan", "สแกน"],
  ["mybooking", "history", "ประวัติ"],
  ["profile", "profile", "โปรไฟล์"],
];

const richMenuScreens: readonly Screen[] = deepLinkScreens;
const managedPrototypeScreens: Screen[] = [
  "orprofile", "kuanprofile", "groupcreate", "groupdetail", "groupchat", "groupranking", "kuanvote", "kuanresult", "kuanredeem", "playerprofile", "coinshop", "kuanroster", "kuanpairs",
  "svcdetail", "pilprivate", "pilgroup", "promo", "tennis", "basketball", "volleyball", "memverify", "classhub", "classschedule", "bookings", "editprofile", "payscan", "pool", "classes",
  "walletpay", "linkwallet", "linkbank", "buyhistory", "visits", "personal", "mystatus", "notisettings", "qr", "scanqr",
];

function initialScreenFromUrl(): Screen {
  if (typeof window === "undefined") return "home";
  return (screenFromSearch(window.location.search, richMenuScreens) as Screen | null) || "home";
}


const serviceShortcuts: { icon: string; title: string; text: string; screen: Screen }[] = [
  { icon: "🏋️", title: "Gymnos Hub", text: "Fitness · Swim · HYROX · Pilates · Airfit · Promotion", screen: "gymnos" },
  { icon: "🏊", title: "Swim Pack", text: "สระและแพ็กเกจ", screen: "swim" },
  { icon: "🤸", title: "Pilates", text: "Private / Group", screen: "pilates" },
  { icon: "🎁", title: "Promotion", text: "ดีลสมาชิก", screen: "promotion" },
  { icon: "📺", title: "Live TV", text: "แมตช์สดในคลับ", screen: "livetv" },
  { icon: "🎫", title: "Coupon", text: "ซื้อและใช้คูปอง", screen: "coupon" },
  { icon: "🏆", title: "Reward", text: "Coins / Points", screen: "reward" },
  { icon: "👥", title: "Find Your Game", text: "ก๊วนและ Open Run", screen: "groups" },
];

const gymnosChildren: Screen[] = ["swim", "hyrox", "pilates", "airfit", "svcclass", "promotion"];
const timeChoices = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30", "20:00"];

const statIcons: Record<string, string> = {
  Bookings: "📋",
  Coupons: "🎫",
  Groups: "👥",
  Unread: "🔔",
};

const entitlementLabels: Record<string, string> = { time_pass: "บัตรผ่าน Time", class: "คลาส", trainer: "เทรนเนอร์", reward: "รางวัล", coupon: "คูปอง", membership: "แพ็กเกจ" };

function entitlementLabel(type: string) {
  return entitlementLabels[type] || "สิทธิ์";
}

function newRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function today() {
  return bangkokToday();
}

function bookingNo(booking: Booking | null) {
  return booking?.booking_no || booking?.bookingNo || "";
}

function memberInitial(name: string | undefined) {
  const trimmed = (name || "PPA").trim();
  return trimmed.slice(0, 1).toUpperCase();
}

async function api<T>(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
    signal: init?.signal || AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const error = new Error(body?.message || "เกิดข้อผิดพลาด");
    Object.assign(error, { status: res.status, code: typeof body?.code === "string" ? body.code : undefined });
    throw error;
  }
  return (await res.json()) as T;
}

export function PpaApp() {
  useMemberLocale();
  return <><MemberLocaleSync /><MemberApp /></>;
}

function MemberApp() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const [screen, setScreen] = useState<Screen>(initialScreenFromUrl);
  const [lineReady, setLineReady] = useState(false);
  const [lineBlocked, setLineBlocked] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [couponStore, setCouponStore] = useState<Coupon[]>([]);
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [selectedTime, setSelectedTime] = useState("18:00");
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [slotsResult, setSlotsResult] = useState<{ key: string; error?: string } | null>(null);
  const availabilityKey = `${selectedSport?.slug}:${date}:${availabilityRevision}`;
  const slotsLoading = slotsResult?.key !== availabilityKey;
  const [players, setPlayers] = useState(2);
  const [pendingBooking, setPendingBooking] = useState<Booking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [pendingItem, setPendingItem] = useState<{ title: string; amount: number; back: Screen; save?: "coupon" | "topup" | "class" | "membership" | "pause" | "renewal"; couponId?: number; contentId?: number; trainerId?: number; trainerPackage?: string; itemType?: string; membershipId?: number; pauseStart?: string; pauseDays?: number; userCouponId?: number } | null>(null);
  const [planTab, setPlanTab] = useState<PlanTab>("monthly");
  const [plansReturn, setPlansReturn] = useState<Screen>("home");
  const [renewFocus, setRenewFocus] = useState<{ sub: RenewTab; couponId?: number } | undefined>(undefined);
  const [couponTab, setCouponTab] = useState<"mine" | "buy" | null>(null);
  const [hubReturn, setHubReturn] = useState<Screen>("home");
  const [promptPayNo, setPromptPayNo] = useState("");
  // One id per checkout: a retried or double-tapped payment replays instead of charging twice.
  const [checkoutId, setCheckoutId] = useState("");
  const [accessQr, setAccessQr] = useState<AccessQr>({ purpose: "member" });
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastPaymentStatus, setLastPaymentStatus] = useState<"paid" | "created">("paid");
  const qrSeconds = 20;
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [trainerDetail, setTrainerDetail] = useState(false);
  const [myTrainerSlug, setMyTrainerSlug] = useState("");
  const [trainerContactOpen, setTrainerContactOpen] = useState(false);
  const [trainerPlanIndex, setTrainerPlanIndex] = useState<number | null>(null);
  const [trainerDayIndex, setTrainerDayIndex] = useState(0);
  const [tutorial, setTutorial] = useState(0);
  const [policyOpen, setPolicyOpen] = useState(false);
  const rewardAttempt = useRef<{ contentId: number; requestId: string } | null>(null);
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
      // liff.init() may rewrite the URL from liff.state; open the rich-menu screen it carries.
      const deepLink = screenFromSearch(window.location.search, richMenuScreens) as Screen | null;
      if (deepLink) setScreen(deepLink);
      setLineReady(true);
    }
    bootLine().catch(() => { setLineBlocked(requireLine); setLineReady(true); });
  }, [requireLine]);

  useEffect(() => {
    if (!lineReady) return;
    Promise.all([refresh(), loadCoupons()]).catch((error) => {
      if ((error as Error & { status?: number }).status === 401 && requireLine) {
        setLineBlocked(true);
        return;
      }
      notice((error as Error).message);
      setLoadError(true);
    });
  }, [lineReady, requireLine]);

  // Keep Find Your Game counts live while the slots are on screen.
  const hasData = Boolean(data);
  useEffect(() => {
    if (!hasData || !["home", "groups"].includes(screen)) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      api<{ groups: Group[] }>("/api/groups").then((res) => setData((current) => (current ? { ...current, groups: res.groups } : current))).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [hasData, screen]);

  const appContent = (data?.contentItems || []).map(localizedContent);
  const contact = supportContact(appContent);
  const policy = privacyPolicy(appContent);
  const consentDue = Boolean(data) && !["splash", "login"].includes(screen) && needsConsent(policy, data?.consent);
  const managedSlides = contentByType(appContent, "home_slide");
  const servicePackages = contentByType(appContent, "service_package");
  const liveItems = contentByType(appContent, "live_tv");
  const classScheduleItems = contentByType(appContent, "class_schedule");


  useEffect(() => {
    if (!selectedSport?.requiresBooking || !["courts", "datetime", "summary"].includes(screen)) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ sport: selectedSport.slug, date });
    const refreshSlots = () => api<{ slots: Slot[] }>(`/api/courts/availability?${params.toString()}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then((res) => {
        if (controller.signal.aborted) return;
        setSlots(res.slots);
        setSlotsResult({ key: availabilityKey });
        setSelectedSlot((current) => current ? res.slots.find((slot) => slot.courtId === current.courtId && slot.time === current.time && slot.available) || null : null);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSlots([]);
        setSelectedSlot(null);
        setSlotsResult({ key: availabilityKey, error: error.message });
      });
    void refreshSlots();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshSlots(); }, 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [selectedSport, date, availabilityKey, screen]);

  const slotGroups = useMemo(() => {
    const map = new Map<string, Slot[]>();
    slots.forEach((slot) => map.set(slot.time, [...(map.get(slot.time) || []), slot]));
    return [...map.entries()];
  }, [slots]);

  const selectedSportSlots = selectedSport?.requiresBooking && !slotsLoading ? slotGroups : [];
  const unreadCount = data?.notifications.filter((item) => item.status === "unread").length ?? 0;

  function notice(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function go(next: Screen, fromOpenPlans = false) {
    const returningFromFlow = ["payment", "success", "paypromptpay", "plans"].includes(screen);
    // Service screens opened from the GYMNOS hub return there; from elsewhere they return home.
    if (gymnosChildren.includes(next) && next !== screen && !returningFromFlow) setHubReturn(screen === "gymnos" ? "gymnos" : "home");
    // Plans opened from a banner/slide/managed content start fresh and return to where they were opened.
    if (next === "plans" && !fromOpenPlans && !returningFromFlow) {
      setPlanTab("monthly");
      setRenewFocus(undefined);
      setPlansReturn(screen);
    }
    if (next === "payment" && screen !== "payment") setCheckoutId(newRequestId());
    if ((next === "notifications" || next === "noti") && data?.notifications.some((item) => item.status === "unread")) {
      // Opening the list marks everything read; the bell count updates immediately.
      void api("/api/notifications/read", { method: "POST" }).then(() => setData((current) => (current ? { ...current, notifications: current.notifications.map((item) => ({ ...item, status: "read" })) } : current))).catch(() => {});
    }
    setScreen(next);
    document.querySelector(".phone > .content")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }

  async function refresh() {
    const loaded = await api<Partial<Bootstrap> & Pick<Bootstrap, "user" | "wallet">>("/api/bootstrap");
    // Lists added after the first release default to empty so an older API response still renders.
    const next: Bootstrap = {
      sports: [], bookings: [], coupons: [], expiredCoupons: [], trainers: [], groups: [], notifications: [], contentItems: [], memberships: [], membershipPauses: [], entitlements: [], pendingPayments: [], walletLedger: [], visits: [],
      ...loaded,
    };
    setData(next);
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

  function selectClass(item: AppPack) {
    setPendingItem({ contentId: item.contentId, title: `${item.icon} ${item.name}`, amount: item.price, back: item.screen || item.key as Screen, save: "class", itemType: contentTypeForPack(item) });
    go("payment");
  }

  async function createBooking() {
    if (busy) return;
    if (!selectedSport) return;
    if (selectedSport.requiresBooking && (!selectedSlot || slotsLoading)) {
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
      if ((error as Error & { status?: number }).status === 409) {
        setSelectedSlot(null);
        setAvailabilityRevision((value) => value + 1);
        go("courts");
      }
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pay(method: "wallet" | "promptpay") {
    if (!pendingBooking && !pendingItem) return;
    setBusy(true);
    try {
      let nextPaymentStatus: "paid" | "created" = method === "wallet" ? "paid" : "created";
      let createdPaymentNo = "";
      if (pendingBooking) {
        const payment = await api<{ status?: string; paymentNo?: string }>("/api/payments", {
          method: "POST",
          body: JSON.stringify({
            bookingNo: bookingNo(pendingBooking),
            method,
            requestId: checkoutId,
            itemName: pendingBooking.title,
          }),
        });
        nextPaymentStatus = payment.status === "created" ? "created" : "paid";
        createdPaymentNo = payment.paymentNo || "";
        if (nextPaymentStatus === "created") notice("สร้างรายการชำระเงินแล้ว กรุณารอการยืนยันจากระบบ");
      } else if (pendingItem?.save === "coupon" && pendingItem.couponId) {
        const couponPayment = await api<{ status?: string; paymentNo?: string }>("/api/coupons/buy", {
          method: "POST",
          body: JSON.stringify({ couponId: pendingItem.couponId, method, requestId: checkoutId }),
        });
        nextPaymentStatus = couponPayment.status === "created" ? "created" : "paid";
        createdPaymentNo = couponPayment.paymentNo || "";
        if (nextPaymentStatus === "created") notice("สร้างรายการชำระเงินคูปองแล้ว กรุณารอการยืนยันจากระบบ");
      } else if (pendingItem?.save === "pause" && pendingItem.membershipId && pendingItem.pauseStart && pendingItem.pauseDays) {
        const pause = await api<{ status?: string; paymentNo?: string }>("/api/memberships/pause", {
          method: "POST",
          body: JSON.stringify({ membershipId: pendingItem.membershipId, startDate: pendingItem.pauseStart, days: pendingItem.pauseDays, method, requestId: checkoutId }),
        });
        nextPaymentStatus = pause.status === "created" ? "created" : "paid";
        createdPaymentNo = pause.paymentNo || "";
        if (nextPaymentStatus === "created") notice("สร้างคำขอพักการใช้งานแล้ว กรุณารอการยืนยันจากระบบ");
      } else if (pendingItem?.save === "renewal" && pendingItem.userCouponId) {
        const renewal = await api<{ status?: string; paymentNo?: string }>("/api/coupons/renew", { method: "POST", body: JSON.stringify({ userCouponId: pendingItem.userCouponId, method, requestId: checkoutId }) });
        nextPaymentStatus = renewal.status === "created" ? "created" : "paid";
        createdPaymentNo = renewal.paymentNo || "";
        if (nextPaymentStatus === "created") notice("สร้างคำขอต่ออายุคูปองแล้ว กรุณารอการยืนยันจากระบบ");
      } else if (pendingItem?.save === "topup") {
        const topupPayment = await api<{ status?: string; paymentNo?: string }>("/api/wallet/topup", { method: "POST", body: JSON.stringify({ amount: pendingItem.amount, requestId: checkoutId }) });
        nextPaymentStatus = topupPayment.status === "created" ? "created" : "paid";
        createdPaymentNo = topupPayment.paymentNo || "";
        if (nextPaymentStatus === "created") notice("สร้างรายการเติมเงินแล้ว กรุณารอการยืนยันจากระบบ");
      } else if (pendingItem) {
        const payment = await api<{ status?: string; paymentNo?: string }>("/api/payments", {
          method: "POST",
          body: JSON.stringify({ contentId: pendingItem.contentId, trainerId: pendingItem.trainerId, trainerPackage: pendingItem.trainerPackage, method, requestId: checkoutId }),
        });
        nextPaymentStatus = payment.status === "created" ? "created" : "paid";
        createdPaymentNo = payment.paymentNo || "";
        if (nextPaymentStatus === "created") notice("สร้างรายการชำระเงินแล้ว กรุณารอการยืนยันจากระบบ");
      }
      await refresh();
      if (pendingItem?.save === "coupon") await loadCoupons();
      setLastPaymentStatus(nextPaymentStatus);
      if (nextPaymentStatus === "created" && createdPaymentNo) {
        // PromptPay: show the QR with the exact amount and let the member attach the slip.
        setPromptPayNo(createdPaymentNo);
        go("paypromptpay");
        return;
      }
      go("success");
      if (nextPaymentStatus === "paid") notice("ชำระเงินสำเร็จ");
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function redeemReward(reward: ContentItem, cost: number) {
    if (busy || !window.confirm(t("ใช้ {{value0}} Coin แลก {{value1}}?", { value0: cost, value1: t(reward.title) }))) return;
    setBusy(true);
    // A retry of the same reward after an unknown outcome reuses the request id, so it cannot redeem twice.
    const requestId = rewardAttempt.current?.contentId === reward.id ? rewardAttempt.current.requestId : newRequestId();
    rewardAttempt.current = { contentId: reward.id, requestId };
    try {
      const result = await api<{ entitlementId: number; title: string }>("/api/rewards/redeem", { method: "POST", body: JSON.stringify({ contentId: reward.id, requestId }) });
      rewardAttempt.current = null;
      // Redeemed: open its QR even if reloading the member data fails now (an error here would
      // hide the QR and invite a second redemption with a new request id).
      await refresh().catch(() => {});
      notice("แลกรางวัลสำเร็จ");
      setPendingBooking(null);
      setAccessQr({ purpose: "entitlement", entitlementId: result.entitlementId, title: result.title });
      go("scan");
    } catch (error) {
      if (!keepRequestForRetry(error)) rewardAttempt.current = null;
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelPending(paymentNo: string) {
    if (busy || !window.confirm(t("ยกเลิกรายการรอชำระนี้?"))) return;
    setBusy(true);
    try {
      await api("/api/payments/cancel", { method: "POST", body: JSON.stringify({ paymentNo }) });
      await refresh();
      notice("ยกเลิกรายการแล้ว");
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

  function buyCoupon(coupon: Coupon, back: Screen = "coupon") {
    setPendingBooking(null);
    setPendingItem({ title: coupon.name, amount: Number(coupon.price || 0), back, save: "coupon", couponId: coupon.id });
    go("payment");
  }

  function openPlans(tab: PlanTab = "monthly", from: Screen = screen) {
    if (tab !== "renew") setRenewFocus(undefined);
    setPlanTab(tab);
    setPlansReturn(from === "plans" || from === "payment" || from === "success" ? "home" : from);
    go("plans", true);
  }

  function openFromGymnos(target: GymnosTarget) {
    if (target === "fitness") {
      openPlans("monthly", "gymnos");
      return;
    }
    go(target);
  }

  function openRenewCoupon(coupon: Coupon, from: Screen = screen) {
    setRenewFocus({ sub: "coupon", couponId: coupon.id });
    openPlans("renew", from);
  }

  function openCouponQr(coupon: Coupon) {
    setPendingBooking(null);
    setAccessQr({ purpose: "coupon", couponId: coupon.id, title: coupon.name });
    go("scan");
  }

  // Monthly / Time packages: the server resolves price and grant terms from the catalog id.
  function selectPackage(item: ContentItem) {
    const membership = item.contentType === "membership_plan";
    setPendingBooking(null);
    setPendingItem({ contentId: item.id, title: item.title, amount: Number(item.price), back: "plans", save: membership ? "membership" : "class", itemType: membership ? "membership" : item.contentType });
    go("payment");
  }

  function requestPause(input: { membershipId: number; startDate: string; days: number; option: ContentItem }) {
    setPendingBooking(null);
    setPendingItem({ title: t("{{value0}} {{value1}} วัน", { value0: t(input.option.title), value1: input.days }), amount: Number(input.option.price), back: "plans", save: "pause", membershipId: input.membershipId, pauseStart: input.startDate, pauseDays: input.days });
    go("payment");
  }

  function renewCoupon(input: { userCouponId: number; option: ContentItem; title: string }) {
    setPendingBooking(null);
    // Same amount the server charges: price per month × renewal months (app/api/coupons/renew).
    const months = Number(parseMeta(input.option.metadata).months) || 1;
    setPendingItem({ title: `${t(input.option.title)} · ${t(input.title)}`, amount: Number(input.option.price) * months, back: "plans", save: "renewal", userCouponId: input.userCouponId });
    go("payment");
  }

  async function refreshGroups() {
    const res = await api<{ groups: Group[] }>("/api/groups");
    setData((current) => (current ? { ...current, groups: res.groups } : current));
  }

  async function groupAction(request: () => Promise<unknown>, success: string) {
    if (busy) return false;
    setBusy(true);
    try {
      await request();
      await refreshGroups();
      notice(success);
      return true;
    } catch (error) {
      notice((error as Error).message);
      if ((error as Error & { status?: number }).status === 409) await refreshGroups().catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  }

  function createGroup(input: NewGroup) {
    const sport = data?.sports.find((item) => item.slug === input.sportSlug);
    return groupAction(() => api("/api/groups", {
      method: "POST",
      body: JSON.stringify({ ...input, name: input.name.slice(0, 160), description: sport ? `สร้างจาก PPA App สำหรับ ${sport.name}` : undefined }),
    }), "สร้างก๊วนสำเร็จ");
  }

  const joinGroup = (group: Group) => groupAction(() => api("/api/groups/join", { method: "POST", body: JSON.stringify({ groupId: group.id }) }), "เข้าร่วมก๊วนแล้ว");
  const leaveGroup = (group: Group) => groupAction(() => api("/api/groups/join", { method: "DELETE", body: JSON.stringify({ groupId: group.id }) }), "ออกจากก๊วนแล้ว");
  const closeGroup = (group: Group) => groupAction(() => api(`/api/groups?id=${group.id}`, { method: "DELETE" }), "ปิดก๊วนแล้ว");

  async function cancelBooking(booking: Booking) {
    const no = bookingNo(booking);
    if (!no || busy) return;
    setBusy(true);
    try {
      await api("/api/bookings", { method: "DELETE", body: JSON.stringify({ bookingNo: no, reason: "member cancelled from app" }) });
      await refresh();
      setCancelTarget(null);
      notice("ยกเลิกรายการจองแล้ว");
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/auth/line", { method: "DELETE" });
      setLineBlocked(true);
      setData(null);
      setPendingBooking(null);
      setCancelTarget(null);
      setSelectedSlot(null);
      setSlots([]);
    } catch (error) {
      notice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openSupport(kind: "tel" | "mail" | "line") {
    if (kind === "tel") {
      window.location.href = telHref(contact.phone);
      notice(t("📞 กำลังโทร {{value0}}", { value0: contact.phone }));
      return;
    }
    if (kind === "mail") {
      window.location.href = `mailto:${contact.email}?subject=PPA%20Support`;
      notice(t("✉️ เปิดอีเมลถึง {{value0}}", { value0: contact.email }));
      return;
    }
    window.location.href = contact.lineUrl;
    notice(t("💬 เปิด LINE {{value0}}", { value0: contact.line }));
  }

  async function acceptPolicy() {
    if (!policy || busy) return;
    setBusy(true);
    try {
      const consent = await api<{ acceptedAt: string; version: string }>("/api/consent", { method: "POST", body: JSON.stringify({ version: policy.version }) });
      setData((current) => (current ? { ...current, consent } : current));
      notice("ขอบคุณที่ยอมรับนโยบายความเป็นส่วนตัว");
    } catch (error) {
      notice((error as Error).message);
      // The policy may have been updated while it was open: reload to show the current version.
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  if (lineBlocked || (requireLine && !lineReady)) {
    return (
      <LineGate blocked={lineBlocked} liffId={process.env.NEXT_PUBLIC_LINE_LIFF_ID || ""} />
    );
  }

  if (!data) {
    return (
      <main className="phone-wrap">
        <LineGate embedded error={loadError} onRetry={() => { setLoadError(false); refresh().catch(() => setLoadError(true)); }} />
      </main>
    );
  }

  const isUpcoming = (booking: Booking) => upcomingBooking(booking, now);
  const upcomingBookings = data.bookings.filter(isUpcoming).sort((a, b) => new Date(a.startsAt || a.starts_at || "").getTime() - new Date(b.startsAt || b.starts_at || "").getTime());
  const historyBookings = data.bookings.filter((booking) => !isUpcoming(booking)).sort((a, b) => new Date(b.startsAt || b.starts_at || "").getTime() - new Date(a.startsAt || a.starts_at || "").getTime());
  const myTrainer = data.trainers.find((trainer) => trainer.slug === myTrainerSlug);
  const activeMembership = data.memberships.find((membership) => membership.status === "active" && new Date(membership.startsAt).getTime() <= now && new Date(membership.endsAt).getTime() > now) || null;
  const membershipExpiry = activeMembership ? new Date(activeMembership.endsAt).toLocaleDateString(localeTag(), { day: "numeric", month: "short", year: "numeric" }) : "ยังไม่มีแพ็กเกจ";
  const activeCouponTab = couponTab ?? (data.coupons.length || data.expiredCoupons.length ? "mine" : "buy");
  const otherCoupons = couponStore.filter((coupon) => parseMeta(coupon.metadata).tab !== "coupon");
  const selectedTrainerSchedule = selectedTrainer ? trainerSchedule(selectedTrainer) : [];
  const activeTrainerDay = selectedTrainerSchedule[Math.min(trainerDayIndex, Math.max(selectedTrainerSchedule.length - 1, 0))];

  return (
    <main className="phone-wrap">
      <section className="phone">
        <div className="statusbar">
          <span>PPA</span>
          <LanguageSwitcher />
          <button className="status-member-chip" onClick={() => go("profile")}>
            <span>{memberInitial(data.user.displayName)}</span>
            <b>{data.user.displayName || t("PPA Member")}</b>
            <i />
          </button>
        </div>
        <div className="content">
          {screen === "splash" && (
            <div className="page centered splash">
              <div className="brand">PPA<span>.</span></div>
              <p>Power Play Asia Sport Complex</p>
              <button className="primary" onClick={() => go("home")}>{t("🚀 เลื่อนเพื่อเริ่มต้น")}</button>
            </div>
          )}

          {screen === "login" && (
            <div className="page centered">
              <div className="brand">PPA<span>.</span></div>
              <p>{t("เข้าสู่ระบบสมาชิกเพื่อจองและใช้งาน QR เข้าใช้บริการ")}</p>
              <button className="primary" onClick={() => go("home")}>{t("💬 Continue with LINE")}</button>
              <button className="ghost" onClick={() => go("home")}>{t("👤 ใช้งานแบบสมาชิกเดโม")}</button>
            </div>
          )}

          {screen === "home" && (
            <div className="page home-page">
              <header className="greet">
                <div className="greet-copy"><div className="g1">{t("สวัสดี")}</div><div className="g2">{data.user.displayName || t("PPA Member")}</div><h1 className="home-brand">PPA Sport Complex</h1></div>
                <button className="home-bubble reward" onClick={() => go("reward")}><span aria-hidden="true">🪙</span><small>{t("แลกรางวัล")}</small></button>
                <button className="home-bubble level" onClick={() => go("profile")}><span aria-hidden="true">{data.user.avatar || "💪"}</span><small>{t("ระดับ")}</small></button>
              </header>

              <button className="member-card premium-card" onClick={() => go("membership")}>
                <div><span className="m1">{activeMembership ? t("Premium Member") : t("สมาชิก PPA")}</span><small className="m2">{activeMembership ? t("ใช้ได้ถึง {{value0}}", { value0: membershipExpiry }) : t("เลือกแพ็กเกจเพื่อเปิดสิทธิ์สมาชิก")}</small></div>
                <span className="mini-qr" aria-hidden="true"><QrCode size={40} /></span>
              </button>

              <HomeCarousel items={managedSlides} onOpen={go} />

              <button className="live-banner" onClick={() => go("livetv")}>
                <div className="lb-head"><span className="live-pill">{t("Live TV")}</span><strong>{t("BIG SCREEN LIVE")}</strong></div>
                <div className="ticker-wrap">{liveItems.length ? <div className="live-ticker-track">{liveItems.map((item) => <span key={item.id}>{item.icon} {t(item.title)} · {t(item.subtitle) || t(item.body)}</span>)}</div> : t("ยังไม่มีรายการถ่ายทอดสด")}</div>
                <small>{t("แมตช์สดในคลับ")}</small>
              </button>

              <FindYourGameRow groups={data.groups} now={now} onOpen={() => go("groups")} onCreate={() => go("groups")} />

              <div className="sec-head"><strong>{t("Quick Booking")}</strong></div>
              <div className="quick-booking-row">
                {data.sports.filter((sport) => sport.requiresBooking).map((sport) => <button key={sport.slug} onClick={() => pickSport(sport)}><span aria-hidden="true">{sport.icon}</span><small>{t(sport.name)}</small></button>)}
              </div>
              {!data.sports.length && <Empty text={t("ยังไม่มีบริการเปิดให้จอง")} />}

              <div className="sec-head"><strong>{t("กีฬา & บริการ")}</strong></div>
              <button className="gymnos-banner" onClick={() => go("gymnos")}><div><strong>GYMNOS</strong><small>{t("Fitness · Swim · HYROX · Pilates · Airfit · Promotion")}</small></div><span aria-hidden="true">›</span></button>
              <div className="svc-grid">
                {data.sports.slice(0, 8).map((sport) => <button key={sport.slug} onClick={() => pickSport(sport)}><span aria-hidden="true">{sport.icon}</span><div><strong>{t(sport.name)}</strong><small>{t(sport.description)}</small></div></button>)}
              </div>

              <div className="sec-head"><strong>{t("Statistics")}</strong></div>
              <div className="stat-row">
                <div><strong>{upcomingBookings.length}</strong><small>{t("Bookings")}</small></div>
                <div><strong>{data.groups.length}</strong><small>{t("Groups")}</small></div>
                <div><strong>{data.coupons.length}</strong><small>{t("Coupons")}</small></div>
              </div>

              <div className="sec-head"><strong>{t("การจองครั้งถัดไป")}</strong><button className="home-text-action" onClick={() => go("mybooking")}>{t("ดูทั้งหมด")}</button></div>
              {upcomingBookings[0] ? <BookingRow now={now} booking={upcomingBookings[0]} onClick={() => { setPendingBooking(upcomingBookings[0]); setAccessQr({ purpose: "member" }); go("scan"); }} /> : <Empty text={t("ยังไม่มีนัดหมายที่กำลังจะมาถึง")} />}
              <div className="sec-head"><strong>{t("บริการเพิ่มเติม")}</strong><button className="club-icon-button" title={t("การแจ้งเตือน")} aria-label={t("การแจ้งเตือน {{value0}} รายการใหม่", { value0: unreadCount })} onClick={() => go("notifications")}><Bell size={20} aria-hidden="true" /></button></div>
              <div className="svc-grid">{serviceShortcuts.map((item) => <button key={item.screen} onClick={() => go(item.screen)}><span aria-hidden="true">{item.icon}</span><div><strong>{t(item.title)}</strong><small>{t(item.text)}</small></div></button>)}</div>
            </div>
          )}

          {screen === "sports" && (
            <div className="page">
              <Top title={t("เลือกกีฬา")} onBack={() => go("home")} />
              <div className="prototype-list">
                {data.sports.map((sport) => (
                  <SportRow
                    key={sport.slug}
                    icon={sport.icon}
                    title={t(sport.name)}
                    text={`${t(sport.description)}${sport.requiresBooking ? t(" · เริ่ม {{value0}} ฿/ชม.", { value0: money(sport.baseRate) }) : t(" · ใช้ได้ทันที")}`}
                    onClick={() => pickSport(sport)}
                  />
                ))}
              </div>
              <SectionTitle title={t("คลาสและบริการเสริม")} />
              <div className="prototype-list">
                {serviceShortcuts.slice(0, 6).map((item) => (
                  <SportRow key={item.title} icon={item.icon} title={t(item.title)} text={t(item.text)} onClick={() => go(item.screen)} />
                ))}
              </div>
            </div>
          )}

          {screen === "courts" && (
            <div className="page">
              <Top title={selectedSport ? `${selectedSport.icon} ${t(selectedSport.name)}` : t("จองสนาม")} onBack={() => go("sports")} />
              <div className="booking-focus">
                <span>{t("เลือกบริการ")}</span>
                <strong>{selectedSport?.icon} {t(selectedSport?.name)}</strong>
                <small>{t(selectedSport?.description)}</small>
              </div>
              <div className="sport-strip">
                {data.sports.map((sport) => (
                  <button className={selectedSport?.slug === sport.slug ? "on" : ""} key={sport.slug} onClick={() => pickSport(sport)}>
                    {sport.icon}<span>{t(sport.name)}</span>
                  </button>
                ))}
              </div>
              {selectedSport && <BookingCalendar key={selectedSport.slug} sport={selectedSport.slug} value={date} revision={availabilityRevision} onChange={(nextDate) => { setSelectedSlot(null); setDate(nextDate); }} />}
              <div className="slot-toolbar"><span>{new Date(`${date}T00:00:00+07:00`).toLocaleDateString(localeTag(), { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" })}</span><strong>{slotsLoading ? t("กำลังตรวจสอบ…") : t("{{value0}} ช่วงเวลาว่าง", { value0: selectedSportSlots.filter(([, group]) => group.some((slot) => slot.available)).length })}</strong></div>
              {!slotsLoading && slotsResult?.error && <div role="alert" className="calendar-error">{t("โหลดเวลาว่างไม่สำเร็จ")}<button onClick={() => setAvailabilityRevision((value) => value + 1)}>{t("ลองใหม่")}</button></div>}
              <div className="slot-list">
                {selectedSportSlots.map(([time, group]) => (
                  <article key={time}>
                    <strong>{time}</strong>
                    <div>
                      {group.map((slot) => (
                        <button disabled={!slot.available} className={selectedSlot === slot ? "on" : ""} key={`${slot.courtId}-${slot.time}`} onClick={() => { setSelectedSlot(slot); setPlayers((value) => Math.min(value, slot.capacity)); }}>
                          {courtName(slot.courtName)}<small>{slot.available ? t("{{value0}} ฿", { value0: money(slot.rate) }) : slot.status === "past" ? t("ผ่านเวลาแล้ว") : slot.status === "closed" ? t("ปิดให้บริการ") : t("เต็ม")}</small>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              {!slotsLoading && !slotsResult?.error && !selectedSportSlots.length && <Empty text={t("ยังไม่มีสนามเปิดให้จองสำหรับบริการนี้")} />}
              {selectedSlot && !slotsLoading && (
                <div className="sticky-summary">
                  <Summary sport={selectedSport} slot={selectedSlot} players={players} date={date} />
                  <button className="primary" disabled={busy} onClick={() => go("datetime")}>{t("👥 เลือกจำนวนผู้เล่นและสรุป")}</button>
                </div>
              )}
            </div>
          )}

          {screen === "datetime" && (
            <div className="page">
              <Top title={t("วันที่และเวลา")} onBack={() => go("courts")} />
              <Summary sport={selectedSport} slot={selectedSlot} players={players} date={date} />
              <button className="ghost" onClick={() => go("courts")}>{t("เปลี่ยนวัน สนาม หรือเวลา")}</button>
              <label className="field">{t("จำนวนผู้เล่น")}<input type="number" min={1} max={selectedSlot?.capacity || 20} value={players} onChange={(event) => setPlayers(Math.min(selectedSlot?.capacity || 20, Math.max(1, Number(event.target.value))))} /></label>
              {!selectedSport?.requiresBooking && <><SectionTitle title={t("เวลายอดนิยม")} /><div className="chip-grid">
                {timeChoices.map((time) => (
                  <button className={(selectedSlot?.time || selectedTime) === time ? "on" : ""} key={time} onClick={() => setSelectedTime(time)}>{time}</button>
                ))}
              </div></>}
              <button className="primary" disabled={Boolean(selectedSport?.requiresBooking) && (!selectedSlot || slotsLoading)} onClick={() => go("summary")}>{t("🧾 ไปหน้าสรุป")}</button>
            </div>
          )}

          {screen === "summary" && (
            <div className="page">
              <Top title={t("สรุปรายการ")} onBack={() => selectedSport?.requiresBooking ? go("courts") : go("sports")} />
              <Summary sport={selectedSport} slot={selectedSlot} players={players} date={date} />
              <div className="secure-note">
                <strong>{t("ตรวจสอบก่อนชำระเงิน")}</strong>
                <small>{t("ระบบจะกันสนามหลังสร้าง booking และ QR จะใช้งานได้เมื่อชำระเงินสำเร็จเท่านั้น")}</small>
              </div>
              <button className="primary" disabled={busy || (Boolean(selectedSport?.requiresBooking) && (!selectedSlot || slotsLoading))} onClick={createBooking}>{t("🔐 ยืนยันและชำระเงิน")}</button>
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

          {screen === "paypromptpay" && promptPayNo && <PromptPayScreen key={promptPayNo} paymentNo={promptPayNo} onBack={() => go("wallet")} onDone={() => { void refresh().catch(() => {}); go("wallet"); }} />}

          {screen === "success" && (
            <div className="page centered">
              <div className="check">{lastPaymentStatus === "paid" ? "✓" : "!"}</div>
              <h2>{lastPaymentStatus === "paid" ? t("สำเร็จแล้ว") : t("รอการยืนยัน")}</h2>
              <p>{lastPaymentStatus === "paid" ? t("รายการถูกบันทึกแล้ว คุณสามารถดูประวัติหรือเปิด QR สำหรับเข้าใช้บริการได้ทันที") : t("ระบบบันทึกรายการแล้ว แต่ยังไม่เปิดสิทธิ์จนกว่าการชำระเงินจะถูกยืนยัน")}</p>
              <button className="primary" onClick={() => go("mybooking")}>{t("📋 ดูรายการของฉัน")}</button>
              {lastPaymentStatus === "paid" && <button className="ghost" onClick={() => go("scan")}>{t("▣ เปิด QR เข้าใช้บริการ")}</button>}
            </div>
          )}

          {screen === "scan" && <ScanScreen data={data} booking={pendingBooking} accessQr={accessQr} qrSeconds={qrSeconds} onCheckin={() => go("checkin")} />}

          {screen === "checkin" && (
            <VisitsScreen visits={data.visits} onBack={() => go("membership")} onShowQr={() => { setPendingBooking(null); setAccessQr({ purpose: "member" }); go("scan"); }} />
          )}

          {screen === "mybooking" && (
            <div className="page mybooking-page">
              <Top title={t("การจองของฉัน")} />
              <div className="seg booking-seg">
                <button className={bookingTab === "up" ? "on" : ""} onClick={() => setBookingTab("up")}>{t("Upcoming")}</button>
                <button className={bookingTab === "his" ? "on" : ""} onClick={() => setBookingTab("his")}>{t("History")}</button>
              </div>
              <div className="booking-list">
                {(bookingTab === "up" ? upcomingBookings : historyBookings).map((booking, index) => (
                  <BookingRow now={now} key={`${bookingNo(booking)}-${index}`} booking={booking} onCancel={() => setCancelTarget(booking)} onClick={() => { setAccessQr({ purpose: "member" }); setPendingBooking(booking); go("scan"); }} />
                ))}
                {!(bookingTab === "up" ? upcomingBookings : historyBookings).length && <div className="club-empty"><strong>{bookingTab === "up" ? t("ยังไม่มีรายการจองที่กำลังจะมาถึง") : t("ยังไม่มีประวัติการจอง")}</strong><button onClick={() => go("sports")}>{t("จองสนาม")}</button></div>}
              </div>
            </div>
          )}

          {screen === "gymnos" && <GymnosHub onBack={() => go("home")} onOpen={openFromGymnos} />}
          {screen === "svcclass" && <ServiceClassScreen items={appContent} hasActiveMembership={Boolean(activeMembership)} onBack={() => go(hubReturn)} onSchedule={() => go("classschedule")} />}
          {screen === "fitness" && <HubScreen title={t("Fitness Pack")} back={() => go("gymnos")} items={servicePackages.map(contentToPack).filter((item) => item.screen === "fitness" || item.key.includes("fitness"))} onSelect={selectClass} extra={<TrainerStrip trainers={data.trainers} onOpen={(trainer) => { setSelectedTrainer(trainer); setTrainerDetail(true); go("trainer"); }} />} />}
          {screen === "swim" && <HubScreen title={t("Swim Pack")} back={() => go(hubReturn)} items={packagesForScreen(servicePackages, "swim")} onSelect={selectClass} extra={<button className="primary swim-plans" onClick={() => openPlans("monthly", "swim")}>{t("🏊 ดูแพ็กเกจ Fitness + Swim")}</button>} />}
          {screen === "hyrox" && <HubScreen title="HYROX" back={() => go(hubReturn)} items={packagesForScreen(servicePackages, "hyrox")} onSelect={selectClass} extra={<Schedule title={t("HYROX Class Schedule")} items={scheduleForScreen(classScheduleItems, "hyrox")} onBook={(time, item) => { setPendingItem({ contentId: item?.id, title: `${item?.title || "HYROX Class"} · ${time}`, amount: Number(item?.price || 700), back: "hyrox", save: "class", itemType: "class" }); setPendingBooking(null); go("payment"); }} />} />}
          {screen === "pilates" && <HubScreen title={t("Pilates")} back={() => go(hubReturn)} items={packagesForScreen(servicePackages, "pilates")} onSelect={selectClass} extra={<Schedule title={t("Reformer Schedule")} items={scheduleForScreen(classScheduleItems, "pilates")} onBook={(time, item) => { setPendingItem({ contentId: item?.id, title: `${item?.title || "Pilates Reformer"} · ${time}`, amount: Number(item?.price || 950), back: "pilates", save: "class", itemType: "class" }); setPendingBooking(null); go("payment"); }} />} />}
          {screen === "airfit" && <HubScreen title="Airfit" back={() => go(hubReturn)} items={packagesForScreen(servicePackages, "airfit")} onSelect={selectClass} extra={<Schedule title={t("Airfit Slots")} items={scheduleForScreen(classScheduleItems, "airfit")} onBook={(time, item) => { setPendingItem({ contentId: item?.id, title: `${item?.title || "Airfit"} · ${time}`, amount: Number(item?.price || 199), back: "airfit", save: "class", itemType: "class" }); setPendingBooking(null); go("payment"); }} />} />}

          {screen === "promotion" && (
            <div className="page">
              <Top title={t("Promotion")} onBack={() => go(hubReturn)} />
              {managedSlides[0] ? <div className="promo-card"><span>{t("MEMBER DEAL")}</span><strong>{t(managedSlides[0].title)}</strong><button onClick={() => go((managedSlides[0].targetScreen as Screen) || "plans")}>{t(managedSlides[0].actionLabel) || t("ดูแพ็กเกจ")}</button></div> : <Empty text={t("ยังไม่มีโปรโมชั่นประกาศในขณะนี้")} />}
              <SectionTitle title={t("ดีลประจำสัปดาห์")} />
              <div className="list">
                {servicePackages.map(contentToPack).map((item) => <button key={item.key} onClick={() => selectClass(item)}>{item.icon} {t(item.name)}<small>{t(item.desc)} · {money(item.price)} ฿</small></button>)}
              </div>
            </div>
          )}

          {screen === "livetv" && (
            <div className="page">
              <Top title={t("Live TV")} onBack={() => go("home")} />
              <div className="tv-stage"><span>{t("Live TV")}</span><strong>PPA Arena Channel</strong><small>{t(liveItems[0]?.body) || t("ยังไม่มีรายการถ่ายทอดสด")}</small></div>
              <div className="list compact">
                {liveItems.map((item) => <article className="club-broadcast" key={item.id}><strong>{t(item.title)}</strong><p>{t(item.subtitle) || t(item.body) || "-"}</p></article>)}
                {!liveItems.length && <Empty text={t("ยังไม่มีตารางถ่ายทอดสดประกาศในขณะนี้")} />}
              </div>
            </div>
          )}

          {screen === "wallet" && (
            <div className="page">
              <Top title={t("กระเป๋าเงิน")} onBack={() => go("profile")} />
              <BigBalance label={t("ยอดเงินคงเหลือ")} value={`${money(data.wallet.balance)}`} unit="฿" />
              <WalletPanel coinBalance={data.wallet.coinBalance} pointBalance={data.wallet.pointBalance} ledger={data.walletLedger} pending={data.pendingPayments} promptPayEnabled={data.promptPayEnabled ?? true} busy={busy} onTopup={topup} onPayPending={(paymentNo) => { setPromptPayNo(paymentNo); go("paypromptpay"); }} onCancelPending={cancelPending} />
            </div>
          )}

          {screen === "coupon" && (
            <div className="page">
              <Top title={t("คูปอง")} onBack={() => go("home")} />
              <div className="plan-tabs" role="tablist" aria-label={t("คูปอง")}>
                <button type="button" role="tab" aria-selected={activeCouponTab === "mine"} className={activeCouponTab === "mine" ? "on" : ""} onClick={() => setCouponTab("mine")}>{t("คูปองของฉัน")}</button>
                <button type="button" role="tab" aria-selected={activeCouponTab === "buy"} className={activeCouponTab === "buy" ? "on" : ""} onClick={() => setCouponTab("buy")}>{t("ซื้อคูปอง")}</button>
              </div>
              {activeCouponTab === "mine" ? (
                <MyCouponList coupons={data.coupons} expiredCoupons={data.expiredCoupons} now={now} onOpenQr={openCouponQr} onRenew={(coupon) => openRenewCoupon(coupon)} onBuy={() => setCouponTab("buy")} />
              ) : (
                <>
                  <h2 className="plans-subtitle">{t("คูปอง (Fitness)")}</h2>
                  <div className="share-note">{t("🤝 คูปอง 1 ใบ สามารถแชร์ให้เพื่อนได้ 1 คน")}</div>
                  <CouponPacks coupons={couponStore} onBuy={(coupon) => buyCoupon(coupon, "coupon")} />
                  {otherCoupons.length ? (
                    <>
                      <SectionTitle title={t("คูปองอื่น ๆ")} />
                      <div className="coupon-list">
                        {otherCoupons.map((coupon) => <CouponRow key={coupon.id} coupon={coupon} onClick={() => buyCoupon(coupon, "coupon")} />)}
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          )}

          {screen === "mycoupons" && (
            <div className="page mycoupons-page">
              <Top title={t("คูปองของฉัน")} icon="🎟️" onBack={() => go("membership")} />
              <MyCouponList coupons={data.coupons} expiredCoupons={data.expiredCoupons} now={now} onOpenQr={openCouponQr} onRenew={(coupon) => openRenewCoupon(coupon, "mycoupons")} onBuy={() => openPlans("coupon", "mycoupons")} />
            </div>
          )}

          {screen === "reward" && (
            <RewardsScreen
              coinBalance={data.wallet.coinBalance}
              rewards={contentByType(appContent, "reward")}
              myRewards={data.entitlements.filter((item) => item.entitlementType === "reward")}
              busy={busy}
              onBack={() => go("home")}
              onRedeem={redeemReward}
              onOpenQr={(right) => { setPendingBooking(null); setAccessQr({ purpose: "entitlement", entitlementId: right.id, title: right.title }); go("scan"); }}
            />
          )}

          {screen === "membership" && (
            <div className="page">
              <Top title={t("สมาชิกของฉัน")} onBack={() => go("home")} />
              <button className="member-card premium-card" onClick={() => go("scan")}>
                <div>
                  <span>{t(activeMembership?.planName) || t("PPA MEMBER")}</span>
                  <strong>{data.user.memberCode}</strong>
                  <small>{data.user.displayName || t("PPA Member")} · {activeMembership ? t("Active ถึง {{value0}}", { value0: membershipExpiry }) : t("ยังไม่มีแพ็กเกจ active")}</small>
                </div>
                <span className="member-qr-link"><QrCode size={28} aria-hidden="true" /><small>{t("เปิด QR")}</small></span>
              </button>
              <div className="prototype-list">
                <MenuItem icon="📦" title={t("แพ็กเกจของฉัน")} onClick={() => openPlans("monthly", "membership")} />
                <MenuItem icon="🧾" title={t("ประวัติการซื้อ")} onClick={() => go("mybooking")} />
                <MenuItem icon="🚪" title={t("การเข้าใช้บริการ")} onClick={() => go("checkin")} />
                <MenuItem icon="🎟️" title={t("คูปองของฉัน")} onClick={() => go("mycoupons")} />
                <MenuItem icon="⭐" title={t("คะแนนสะสม")} onClick={() => go("reward")} />
              </div>
              <SectionTitle title={t("สิทธิ์ที่ใช้งานได้")} />
              <div className="prototype-list">
                {data.entitlements.length ? data.entitlements.slice(0, 6).map((item) => (
                  <MenuItem
                    key={item.id}
                    icon="🎫"
                    title={t(item.title)}
                    meta={t("{{value0}}{{value1}}{{value2}} · เปิด QR", { value0: t(entitlementLabel(item.entitlementType)), value1: item.remainingUses ? t(" · เหลือ {{value0}}", { value0: item.remainingUses }) : "", value2: item.endsAt ? t(" · ถึง {{value0}}", { value0: new Date(item.endsAt).toLocaleDateString(localeTag()) }) : "" })}
                    onClick={() => { setPendingBooking(null); setAccessQr({ purpose: "entitlement", entitlementId: item.id, title: item.title }); go("scan"); }}
                  />
                )) : <Empty text={t("ยังไม่มีสิทธิ์แพ็กเกจ")} />}
              </div>
            </div>
          )}

          {screen === "plans" && (
            <PackagePlansScreen
              tab={planTab}
              onTab={setPlanTab}
              contentItems={appContent}
              couponStore={couponStore}
              data={data}
              now={now}
              busy={busy}
              onBack={() => go(plansReturn)}
              onSelectContent={selectPackage}
              onBuyCoupon={(coupon) => buyCoupon(coupon, "plans")}
              onRequestPause={requestPause}
              onRenewCoupon={renewCoupon}
              renewFocus={renewFocus}
            />
          )}

          {screen === "trainer" && (
            <div className="page trainer-page">
              {!trainerDetail ? (
                <>
                  <Top title={t("เทรนเนอร์")} icon="🧑‍🏫" />
                  <div className="reward-label">{t("เทรนเนอร์ประจำของฉัน")}</div>
                  {myTrainer ? (
                    <button className="my-trainer-card" onClick={() => { setSelectedTrainer(myTrainer); setTrainerDetail(true); }}>
                      <TrainerAvatar trainer={myTrainer} className="my-trainer-ava" />
                      <span className="my-trainer-info"><b>{myTrainer.name}</b><small>{t(myTrainer.role)} · {myTrainer.nickname}</small></span>
                      <em>{t("ประจำ")}</em>
                      <i onClick={(event) => { event.stopPropagation(); setMyTrainerSlug(""); notice("ยกเลิกเทรนเนอร์ประจำแล้ว"); }}>×</i>
                    </button>
                  ) : (
                    <div className="trainer-empty">
                      <div>🧑‍🏫</div>
                      <b>{t("ยังไม่มีเทรนเนอร์ประจำ")}</b>
                      <small>{t("เลือกเทรนเนอร์ที่ต้องการจากรายชื่อด้านล่าง")}</small>
                    </div>
                  )}
                  <div className="sec-head"><strong>{t("เลือกเทรนเนอร์")}</strong></div>
                  <div className="prototype-list">
                    {data.trainers.map((trainer) => (
                      <button
                        className="trainer-list-card"
                        key={trainer.slug}
                        onClick={() => { setSelectedTrainer(trainer); setTrainerDetail(true); setTrainerContactOpen(false); setTrainerPlanIndex(null); setTrainerDayIndex(0); }}
                      >
                        <TrainerAvatar trainer={trainer} />
                        <span><b>{trainer.name} ({trainer.nickname})</b><small>{t(trainer.role)} · {trainerSpecialties(trainer).slice(0, 2).join(" · ") || t("ประสบการณ์ {{value0}}", { value0: t(trainer.experience) })} {t("· เริ่มต้น")} {money(trainer.startPrice)} ฿</small></span>
                      </button>
                    ))}
                  </div>
                </>
              ) : selectedTrainer && (
                <>
                  <Top title={t("โปรไฟล์เทรนเนอร์")} onBack={() => setTrainerDetail(false)} />
                  <div className="trainer-hero">
                    <TrainerAvatar trainer={selectedTrainer} className="trainer-ava" />
                    <div>
                      <b>{selectedTrainer.name}</b>
                      <div>{t("ชื่อเล่น:")} {selectedTrainer.nickname} · {t(selectedTrainer.role)}</div>
                    </div>
                  </div>
                  <div className="trainer-stats">
                    <div><b>{t(selectedTrainer.experience)}</b><small>{t("ประสบการณ์")}</small></div>
                    <div><b>{selectedTrainer.zodiac || "-"}</b><small>{t("ราศี · เกิด")} {selectedTrainer.birthYear || "-"}</small></div>
                    <div><b>{selectedTrainer.bloodType || "-"}</b><small>{t("กรุ๊ปเลือด")}</small></div>
                  </div>
                  {t(selectedTrainer.bio) ? <p className="trainer-bio">{t(selectedTrainer.bio)}</p> : null}
                  {trainerSpecialties(selectedTrainer).length ? (
                    <div className="trainer-specialties">
                      {trainerSpecialties(selectedTrainer).map((item) => <span key={item}>{item}</span>)}
                    </div>
                  ) : null}
                  <div className="cert-card">
                    <div className="reward-label">{t("สถาบันที่มีเกียรติบัตร")}</div>
                    <ul>
                      {trainerCerts(selectedTrainer).map((cert) => <li key={cert}>{cert}</li>)}
                    </ul>
                  </div>
                  <button
                    className={myTrainerSlug === selectedTrainer.slug ? "ghost trainer-set danger" : "ghost trainer-set"}
                    onClick={() => {
                      const isMine = myTrainerSlug === selectedTrainer.slug;
                      setMyTrainerSlug(isMine ? "" : selectedTrainer.slug);
                      notice(t(isMine ? "ยกเลิก {{value0}} จากเทรนเนอร์ประจำแล้ว" : "ตั้ง {{value0}} เป็นเทรนเนอร์ประจำแล้ว", { value0: selectedTrainer.name }));
                    }}
                  >
                    {myTrainerSlug === selectedTrainer.slug ? t("✕ ยกเลิกเทรนเนอร์ประจำ") : t("ตั้งเป็นเทรนเนอร์ประจำ")}
                  </button>
                  <button className="primary green" onClick={() => setTrainerContactOpen((open) => !open)}>{t("📞 ติดต่อแอดมิน")}</button>
                  {trainerContactOpen && (
                    <div className="trainer-contact-card">
                      <span>{t("เบอร์ติดต่อแอดมิน PPA Power Play")}</span>
                      <b>{selectedTrainer.contactPhone || "02-123-4567"}</b>
                      <p>{selectedTrainer.socialLine ? `LINE: ${selectedTrainer.socialLine} · ` : ""}{t("แจ้งชื่อเทรนเนอร์ที่สนใจกับแอดมิน เพื่อสอบถามแพ็กเกจและนัดเวลาเทรน")}</p>
                    </div>
                  )}
                  <div className="sec-head"><strong>{t("แพ็กเกจเทรนส่วนตัว")}</strong></div>
                  <div className="fit-list">
                    {trainerPlans(selectedTrainer).map((plan, index) => (
                      <button
                        className={trainerPlanIndex === index ? "fit-item-ui sel-pkg" : "fit-item-ui"}
                        key={plan.title}
                        onClick={() => { setTrainerPlanIndex(index); notice(t("เลือกแพ็กเกจ {{value0}} แล้ว - เลือกเวลาที่ว่างด้านล่าง", { value0: t(plan.title) })); }}
                      >
                        <div><b>{t(plan.title)}</b><small>{t(plan.text)}</small></div>
                        <strong>{money(plan.price)} ฿</strong>
                      </button>
                    ))}
                  </div>
                  <div className="sec-head"><strong>{t("ตารางว่าง")}</strong></div>
                  {!selectedTrainerSchedule.length && <Empty text={t("เทรนเนอร์ยังไม่ได้ประกาศตารางว่าง")} />}
                  <div className="trainer-day-strip">
                    {selectedTrainerSchedule.map((item, index) => (
                      <button className={trainerDayIndex === index ? "on" : ""} key={item.day} onClick={() => setTrainerDayIndex(index)}>
                        <small>{t(item.day)}</small><b>{item.date || "-"}</b>
                      </button>
                    ))}
                  </div>
                  <div className="trainer-slot-grid">
                    {(activeTrainerDay?.slots || []).map((slot) => {
                      const full = slot.status !== "available";
                      return (
                        <button
                          className={full ? "full" : ""}
                          disabled={full}
                          key={`${activeTrainerDay?.day}-${slot.time}`}
                          onClick={() => {
                            if (trainerPlanIndex === null) {
                              notice("กรุณาเลือกแพ็กเกจก่อน");
                              return;
                            }
                            const plan = trainerPlans(selectedTrainer)[trainerPlanIndex];
                            setPendingBooking(null);
                            setPendingItem({ trainerId: selectedTrainer.id, trainerPackage: plan.title, title: `PT ${selectedTrainer.name} · ${activeTrainerDay?.day || ""} ${slot.time} · ${plan.title}`, amount: plan.price, back: "trainer", save: "class", itemType: "trainer" });
                            go("payment");
                          }}
                        >
                          {slot.time}<small>{full ? t("ไม่ว่าง") : t("ว่าง")}</small>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {screen === "groups" && (
            <GroupsScreen groups={data.groups} sports={data.sports} now={now} busy={busy} onBack={() => go("home")} onCreate={createGroup} onJoin={joinGroup} onLeave={leaveGroup} onClose={closeGroup} />
          )}

          {screen === "notifications" && (
            <div className="page">
              <Top title={t("การแจ้งเตือน")} onBack={() => go("home")} />
              <div className="noti-list">
                {data.notifications.length ? data.notifications.map((item) => (
                  <NotiRow key={item.id} icon={item.status === "unread" ? "🔔" : "✓"} title={t(item.title)} body={item.body} unread={item.status === "unread"} />
                )) : <Empty text={t("ยังไม่มีแจ้งเตือน")} />}
              </div>
            </div>
          )}

          {screen === "noti" && (
            <div className="page">
              <Top title={t("การแจ้งเตือน")} onBack={() => go("home")} />
              <div className="noti-list">
                {data.notifications.length ? data.notifications.map((item) => (
                  <NotiRow key={item.id} icon={item.status === "unread" ? "🔔" : "✓"} title={t(item.title)} body={item.body} unread={item.status === "unread"} />
                )) : <Empty text={t("ยังไม่มีแจ้งเตือน")} />}
              </div>
            </div>
          )}

          {managedPrototypeScreens.includes(screen) && !["classhub", "classschedule", "qr", "scanqr"].includes(screen) && (
            <ManagedFeatureScreen
              items={contentForScreen(appContent, screen)}
              onBack={() => go("home")}
              onBuy={(item) => {
                if (item.price > 0) {
                  setPendingBooking(null);
                setPendingItem({ contentId: item.id, title: item.title, amount: Number(item.price), back: screen, save: "class", itemType: String(contentMeta(item).itemType || item.contentType || "class") });
                  go("payment");
                  return;
                }
                if (item.targetScreen) go(item.targetScreen as Screen);
              }}
              screen={screen}
            />
          )}

          {screen === "classhub" && (
            <ManagedFeatureScreen
              items={contentByType(appContent, "service_package")}
              onBack={() => go("home")}
              onBuy={(item) => {
                setPendingBooking(null);
                setPendingItem({ contentId: item.id, title: item.title, amount: Number(item.price), back: "classhub", save: "class", itemType: String(contentMeta(item).itemType || item.contentType || "class") });
                go("payment");
              }}
              screen="classhub"
            />
          )}

          {screen === "classschedule" && (
            <div className="page">
              <Top title={t("ตารางคลาส")} onBack={() => go("home")} />
              <Schedule title={t("Class Schedule")} items={classScheduleItems} onBook={(time, item) => { setPendingItem({ contentId: item?.id, title: `${item?.title || "Class"} · ${time}`, amount: Number(item?.price || 0), back: "classschedule", save: "class", itemType: "class" }); setPendingBooking(null); go("payment"); }} />
            </div>
          )}

          {(screen === "qr" || screen === "scanqr") && <ScanScreen data={data} booking={pendingBooking} accessQr={accessQr} qrSeconds={qrSeconds} onCheckin={() => go("checkin")} />}

          {screen === "profile" && (
            <div className="page">
              <Top title={t("โปรไฟล์")} />
              <div className="profile-head">
                <div className="avatar profile-avatar" aria-hidden="true">{data.user.avatar || memberInitial(data.user.displayName)}</div>
                <h2 className="profile-name">{data.user.displayName}</h2>
                <small>{t(activeMembership?.planName) || t("สมาชิก PPA")}</small>
                <em>{t("MEMBER ID ·")} {data.user.memberCode}</em>
              </div>
              <div className="prototype-list">
                <MenuItem icon="👛" title={t("กระเป๋าเงิน & การชำระเงิน")} onClick={() => go("wallet")} />
                <MenuItem icon="🎖️" title={t("สมาชิกและแพ็กเกจ")} onClick={() => go("membership")} />
                <MenuItem icon="📅" title={t("การจองของฉัน")} onClick={() => go("mybooking")} />
                <MenuItem icon="🎓" title={t("คู่มือการใช้งาน")} meta={t("Buffet Rank · ก๊วน · เหรียญ")} onClick={() => setTutorial(1)} />
                <MenuItem icon="🔔" title={t("การแจ้งเตือน")} onClick={() => go("notifications")} />
                <MenuItem icon="❓" title={t("ช่วยเหลือ & ติดต่อเรา")} onClick={() => go("help")} />
                <MenuItem icon="🚪" title={t("ออกจากระบบ")} onClick={logout} />
              </div>
            </div>
          )}

          {screen === "help" && (
            <div className="page help-page">
              <Top title={t("ช่วยเหลือ & ติดต่อเรา")} icon="❓" onBack={() => go("profile")} />
              <div className="prototype-list">
                <MenuItem icon="📞" title={t("โทรหาเรา")} meta={`${contact.phone} · ${contact.hours}`} onClick={() => openSupport("tel")} />
                <MenuItem icon="✉️" title={t("อีเมล")} meta={contact.email} onClick={() => openSupport("mail")} />
                <MenuItem icon="🎓" title={t("คู่มือการใช้งาน")} meta={t("จอง · ก๊วน · เหรียญ")} onClick={() => { go("home"); window.setTimeout(() => setTutorial(1), 250); }} />
                <MenuItem icon="💬" title={t("LINE Official")} meta={contact.line} onClick={() => openSupport("line")} />
                {policy ? <MenuItem icon="🔒" title={t("นโยบายความเป็นส่วนตัว")} meta={data.consent?.version === policy.version ? t("ยอมรับแล้ว · ฉบับ {{value0}}", { value0: policy.version }) : t("ฉบับ {{value0}}", { value0: policy.version })} onClick={() => setPolicyOpen(true)} /> : null}
              </div>
              <div className="help-info">
                <b>PPA Power Play Sport Club</b>
                <small>{t("เวลาทำการ {{value0}}", { value0: contact.hours })}</small>
              </div>
              <div className="help-faq">
                <div className="reward-label">{t("คำถามที่พบบ่อย")}</div>
                <details>
                  <summary>{t("QR เข้าใช้บริการหมดอายุทำอย่างไร?")}</summary>
                  <p>{t("เปิดหน้า Scan ใหม่ ระบบจะสร้าง QR อายุ 20 วินาทีเพื่อป้องกันการแชร์ต่อ")}</p>
                </details>
                <details>
                  <summary>{t("จองแล้วต้องชำระภายในกี่นาที?")}</summary>
                  <p>{t("ระบบกันสนามไว้ 15 นาที หากไม่ชำระเงิน รายการจะหมดอายุอัตโนมัติ")}</p>
                </details>
                <details>
                  <summary>{t("ต้องการเปลี่ยนรอบหรือยกเลิกติดต่อที่ไหน?")}</summary>
                  <p>{t("ติดต่อ LINE Official หรือโทรหาแอดมิน พร้อมแจ้งเลข booking ในหน้าประวัติ")}</p>
                </details>
              </div>
            </div>
          )}

          {screen === "admin" && (
            <div className="page">
              <Top title={t("Admin")} onBack={() => go("profile")} />
              <div className="admin-grid">
                <Stat label={t("Bookings")} value={data.bookings.length} />
                <Stat label={t("Coupons")} value={data.coupons.length} />
                <Stat label={t("Groups")} value={data.groups.length} />
                <Stat label={t("Unread")} value={unreadCount} />
              </div>
              <div className="secure-note"><strong>{t("Read-only operation panel")}</strong><small>{t("หน้านี้แสดงภาพรวมใน client เท่านั้น งานจัดการจริงควรทำผ่าน backend role-based access control")}</small></div>
              <button className="primary" disabled={busy} onClick={() => refresh().then(() => notice("อัปเดตข้อมูลแล้ว"))}>{t("↻ Refresh data")}</button>
            </div>
          )}
        </div>
        <nav className="tabbar" id="tabbar" aria-label={t("เมนูหลัก")}>
          {tabs.map(([id, icon, label]) => (
            <button className={screen === id ? "on" : ""} aria-current={screen === id ? "page" : undefined} key={id} onClick={() => { if (id === "trainer") setTrainerDetail(false); go(id); }}>
              <TabBarIcon name={icon} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
        {cancelTarget && <AdminDialog onClose={() => { if (!busy) setCancelTarget(null); }}><section className="member-confirm"><h2>{t("ยกเลิกการจองนี้?")}</h2><p>{t(cancelTarget.title)}</p><small>{t("รายการที่ชำระแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบเงื่อนไขการคืนเงิน")}</small><div><button className="ghost" disabled={busy} onClick={() => setCancelTarget(null)}>{t("เก็บการจองไว้")}</button><button className="danger-action" disabled={busy} onClick={() => cancelBooking(cancelTarget)}>{busy ? t("กำลังยกเลิก…") : t("ยืนยันยกเลิก")}</button></div></section></AdminDialog>}
        {tutorial > 0 && <Tutorial step={tutorial} onNext={() => setTutorial(tutorial >= 4 ? 0 : tutorial + 1)} onSkip={() => setTutorial(0)} />}
        {policy && (consentDue || policyOpen) ? <PrivacyPolicyDialog policy={policy} contact={contact} busy={busy} onAccept={consentDue ? acceptPolicy : undefined} onClose={consentDue ? undefined : () => setPolicyOpen(false)} /> : null}
        {t(toast) && <div className="toast" role="status" aria-live="polite">{t(toast)}</div>}
      </section>
    </main>
  );
}

function LineGate({ blocked = false, embedded = false, liffId = "", error = false, onRetry }: { blocked?: boolean; embedded?: boolean; liffId?: string; error?: boolean; onRetry?: () => void }) {
  const openUrl = liffId ? `https://liff.line.me/${liffId}` : "";
  return (
    <main className={embedded ? "phone line-gate embedded" : "line-gate"}>
      <div className="gate-language"><LanguageSwitcher /></div>
      <div className="gate-grid" />
      <div className="gate-glow one" />
      <div className="gate-glow two" />
      <section className="gate-panel">
        <div className="gate-mark">
          <div className="gate-rings">
            <span />
            <span />
            <span />
          </div>
          <div className="gate-logo">PPA<span>.</span></div>
        </div>
        <div className="gate-copy">
          <span className="gate-kicker">{blocked ? t("LINE SECURE ACCESS") : t("SPORT COMPLEX LOADING")}</span>
          <h1>{error ? t("โหลดข้อมูลไม่สำเร็จ") : blocked ? t("เปิดผ่าน LINE เพื่อเข้าสู่ระบบสมาชิก") : t("กำลังเตรียมสนามและข้อมูลสมาชิก")}</h1>
          <p>
            {blocked
              ? t("ยืนยันตัวตนด้วย LINE LIFF เพื่อเรียกข้อมูลเดิมของสมาชิกอย่างปลอดภัย แม้เปลี่ยนเครื่องก็ใช้บัญชีเดิมได้")
              : t("เชื่อมต่อโปรไฟล์ Wallet การจอง และสิทธิพิเศษของคุณแบบปลอดภัย")}
          </p>
        </div>
        <div className="gate-status">
          <div><b>LINE</b><small>{blocked ? t("Required") : t("Verifying")}</small></div>
          <div><b>{t("MEMBER")}</b><small>{blocked ? t("Protected") : t("Syncing")}</small></div>
          <div><b>{t("DATA")}</b><small>{blocked ? t("Safe") : t("Loading")}</small></div>
        </div>
        {!error && <div className="gate-progress"><span /></div>}
        <div className="gate-actions">
          {error ? <button type="button" className="primary" onClick={onRetry}>{t("ลองอีกครั้ง")}</button> : null}
          {blocked && openUrl ? <a href={openUrl}>{t("เปิดใน LINE")}</a> : null}
          <small>{blocked ? t("หากเปิดจาก Rich Menu แล้วยังเห็นหน้านี้ ให้ปิดหน้านี้แล้วเปิดจากแชต LINE OA อีกครั้ง") : t("Secure member access in progress")}</small>
        </div>
      </section>
    </main>
  );
}

function TabBarIcon({ name }: { name: TabIcon }) {
  const Icon = { home: House, trainer: Dumbbell, scan: QrCode, history: CalendarDays, profile: UserRound }[name];
  return <Icon size={24} strokeWidth={1.8} aria-hidden="true" />;
}

function SportRow({ icon, title, text, onClick }: { icon: string; title: string; text?: string; onClick?: () => void }) {
  return (
    <button className="sport-row-ui" onClick={onClick}>
      <span className="si">{icon}</span>
      <div>
        <b>{t(title)}</b>
        {t(text) && <small>{t(text)}</small>}
      </div>
      <span className="chev">›</span>
    </button>
  );
}

function MenuItem({ icon, title, meta, onClick }: { icon: string; title: string; meta?: string; onClick?: () => void }) {
  return (
    <button className="menu-item-ui" onClick={onClick}>
      <span className="mi">{icon}</span>
      <span className="menu-title">{t(title)}</span>
      {t(meta) && <small>{t(meta)}</small>}
      <span className="chev">›</span>
    </button>
  );
}

function BigBalance({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="big-balance-ui">
      <small>{t(label)}</small>
      <b>{value} <em>{t(unit)}</em></b>
    </div>
  );
}

function CouponRow({ coupon, onClick }: { coupon: Coupon; onClick?: () => void }) {
  const qty = coupon.totalUses || coupon.remainingUses || 1;
  return (
    <button className="coupon-row-ui" onClick={onClick}>
      <span className="cn">{qty}<small>{t("ใบ")}</small></span>
      <span className="ci">
        <b>{t(coupon.name)}</b>
        <small>{money(coupon.price)} {t("฿ · ใช้ได้")} {coupon.validityDays || 30} {t("วัน")}</small>
      </span>
      <span className="add">+</span>
    </button>
  );
}

function BookingRow({ booking, onCancel, onClick, now }: { booking: Booking; onCancel?: () => void; onClick?: () => void; now: number }) {
  const start = booking.startsAt || booking.starts_at || "";
  const validStart = Number.isFinite(new Date(start).getTime());
  const day = validStart ? new Date(start).toLocaleDateString("en-GB", { day: "2-digit", timeZone: "Asia/Bangkok" }) : "--";
  const month = validStart ? new Date(start).toLocaleDateString(localeTag(), { month: "short", timeZone: "Asia/Bangkok" }) : "PPA";
  const time = validStart ? new Date(start).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "";
  const done = ["done", "completed", "used", "checked_in", "cancelled", "expired"].includes(booking.status);
  const canCancel = ["hold", "pending_payment", "paid"].includes(booking.status) && new Date(start).getTime() >= now + 30 * 60000 && Boolean(onCancel);
  return (
    <article className="booking-row-ui">
      <button className="booking-open" onClick={onClick} aria-label={t("ดูการจอง {{value0}}", { value0: t(booking.title) })}>
      <span className="date"><b>{day}</b><small>{month}</small></span>
      <span className="inf"><b>{t(booking.title)}</b><small>{time ? `${time} · ` : ""}{money(booking.amount)} ฿</small></span>
      <span className={done ? "tag gray" : "tag"}>{t(bookingStatusLabel(booking.status))}</span>
      </button>
      {canCancel && <button className="booking-cancel" onClick={onCancel}>{t("ยกเลิก")}</button>}
    </article>
  );
}


function NotiRow({ icon, title, body, unread }: { icon: string; title: string; body: string; unread?: boolean }) {
  return (
    <div className={unread ? "noti-row unread" : "noti-row"}>
      <span className="ni">{icon}</span>
      <div>
        <b>{t(title)}</b>
        <p>{body}</p>
        <small>{unread ? t("ใหม่") : t("อ่านแล้ว")}</small>
      </div>
    </div>
  );
}

function contentByType(items: ContentItem[], contentType: string) {
  return items.filter((item) => item.contentType === contentType).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function contentForScreen(items: ContentItem[], screen: Screen) {
  const direct = items.filter((item) => item.targetScreen === screen || item.slug === screen);
  if (direct.length) return direct;
  return contentByType(items, "feature_screen").filter((item) => {
    const screens = contentMeta(item).screens;
    return Array.isArray(screens) && screens.map(String).includes(screen);
  });
}


function contentToPack(item: ContentItem): AppPack {
  return {
    contentId: item.id,
    key: item.slug,
    icon: item.icon || "📦",
    name: item.title,
    price: Number(item.price || 0),
    desc: item.subtitle || item.body || "",
    screen: item.targetScreen as Screen | undefined,
  };
}

function contentTypeForPack(item: AppPack) {
  if (item.screen === "plans" || item.name.toLowerCase().includes("premium")) return "membership";
  if (item.screen === "trainer" || item.name.toLowerCase().includes("pt")) return "trainer";
  return "class";
}

function packagesForScreen(items: ContentItem[], screen: Screen) {
  return items.filter((item) => item.targetScreen === screen || contentMeta(item).category === screen).map(contentToPack);
}

function scheduleForScreen(items: ContentItem[], screen: Screen) {
  return items.filter((item) => item.targetScreen === screen || contentMeta(item).category === screen);
}

function contentMeta(item: ContentItem): Record<string, unknown> {
  if (!item.metadata) return {};
  if (typeof item.metadata !== "string") return item.metadata;
  try {
    const parsed = JSON.parse(item.metadata) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function prototypeScreenLabel(screen: Screen) {
  const labels: Partial<Record<Screen, string>> = {
    orprofile: "Open Run Profile",
    kuanprofile: "Buffet Rank Profile",
    groupcreate: "สร้างก๊วน",
    groupdetail: "รายละเอียดก๊วน",
    groupchat: "Group Chat",
    groupranking: "Ranking",
    kuanvote: "Vote",
    kuanresult: "Result",
    kuanredeem: "Redeem Reward",
    playerprofile: "Player Profile",
    coinshop: "Coin Shop",
    kuanroster: "Roster",
    kuanpairs: "Pairs",
    svcclass: "Service Class",
    svcdetail: "Service Detail",
    pilprivate: "Pilates Private",
    pilgroup: "Pilates Group",
    promo: "Promotion Detail",
    memverify: "Member Verify",
    classhub: "Class Hub",
    classschedule: "Class Schedule",
    bookings: "Bookings",
    editprofile: "Edit Profile",
    payscan: "Payment Scan",
    pool: "Pool",
    classes: "Classes",
    walletpay: "Wallet Pay",
    linkwallet: "Link Wallet",
    linkbank: "Link Bank",
    buyhistory: "Buy History",
    visits: "Visits",
    mycoupons: "My Coupons",
    personal: "Personal Info",
    mystatus: "My Status",
    notisettings: "Notification Settings",
    tennis: "Tennis",
    basketball: "Basketball",
    volleyball: "Volleyball",
  };
  return labels[screen] || screen;
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

function trainerSpecialties(trainer: Trainer) {
  if (Array.isArray(trainer.specialties)) return trainer.specialties.map(String).filter(Boolean);
  if (typeof trainer.specialties === "string") {
    try {
      const parsed = JSON.parse(trainer.specialties) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return trainer.specialties.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function trainerPlans(trainer: Trainer) {
  const configured = parseJsonArray<TrainerPackage>(trainer.packages).filter((plan) => plan.title && plan.text && Number(plan.price) >= 0);
  if (configured.length) return configured.map((plan) => ({ ...plan, price: Number(plan.price) }));
  const base = Number(trainer.startPrice || 1200);
  return [
    { title: "รายวัน", text: "1 ครั้ง · 1 ชม.", price: base },
    { title: "รายสัปดาห์", text: "5 ครั้ง/สัปดาห์", price: Math.round(base * 4.5) },
    { title: "รายเดือน", text: "20 ครั้ง/เดือน", price: Math.round(base * 16.7) },
    { title: "ราย 6 เดือน", text: "120 ครั้ง", price: Math.round(base * 92) },
    { title: "ราย 1 ปี", text: "240 ครั้ง", price: Math.round(base * 168) },
  ];
}

function trainerSchedule(trainer: Trainer): TrainerScheduleDay[] {
  const configured = parseJsonArray<TrainerScheduleDay>(trainer.weeklySchedule)
    .map((day) => ({ ...day, slots: Array.isArray(day.slots) ? day.slots.filter((slot) => /^\d{2}:\d{2}$/.test(slot.time)) : [] }))
    .filter((day) => day.day && day.slots.length);
  return configured;
}

function parseJsonArray<T>(value: T[] | string | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function Summary({ sport, slot, players, date }: { sport: Sport | null; slot: Slot | null; players: number; date?: string }) {
  const rate = slot?.rate ?? sport?.baseRate ?? 0;
  return (
    <div className="summary">
      {date && <div><span>{t("วันที่")}</span><strong>{new Date(`${date}T00:00:00+07:00`).toLocaleDateString(localeTag(), { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" })}</strong></div>}
      <div><span>{t("🏷️ บริการ")}</span><strong>{sport ? `${sport.icon} ${t(sport.name)}` : "-"}</strong></div>
      <div><span>{t("🏟️ สนาม/เวลา")}</span><strong>{slot ? `${courtName(slot.courtName)} · ${slot.time}` : t("ใช้ QR เข้าได้ทันที")}</strong></div>
      <div><span>{t("👥 ผู้เล่น")}</span><strong>{players} {t("คน")}</strong></div>
      <div><span>{t("💳 ยอดรวม")}</span><strong>{money(rate)} ฿</strong></div>
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
  item: { title: string; amount: number; save?: string } | null;
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
        <span className="eyebrow">{t("CONFIRM PAYMENT")}</span>
        <h2>{t("ยืนยันการชำระเงิน")}</h2>
        <div className="pay-card"><span>🧾 {t(title)}</span><strong>{money(amount)} ฿</strong><small>{booking ? `Booking: ${bookingNo(booking)}` : t("PPA secure checkout")}</small></div>
        {item?.save !== "topup" && <button className="pay-method primary-pay" onClick={() => onPay("wallet")} disabled={busy || wallet < amount}>{t("👛 จ่ายด้วย Wallet")} <span>{money(wallet)} ฿</span></button>}
        <button className="pay-method" onClick={() => onPay("promptpay")} disabled={busy}>{t("payment.manual.request")} <span>{t("ยืนยันหลังชำระ")}</span></button>
        <button className="ghost" onClick={onBack} disabled={busy}>{t("‹ ย้อนกลับ")}</button>
      </div>
    </div>
  );
}

function ScanScreen({ data, booking, accessQr, onCheckin }: { data: Bootstrap; booking?: Booking | null; accessQr?: AccessQr; qrSeconds: number; onCheckin: () => void }) {
  const [qr, setQr] = useState<(QrPayload & { selection: string }) | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [qrError, setQrError] = useState("");
  const [revision, setRevision] = useState(0);
  const bookingCode = booking ? bookingNo(booking) : "";
  const purpose = bookingCode ? "booking" : accessQr?.purpose || "member";
  const accessKey = accessQr?.purpose === "coupon" ? String(accessQr.couponId) : accessQr?.purpose === "entitlement" ? String(accessQr.entitlementId) : "";
  const selection = `${purpose}:${bookingCode}:${accessKey}`;
  const currentQr = qr?.selection === selection && remaining > 0 ? qr : null;

  useEffect(() => {
    let alive = true;
    let pending = false;
    let expiresAt = 0;
    const controller = new AbortController();
    async function loadQr() {
      if (pending) return;
      pending = true;
      setQrError("");
      const requestedAt = Date.now();
      try {
        const params = new URLSearchParams({ purpose });
        if (bookingCode) params.set("bookingNo", bookingCode);
        if (!bookingCode && accessQr?.purpose === "coupon") params.set("couponId", String(accessQr.couponId));
        if (!bookingCode && accessQr?.purpose === "entitlement") params.set("entitlementId", String(accessQr.entitlementId));
        const nextQr = await api<QrPayload>(`/api/qr?${params.toString()}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (!alive) return;
        expiresAt = requestedAt + nextQr.expiresIn * 1000;
        setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
        setQr({ ...nextQr, selection });
        setQrError("");
      } catch (error) {
        if (!alive) return;
        setQr(null);
        setQrError(qrErrorKey((error as Error & { status?: number }).status, purpose, (error as Error & { code?: string }).code));
      } finally {
        pending = false;
      }
    }
    loadQr();
    const timer = window.setInterval(loadQr, 20_000);
    const countdown = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))), 1000);
    return () => {
      alive = false;
      controller.abort();
      window.clearInterval(timer);
      window.clearInterval(countdown);
    };
  }, [accessKey, accessQr, bookingCode, purpose, selection, revision]);

  return (
    <div className="page centered">
      <span className="eyebrow">{t("FAST ACCESS")}</span>
      <h1 className="scan-title">{t("สแกนเข้าใช้บริการ")}</h1>
      <div className={qrError ? "qr-box qr-error-state" : "qr-box"}>
        {currentQr?.svg ? (
          <Image unoptimized width={220} height={220} alt={t("QR เข้าใช้บริการ")} className="qr-svg" src={`data:image/svg+xml,${encodeURIComponent(currentQr.svg)}`} />
        ) : (
          <div role="status"><p>{qrError ? t(qrError) : t("กำลังโหลด QR...")}</p>{qrError && <button className="ghost" onClick={() => setRevision((value) => value + 1)}>{t("ลองใหม่")}</button>}</div>
        )}
      </div>
      <h2>{bookingCode || data.user.memberCode}</h2>
      <p>{bookingCode ? t(booking?.title) : t(accessQr?.title) || t(qr?.title) || t("QR สมาชิกอายุสั้นสำหรับเข้าใช้ sport complex")}</p>
      {currentQr ? <div className="scan-meta"><span>{t("หมดอายุใน")}</span><strong>{remaining}{t("s")}</strong></div> : null}
      <button className="primary" onClick={onCheckin}>{t("🚪 ประวัติการเข้าใช้บริการ")}</button>
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
  items: AppPack[];
  onSelect: (item: AppPack) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="page">
      <Top title={t(title)} onBack={back} />
      <div className="list">
        {items.map((item) => (
          <button key={item.key} onClick={() => onSelect(item)}>{item.icon} {t(item.name)}<small>💳 {t(item.desc)} · {money(item.price)} ฿</small></button>
        ))}
        {!items.length && <Empty text={t("ยังไม่มีแพ็กเกจเปิดจำหน่าย")} />}
      </div>
      {extra}
    </div>
  );
}

function Schedule({ title, items = [], onBook }: { title: string; items?: ContentItem[]; onBook: (time: string, item?: ContentItem) => void }) {
  return (
    <>
      <SectionTitle title={t(title)} />
      <div className="chip-grid">
        {items.map((item) => {
          const meta = contentMeta(item);
          const time = typeof meta.time === "string" ? meta.time : item.subtitle || "";
          const full = meta.status === "full";
          const closed = !time || ["closed", "off", "cancelled"].includes(String(meta.status));
          return <button key={item.id} disabled={full || closed} onClick={() => onBook(time, item)}>{item.icon} {time || t(item.title)}<small>{full ? t("เต็ม") : closed ? t("ปิดรับจอง") : t("{{value0}} · {{value1}} ฿", { value0: t(item.title), value1: money(item.price) })}</small></button>;
        })}
      </div>
      {!items.length && <Empty text={t("ยังไม่มีตารางคลาสเปิดให้จอง")} />}
    </>
  );
}

function ManagedFeatureScreen({ items, onBack, onBuy, screen }: { items: ContentItem[]; onBack: () => void; onBuy: (item: ContentItem) => void; screen: Screen }) {
  const title = prototypeScreenLabel(screen);
  return (
    <div className="page">
      <Top title={t(title)} onBack={onBack} />
      <div className="list">
        {items.length ? items.map((item) => (
          <button key={item.id} onClick={() => onBuy(item)}>
            {item.icon} {t(item.title)}
            <small>{t(item.subtitle) || t(item.body) || item.slug}{item.price > 0 ? t(" · {{value0}} ฿", { value0: money(item.price) }) : ""}</small>
          </button>
        )) : <Empty text={t("ยังไม่มีข้อมูลในขณะนี้")} />}
      </div>
    </div>
  );
}

const defaultHomeSlides: ContentItem[] = [
  { id: -1, contentType: "home_slide", slug: "hyrox", icon: "🏆", title: "HYROX", subtitle: "คลาสและบริการเสริม", targetScreen: "hyrox", price: 0, metadata: { tag: "PPA", tone: "event" } },
  { id: -2, contentType: "home_slide", slug: "promotion", icon: "🎁", title: "Promotion", subtitle: "ดีลสมาชิก", targetScreen: "promotion", price: 0, metadata: { tag: "PPA", tone: "shop" } },
  { id: -3, contentType: "home_slide", slug: "coupon", icon: "🎫", title: "Coupon", subtitle: "ซื้อและใช้คูปอง", targetScreen: "coupon", price: 0, metadata: { tag: "PPA", tone: "food" } },
  { id: -4, contentType: "home_slide", slug: "airfit", icon: "🪂", title: "Airfit", subtitle: "คลาสและบริการเสริม", targetScreen: "airfit", price: 0, metadata: { tag: "PPA", tone: "airfit" } },
];

function HomeCarousel({ items, onOpen }: { items: ContentItem[]; onOpen: (screen: Screen) => void }) {
  const slides = items.length ? items : defaultHomeSlides;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const touchStart = useRef<number | null>(null);
  const suppressClickUntil = useRef(0);
  const active = index % slides.length;
  const move = (delta: number) => setIndex((value) => (value + delta + slides.length) % slides.length);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (paused || interacting || reducedMotion || slides.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((value) => (value + 1) % slides.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [paused, interacting, reducedMotion, slides.length]);
  return (
    <section className="ad-carousel home-carousel" aria-label={t("ข่าวสารและกิจกรรม")}
      onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}
      onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); } }}
      onTouchStart={(event) => { touchStart.current = event.touches[0].clientX; suppressClickUntil.current = 0; }}
      onTouchEnd={(event) => { const delta = event.changedTouches[0].clientX - (touchStart.current ?? event.changedTouches[0].clientX); if (Math.abs(delta) > 45) { move(delta < 0 ? 1 : -1); suppressClickUntil.current = Date.now() + 400; } touchStart.current = null; }}
      onClickCapture={(event) => { if (Date.now() < suppressClickUntil.current) { event.preventDefault(); event.stopPropagation(); } suppressClickUntil.current = 0; }}>
      <div className="ad-track" style={{ transform: `translateX(-${active * 100}%)` }}>
        {slides.map((slide, slideIndex) => {
          const meta = contentMeta(slide);
          const tone = ["event", "shop", "food", "airfit"].includes(String(meta.tone)) ? String(meta.tone) : "event";
          const src = safeImageSource(slide.imageUrl);
          const target = slide.targetScreen as Screen;
          const validTarget = [...richMenuScreens, ...managedPrototypeScreens, ...serviceShortcuts.map((item) => item.screen), "hyrox", "airfit", "fitness", "plans"].includes(target);
          return <button className={`ad-slide ${tone}`} key={slide.id} aria-hidden={slideIndex !== active} tabIndex={slideIndex === active ? 0 : -1} onClick={() => onOpen(validTarget ? target : "promotion")}>
            {src && <UploadImage className="home-slide-image" src={src} alt="" width={640} height={360} sizes="(max-width: 520px) 100vw, 520px" referrerPolicy="no-referrer" />}
            <span className="ad-tag">{typeof meta.tag === "string" ? t(meta.tag) : "PPA"}</span>
            <strong>{slide.icon} {t(slide.title)}</strong><small>{t(slide.subtitle) || t(slide.body)}</small>
          </button>;
        })}
      </div>
      {slides.length > 1 && <div className="home-slide-controls">
        <button title={t("สไลด์ก่อนหน้า")} aria-label={t("สไลด์ก่อนหน้า")} onClick={() => move(-1)}><ChevronLeft size={16} /></button>
        <div className="ad-dots">{slides.map((slide, slideIndex) => <button key={slide.id} aria-label={t("ดูสไลด์ {{number}}", { number: slideIndex + 1 })} aria-current={active === slideIndex ? "true" : undefined} className={active === slideIndex ? "on" : ""} onClick={() => setIndex(slideIndex)} />)}</div>
        <button title={t("สไลด์ถัดไป")} aria-label={t("สไลด์ถัดไป")} onClick={() => move(1)}><ChevronRight size={16} /></button>
        {!reducedMotion && <button title={t(paused ? "เล่นสไลด์" : "หยุดสไลด์")} aria-label={t(paused ? "เล่นสไลด์" : "หยุดสไลด์")} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}</button>}
      </div>}
    </section>
  );
}

function TrainerStrip({ trainers, onOpen }: { trainers: Trainer[]; onOpen: (trainer: Trainer) => void }) {
  return (
    <div className="trainer-strip">
      {trainers.map((trainer) => <button key={trainer.slug} onClick={() => onOpen(trainer)}><TrainerAvatar trainer={trainer} /><strong>{trainer.nickname}</strong><small>{t(trainer.role)}</small></button>)}
    </div>
  );
}

// Uploaded photos (/uploads/...) go through the image optimizer: a small WebP sized for the screen
// instead of the original file (up to 3 MB). Other images, or an optimizer failure, show the original.
function UploadImage({ alt, src, ...props }: ComponentProps<typeof Image> & { src: string }) {
  const [failed, setFailed] = useState(false);
  return <Image {...props} alt={alt} src={src} unoptimized={!src.startsWith("/uploads/") || failed} onError={() => setFailed(true)} />;
}

function TrainerAvatar({ className = "", trainer }: { className?: string; trainer: Trainer }) {
  const src = safeImageSource(trainer.imageUrl);
  if (src) return <UploadImage width={160} height={160} alt={trainer.name} className={`trainer-photo ${className}`} src={src} referrerPolicy="no-referrer" />;
  return <span className={`trainer-photo fallback ${className}`}>{trainer.avatar}</span>;
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
        <span>{step}/4</span><div className="tut-icon">{current[0]}</div><strong>{t(current[1])}</strong><p>{t(current[2])}</p>
        <div><button className="ghost" onClick={onSkip}>{t("ข้าม")}</button><button className="primary" onClick={onNext}>{step >= 4 ? t("จบ") : t("ถัดไป")}</button></div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{statIcons[label] || "•"} {t(label)}</span><strong>{value}</strong></div>;
}
