// Data shapes shared by the member app screens (responses of /api/bootstrap and friends).

export type Sport = {
  id: number;
  slug: string;
  name: string;
  icon: string;
  description: string;
  requiresBooking: number | boolean;
  baseRate: number;
};
export type Booking = {
  booking_no?: string;
  bookingNo?: string;
  title: string;
  startsAt?: string;
  starts_at?: string;
  amount: number;
  status: string;
};
export type Coupon = {
  id: number;
  code?: string;
  name: string;
  category: string;
  price?: number;
  totalUses?: number;
  validityDays?: number;
  remainingUses?: number;
  expiresAt?: string;
  purchasedAt?: string;
  sortOrder?: number | null;
  metadata?: string | Record<string, unknown> | null;
};
export type Trainer = {
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
  bio?: string | null;
  specialties?: string[] | string | null;
  packages?: TrainerPackage[] | string | null;
  weeklySchedule?: TrainerScheduleDay[] | string | null;
  socialLine?: string | null;
  startPrice: number;
  certifications?: string[] | string | null;
};
export type TrainerPackage = { title: string; text: string; price: number };
export type TrainerScheduleDay = { day: string; date?: string; slots: { time: string; status: "available" | "full" | "off" }[] };
// Find Your Game slot (lib/groups.ts GroupRow).
export type Group = {
  id: number;
  name: string;
  levelName: string;
  sportName: string;
  sportSlug?: string;
  sportIcon?: string;
  description?: string | null;
  maxPlayers: number;
  memberCount: number;
  playAt?: string | null;
  joined?: number | boolean;
  isOwner?: number | boolean;
};
export type NotificationItem = { id: number; title: string; body: string; status: string; createdAt?: string };
export type ContentItem = {
  id: number;
  contentType: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  icon: string;
  imageUrl?: string | null;
  actionLabel?: string | null;
  targetScreen?: string | null;
  price: number;
  metadata?: string | Record<string, unknown> | null;
  sortOrder?: number | null;
};
export type Membership = { id: number; planName: string; startsAt: string; endsAt: string; status: string; metadata?: string | Record<string, unknown> | null };
export type MembershipPause = { id: number; membershipId: number; startsAt: string; endsAt: string; days: number };
export type PendingPayment = { paymentNo: string; method?: string | null; amount: number; createdAt: string; itemType?: string | null; itemName?: string | null; refId?: string | null; slipUploadedAt?: string | null };
export type WalletLedgerEntry = { id: number; kind: string; amount: number; coinDelta: number; pointDelta: number; note?: string | null; createdAt: string };
export type Entitlement = { id: number; entitlementType: string; title: string; remainingUses?: number | null; startsAt: string; endsAt?: string | null; status: string };
export type Bootstrap = {
  user: { displayName: string; memberCode: string; avatar?: string; avatarTier?: string };
  wallet: { balance: number; coinBalance: number; pointBalance: number };
  sports: Sport[];
  bookings: Booking[];
  coupons: Coupon[];
  expiredCoupons: Coupon[];
  trainers: Trainer[];
  groups: Group[];
  notifications: NotificationItem[];
  contentItems: ContentItem[];
  memberships: Membership[];
  membershipPauses: MembershipPause[];
  entitlements: Entitlement[];
  pendingPayments: PendingPayment[];
  walletLedger: WalletLedgerEntry[];
  // PDPA: privacy policy version the member accepted (lib/site-settings.ts).
  consent?: { acceptedAt: string | null; version: string | null };
  visits: Visit[];
  // False when PROMPTPAY_ID is not configured: pending payments are then settled at the counter.
  promptPayEnabled?: boolean;
};
// Recorded when staff scan the member's QR (admin QR verify).
export type Visit = { id: number; purpose: string; title: string | null; createdAt: string };
export type Screen =
  | "splash"
  | "login"
  | "home"
  | "sports"
  | "courts"
  | "datetime"
  | "summary"
  | "payment"
  | "paypromptpay"
  | "success"
  | "orprofile"
  | "kuanprofile"
  | "groupcreate"
  | "groupdetail"
  | "groupchat"
  | "groupranking"
  | "kuanvote"
  | "kuanresult"
  | "kuanredeem"
  | "playerprofile"
  | "coinshop"
  | "kuanroster"
  | "kuanpairs"
  | "qr"
  | "scan"
  | "scanqr"
  | "checkin"
  | "mybooking"
  | "gymnos"
  | "svcclass"
  | "svcdetail"
  | "fitness"
  | "swim"
  | "hyrox"
  | "pilates"
  | "pilprivate"
  | "pilgroup"
  | "promo"
  | "airfit"
  | "tennis"
  | "basketball"
  | "volleyball"
  | "promotion"
  | "memverify"
  | "classhub"
  | "classschedule"
  | "bookings"
  | "editprofile"
  | "livetv"
  | "payscan"
  | "pool"
  | "classes"
  | "wallet"
  | "walletpay"
  | "linkwallet"
  | "linkbank"
  | "coupon"
  | "reward"
  | "membership"
  | "buyhistory"
  | "visits"
  | "mycoupons"
  | "plans"
  | "trainer"
  | "groups"
  | "notifications"
  | "noti"
  | "personal"
  | "mystatus"
  | "notisettings"
  | "help"
  | "profile"
  | "admin";
