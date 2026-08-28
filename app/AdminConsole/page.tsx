import { AdminConsole, type AdminConsoleData } from "@/components/admin-console";
import { query } from "@/lib/db";

type AdminConsolePageProps = {
  searchParams: Promise<{ key?: string | string[]; report?: string | string[] }>;
};

export const adminConsoleSections = ["dashboard", "members", "staff", "roles", "reports", "coupons", "bookings", "trainers", "audit", "security", "system", "analysis"] as const;
export type AdminConsoleSection = (typeof adminConsoleSections)[number];

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminConsolePage(props: AdminConsolePageProps) {
  return AdminConsolePageView({ ...props, initialTab: "dashboard" });
}

export async function AdminConsolePageView({ searchParams, initialTab = "dashboard" }: AdminConsolePageProps & { initialTab?: AdminConsoleSection }) {
  const adminKey = process.env.ADMIN_ACCESS_KEY || "";
  const allowDevOpen = process.env.NODE_ENV !== "production" && !adminKey;
  const resolvedSearchParams = await searchParams;
  const providedKey = readSingle(resolvedSearchParams.key);
  const reportSection = readSingle(resolvedSearchParams.report);
  const canAccess = allowDevOpen || (Boolean(adminKey) && providedKey === adminKey);

  if (!canAccess) {
    return (
      <main className="admin admin-locked">
        <div className="brand">PPA<span>.</span></div>
        <h1>Admin Access</h1>
        <p>เปิดผ่าน browser ได้โดยใช้ admin key สำหรับระบบจัดการ</p>
        <code>/AdminConsole?key=YOUR_ADMIN_ACCESS_KEY</code>
      </main>
    );
  }

  const [
    userCount,
    bookingCount,
    paymentCount,
    revenue,
    users,
    bookings,
    payments,
    coupons,
    trainers,
    courts,
    staff,
    roles,
    permissions,
    auditLogs,
    activeMemberships,
    walletAccounts,
    notifications,
    groups,
  ] = await Promise.all([
    query<{ total: number }>("SELECT COUNT(*) total FROM users"),
    query<{ total: number }>("SELECT COUNT(*) total FROM bookings"),
    query<{ total: number }>("SELECT COUNT(*) total FROM payments WHERE status = 'paid'"),
    query<{ total: number }>("SELECT COALESCE(SUM(amount), 0) total FROM payments WHERE status = 'paid'"),
    query<AdminConsoleData["users"][number]>(
      "SELECT id, display_name displayName, member_code memberCode, phone, email, status, created_at createdAt FROM users ORDER BY created_at DESC LIMIT 80",
    ),
    query<AdminConsoleData["bookings"][number]>(
      "SELECT b.booking_no bookingNo, b.title, u.display_name displayName, b.starts_at startsAt, b.amount, b.status FROM bookings b JOIN users u ON u.id = b.user_id ORDER BY b.starts_at DESC LIMIT 80",
    ),
    query<AdminConsoleData["payments"][number]>(
      "SELECT p.payment_no paymentNo, u.display_name displayName, p.method, p.amount, p.status, p.paid_at paidAt FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 80",
    ),
    query<AdminConsoleData["coupons"][number]>(
      "SELECT id, code, name, category, price, total_uses totalUses, validity_days validityDays, active FROM coupons ORDER BY id DESC LIMIT 80",
    ),
    query<AdminConsoleData["trainers"][number]>(
      "SELECT id, slug, name, nickname, role, avatar, image_url imageUrl, experience, zodiac, birth_year birthYear, blood_type bloodType, contact_phone contactPhone, start_price startPrice, CAST(certifications AS CHAR) certifications, active FROM trainers ORDER BY id DESC LIMIT 80",
    ),
    query<AdminConsoleData["courts"][number]>(
      "SELECT c.id, s.name_th sportName, c.name, c.zone, c.status FROM courts c JOIN sports s ON s.id = c.sport_id ORDER BY s.sort_order, c.id LIMIT 120",
    ),
    query<AdminConsoleData["staff"][number]>(
      "SELECT s.id, s.username, s.display_name displayName, s.email, s.phone, s.status, s.role_id roleId, r.code roleCode, r.name_th roleNameTh, r.name_en roleNameEn, s.created_at createdAt FROM admin_staff s JOIN admin_roles r ON r.id = s.role_id WHERE s.status <> 'deleted' ORDER BY s.id DESC",
    ),
    query<
      Omit<AdminConsoleData["roles"][number], "permissionCodes"> & {
        permissionCodes: string;
      }
    >(
      "SELECT r.id, r.code, r.name_th nameTh, r.name_en nameEn, r.description, r.level, r.is_system isSystem, COALESCE(GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ','), '') permissionCodes FROM admin_roles r LEFT JOIN admin_role_permissions rp ON rp.role_id = r.id LEFT JOIN admin_permissions p ON p.id = rp.permission_id GROUP BY r.id, r.code, r.name_th, r.name_en, r.description, r.level, r.is_system ORDER BY r.level DESC, r.id",
    ),
    query<AdminConsoleData["permissions"][number]>(
      "SELECT id, code, name_th nameTh, name_en nameEn, group_key groupKey FROM admin_permissions ORDER BY group_key, code",
    ),
    query<AdminConsoleData["auditLogs"][number]>(
      "SELECT l.id, s.display_name staffName, s.username, l.action, l.target_type targetType, l.target_id targetId, CAST(l.metadata AS CHAR) metadataText, l.created_at createdAt FROM admin_audit_logs l LEFT JOIN admin_staff s ON s.id = l.staff_id ORDER BY l.created_at DESC LIMIT 120",
    ),
    query<{ total: number }>("SELECT COUNT(*) total FROM memberships WHERE status = 'active'"),
    query<{ total: number }>("SELECT COUNT(*) total FROM wallet_accounts"),
    query<{ total: number }>("SELECT COUNT(*) total FROM notifications"),
    query<{ total: number }>("SELECT COUNT(*) total FROM groups_clubs WHERE status = 'active'"),
  ]);

  const requireLine = process.env.APP_REQUIRE_LINE === "true" && process.env.NEXT_PUBLIC_REQUIRE_LINE === "true";
  const liffConfigured = Boolean(process.env.NEXT_PUBLIC_LINE_LIFF_ID);
  const lineChannelConfigured = Boolean(process.env.LINE_CHANNEL_ID);
  const adminKeyConfigured = Boolean(adminKey);

  const data: AdminConsoleData = {
    metrics: [
      { label: "สมาชิก", value: userCount[0]?.total ?? 0, hint: "สมาชิกทั้งหมดในระบบ" },
      { label: "การจอง", value: bookingCount[0]?.total ?? 0, hint: "booking ทุกสถานะ" },
      { label: "ชำระสำเร็จ", value: paymentCount[0]?.total ?? 0, hint: "payments.status = paid" },
      { label: "รายได้", value: `${Number(revenue[0]?.total ?? 0).toLocaleString("th-TH")} ฿`, hint: "ยอดรับชำระสะสม" },
    ],
    users,
    bookings,
    payments,
    coupons,
    trainers,
    courts,
    staff,
    roles: roles.map((role) => ({
      ...role,
      isSystem: Boolean(role.isSystem),
      permissionCodes: role.permissionCodes ? role.permissionCodes.split(",") : [],
    })),
    permissions,
    currentAdmin: staff.find((admin) => admin.username === "zeroline") || staff.find((admin) => admin.roleCode === "super_admin") || staff[0] || null,
    auditLogs,
    securityItems: [
      {
        key: "line-only",
        labelTh: "Member App ใช้ผ่าน LINE เท่านั้น",
        labelEn: "Member app LINE-only",
        value: requireLine ? "Enforced" : "Open",
        status: requireLine ? "good" : "bad",
        hintTh: "ตรวจจาก APP_REQUIRE_LINE และ NEXT_PUBLIC_REQUIRE_LINE",
        hintEn: "Checked from APP_REQUIRE_LINE and NEXT_PUBLIC_REQUIRE_LINE",
      },
      {
        key: "admin-browser",
        labelTh: "หลังบ้านเข้า browser ปกติ",
        labelEn: "Admin browser access",
        value: "/AdminConsole",
        status: "good",
        hintTh: "แยกจากหน้า member และไม่บังคับ LINE",
        hintEn: "Separated from member app and not forced through LINE",
      },
      {
        key: "admin-key",
        labelTh: "Admin Access Key",
        labelEn: "Admin access key",
        value: adminKeyConfigured ? "Configured" : "Dev open",
        status: adminKeyConfigured ? "good" : "warn",
        hintTh: "Production ควรตั้ง ADMIN_ACCESS_KEY เสมอ",
        hintEn: "Production should always set ADMIN_ACCESS_KEY",
      },
      {
        key: "password-hash",
        labelTh: "รหัสผ่านพนักงานเข้ารหัส",
        labelEn: "Staff password hashing",
        value: "scrypt",
        status: "good",
        hintTh: "จัดเก็บเป็น hash ไม่เก็บ plain text",
        hintEn: "Stored as hashes, not plain text",
      },
      {
        key: "permissions",
        labelTh: "Role-based permissions",
        labelEn: "Role-based permissions",
        value: `${permissions.length}`,
        status: permissions.length >= 10 ? "good" : "warn",
        hintTh: "สิทธิ์แยกตาม dashboard, member, booking, coupon, trainer, report",
        hintEn: "Permissions are separated by dashboard, member, booking, coupon, trainer, and report",
      },
      {
        key: "line-config",
        labelTh: "LINE integration config",
        labelEn: "LINE integration config",
        value: liffConfigured && lineChannelConfigured ? "Configured" : "Incomplete",
        status: liffConfigured && lineChannelConfigured ? "good" : "warn",
        hintTh: "ควรตั้ง LIFF ID และ LINE Channel ID ก่อนขึ้น Production",
        hintEn: "Set LIFF ID and LINE Channel ID before production",
      },
    ],
    systemHealth: [
      {
        key: "database",
        labelTh: "Database connection",
        labelEn: "Database connection",
        value: "Online",
        status: "good",
        hintTh: "โหลดข้อมูล dashboard จากฐานข้อมูลสำเร็จ",
        hintEn: "Dashboard data loaded from the database",
      },
      {
        key: "audit",
        labelTh: "Audit log",
        labelEn: "Audit log",
        value: `${auditLogs.length}`,
        status: auditLogs.length ? "good" : "warn",
        hintTh: "เก็บประวัติ action สำคัญของหลังบ้าน",
        hintEn: "Stores critical admin actions",
      },
      {
        key: "staff",
        labelTh: "Admin staff",
        labelEn: "Admin staff",
        value: `${staff.length}`,
        status: staff.some((admin) => admin.roleCode === "super_admin") ? "good" : "bad",
        hintTh: "ต้องมี super admin อย่างน้อย 1 คน",
        hintEn: "Requires at least one super admin",
      },
      {
        key: "memberships",
        labelTh: "Active memberships",
        labelEn: "Active memberships",
        value: `${activeMemberships[0]?.total ?? 0}`,
        status: "good",
        hintTh: "ใช้ติดตามสมาชิกที่ใช้งานจริง",
        hintEn: "Tracks active member plans",
      },
      {
        key: "wallets",
        labelTh: "Wallet accounts",
        labelEn: "Wallet accounts",
        value: `${walletAccounts[0]?.total ?? 0}`,
        status: "good",
        hintTh: "รองรับ wallet/coin/point",
        hintEn: "Supports wallet, coin, and point balances",
      },
      {
        key: "notifications",
        labelTh: "Notifications",
        labelEn: "Notifications",
        value: `${notifications[0]?.total ?? 0}`,
        status: "good",
        hintTh: "พร้อมต่อยอด LINE OA และ inbox",
        hintEn: "Ready for LINE OA and in-app inbox workflows",
      },
      {
        key: "groups",
        labelTh: "Groups / clubs",
        labelEn: "Groups / clubs",
        value: `${groups[0]?.total ?? 0}`,
        status: "good",
        hintTh: "รองรับ community และ Find Your Game",
        hintEn: "Supports community and Find Your Game",
      },
    ],
  };

  return <AdminConsole adminKey={providedKey || ""} data={data} initialReportSection={reportSection} initialTab={initialTab} />;
}
