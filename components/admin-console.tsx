"use client";

import { useEffect, useMemo, useState } from "react";

type Lang = "th" | "en";
type Theme = "dark" | "light";
type AdminMetric = { label: string; value: number | string; hint: string };
type AdminUser = { id: number; displayName: string; memberCode: string; phone?: string | null; email?: string | null; status: string; createdAt?: string };
type AdminBooking = { bookingNo: string; title: string; displayName: string; startsAt: string; amount: number; status: string };
type AdminCoupon = { id: number; code: string; name: string; category: string; price: number; totalUses: number; validityDays: number; active: number | boolean };
type AdminTrainer = {
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
  certifications?: string[] | string | null;
  startPrice: number;
  active: number | boolean;
};
type AdminPayment = { paymentNo: string; displayName: string; method: string; amount: number; status: string; paidAt?: string | null };
type AdminCourt = { id: number; sportName: string; name: string; zone?: string | null; status: string };
type AdminStaff = {
  id: number;
  username: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  status: "active" | "suspended" | "deleted";
  roleId: number;
  roleCode: string;
  roleNameTh: string;
  roleNameEn: string;
  createdAt?: string;
};
type AdminRole = {
  id: number;
  code: string;
  nameTh: string;
  nameEn: string;
  description?: string | null;
  level: number;
  isSystem: boolean;
  permissionCodes: string[];
};
type AdminPermission = { id: number; code: string; nameTh: string; nameEn: string; groupKey: string };
type AdminStatusTone = "good" | "warn" | "bad";
type AdminAuditLog = {
  id: number;
  staffName: string | null;
  username: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadataText: string | null;
  createdAt: string;
};
type AdminSystemItem = {
  key: string;
  labelTh: string;
  labelEn: string;
  value: string;
  status: AdminStatusTone;
  hintTh: string;
  hintEn: string;
};

export type AdminConsoleData = {
  metrics: AdminMetric[];
  users: AdminUser[];
  bookings: AdminBooking[];
  coupons: AdminCoupon[];
  trainers: AdminTrainer[];
  payments: AdminPayment[];
  courts: AdminCourt[];
  staff: AdminStaff[];
  roles: AdminRole[];
  permissions: AdminPermission[];
  currentAdmin: AdminStaff | null;
  auditLogs: AdminAuditLog[];
  systemHealth: AdminSystemItem[];
  securityItems: AdminSystemItem[];
};

const copy = {
  th: {
    ops: "ระบบจัดการสปอร์ตคอมเพล็กซ์",
    eyebrow: "PPA POWER PLAY",
    search: "ค้นหาสมาชิก / การจอง / คูปอง",
    language: "ภาษา",
    theme: "ธีม",
    dark: "มืด",
    light: "สว่าง",
    refresh: "รีเฟรช",
    home: "บ้าน",
    signedIn: "ผู้ใช้งาน",
    editProfile: "โปรไฟล์",
    logout: "ออกจากระบบ",
    profileTitle: "ข้อมูลส่วนตัว",
    profileSubtitle: "แก้ไขข้อมูลผู้ใช้งานและรหัสผ่านของบัญชีที่กำลังเข้าสู่ระบบ",
    profileSaved: "บันทึกข้อมูลส่วนตัวแล้ว",
    saveProfile: "บันทึกข้อมูลส่วนตัว",
    changePassword: "เปลี่ยนรหัสผ่าน",
    currentPassword: "รหัสผ่านปัจจุบัน",
    newPassword: "รหัสผ่านใหม่",
    confirmPassword: "ยืนยันรหัสผ่านใหม่",
    savePassword: "บันทึกรหัสผ่าน",
    cancel: "ยกเลิก",
    clockLabel: "วันที่และเวลา",
    passwordMismatch: "รหัสผ่านใหม่ไม่ตรงกัน",
    passwordChanged: "เปลี่ยนรหัสผ่านแล้ว",
    changePasswordFailed: "เปลี่ยนรหัสผ่านไม่สำเร็จ",
    currentPasswordIncorrect: "รหัสผ่านปัจจุบันไม่ถูกต้อง",
    usernameTaken: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว",
    live: "สด",
    dashboard: "ภาพรวม",
    members: "จัดการสมาชิก",
    staff: "จัดการพนักงาน",
    roles: "สิทธิพนักงาน",
    reports: "รายงาน",
    coupons: "ระบบคูปอง",
    bookings: "ระบบจอง",
    trainers: "เทรนเนอร์",
    audit: "ตรวจสอบระบบ",
    security: "ความปลอดภัย",
    system: "สถานะระบบ",
    analysis: "ควรเพิ่มอะไร",
    recentBookings: "รายการจองล่าสุด",
    recentPayments: "ชำระเงินล่าสุด",
    revenueTrend: "กราฟรายได้",
    bookingStatus: "สถานะการจอง",
    courtMix: "สนามแยกตามกีฬา",
    operationsPulse: "สัญญาณการทำงานวันนี้",
    financialReport: "รายงานการเงิน",
    bookingReport: "รายงานการจอง",
    memberReport: "รายงานสมาชิก",
    reportOverview: "ภาพรวมรายงาน",
    reportFinance: "การเงิน",
    reportBookings: "การจอง",
    reportMembers: "สมาชิก",
    reportCoupons: "คูปอง",
    reportTrainers: "เทรนเนอร์",
    reportCourts: "สนาม",
    reportEngagement: "การใช้งาน",
    reportAudit: "Audit",
    reportKpi: "KPI สำคัญ",
    reportDetail: "รายละเอียดรายงาน",
    reportSearchRows: "ค้นหาในรายการ",
    reportDateFrom: "วันที่เริ่ม",
    reportDateTo: "วันที่สิ้นสุด",
    reportStatus: "สถานะ/ประเภท",
    reportAllStatus: "ทั้งหมด",
    reportSummary: "สรุปรวม",
    reportFilteredRows: "รายการที่พบ",
    reportFilteredAmount: "ยอดรวม",
    reportPageSize: "ต่อหน้า",
    reportExportAll: "ส่งออกข้อมูลทั้งหมด",
    paidRevenue: "รายได้ชำระแล้ว",
    avgBookingValue: "มูลค่าเฉลี่ยต่อการจอง",
    pendingBookings: "รอชำระ/จองค้าง",
    cancelledBookings: "ยกเลิก/หมดอายุ",
    activeCoupons: "คูปองที่เปิดใช้งาน",
    activeTrainers: "เทรนเนอร์ที่เปิดใช้งาน",
    trainerAvgPrice: "ราคาเทรนเฉลี่ย",
    courtMaintenance: "สนามซ่อมบำรุง",
    utilizationSignal: "สัญญาณการใช้งาน",
    checkinSignal: "เช็คอิน/เข้าใช้งาน",
    auditEvents: "เหตุการณ์ Audit",
    highRiskActions: "Action เสี่ยงสูง",
    reportRecommendation: "ข้อเสนอแนะเชิงปฏิบัติการ",
    totalPaid: "ยอดชำระทั้งหมด",
    paymentRows: "รายการชำระ",
    allBookings: "การจองทั้งหมด",
    allCourts: "สนามในระบบ",
    allMembers: "สมาชิกทั้งหมด",
    activeMembers: "สมาชิกที่ใช้งาน",
    noData: "ยังไม่มีข้อมูล",
    recommendations: "วิเคราะห์สิ่งที่ควรเพิ่มให้สมบูรณ์",
    auditTitle: "ประวัติการทำงานของระบบ",
    auditActor: "ผู้ดำเนินการ",
    auditAction: "การกระทำ",
    auditTarget: "เป้าหมาย",
    auditMetadata: "รายละเอียด",
    auditTime: "เวลา",
    auditEmpty: "ยังไม่มีประวัติการทำงาน",
    exportCsv: "ส่งออก CSV",
    filterAction: "กรองการกระทำ",
    filterActor: "ค้นหาผู้ใช้งาน/เป้าหมาย",
    resetFilter: "ล้างตัวกรอง",
    allActions: "ทุกการกระทำ",
    healthTitle: "Production Readiness",
    securityTitle: "Security Control Center",
    systemTitle: "System Health",
    statusReady: "พร้อม",
    statusWarning: "ต้องตรวจ",
    statusRisk: "เสี่ยง",
    readinessScore: "คะแนนความพร้อม",
    lastAudit: "Audit ล่าสุด",
    checklistTitle: "Checklist ความครบถ้วนตามเมนู",
    checklistStatusReady: "พร้อมใช้",
    checklistStatusNext: "ควรเพิ่ม",
    paidBookingRate: "อัตราการจองที่ชำระแล้ว",
    availableCourts: "สนามพร้อมใช้งาน",
    livePayments: "การชำระเงินล่าสุด",
    total: "ทั้งหมด",
    metricMembers: "สมาชิก",
    metricMembersHint: "สมาชิกทั้งหมดในระบบ",
    metricBookings: "การจอง",
    metricBookingsHint: "การจองทุกสถานะ",
    metricPaid: "ชำระสำเร็จ",
    metricPaidHint: "รายการชำระเงินสำเร็จ",
    metricRevenue: "รายได้",
    metricRevenueHint: "ยอดรับชำระสะสม",
    addStaff: "เพิ่มพนักงาน",
    editStaff: "แก้ไขพนักงาน",
    staffList: "รายชื่อพนักงาน",
    username: "ชื่อผู้ใช้",
    password: "รหัสผ่าน",
    passwordUnchanged: "เว้นว่างถ้าไม่เปลี่ยน",
    displayName: "ชื่อแสดงผล",
    email: "อีเมล",
    phone: "โทรศัพท์",
    role: "บทบาท",
    status: "สถานะ",
    contact: "ติดต่อ",
    action: "จัดการ",
    save: "บันทึก",
    add: "เพิ่ม",
    clear: "ล้าง",
    edit: "แก้ไข",
    delete: "ลบ",
    staffCreated: "เพิ่มพนักงานแล้ว",
    staffUpdated: "อัปเดตพนักงานแล้ว",
    staffDeleted: "ลบพนักงานแล้ว",
    staffSearch: "ค้นหาพนักงาน / ชื่อผู้ใช้ / บทบาท",
    saveFailed: "บันทึกไม่สำเร็จ",
    deleteFailed: "ลบไม่สำเร็จ",
    addRole: "เพิ่มบทบาท",
    editRole: "แก้ไขบทบาทและสิทธิ์",
    allRoles: "บทบาททั้งหมด",
    code: "รหัส",
    thaiName: "ชื่อไทย",
    englishName: "ชื่ออังกฤษ",
    level: "ระดับ",
    description: "รายละเอียด",
    savePermissions: "บันทึกสิทธิ์",
    roleCreated: "เพิ่มบทบาทแล้ว",
    roleUpdated: "อัปเดตสิทธิ์แล้ว",
    roleDeleted: "ลบบทบาทแล้ว",
    permissionsCount: "สิทธิ์",
    addCoupon: "เพิ่มคูปอง",
    editCoupon: "แก้ไขคูปอง",
    couponList: "รายการคูปอง",
    couponCreated: "เพิ่มคูปองแล้ว",
    couponUpdated: "อัปเดตคูปองแล้ว",
    couponDeleted: "ปิดใช้งานคูปองแล้ว",
    couponSearch: "ค้นหาคูปอง / รหัส / หมวด",
    couponType: "ลักษณะคูปอง",
    couponPreview: "ตัวอย่างหน้าลูกค้า",
    couponCodeHint: "เช่น FOOD-15 หรือ TENNIS-10",
    totalUses: "จำนวนใบ/ครั้ง",
    validityDays: "อายุการใช้งาน (วัน)",
    addTrainer: "เพิ่มเทรนเนอร์",
    editTrainer: "แก้ไขเทรนเนอร์",
    trainerList: "รายชื่อเทรนเนอร์",
    trainerCreated: "เพิ่มเทรนเนอร์แล้ว",
    trainerUpdated: "อัปเดตเทรนเนอร์แล้ว",
    trainerDeleted: "ลบเทรนเนอร์แล้ว",
    trainerSearch: "ค้นหาเทรนเนอร์ / role / เกียรติบัตร",
    previousPage: "ก่อนหน้า",
    nextPage: "ถัดไป",
    pageLabel: "หน้า",
    rowsShowing: "รายการที่แสดง",
    slug: "Slug",
    nickname: "ชื่อเล่น",
    avatar: "ไอคอน",
    imageUrl: "URL รูปภาพ",
    uploadImage: "อัปโหลดรูป",
    imagePreview: "รูปภาพ",
    experience: "ประสบการณ์",
    zodiac: "ราศี",
    birthYear: "ปีเกิด",
    bloodType: "กรุ๊ปเลือด",
    contactPhone: "เบอร์ติดต่อ",
    certifications: "เกียรติบัตร",
    certificationsHint: "ใส่ 1 รายการต่อ 1 บรรทัด",
    active: "เปิดใช้งาน",
    inactive: "ปิดใช้งาน",
    statuses: {
      active: "ใช้งาน",
      suspended: "ระงับ",
      deleted: "ลบแล้ว",
      paid: "ชำระแล้ว",
      pending_payment: "รอชำระ",
      hold: "จองค้าง",
      checked_in: "เช็คอินแล้ว",
      cancelled: "ยกเลิก",
      expired: "หมดอายุ",
      created: "สร้างแล้ว",
      failed: "ไม่สำเร็จ",
      refunded: "คืนเงินแล้ว",
      off: "ปิด",
      available: "พร้อมใช้งาน",
      maintenance: "ซ่อมบำรุง",
      hidden: "ซ่อน",
    },
    cols: {
      member: "สมาชิก",
      memberId: "Member ID",
      contact: "ติดต่อ",
      status: "สถานะ",
      booking: "Booking",
      time: "เวลา",
      amount: "ยอด",
      coupon: "คูปอง",
      category: "หมวด",
      price: "ราคา",
      usage: "จำนวนใช้",
      trainer: "เทรนเนอร์",
      role: "บทบาท",
      startPrice: "ราคาเริ่ม",
      payment: "Payment",
      method: "ช่องทาง",
    },
  },
  en: {
    ops: "SPORT COMPLEX OPS",
    eyebrow: "PPA POWER PLAY",
    search: "Search members / bookings / coupons",
    language: "Language",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    refresh: "Refresh",
    home: "Home",
    signedIn: "Signed in",
    editProfile: "Profile",
    logout: "Logout",
    profileTitle: "Profile settings",
    profileSubtitle: "Edit your signed-in account details and password.",
    profileSaved: "Profile saved",
    saveProfile: "Save profile",
    changePassword: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    savePassword: "Save password",
    cancel: "Cancel",
    clockLabel: "Date & Time",
    passwordMismatch: "New passwords do not match",
    passwordChanged: "Password changed",
    changePasswordFailed: "Change password failed",
    currentPasswordIncorrect: "Current password is incorrect",
    usernameTaken: "Username is already used",
    live: "LIVE",
    dashboard: "Dashboard",
    members: "Members",
    staff: "Staff",
    roles: "Staff Roles",
    reports: "Reports",
    coupons: "Coupons",
    bookings: "Bookings",
    trainers: "Trainers",
    audit: "Audit",
    security: "Security",
    system: "System",
    analysis: "Analysis",
    recentBookings: "Recent Bookings",
    recentPayments: "Recent Payments",
    revenueTrend: "Revenue Trend",
    bookingStatus: "Booking Status",
    courtMix: "Courts by Sport",
    operationsPulse: "Operations Pulse",
    financialReport: "Financial Report",
    bookingReport: "Booking Report",
    memberReport: "Member Report",
    reportOverview: "Report Overview",
    reportFinance: "Finance",
    reportBookings: "Bookings",
    reportMembers: "Members",
    reportCoupons: "Coupons",
    reportTrainers: "Trainers",
    reportCourts: "Courts",
    reportEngagement: "Engagement",
    reportAudit: "Audit",
    reportKpi: "Key KPIs",
    reportDetail: "Report Details",
    reportSearchRows: "Search rows",
    reportDateFrom: "Date from",
    reportDateTo: "Date to",
    reportStatus: "Status / type",
    reportAllStatus: "All",
    reportSummary: "Summary",
    reportFilteredRows: "Matched rows",
    reportFilteredAmount: "Total amount",
    reportPageSize: "Per page",
    reportExportAll: "Export all data",
    paidRevenue: "Paid revenue",
    avgBookingValue: "Average booking value",
    pendingBookings: "Pending / hold bookings",
    cancelledBookings: "Cancelled / expired",
    activeCoupons: "Active coupons",
    activeTrainers: "Active trainers",
    trainerAvgPrice: "Average trainer price",
    courtMaintenance: "Courts in maintenance",
    utilizationSignal: "Utilization signal",
    checkinSignal: "Check-in / usage",
    auditEvents: "Audit events",
    highRiskActions: "High-risk actions",
    reportRecommendation: "Operational recommendation",
    totalPaid: "Total Paid",
    paymentRows: "Payment Rows",
    allBookings: "All Bookings",
    allCourts: "Courts",
    allMembers: "Members",
    activeMembers: "Active Members",
    noData: "No data",
    recommendations: "Recommended Systems to Complete Production",
    auditTitle: "System audit trail",
    auditActor: "Actor",
    auditAction: "Action",
    auditTarget: "Target",
    auditMetadata: "Details",
    auditTime: "Time",
    auditEmpty: "No audit logs yet",
    exportCsv: "Export CSV",
    filterAction: "Filter action",
    filterActor: "Search actor / target",
    resetFilter: "Reset filter",
    allActions: "All actions",
    healthTitle: "Production Readiness",
    securityTitle: "Security Control Center",
    systemTitle: "System Health",
    statusReady: "Ready",
    statusWarning: "Review",
    statusRisk: "Risk",
    readinessScore: "Readiness score",
    lastAudit: "Last audit",
    checklistTitle: "Menu completion checklist",
    checklistStatusReady: "Ready",
    checklistStatusNext: "Recommended",
    paidBookingRate: "Paid booking rate",
    availableCourts: "Available courts",
    livePayments: "Live payments",
    total: "total",
    metricMembers: "Members",
    metricMembersHint: "All members in the system",
    metricBookings: "Bookings",
    metricBookingsHint: "Bookings across all statuses",
    metricPaid: "Successful payments",
    metricPaidHint: "Paid payment records",
    metricRevenue: "Revenue",
    metricRevenueHint: "Accumulated paid revenue",
    addStaff: "Add staff",
    editStaff: "Edit staff",
    staffList: "Staff list",
    username: "Username",
    password: "Password",
    passwordUnchanged: "Leave blank to keep unchanged",
    displayName: "Display name",
    email: "Email",
    phone: "Phone",
    role: "Role",
    status: "Status",
    contact: "Contact",
    action: "Action",
    save: "Save",
    add: "Add",
    clear: "Clear",
    edit: "Edit",
    delete: "Delete",
    staffCreated: "Staff created",
    staffUpdated: "Staff updated",
    staffDeleted: "Staff deleted",
    staffSearch: "Search staff / username / role",
    saveFailed: "Save failed",
    deleteFailed: "Delete failed",
    addRole: "Add role",
    editRole: "Edit role and permissions",
    allRoles: "All roles",
    code: "Code",
    thaiName: "Thai name",
    englishName: "English name",
    level: "Level",
    description: "Description",
    savePermissions: "Save permissions",
    roleCreated: "Role created",
    roleUpdated: "Permissions updated",
    roleDeleted: "Role deleted",
    permissionsCount: "permissions",
    addCoupon: "Add coupon",
    editCoupon: "Edit coupon",
    couponList: "Coupon list",
    couponCreated: "Coupon created",
    couponUpdated: "Coupon updated",
    couponDeleted: "Coupon disabled",
    couponSearch: "Search coupon / code / category",
    couponType: "Coupon type",
    couponPreview: "Customer preview",
    couponCodeHint: "Example: FOOD-15 or TENNIS-10",
    totalUses: "Uses / tickets",
    validityDays: "Validity days",
    addTrainer: "Add trainer",
    editTrainer: "Edit trainer",
    trainerList: "Trainer list",
    trainerCreated: "Trainer created",
    trainerUpdated: "Trainer updated",
    trainerDeleted: "Trainer deleted",
    trainerSearch: "Search trainer / role / certification",
    previousPage: "Previous",
    nextPage: "Next",
    pageLabel: "Page",
    rowsShowing: "Showing",
    slug: "Slug",
    nickname: "Nickname",
    avatar: "Icon",
    imageUrl: "Image URL",
    uploadImage: "Upload image",
    imagePreview: "Image",
    experience: "Experience",
    zodiac: "Zodiac",
    birthYear: "Birth year",
    bloodType: "Blood type",
    contactPhone: "Contact phone",
    certifications: "Certifications",
    certificationsHint: "One item per line",
    active: "Active",
    inactive: "Inactive",
    statuses: {
      active: "Active",
      suspended: "Suspended",
      deleted: "Deleted",
      paid: "Paid",
      pending_payment: "Pending payment",
      hold: "On hold",
      checked_in: "Checked in",
      cancelled: "Cancelled",
      expired: "Expired",
      created: "Created",
      failed: "Failed",
      refunded: "Refunded",
      off: "Off",
      available: "Available",
      maintenance: "Maintenance",
      hidden: "Hidden",
    },
    cols: {
      member: "Member",
      memberId: "Member ID",
      contact: "Contact",
      status: "Status",
      booking: "Booking",
      time: "Time",
      amount: "Amount",
      coupon: "Coupon",
      category: "Category",
      price: "Price",
      usage: "Usage",
      trainer: "Trainer",
      role: "Role",
      startPrice: "Start Price",
      payment: "Payment",
      method: "Method",
    },
  },
} as const;

const tabs = [
  ["dashboard", "Dashboard", "dashboard", "📊"],
  ["members", "Members", "members", "👤"],
  ["staff", "Staff", "staff", "🧑‍💼"],
  ["roles", "Roles", "roles", "🛡️"],
  ["reports", "Reports", "reports", "📈"],
  ["coupons", "Coupons", "coupons", "🎟️"],
  ["bookings", "Bookings", "bookings", "📅"],
  ["trainers", "Trainers", "trainers", "🏋️"],
  ["audit", "Audit", "audit", "🧾"],
  ["security", "Security", "security", "🔐"],
  ["system", "System", "system", "🖥️"],
  ["analysis", "Analysis", "analysis", "🧠"],
] as const;

type AdminTab = (typeof tabs)[number][0];
type ReportSection = "overview" | "finance" | "bookings" | "members" | "coupons" | "trainers" | "courts" | "engagement" | "audit";
type AdminNavGroup = { labelTh: string; labelEn: string; items: AdminTab[] };

const reportSectionIds = ["overview", "finance", "bookings", "members", "coupons", "trainers", "courts", "engagement", "audit"] as const;
const adminNavGroups: AdminNavGroup[] = [
  { labelTh: "ภาพรวม", labelEn: "Overview", items: ["dashboard"] },
  { labelTh: "งานบริการหลัก", labelEn: "Core Operations", items: ["bookings", "members", "trainers", "coupons"] },
  { labelTh: "รายงานและวิเคราะห์", labelEn: "Reports & Analytics", items: ["reports", "analysis"] },
  { labelTh: "ทีมงานและสิทธิ์", labelEn: "Team & Access", items: ["staff", "roles"] },
  { labelTh: "ระบบและความปลอดภัย", labelEn: "System & Security", items: ["audit", "security", "system"] },
];

function pageDescription(tab: AdminTab, lang: Lang) {
  const descriptions = {
    th: {
      dashboard: "ศูนย์ควบคุมภาพรวมรายได้ การจอง สนาม และความพร้อมระบบ",
      members: "ค้นหาและตรวจสอบข้อมูลสมาชิก สถานะ และช่องทางติดต่อ",
      bookings: "ติดตามรายการจอง เวลาใช้งาน ยอดชำระ และสถานะสนาม",
      trainers: "จัดการโปรไฟล์ รูปภาพ ราคา และสถานะเทรนเนอร์ของสปอร์ตคอมเพล็กซ์",
      coupons: "ตรวจสอบคูปอง หมวดหมู่ ราคา และการใช้งาน",
      reports: "วิเคราะห์ข้อมูลรายงานพร้อมตัวกรอง สรุปรวม และส่งออก CSV",
      analysis: "รายการตรวจสอบและข้อเสนอแนะเพื่อยกระดับ production",
      staff: "จัดการบัญชีพนักงาน บทบาท สถานะ และการเข้าถึงระบบ",
      roles: "กำหนดสิทธิ์ตามบทบาทและควบคุม permission สำคัญ",
      audit: "ตรวจสอบประวัติการทำงาน การแก้ไข และ action เสี่ยง",
      security: "ติดตามความปลอดภัย LINE-only, admin key และ control สำคัญ",
      system: "ตรวจสถานะระบบ ฐานข้อมูล การแจ้งเตือน และ readiness",
    },
    en: {
      dashboard: "Control revenue, bookings, courts, and system readiness in one view.",
      members: "Search and review member profiles, status, and contact data.",
      bookings: "Track bookings, session times, payments, and court states.",
      trainers: "Manage trainer profiles, photos, prices, and active status.",
      coupons: "Review coupons, categories, pricing, and usage.",
      reports: "Analyze reports with filters, summaries, and CSV export.",
      analysis: "Production checklist and recommendations for system maturity.",
      staff: "Manage staff accounts, roles, status, and system access.",
      roles: "Assign permissions by role and protect critical access.",
      audit: "Review activity logs, edits, and high-risk actions.",
      security: "Monitor LINE-only access, admin key, and security controls.",
      system: "Check database, notifications, system health, and readiness.",
    },
  } as const;
  return descriptions[lang][tab];
}

function reportMenu(t: typeof copy[Lang]): [ReportSection, string, string][] {
  return [
    ["overview", t.reportOverview, "📌"],
    ["finance", t.reportFinance, "💳"],
    ["bookings", t.reportBookings, "📅"],
    ["members", t.reportMembers, "👤"],
    ["coupons", t.reportCoupons, "🎟️"],
    ["trainers", t.reportTrainers, "🏋️"],
    ["courts", t.reportCourts, "🏟️"],
    ["engagement", t.reportEngagement, "📡"],
    ["audit", t.reportAudit, "🧾"],
  ];
}

const recommendations = {
  th: [
    "Booking calendar แบบ resource view รายสนาม: day/week/month, drag-reschedule, block ซ่อมบำรุง, peak/off-peak pricing",
    "ระบบ payment operations: pending/failed queue, refund, void, payment reconciliation, receipt/tax invoice",
    "ระบบ check-in หน้างาน: QR scan, staff override, no-show, late arrival, court handover และ activity log",
    "Member CRM: segment สมาชิก, tag, tier, wallet history, coupon history, PDPA consent, suspend/reactivate",
    "Trainer operations: package, schedule availability, commission, payout, occupancy, rating และ performance report",
    "Coupon campaign builder: usage limit, member segment, expiry, blackout date, fraud checks และ redemption analytics",
    "LINE OA integration: rich menu per role/member tier, notification template, booking reminder, payment reminder, broadcast segment",
    "Admin security: 2FA, session timeout, password policy, OTP confirmation สำหรับ refund/role/payment action",
    "Audit ระดับ production: log ทุก action สำคัญ, IP/user-agent, immutable retention, export audit และ alert action เสี่ยง",
    "Reports: CSV/PDF export, scheduled daily report, utilization heatmap, revenue by court/trainer/sport, cohort และ churn",
    "Inventory/Pro shop: สินค้า, stock, member price, coupon usage, sale report และเชื่อม POS ในอนาคต",
    "Facility maintenance: work order, equipment checklist, court downtime, preventive maintenance และ vendor contact",
    "Notification center: inbox ในแอป, email/SMS fallback, template variables, delivery log และ retry",
    "Data & backup: automated backup monitor, restore drill, data retention, anonymize/delete user และ environment health",
    "Production observability: uptime, slow query, API error rate, payment webhook failure, LINE webhook failure และ alert",
  ],
  en: [
    "Resource booking calendar: day/week/month, drag-reschedule, maintenance blocks, and peak/off-peak pricing.",
    "Payment operations: pending/failed queue, refund, void, reconciliation, receipt, and tax invoice.",
    "On-site check-in: QR scan, staff override, no-show, late arrival, court handover, and activity log.",
    "Member CRM: segments, tags, tiers, wallet history, coupon history, PDPA consent, suspend/reactivate.",
    "Trainer operations: packages, availability, commission, payout, occupancy, rating, and performance reports.",
    "Coupon campaign builder: usage limit, member segment, expiry, blackout date, fraud checks, and redemption analytics.",
    "LINE OA integration: role/tier rich menus, notification templates, booking reminder, payment reminder, segmented broadcast.",
    "Admin security: 2FA, session timeout, password policy, OTP confirmation for refund/role/payment actions.",
    "Production audit: every critical action, IP/user-agent, immutable retention, audit export, and risky-action alerts.",
    "Reports: CSV/PDF export, scheduled reports, utilization heatmap, revenue by court/trainer/sport, cohort, and churn.",
    "Inventory/Pro shop: products, stock, member price, coupon usage, sale report, and future POS integration.",
    "Facility maintenance: work orders, equipment checklist, court downtime, preventive maintenance, and vendor contacts.",
    "Notification center: in-app inbox, email/SMS fallback, template variables, delivery log, and retry.",
    "Data and backup: automated backup monitor, restore drill, retention, anonymize/delete user, and environment health.",
    "Production observability: uptime, slow query, API error rate, payment webhook failure, LINE webhook failure, and alerts.",
  ],
};

const roadmap = {
  th: [
    { phase: "Phase 1 · ต้องทำก่อน Production", items: ["Admin session + 2FA", "Booking calendar รายสนาม", "Payment queue/refund/reconciliation", "Audit log พร้อม IP/user-agent", "Backup monitor และ restore test"] },
    { phase: "Phase 2 · ทำให้ Operations ใช้งานจริงเร็ว", items: ["Check-in QR หน้างาน", "LINE reminder และ notification template", "Member CRM + segment", "Trainer package/commission", "Maintenance block และ work order"] },
    { phase: "Phase 3 · ทำให้ธุรกิจโต", items: ["Coupon campaign builder", "Revenue/utilization heatmap", "Scheduled executive report", "Pro shop/POS integration", "Loyalty tier และ campaign automation"] },
    { phase: "Phase 4 · Enterprise readiness", items: ["Immutable audit retention", "PDPA export/delete/anonymize", "Role approval workflow", "Webhook monitoring", "Multi-branch support"] },
  ],
  en: [
    { phase: "Phase 1 · Production essentials", items: ["Admin sessions + 2FA", "Resource booking calendar", "Payment queue/refund/reconciliation", "Audit logs with IP/user-agent", "Backup monitor and restore test"] },
    { phase: "Phase 2 · Faster operations", items: ["On-site QR check-in", "LINE reminders and templates", "Member CRM + segments", "Trainer packages/commission", "Maintenance blocks and work orders"] },
    { phase: "Phase 3 · Business growth", items: ["Coupon campaign builder", "Revenue/utilization heatmaps", "Scheduled executive reports", "Pro shop/POS integration", "Loyalty tiers and campaign automation"] },
    { phase: "Phase 4 · Enterprise readiness", items: ["Immutable audit retention", "PDPA export/delete/anonymize", "Role approval workflow", "Webhook monitoring", "Multi-branch support"] },
  ],
};

const completionChecklist = {
  th: [
    { menu: "ภาพรวม", items: [{ ready: true, text: "มี KPI, หลายกราฟ, action queue และ operational signal" }, { ready: false, text: "เพิ่ม filter ช่วงเวลา/สาขา/กีฬา และ alert KPI ผิดปกติแบบ real-time" }] },
    { menu: "ระบบจอง", items: [{ ready: true, text: "มีรายการจองและสถานะพื้นฐาน" }, { ready: false, text: "เพิ่ม calendar รายสนาม, drag/drop, recurring booking, waiting list, maintenance block และ no-show" }] },
    { menu: "สมาชิก", items: [{ ready: true, text: "ดูสมาชิกและสถานะจากฐานข้อมูลจริง" }, { ready: false, text: "เพิ่ม edit/suspend, segment, tag, tier, PDPA consent, wallet/coupon/package history รายคน" }] },
    { menu: "เทรนเนอร์", items: [{ ready: true, text: "เพิ่ม แก้ไข ลบ รูปภาพ ค้นหา และแบ่งหน้า" }, { ready: false, text: "เพิ่ม schedule availability, package, commission, payout, rating และ occupancy report" }] },
    { menu: "คูปอง", items: [{ ready: true, text: "มีรายการคูปองและสถานะ" }, { ready: false, text: "เพิ่ม campaign builder, segment, usage limit, blackout date, redemption analytics และ fraud checks" }] },
    { menu: "การเงิน", items: [{ ready: true, text: "มีรายงาน payment และยอดรวม" }, { ready: false, text: "เพิ่ม refund/void, reconciliation, receipt/tax invoice, failed payment queue และ webhook retry" }] },
    { menu: "พนักงานและสิทธิ์", items: [{ ready: true, text: "มี CRUD พนักงาน, role, permission และ profile modal" }, { ready: false, text: "เพิ่ม session login, 2FA, approval workflow, prevent self-escalation และ password policy" }] },
    { menu: "รายงาน", items: [{ ready: true, text: "มี filter, date range, summary, pagination และ CSV export" }, { ready: false, text: "เพิ่ม PDF export, scheduled report, heatmap, cohort, churn และ profit by court/trainer/sport" }] },
    { menu: "LINE และ Notification", items: [{ ready: false, text: "เพิ่ม LINE rich menu ตาม role/tier, booking/payment reminder, broadcast segment และ delivery log" }, { ready: false, text: "เพิ่ม inbox ในแอป, email/SMS fallback และ template variables" }] },
    { menu: "ตรวจสอบและความปลอดภัย", items: [{ ready: true, text: "มี audit log และ security readiness เบื้องต้น" }, { ready: false, text: "เพิ่ม IP/user-agent, immutable log, risky action alert, 2FA, session timeout และ OTP confirm" }] },
    { menu: "ระบบและข้อมูล", items: [{ ready: true, text: "มี health checklist และ database pool retry" }, { ready: false, text: "เพิ่ม backup monitor, restore drill, slow query, uptime, webhook failure alert และ data retention" }] },
  ],
  en: [
    { menu: "Dashboard", items: [{ ready: true, text: "KPIs, multiple charts, action queue, and operational signals" }, { ready: false, text: "Add period/branch/sport filters and real-time abnormal KPI alerts" }] },
    { menu: "Bookings", items: [{ ready: true, text: "Booking list and basic status are available" }, { ready: false, text: "Add resource calendar, drag/drop, recurring bookings, waiting list, maintenance blocks, and no-show" }] },
    { menu: "Members", items: [{ ready: true, text: "View members and statuses from live data" }, { ready: false, text: "Add edit/suspend, segments, tags, tiers, PDPA consent, and per-member wallet/coupon/package history" }] },
    { menu: "Trainers", items: [{ ready: true, text: "Create, update, delete, image upload, search, and pagination" }, { ready: false, text: "Add availability, packages, commission, payout, rating, and occupancy reports" }] },
    { menu: "Coupons", items: [{ ready: true, text: "Coupon list and status are available" }, { ready: false, text: "Add campaign builder, segments, usage limits, blackout dates, redemption analytics, and fraud checks" }] },
    { menu: "Finance", items: [{ ready: true, text: "Payment report and summary are available" }, { ready: false, text: "Add refund/void, reconciliation, receipt/tax invoice, failed-payment queue, and webhook retry" }] },
    { menu: "Staff & Roles", items: [{ ready: true, text: "Staff CRUD, role, permission, and profile modal" }, { ready: false, text: "Add login sessions, 2FA, approval workflow, self-escalation prevention, and password policy" }] },
    { menu: "Reports", items: [{ ready: true, text: "Filters, date range, summary, pagination, and CSV export" }, { ready: false, text: "Add PDF export, scheduled reports, heatmaps, cohort, churn, and profit by court/trainer/sport" }] },
    { menu: "LINE & Notification", items: [{ ready: false, text: "Add LINE rich menus by role/tier, booking/payment reminders, segmented broadcast, and delivery logs" }, { ready: false, text: "Add in-app inbox, email/SMS fallback, and template variables" }] },
    { menu: "Audit & Security", items: [{ ready: true, text: "Basic audit log and security readiness exist" }, { ready: false, text: "Add IP/user-agent, immutable logs, risky-action alerts, 2FA, session timeout, and OTP confirmation" }] },
    { menu: "System & Data", items: [{ ready: true, text: "Health checklist and database pool retry exist" }, { ready: false, text: "Add backup monitor, restore drill, slow query, uptime, webhook failure alerts, and data retention" }] },
  ],
};

export function AdminConsole({ adminKey, data, initialReportSection, initialTab = "dashboard" }: { adminKey: string; data: AdminConsoleData; initialReportSection?: string; initialTab?: string }) {
  const [tab, setTab] = useState<AdminTab>(isAdminTab(initialTab) ? initialTab : "dashboard");
  const initialReport = isReportSection(initialReportSection || null) ? initialReportSection as ReportSection : "overview";
  const [reportSection, setReportSection] = useState<ReportSection>(initialReport);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<Lang>("th");
  const [theme, setTheme] = useState<Theme>("dark");
  const [staffRows, setStaffRows] = useState(data.staff);
  const [couponRows, setCouponRows] = useState(data.coupons);
  const [trainerRows, setTrainerRows] = useState(data.trainers);
  const [roleRows, setRoleRows] = useState(data.roles);
  const [permissionRows, setPermissionRows] = useState(data.permissions);
  const [adminMessage, setAdminMessage] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [clockText, setClockText] = useState("");
  const t = copy[lang];

  useEffect(() => {
    const updateClock = () => {
      setClockText(new Date().toLocaleString(lang === "th" ? "th-TH" : "en-US", { dateStyle: "medium", timeStyle: "short" }));
    };
    updateClock();
    const timer = window.setInterval(updateClock, 30_000);
    return () => window.clearInterval(timer);
  }, [lang]);

  useEffect(() => {
    const syncFromPath = () => {
      const section = window.location.pathname.split("/").filter(Boolean)[1] || "dashboard";
      if (isAdminTab(section)) {
        setTab(section);
        setReportMenuOpen(section === "reports");
      }
      const nextReport = new URLSearchParams(window.location.search).get("report");
      setReportSection(isReportSection(nextReport) ? nextReport : "overview");
    };
    window.addEventListener("popstate", syncFromPath);
    return () => window.removeEventListener("popstate", syncFromPath);
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.users;
    return data.users.filter((user) => `${user.displayName} ${user.memberCode} ${user.phone || ""} ${user.email || ""}`.toLowerCase().includes(needle));
  }, [data.users, query]);

  const activeTab = tabs.find(([id]) => id === tab);
  const currentAdminRaw = data.currentAdmin || staffRows.find((row) => row.roleCode === "super_admin") || staffRows[0] || null;
  const currentAdmin = currentAdminRaw?.username === "zeroline" ? { ...currentAdminRaw, displayName: "i'm zΞro" } : currentAdminRaw;
  const searchScope = activeTab ? t[activeTab[2]] : t.dashboard;
  const currentTitle = activeTab ? t[activeTab[2]] : t.dashboard;
  const currentDescription = pageDescription(tab, lang);
  const showHeaderSearch = tab === "members";
  const adminPath = (id: AdminTab, section = reportSection) => {
    const path = id === "dashboard" ? "/AdminConsole" : `/AdminConsole/${id}`;
    const params = new URLSearchParams();
    if (adminKey) params.set("key", adminKey);
    if (id === "reports" && section !== "overview") params.set("report", section);
    const queryText = params.toString();
    return queryText ? `${path}?${queryText}` : path;
  };
  const goTab = (id: AdminTab) => {
    setTab(id);
    setReportMenuOpen(id === "reports");
    window.history.pushState({}, "", adminPath(id));
  };
  const toggleReportMenu = () => {
    if (tab !== "reports") {
      goTab("reports");
      return;
    }
    setReportMenuOpen((open) => !open);
  };
  const goReport = (section: ReportSection) => {
    setReportSection(section);
    setTab("reports");
    setReportMenuOpen(true);
    window.history.pushState({}, "", adminPath("reports", section));
  };
  const logout = () => {
    window.location.assign("/AdminConsole");
  };
  const reportTabs = reportMenu(t);

  return (
    <main className="admin admin-console" data-theme={theme}>
      <aside className="admin-sidebar">
        <div className="admin-logo">PPA<span>.</span></div>
        <small>{t.ops}</small>
        <nav>
          {adminNavGroups.map((group) => (
            <section className="admin-nav-section" key={group.labelEn}>
              <p>{lang === "th" ? group.labelTh : group.labelEn}</p>
              {group.items.map((itemId) => {
                const item = tabs.find(([id]) => id === itemId);
                if (!item) return null;
                const [id, , key, icon] = item;
                return (
                  <div className="admin-nav-group" key={id}>
                    <button
                      aria-expanded={id === "reports" ? reportMenuOpen : undefined}
                      className={`${tab === id ? "on" : ""} ${id === "reports" && reportMenuOpen ? "expanded" : ""}`}
                      onClick={() => (id === "reports" ? toggleReportMenu() : goTab(id))}
                      type="button"
                    >
                      <i>{icon}</i><b>{t[key]}</b>
                      {id === "reports" ? <em className="admin-nav-caret">⌄</em> : null}
                    </button>
                    {id === "reports" && reportMenuOpen ? (
                      <div className="admin-subnav">
                        {reportTabs.map(([section, label]) => (
                          <button className={reportSection === section ? "on" : ""} key={section} type="button" onClick={() => goReport(section)}>
                            <span className="admin-subnav-prefix">-</span><b>{label}</b>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))}
        </nav>
      </aside>
      <section className="admin-main">
        <nav className="admin-navbar">
          <button className="admin-nav-home" type="button" onClick={() => goTab("dashboard")}>
            <span>⌂</span>{t.home}
          </button>
          <div className="admin-nav-tools">
            <Segment label={t.language} value={lang} options={[["th", "ไทย"], ["en", "EN"]]} onChange={(value) => setLang(value as Lang)} />
            <Segment label={t.theme} value={theme} options={[["dark", t.dark], ["light", t.light]]} onChange={(value) => setTheme(value as Theme)} />
            <div className="admin-clock"><small>{t.clockLabel}</small><b>{clockText || "-"}</b></div>
            {currentAdmin ? <AdminProfile admin={currentAdmin} lang={lang} onLogout={logout} t={t} onOpenProfile={() => setProfileOpen(true)} /> : null}
          </div>
        </nav>

        {profileOpen && currentAdmin ? (
          <ProfileModal admin={currentAdmin} adminKey={adminKey} lang={lang} onClose={() => setProfileOpen(false)} onProfileSaved={setStaffRows} t={t} />
        ) : null}

        <header className="admin-top">
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h1>{currentTitle}</h1>
            <span>{currentDescription}</span>
          </div>
          <div className={`admin-page-toolbar ${showHeaderSearch ? "" : "compact"}`} aria-label={t.search}>
            <button className="admin-refresh" type="button" onClick={() => window.location.reload()}><span>↻</span>{t.refresh}</button>
            {showHeaderSearch ? (
              <label className="admin-page-search">
                <span>{searchScope}</span>
                <input placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
            ) : null}
          </div>
        </header>

        {tab === "dashboard" && <Dashboard data={data} lang={lang} t={t} />}
        {tab === "members" && <Panel title={t.members}><MemberTable rows={filteredUsers} lang={lang} t={t} /></Panel>}
        {tab === "staff" && (
          <StaffManager
            adminKey={adminKey}
            lang={lang}
            message={adminMessage}
            roles={roleRows}
            rows={staffRows}
            setMessage={setAdminMessage}
            setRows={setStaffRows}
            t={t}
          />
        )}
        {tab === "roles" && (
          <RoleManager
            adminKey={adminKey}
            lang={lang}
            message={adminMessage}
            permissions={permissionRows}
            rows={roleRows}
            setMessage={setAdminMessage}
            setPermissions={setPermissionRows}
            setRows={setRoleRows}
            t={t}
          />
        )}
        {tab === "reports" && <Reports data={data} lang={lang} section={reportSection} t={t} />}
        {tab === "coupons" && <CouponManager adminKey={adminKey} lang={lang} message={adminMessage} rows={couponRows} setMessage={setAdminMessage} setRows={setCouponRows} t={t} />}
        {tab === "bookings" && <Panel title={t.bookings}><BookingTable rows={data.bookings} lang={lang} t={t} /></Panel>}
        {tab === "trainers" && (
          <TrainerManager
            adminKey={adminKey}
            lang={lang}
            message={adminMessage}
            rows={trainerRows}
            setMessage={setAdminMessage}
            setRows={setTrainerRows}
            t={t}
          />
        )}
        {tab === "audit" && <AuditTrail lang={lang} rows={data.auditLogs} t={t} />}
        {tab === "security" && <SystemStatusPanel lang={lang} rows={data.securityItems} scoreItems={[...data.securityItems, ...data.systemHealth]} title={t.securityTitle} t={t} />}
        {tab === "system" && <SystemStatusPanel lang={lang} rows={data.systemHealth} scoreItems={[...data.securityItems, ...data.systemHealth]} title={t.systemTitle} t={t} />}
        {tab === "analysis" && <Analysis lang={lang} t={t} />}
      </section>
    </main>
  );
}

function AdminProfile({ admin, lang, onLogout, onOpenProfile, t }: { admin: AdminStaff; lang: Lang; onLogout: () => void; onOpenProfile: () => void; t: typeof copy[Lang] }) {
  return (
    <div className="admin-profile-chip">
      <div className="admin-avatar">{initials(admin.displayName || admin.username)}</div>
      <div>
        <small>{t.signedIn}</small>
        <b>{admin.displayName}</b>
        <span>{lang === "th" ? admin.roleNameTh : admin.roleNameEn}</span>
      </div>
      <div className="admin-profile-actions">
        <button type="button" onClick={onOpenProfile}>{t.editProfile}</button>
        <button className="ghost" type="button" onClick={onLogout}>{t.logout}</button>
      </div>
    </div>
  );
}

function ProfileModal({
  admin,
  adminKey,
  lang,
  onClose,
  onProfileSaved,
  t,
}: {
  admin: AdminStaff;
  adminKey: string;
  lang: Lang;
  onClose: () => void;
  onProfileSaved: (rows: AdminStaff[]) => void;
  t: typeof copy[Lang];
}) {
  const [profileForm, setProfileForm] = useState({
    username: admin.username,
    displayName: admin.username === "zeroline" ? "i'm zΞro" : admin.displayName,
    email: admin.email || "",
    phone: admin.phone || "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const saveAll = async () => {
    setMessage("");
    const wantsPasswordChange = Boolean(currentPassword || newPassword || confirmPassword);
    if (wantsPasswordChange && newPassword !== confirmPassword) return setMessage(t.passwordMismatch);
    setBusy(true);
    try {
      const profileResponse = await adminFetch(adminKey, "/api/admin/profile", {
        method: "PUT",
        body: JSON.stringify({ staffId: admin.id, ...profileForm }),
      });
      const profileResult = await profileResponse.json();
      if (!profileResponse.ok) return setMessage(profileErrorMessage(profileResult.message, t));
      onProfileSaved(profileResult.staff);

      if (wantsPasswordChange) {
        const passwordResponse = await adminFetch(adminKey, "/api/admin/profile/password", {
          method: "PUT",
          body: JSON.stringify({ staffId: admin.id, currentPassword, newPassword }),
        });
        const passwordResult = await passwordResponse.json();
        if (!passwordResponse.ok) return setMessage(passwordErrorMessage(passwordResult.message, t));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
      setMessage(wantsPasswordChange ? `${t.profileSaved} · ${t.passwordChanged}` : t.profileSaved);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
      <section className="admin-modal admin-profile-modal">
        <header>
          <div><small>{t.signedIn}</small><h2>{t.profileTitle}</h2><span>{t.profileSubtitle}</span></div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="admin-profile-modal-grid">
          <section className="admin-profile-card">
            <div className="admin-profile-large-avatar">{initials(profileForm.displayName || profileForm.username)}</div>
            <b>{profileForm.displayName || admin.displayName}</b>
            <span>{profileForm.username} · {admin.roleCode}</span>
            <small>{lang === "th" ? admin.roleNameTh : admin.roleNameEn}</small>
          </section>
          <section className="admin-profile-form">
            <h3>{t.profileTitle}</h3>
            <div className="admin-form">
              <label>{t.username}<input value={profileForm.username} onChange={(event) => setProfileForm({ ...profileForm, username: event.target.value })} /></label>
              <label>{t.displayName}<input value={profileForm.displayName} onChange={(event) => setProfileForm({ ...profileForm, displayName: event.target.value })} /></label>
              <label>{t.email}<input value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} /></label>
              <label>{t.phone}<input value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} /></label>
            </div>
          </section>
          <section className="admin-profile-form wide">
            <h3>{t.changePassword}</h3>
            <div className="admin-form">
              <label>{t.currentPassword}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
              <label>{t.newPassword}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
              <label>{t.confirmPassword}<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
            </div>
          </section>
          {message ? <p className="admin-message wide">{message}</p> : null}
          <div className="admin-profile-modal-actions">
            <button disabled={busy} type="button" onClick={saveAll}>{t.save}</button>
            <button className="ghost" type="button" onClick={onClose}>{t.cancel}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Segment({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <div className="admin-segment" aria-label={label}>
      <small>{label}</small>
      {options.map(([id, text]) => (
        <button className={value === id ? "on" : ""} key={id} type="button" onClick={() => onChange(id)}>{text}</button>
      ))}
    </div>
  );
}

function Dashboard({ data, lang, t }: { data: AdminConsoleData; lang: Lang; t: typeof copy[Lang] }) {
  const revenue = useMemo(() => buildRevenueBars(data.payments, lang), [data.payments, lang]);
  const bookingActivity = useMemo(() => buildBookingActivityBars(data.bookings, lang), [data.bookings, lang]);
  const statuses = useMemo(() => buildStatusBars(data.bookings), [data.bookings]);
  const courts = useMemo(() => buildCourtBars(data.courts), [data.courts]);
  const courtStatus = useMemo(() => buildCourtStatusBars(data.courts), [data.courts]);
  const paymentMethods = useMemo(() => buildPaymentMethodBars(data.payments), [data.payments]);
  const memberStatus = useMemo(() => buildMemberStatusBars(data.users), [data.users]);
  const trainerPrices = useMemo(() => buildTrainerPriceBars(data.trainers), [data.trainers]);
  const totalBookings = data.bookings.length || 1;
  const paidBookings = data.bookings.filter((booking) => booking.status === "paid").length;
  const checkedInBookings = data.bookings.filter((booking) => booking.status === "checked_in").length;
  const pendingBookings = data.bookings.filter((booking) => ["hold", "pending_payment"].includes(booking.status)).length;
  const paidRevenue = data.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const activeCourts = data.courts.filter((court) => court.status === "available").length;
  const maintenanceCourts = data.courts.filter((court) => court.status === "maintenance").length;
  const activeMembers = data.users.filter((user) => user.status === "active").length;
  const activeTrainers = data.trainers.filter((trainer) => Boolean(trainer.active)).length;
  const avgBookingValue = data.bookings.length ? Math.round(data.bookings.reduce((sum, booking) => sum + Number(booking.amount || 0), 0) / data.bookings.length) : 0;
  const paidRate = Math.round((paidBookings / totalBookings) * 100);
  const courtReadyRate = data.courts.length ? Math.round((activeCourts / data.courts.length) * 100) : 0;
  const metrics = translatedMetrics(data.metrics, t);
  const readinessScore = readiness(data.securityItems, data.systemHealth);
  const lastAudit = data.auditLogs[0];
  const dashboardCopy = lang === "th" ? {
    title: "Sport Complex Command Center",
    subtitle: "มองภาพรวมรายได้ การจอง สนาม ทีมเทรนเนอร์ และความพร้อมระบบในหน้าเดียว",
    live: "LIVE OPERATIONS",
    paidRate: "อัตราชำระ",
    courtReady: "สนามพร้อม",
    todaySignal: "สัญญาณวันนี้",
    bookingActivity: "กิจกรรมการจอง 7 วัน",
    paymentMethod: "รายได้แยกช่องทางชำระ",
    memberStatus: "สถานะสมาชิก",
    trainerPrice: "ราคาเทรนเนอร์แนะนำ",
    capacity: "สนามและความพร้อม",
    revenueHint: "ยอดรับชำระสำเร็จ",
    averageSpend: "ค่าเฉลี่ยต่อการจอง",
    checkedIn: "เข้าใช้งานแล้ว",
    pending: "รอดำเนินการ",
    actionQueue: "คิวงานผู้จัดการ",
    pendingPayment: "ติดตามรอชำระ",
    reviewAudit: "ตรวจ Audit เสี่ยง",
    reviewSystem: "รายการระบบต้องตรวจ",
    courtAttention: "สนามที่ต้องดูแล",
  } : {
    title: "Sport Complex Command Center",
    subtitle: "Revenue, bookings, courts, trainers, and system readiness in one operational view.",
    live: "LIVE OPERATIONS",
    paidRate: "Paid rate",
    courtReady: "Court ready",
    todaySignal: "Today signal",
    bookingActivity: "7-day booking activity",
    paymentMethod: "Revenue by payment method",
    memberStatus: "Member status",
    trainerPrice: "Trainer starting price mix",
    capacity: "Court capacity and readiness",
    revenueHint: "Successful paid revenue",
    averageSpend: "Average booking value",
    checkedIn: "Checked in",
    pending: "Pending",
    actionQueue: "Manager action queue",
    pendingPayment: "Follow pending payments",
    reviewAudit: "Review risky audit",
    reviewSystem: "System items to review",
    courtAttention: "Courts needing attention",
  };
  const actionQueue = [
    { label: dashboardCopy.pendingPayment, value: pendingBookings, hint: t.pendingBookings, tone: pendingBookings ? "warn" : "good" },
    { label: dashboardCopy.courtAttention, value: maintenanceCourts, hint: t.courtMaintenance, tone: maintenanceCourts ? "warn" : "good" },
    { label: dashboardCopy.reviewAudit, value: data.auditLogs.filter((log) => log.action.includes("delete") || log.action.includes("password")).length, hint: t.highRiskActions, tone: data.auditLogs.some((log) => log.action.includes("delete") || log.action.includes("password")) ? "warn" : "good" },
    { label: dashboardCopy.reviewSystem, value: [...data.securityItems, ...data.systemHealth].filter((item) => item.status !== "good").length, hint: t.statusWarning, tone: [...data.securityItems, ...data.systemHealth].some((item) => item.status === "bad") ? "bad" : [...data.securityItems, ...data.systemHealth].some((item) => item.status === "warn") ? "warn" : "good" },
  ] satisfies { label: string; value: number; hint: string; tone: AdminStatusTone }[];

  return (
    <>
      <section className="admin-dashboard-hero">
        <div>
          <p>{dashboardCopy.live}</p>
          <h2>{dashboardCopy.title}</h2>
          <span>{dashboardCopy.subtitle}</span>
          <div className="admin-hero-stats">
            <b>{money(paidRevenue, lang)} ฿<small>{dashboardCopy.revenueHint}</small></b>
            <b>{money(avgBookingValue, lang)} ฿<small>{dashboardCopy.averageSpend}</small></b>
            <b>{activeTrainers}<small>{t.activeTrainers}</small></b>
          </div>
        </div>
        <div className="admin-hero-rings">
          <RingMetric label={dashboardCopy.paidRate} value={paidRate} hint={`${paidBookings}/${data.bookings.length}`} />
          <RingMetric label={dashboardCopy.courtReady} value={courtReadyRate} hint={`${activeCourts}/${data.courts.length}`} />
          <RingMetric label={t.readinessScore} value={readinessScore} hint={readinessScore >= 80 ? t.statusReady : t.statusWarning} />
        </div>
      </section>

      <div className="admin-kpi-grid">
        {metrics.map((metric) => (
          <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></article>
        ))}
      </div>

      <div className="admin-dashboard-grid">
        <Panel title={t.revenueTrend}><BarChart rows={revenue} moneyBars /></Panel>
        <Panel title={dashboardCopy.bookingActivity}><BarChart rows={bookingActivity} /></Panel>
        <Panel title={t.bookingStatus}><DonutSummary rows={statuses} t={t} /></Panel>
        <Panel title={dashboardCopy.paymentMethod}><BarChart rows={paymentMethods} moneyBars /></Panel>
        <Panel title={t.courtMix}><BarChart rows={courts} /></Panel>
        <Panel title={dashboardCopy.memberStatus}><DonutSummary rows={memberStatus} t={t} /></Panel>
        <Panel title={dashboardCopy.trainerPrice}><BarChart rows={trainerPrices} moneyBars /></Panel>
        <Panel title={dashboardCopy.capacity}><CapacityGrid rows={courtStatus} t={t} /></Panel>
        <Panel title={t.operationsPulse}>
          <div className="admin-pulse-grid">
            <PulseCard label={t.paidBookingRate} value={`${paidRate}%`} hint={`${paidBookings}/${data.bookings.length}`} />
            <PulseCard label={t.availableCourts} value={activeCourts} hint={`${data.courts.length} ${t.total}`} />
            <PulseCard label={dashboardCopy.checkedIn} value={checkedInBookings} hint={`${data.bookings.length} ${t.allBookings}`} />
            <PulseCard label={dashboardCopy.pending} value={pendingBookings} hint={t.pendingBookings} />
            <PulseCard label={t.activeMembers} value={activeMembers} hint={`${data.users.length} ${t.allMembers}`} />
            <PulseCard label={t.courtMaintenance} value={maintenanceCourts} hint={`${data.courts.length} ${t.allCourts}`} />
            <PulseCard label={t.livePayments} value={data.payments.length} hint={t.live} />
            <PulseCard label={t.readinessScore} value={`${readinessScore}%`} hint={readinessScore >= 80 ? t.statusReady : t.statusWarning} />
            <PulseCard label={t.lastAudit} value={lastAudit ? auditActionLabel(lastAudit.action, lang) : "-"} hint={lastAudit ? formatDate(lastAudit.createdAt, lang) : t.noData} />
          </div>
        </Panel>
        <Panel title={dashboardCopy.actionQueue}><ActionQueue rows={actionQueue} /></Panel>
      </div>

      <div className="admin-panels">
        <Panel title={t.recentBookings}><BookingTable rows={data.bookings.slice(0, 6)} lang={lang} t={t} /></Panel>
        <Panel title={t.recentPayments}><PaymentTable rows={data.payments.slice(0, 6)} lang={lang} t={t} /></Panel>
      </div>
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="admin-panel"><h2>{title}</h2>{children}</section>;
}

function MemberTable({ rows, lang, t }: { rows: AdminUser[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.cols.member}</th><th>{t.cols.memberId}</th><th>{t.cols.contact}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.displayName}<small>{formatDate(r.createdAt || "", lang)}</small></td><td>{r.memberCode}</td><td>{r.phone || r.email || "-"}</td><td><Badge tone={r.status === "active" ? "good" : "bad"}>{statusLabel(r.status, t)}</Badge></td></tr>)}</tbody></table>;
}

function BookingTable({ rows, lang, t }: { rows: AdminBooking[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.cols.booking}</th><th>{t.cols.member}</th><th>{t.cols.time}</th><th>{t.cols.amount}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.bookingNo}><td>{r.title}<small>{r.bookingNo}</small></td><td>{r.displayName}</td><td>{formatDate(r.startsAt, lang)}</td><td>{money(r.amount, lang)} ฿</td><td><Badge tone={r.status === "paid" ? "good" : "warn"}>{statusLabel(r.status, t)}</Badge></td></tr>)}</tbody></table>;
}

function CouponTable({ rows, lang, t }: { rows: AdminCoupon[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.cols.coupon}</th><th>{t.cols.category}</th><th>{t.cols.price}</th><th>{t.cols.usage}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}<small>{r.code}</small></td><td>{r.category}</td><td>{money(r.price, lang)} ฿</td><td>{r.totalUses} / {r.validityDays}d</td><td><Badge tone={r.active ? "good" : "bad"}>{statusLabel(r.active ? "active" : "off", t)}</Badge></td></tr>)}</tbody></table>;
}

function TrainerTable({ rows, lang, t }: { rows: AdminTrainer[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.imagePreview}</th><th>{t.cols.trainer}</th><th>{t.cols.role}</th><th>{t.experience}</th><th>{t.cols.startPrice}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><TrainerPhoto row={r} /></td><td>{r.name}<small>{r.nickname} · {r.slug}</small></td><td>{r.role}</td><td>{r.experience}</td><td>{money(r.startPrice, lang)} ฿</td><td><Badge tone={r.active ? "good" : "bad"}>{statusLabel(r.active ? "active" : "off", t)}</Badge></td></tr>)}</tbody></table>;
}

function PaymentTable({ rows, lang, t }: { rows: AdminPayment[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.cols.payment}</th><th>{t.cols.member}</th><th>{t.cols.method}</th><th>{t.cols.amount}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.paymentNo}><td>{r.paymentNo}<small>{formatDate(r.paidAt || "", lang)}</small></td><td>{r.displayName}</td><td>{r.method}</td><td>{money(r.amount, lang)} ฿</td><td><Badge tone={r.status === "paid" ? "good" : "warn"}>{statusLabel(r.status, t)}</Badge></td></tr>)}</tbody></table>;
}

function ReportDataList<T>({
  amountLabel,
  dateGetter,
  filename,
  lang,
  renderTable,
  rows,
  searchText,
  statusGetter,
  t,
  title,
}: {
  amountLabel?: string;
  dateGetter?: (row: T) => string | null | undefined;
  filename: string;
  lang: Lang;
  renderTable: (rows: T[]) => React.ReactNode;
  rows: T[];
  searchText: (row: T) => string;
  statusGetter?: (row: T) => string | null | undefined;
  t: typeof copy[Lang];
  title: string;
}) {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const statusOptions = useMemo(() => {
    if (!statusGetter) return [];
    return Array.from(new Set(rows.map((row) => statusGetter(row)).filter(Boolean) as string[])).sort();
  }, [rows, statusGetter]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return rows.filter((row) => {
      const rowText = searchText(row).toLowerCase();
      const textMatches = !needle || rowText.includes(needle);
      const rowStatus = statusGetter?.(row) || "";
      const statusMatches = !status || rowStatus === status;
      const rawDate = dateGetter?.(row);
      const dateValue = rawDate ? new Date(rawDate).getTime() : null;
      const dateMatches = !dateGetter || ((!fromTime || (dateValue !== null && dateValue >= fromTime)) && (!toTime || (dateValue !== null && dateValue <= toTime)));
      return textMatches && statusMatches && dateMatches;
    });
  }, [dateFrom, dateGetter, dateTo, query, rows, searchText, status, statusGetter]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, pageSize, query, status]);

  return (
    <Panel title={title}>
      <div className="admin-report-list">
        <div className="admin-filterbar">
          <label>{t.reportSearchRows}<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          {dateGetter ? <label>{t.reportDateFrom}<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label> : null}
          {dateGetter ? <label>{t.reportDateTo}<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label> : null}
          {statusGetter ? <label>{t.reportStatus}<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t.reportAllStatus}</option>{statusOptions.map((item) => <option key={item} value={item}>{statusLabel(item, t)}</option>)}</select></label> : null}
          <label>{t.reportPageSize}<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
          <button type="button" onClick={() => { setQuery(""); setDateFrom(""); setDateTo(""); setStatus(""); }}>{t.resetFilter}</button>
          <ExportButton label={t.exportCsv} filename={filename} rows={filteredRows.map((row) => row as Record<string, unknown>)} />
        </div>
        <div className="admin-report-summary">
          <article><span>{t.total}</span><b>{rows.length}</b><small>{t.reportSummary}</small></article>
          <article><span>{t.reportFilteredRows}</span><b>{filteredRows.length}</b><small>{t.rowsShowing} {pagedRows.length}</small></article>
          <article><span>{amountLabel || t.reportSummary}</span><b>{amountLabel ? `${money(sumReportAmount(filteredRows), lang)} ฿` : filteredRows.length}</b><small>{t.total}</small></article>
        </div>
        {renderTable(pagedRows)}
        <div className="admin-pagination">
          <button disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))}>{t.previousPage}</button>
          <span>{t.pageLabel} {currentPage} / {totalPages}</span>
          <button disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))}>{t.nextPage}</button>
        </div>
      </div>
    </Panel>
  );
}

function sumReportAmount<T>(rows: T[]) {
  return rows.reduce((sum, row) => {
    const value = row && typeof row === "object" && "amount" in row ? Number((row as { amount?: unknown }).amount || 0) : 0;
    return sum + value;
  }, 0);
}

function CouponManager({
  adminKey,
  lang,
  message,
  rows,
  setMessage,
  setRows,
  t,
}: {
  adminKey: string;
  lang: Lang;
  message: string;
  rows: AdminCoupon[];
  setMessage: (message: string) => void;
  setRows: (rows: AdminCoupon[]) => void;
  t: typeof copy[Lang];
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [couponSearch, setCouponSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 8;
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "fitness",
    price: 0,
    totalUses: 1,
    validityDays: 30,
    active: true,
  });
  const filteredRows = useMemo(() => {
    const needle = couponSearch.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.code} ${row.name} ${row.category} ${row.price} ${row.totalUses} ${row.validityDays}`.toLowerCase().includes(needle));
  }, [couponSearch, rows]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / perPage), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * perPage, currentPage * perPage);

  const reset = () => {
    setEditingId(null);
    setForm({ code: "", name: "", category: "fitness", price: 0, totalUses: 1, validityDays: 30, active: true });
  };
  const openCreate = () => {
    reset();
    setMessage("");
    setModalOpen(true);
  };
  const edit = (row: AdminCoupon) => {
    setEditingId(row.id);
    setForm({ code: row.code, name: row.name, category: row.category, price: Number(row.price || 0), totalUses: Number(row.totalUses || 1), validityDays: Number(row.validityDays || 30), active: Boolean(row.active) });
    setMessage("");
    setModalOpen(true);
  };
  const submit = async () => {
    setMessage("");
    const response = await adminFetch(adminKey, "/api/admin/coupons", { method: editingId ? "PUT" : "POST", body: JSON.stringify({ ...form, id: editingId || undefined }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.saveFailed);
    setRows(result.coupons);
    setMessage(editingId ? t.couponUpdated : t.couponCreated);
    reset();
    setModalOpen(false);
  };
  const remove = async (row: AdminCoupon) => {
    setMessage("");
    const response = await adminFetch(adminKey, `/api/admin/coupons?id=${row.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.deleteFailed);
    setRows(result.coupons);
    setMessage(t.couponDeleted);
  };

  return (
    <div className="admin-coupon-layout">
      <Panel title={t.couponList}>
        <div className="admin-list-toolbar">
          <input placeholder={t.couponSearch} value={couponSearch} onChange={(event) => { setCouponSearch(event.target.value); setPage(1); }} />
          <button type="button" onClick={openCreate}>{t.addCoupon}</button>
          <span>{t.rowsShowing} {pagedRows.length} / {filteredRows.length}</span>
        </div>
        <div className="admin-coupon-cards">
          {pagedRows.map((row) => (
            <article key={row.id}>
              <CouponPreview coupon={row} lang={lang} />
              <div><b>{row.name}</b><span>{row.code} · {row.category}</span><small>{money(row.price, lang)} ฿ · {row.totalUses} {t.totalUses} · {row.validityDays} {t.validityDays}</small></div>
              <Badge tone={row.active ? "good" : "bad"}>{statusLabel(row.active ? "active" : "off", t)}</Badge>
              <div className="admin-row-actions"><button type="button" onClick={() => edit(row)}>{t.edit}</button><button className="danger" type="button" onClick={() => remove(row)}>{t.delete}</button></div>
            </article>
          ))}
        </div>
        <div className="admin-pagination">
          <button disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))}>{t.previousPage}</button>
          <span>{t.pageLabel} {currentPage} / {totalPages}</span>
          <button disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))}>{t.nextPage}</button>
        </div>
        {message ? <p className="admin-message">{message}</p> : null}
      </Panel>
      {modalOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <section className="admin-modal">
            <header><div><small>{t.coupons}</small><h2>{editingId ? t.editCoupon : t.addCoupon}</h2></div><button type="button" onClick={() => { reset(); setModalOpen(false); }}>×</button></header>
            <div className="admin-form">
              <div className="admin-coupon-preview-wide wide"><b>{t.couponPreview}</b><CouponPreview coupon={form} lang={lang} /></div>
              <label>{t.code}<input placeholder={t.couponCodeHint} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.trim().toUpperCase() })} /></label>
              <label>{t.cols.coupon}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>{t.couponType}<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{couponCategories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label>{t.cols.price}<input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></label>
              <label>{t.totalUses}<input type="number" value={form.totalUses} onChange={(event) => setForm({ ...form, totalUses: Number(event.target.value) })} /></label>
              <label>{t.validityDays}<input type="number" value={form.validityDays} onChange={(event) => setForm({ ...form, validityDays: Number(event.target.value) })} /></label>
              <label>{t.status}<select value={form.active ? "active" : "off"} onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}><option value="active">{t.active}</option><option value="off">{t.inactive}</option></select></label>
              <div className="admin-form-actions"><button type="button" onClick={submit}>{t.save}</button><button type="button" className="ghost" onClick={() => { reset(); setModalOpen(false); }}>{t.cancel}</button></div>
              {message ? <p className="admin-message">{message}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

const couponCategories = ["food", "promotion", "fitness", "court", "trainer", "tennis", "badminton", "pickleball", "padel", "hyrox", "pilates"];

function CouponPreview({ coupon, lang }: { coupon: Pick<AdminCoupon, "name" | "category" | "price" | "totalUses" | "validityDays">; lang: Lang }) {
  const qty = Number(coupon.totalUses || 1);
  return (
    <div className="admin-coupon-preview">
      <span>{couponIcon(coupon.category)}<small>{qty}</small></span>
      <div><b>{coupon.name || "-"}</b><small>{money(coupon.price, lang)} ฿ · {coupon.validityDays || 30}d · {coupon.category || "-"}</small></div>
      <i>+</i>
    </div>
  );
}

function couponIcon(category: string) {
  const icons: Record<string, string> = { food: "🍜", promotion: "🛍️", fitness: "💪", court: "🏟️", trainer: "🏋️", tennis: "🎾", badminton: "🏸", pickleball: "🥒", padel: "🎯", hyrox: "🔥", pilates: "🧘" };
  return icons[category] || "🎟️";
}

function TrainerManager({
  adminKey,
  lang,
  message,
  rows,
  setMessage,
  setRows,
  t,
}: {
  adminKey: string;
  lang: Lang;
  message: string;
  rows: AdminTrainer[];
  setMessage: (message: string) => void;
  setRows: (rows: AdminTrainer[]) => void;
  t: typeof copy[Lang];
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    name: "",
    nickname: "",
    role: "",
    avatar: "🏋️",
    imageUrl: "",
    experience: "",
    zodiac: "",
    birthYear: 2537,
    bloodType: "O",
    contactPhone: "02-123-4567",
    certificationsText: "",
    startPrice: 0,
    active: true,
  });
  const [uploading, setUploading] = useState(false);
  const [trainerSearch, setTrainerSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 6;
  const filteredRows = useMemo(() => {
    const needle = trainerSearch.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.name} ${row.nickname} ${row.role} ${row.slug} ${row.experience} ${row.zodiac || ""} ${row.birthYear || ""} ${row.bloodType || ""} ${trainerCertifications(row).join(" ")}`.toLowerCase().includes(needle));
  }, [rows, trainerSearch]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / perPage), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * perPage, currentPage * perPage);

  const reset = () => {
    setEditingId(null);
    setForm({ slug: "", name: "", nickname: "", role: "", avatar: "🏋️", imageUrl: "", experience: "", zodiac: "", birthYear: 2537, bloodType: "O", contactPhone: "02-123-4567", certificationsText: "", startPrice: 0, active: true });
  };

  const openCreate = () => {
    reset();
    setMessage("");
    setModalOpen(true);
  };

  const edit = (row: AdminTrainer) => {
    setEditingId(row.id);
    setForm({
      slug: row.slug,
      name: row.name,
      nickname: row.nickname,
      role: row.role,
      avatar: row.avatar || "🏋️",
      imageUrl: row.imageUrl || "",
      experience: row.experience || "",
      zodiac: row.zodiac || "",
      birthYear: Number(row.birthYear || 2537),
      bloodType: row.bloodType || "O",
      contactPhone: row.contactPhone || "02-123-4567",
      certificationsText: trainerCertifications(row).join("\n"),
      startPrice: Number(row.startPrice || 0),
      active: Boolean(row.active),
    });
    setMessage("");
    setModalOpen(true);
  };

  const submit = async () => {
    setMessage("");
    const method = editingId ? "PUT" : "POST";
    const response = await adminFetch(adminKey, "/api/admin/trainers", {
      method,
      body: JSON.stringify({
        ...form,
        birthYear: form.birthYear || null,
        certifications: form.certificationsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        id: editingId || undefined,
      }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.saveFailed);
    setRows(result.trainers);
    setMessage(editingId ? t.trainerUpdated : t.trainerCreated);
    reset();
    setModalOpen(false);
  };

  const remove = async (row: AdminTrainer) => {
    setMessage("");
    const response = await adminFetch(adminKey, `/api/admin/trainers?id=${row.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.deleteFailed);
    setRows(result.trainers);
    setMessage(t.trainerDeleted);
    if (editingId === row.id) reset();
  };

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/admin/uploads/trainers", { method: "POST", headers: { "x-admin-key": adminKey }, body });
      const result = await response.json();
      if (!response.ok) return setMessage(result.message || t.saveFailed);
      setForm((current) => ({ ...current, imageUrl: result.imageUrl || "" }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-trainer-layout">
      <Panel title={t.trainerList}>
        <div className="admin-list-toolbar">
          <input placeholder={t.trainerSearch} value={trainerSearch} onChange={(event) => { setTrainerSearch(event.target.value); setPage(1); }} />
          <button type="button" onClick={openCreate}>{t.addTrainer}</button>
          <span>{t.rowsShowing} {pagedRows.length} / {filteredRows.length}</span>
        </div>
        <div className="admin-trainer-cards">
          {pagedRows.map((row) => (
            <article key={row.id}>
              <TrainerPhoto row={row} />
              <div><b>{row.name}</b><span>{row.nickname} · {row.role}</span><small>{row.experience} · {row.zodiac || "-"} · {row.birthYear || "-"} · {row.bloodType || "-"}</small><small>{trainerCertifications(row).slice(0, 2).join(" · ") || "-"}</small></div>
              <Badge tone={row.active ? "good" : "bad"}>{statusLabel(row.active ? "active" : "off", t)}</Badge>
              <div className="admin-row-actions"><button type="button" onClick={() => edit(row)}>{t.edit}</button><button className="danger" type="button" onClick={() => remove(row)}>{t.delete}</button></div>
            </article>
          ))}
        </div>
        <div className="admin-pagination">
          <button disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))}>{t.previousPage}</button>
          <span>{t.pageLabel} {currentPage} / {totalPages}</span>
          <button disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))}>{t.nextPage}</button>
        </div>
      </Panel>
      {modalOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <section className="admin-modal">
            <header><div><small>{t.trainers}</small><h2>{editingId ? t.editTrainer : t.addTrainer}</h2></div><button type="button" onClick={() => { reset(); setModalOpen(false); }}>×</button></header>
            <div className="admin-form">
              <div className="admin-trainer-preview wide"><TrainerPhoto row={{ name: form.name, avatar: form.avatar, imageUrl: form.imageUrl }} /></div>
              <label>{t.slug}<input placeholder="coach-mind" value={form.slug} onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })} /></label>
              <label>{t.displayName}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>{t.nickname}<input value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} /></label>
              <label>{t.role}<input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></label>
              <label>{t.avatar}<input value={form.avatar} onChange={(event) => setForm({ ...form, avatar: event.target.value })} /></label>
              <label>{t.experience}<input value={form.experience} onChange={(event) => setForm({ ...form, experience: event.target.value })} /></label>
              <label>{t.zodiac}<input value={form.zodiac} onChange={(event) => setForm({ ...form, zodiac: event.target.value })} /></label>
              <label>{t.birthYear}<input type="number" value={form.birthYear} onChange={(event) => setForm({ ...form, birthYear: Number(event.target.value) })} /></label>
              <label>{t.bloodType}<input value={form.bloodType} onChange={(event) => setForm({ ...form, bloodType: event.target.value })} /></label>
              <label>{t.contactPhone}<input value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} /></label>
              <label>{t.cols.startPrice}<input type="number" value={form.startPrice} onChange={(event) => setForm({ ...form, startPrice: Number(event.target.value) })} /></label>
              <label>{t.status}<select value={form.active ? "active" : "off"} onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}><option value="active">{t.active}</option><option value="off">{t.inactive}</option></select></label>
              <label className="wide">{t.uploadImage}<input accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => upload(event.target.files?.[0] || null)} /></label>
              <label className="wide">{t.certifications}<textarea placeholder={t.certificationsHint} value={form.certificationsText} onChange={(event) => setForm({ ...form, certificationsText: event.target.value })} /></label>
              <div className="admin-form-actions"><button type="button" onClick={submit}>{editingId ? t.save : t.add}</button><button type="button" className="ghost" onClick={() => { reset(); setModalOpen(false); }}>{t.cancel}</button></div>
              {uploading ? <p className="admin-message">{t.uploadImage}...</p> : null}
              {message ? <p className="admin-message">{message}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TrainerPhoto({ row }: { row: Pick<AdminTrainer, "avatar" | "imageUrl" | "name"> }) {
  if (row.imageUrl) return <img alt={row.name} className="admin-trainer-photo" src={row.imageUrl} />;
  return <div className="admin-trainer-photo fallback">{row.avatar || "🏋️"}</div>;
}

function StaffManager({
  adminKey,
  lang,
  message,
  roles,
  rows,
  setMessage,
  setRows,
  t,
}: {
  adminKey: string;
  lang: Lang;
  message: string;
  roles: AdminRole[];
  rows: AdminStaff[];
  setMessage: (message: string) => void;
  setRows: (rows: AdminStaff[]) => void;
  t: typeof copy[Lang];
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 8;
  const [form, setForm] = useState({
    username: "",
    password: "",
    displayName: "",
    email: "",
    phone: "",
    status: "active" as AdminStaff["status"],
    roleId: roles[0]?.id || 0,
  });
  const filteredRows = useMemo(() => {
    const needle = staffSearch.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.displayName} ${row.username} ${row.email || ""} ${row.phone || ""} ${row.status} ${row.roleCode} ${row.roleNameTh} ${row.roleNameEn}`.toLowerCase().includes(needle));
  }, [rows, staffSearch]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / perPage), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * perPage, currentPage * perPage);

  const reset = () => {
    setEditingId(null);
    setForm({ username: "", password: "", displayName: "", email: "", phone: "", status: "active", roleId: roles[0]?.id || 0 });
  };

  const openCreate = () => {
    reset();
    setMessage("");
    setModalOpen(true);
  };

  const submit = async () => {
    setMessage("");
    const method = editingId ? "PUT" : "POST";
    const payload = { ...form, id: editingId || undefined };
    const response = await adminFetch(adminKey, "/api/admin/staff", { method, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.saveFailed);
    setRows(result.staff);
    setMessage(editingId ? t.staffUpdated : t.staffCreated);
    reset();
    setModalOpen(false);
  };

  const edit = (row: AdminStaff) => {
    setEditingId(row.id);
    setForm({
      username: row.username,
      password: "",
      displayName: row.displayName,
      email: row.email || "",
      phone: row.phone || "",
      status: row.status,
      roleId: row.roleId,
    });
    setMessage("");
    setModalOpen(true);
  };

  const remove = async (row: AdminStaff) => {
    setMessage("");
    const response = await adminFetch(adminKey, `/api/admin/staff?id=${row.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.deleteFailed);
    setRows(result.staff);
    setMessage(t.staffDeleted);
    if (editingId === row.id) reset();
  };

  return (
    <div className="admin-trainer-layout">
      <Panel title={t.staffList}>
        <div className="admin-list-toolbar">
          <input placeholder={t.staffSearch} value={staffSearch} onChange={(event) => { setStaffSearch(event.target.value); setPage(1); }} />
          <button type="button" onClick={openCreate}>{t.addStaff}</button>
          <span>{t.rowsShowing} {pagedRows.length} / {filteredRows.length}</span>
        </div>
        <div className="admin-staff-cards">
          {pagedRows.map((row) => (
            <article key={row.id}>
              <div className="admin-staff-avatar">{initials(row.displayName || row.username)}</div>
              <div><b>{row.displayName}</b><span>{row.username} · {lang === "th" ? row.roleNameTh : row.roleNameEn}</span><small>{row.phone || row.email || "-"}</small></div>
              <Badge tone={row.status === "active" ? "good" : "warn"}>{statusLabel(row.status, t)}</Badge>
              <div className="admin-row-actions"><button type="button" onClick={() => edit(row)}>{t.edit}</button><button type="button" className="danger" onClick={() => remove(row)}>{t.delete}</button></div>
            </article>
          ))}
        </div>
        <div className="admin-pagination">
          <button disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(value - 1, 1))}>{t.previousPage}</button>
          <span>{t.pageLabel} {currentPage} / {totalPages}</span>
          <button disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(value + 1, totalPages))}>{t.nextPage}</button>
        </div>
      </Panel>
      {modalOpen ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <section className="admin-modal">
            <header><div><small>{t.staff}</small><h2>{editingId ? t.editStaff : t.addStaff}</h2></div><button type="button" onClick={() => { reset(); setModalOpen(false); }}>×</button></header>
            <div className="admin-form">
              <label>{t.username}<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
              <label>{t.password}<input type="password" placeholder={editingId ? t.passwordUnchanged : ""} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
              <label>{t.displayName}<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
              <label>{t.email}<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label>{t.phone}<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label>{t.role}<select value={form.roleId} onChange={(event) => setForm({ ...form, roleId: Number(event.target.value) })}>{roles.map((role) => <option key={role.id} value={role.id}>{lang === "th" ? role.nameTh : role.nameEn}</option>)}</select></label>
              <label>{t.status}<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AdminStaff["status"] })}><option value="active">{statusLabel("active", t)}</option><option value="suspended">{statusLabel("suspended", t)}</option></select></label>
              <div className="admin-form-actions"><button type="button" onClick={submit}>{editingId ? t.save : t.add}</button><button type="button" className="ghost" onClick={() => { reset(); setModalOpen(false); }}>{t.cancel}</button></div>
              {message ? <p className="admin-message">{message}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function RoleManager({
  adminKey,
  lang,
  message,
  permissions,
  rows,
  setMessage,
  setPermissions,
  setRows,
  t,
}: {
  adminKey: string;
  lang: Lang;
  message: string;
  permissions: AdminPermission[];
  rows: AdminRole[];
  setMessage: (message: string) => void;
  setPermissions: (rows: AdminPermission[]) => void;
  setRows: (rows: AdminRole[]) => void;
  t: typeof copy[Lang];
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", nameTh: "", nameEn: "", description: "", level: 50, permissionCodes: [] as string[] });

  const reset = () => {
    setEditingId(null);
    setForm({ code: "", nameTh: "", nameEn: "", description: "", level: 50, permissionCodes: [] });
  };

  const edit = (role: AdminRole) => {
    setEditingId(role.id);
    setForm({
      code: role.code,
      nameTh: role.nameTh,
      nameEn: role.nameEn,
      description: role.description || "",
      level: role.level,
      permissionCodes: role.permissionCodes,
    });
  };

  const togglePermission = (code: string) => {
    const hasCode = form.permissionCodes.includes(code);
    setForm({ ...form, permissionCodes: hasCode ? form.permissionCodes.filter((item) => item !== code) : [...form.permissionCodes, code] });
  };

  const submit = async () => {
    setMessage("");
    const method = editingId ? "PUT" : "POST";
    const response = await adminFetch(adminKey, "/api/admin/roles", { method, body: JSON.stringify({ ...form, id: editingId || undefined }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.saveFailed);
    setRows(result.roles);
    setPermissions(result.permissions);
    setMessage(editingId ? t.roleUpdated : t.roleCreated);
    reset();
  };

  const remove = async (role: AdminRole) => {
    setMessage("");
    const response = await adminFetch(adminKey, `/api/admin/roles?id=${role.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.deleteFailed);
    setRows(result.roles);
    setPermissions(result.permissions);
    setMessage(t.roleDeleted);
    if (editingId === role.id) reset();
  };

  return (
    <div className="admin-crud-grid">
      <Panel title={editingId ? t.editRole : t.addRole}>
        <div className="admin-form">
          <label>{t.code}<input placeholder="front_desk_plus" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
          <label>{t.thaiName}<input value={form.nameTh} onChange={(event) => setForm({ ...form, nameTh: event.target.value })} /></label>
          <label>{t.englishName}<input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></label>
          <label>{t.level}<input type="number" value={form.level} onChange={(event) => setForm({ ...form, level: Number(event.target.value) })} /></label>
          <label className="wide">{t.description}<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="admin-permission-grid">{permissions.map((permission) => <label key={permission.code}><input checked={form.permissionCodes.includes(permission.code)} type="checkbox" onChange={() => togglePermission(permission.code)} /><span>{lang === "th" ? permission.nameTh : permission.nameEn}<small>{permission.code}</small></span></label>)}</div>
          <div className="admin-form-actions"><button type="button" onClick={submit}>{editingId ? t.savePermissions : t.addRole}</button><button type="button" className="ghost" onClick={reset}>{t.clear}</button></div>
          {message ? <p className="admin-message">{message}</p> : null}
        </div>
      </Panel>
      <Panel title={t.allRoles}>
        <div className="admin-role-list">{rows.map((role) => <article key={role.id}><div><b>{lang === "th" ? role.nameTh : role.nameEn}</b><span>{role.code} · {t.level} {role.level}</span><small>{role.permissionCodes.length} {t.permissionsCount}</small></div><div className="admin-row-actions"><button type="button" onClick={() => edit(role)}>{t.edit}</button><button type="button" className="danger" disabled={role.isSystem} onClick={() => remove(role)}>{t.delete}</button></div></article>)}</div>
      </Panel>
    </div>
  );
}

function adminFetch(adminKey: string, input: string, init: RequestInit) {
  return fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(adminKey ? { "x-admin-key": adminKey } : {}),
      ...(init.headers || {}),
    },
  });
}

function Reports({ data, lang, section, t }: { data: AdminConsoleData; lang: Lang; section: ReportSection; t: typeof copy[Lang] }) {
  const paidRevenue = data.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const paidBookings = data.bookings.filter((booking) => booking.status === "paid").length;
  const pendingBookings = data.bookings.filter((booking) => ["hold", "pending_payment"].includes(booking.status)).length;
  const cancelledBookings = data.bookings.filter((booking) => ["cancelled", "expired"].includes(booking.status)).length;
  const activeCoupons = data.coupons.filter((coupon) => Boolean(coupon.active)).length;
  const activeTrainers = data.trainers.filter((trainer) => Boolean(trainer.active)).length;
  const availableCourts = data.courts.filter((court) => court.status === "available").length;
  const maintenanceCourts = data.courts.filter((court) => court.status === "maintenance").length;
  const avgBookingValue = data.bookings.length ? Math.round(data.bookings.reduce((sum, booking) => sum + Number(booking.amount || 0), 0) / data.bookings.length) : 0;
  const avgTrainerPrice = data.trainers.length ? Math.round(data.trainers.reduce((sum, trainer) => sum + Number(trainer.startPrice || 0), 0) / data.trainers.length) : 0;
  const paidRate = data.bookings.length ? Math.round((paidBookings / data.bookings.length) * 100) : 0;
  const reportTabs = reportMenu(t);

  const cards = {
    overview: [
      [t.paidRevenue, `${money(paidRevenue, lang)} ฿`],
      [t.paidBookingRate, `${paidRate}%`],
      [t.activeMembers, data.users.filter((user) => user.status === "active").length],
      [t.availableCourts, `${availableCourts}/${data.courts.length}`],
    ],
    finance: [[t.paidRevenue, `${money(paidRevenue, lang)} ฿`], [t.paymentRows, data.payments.length], [t.avgBookingValue, `${money(avgBookingValue, lang)} ฿`]],
    bookings: [[t.allBookings, data.bookings.length], [t.paidBookingRate, `${paidRate}%`], [t.pendingBookings, pendingBookings], [t.cancelledBookings, cancelledBookings]],
    members: [[t.allMembers, data.users.length], [t.activeMembers, data.users.filter((user) => user.status === "active").length], [t.checkinSignal, data.bookings.filter((booking) => booking.status === "checked_in").length]],
    coupons: [[t.total, data.coupons.length], [t.activeCoupons, activeCoupons], [t.cols.usage, data.coupons.reduce((sum, coupon) => sum + Number(coupon.totalUses || 0), 0)]],
    trainers: [[t.total, data.trainers.length], [t.activeTrainers, activeTrainers], [t.trainerAvgPrice, `${money(avgTrainerPrice, lang)} ฿`]],
    courts: [[t.allCourts, data.courts.length], [t.availableCourts, availableCourts], [t.courtMaintenance, maintenanceCourts]],
    engagement: [[t.utilizationSignal, `${paidRate}%`], [t.checkinSignal, data.bookings.filter((booking) => booking.status === "checked_in").length], [t.livePayments, data.payments.length]],
    audit: [[t.auditEvents, data.auditLogs.length], [t.highRiskActions, data.auditLogs.filter((log) => log.action.includes("delete") || log.action.includes("password")).length], [t.staff, data.staff.length]],
  } as Record<ReportSection, [string, number | string][]>;

  return (
    <div className="admin-report-content">
      <Panel title={reportTabs.find(([id]) => id === section)?.[1] || t.reports}>
        <div className="admin-report-kpis">
          {cards[section].map(([label, value]) => <ReportCard key={label} label={label} value={value} />)}
        </div>
        <ReportRecommendation lang={lang} section={section} t={t} paidRate={paidRate} />
      </Panel>
      {section === "overview" && (
        <div className="admin-report-grid">
          <Panel title={t.revenueTrend}><BarChart rows={buildRevenueBars(data.payments, lang)} moneyBars /></Panel>
          <Panel title={t.bookingStatus}><DonutSummary rows={buildStatusBars(data.bookings)} t={t} /></Panel>
          <Panel title={t.courtMix}><BarChart rows={buildCourtBars(data.courts)} /></Panel>
          <Panel title={t.reportExportAll}><div className="admin-report-export-grid"><ExportButton label={t.reportFinance} filename="ppa-report-payments.csv" rows={data.payments} /><ExportButton label={t.reportBookings} filename="ppa-report-bookings.csv" rows={data.bookings} /><ExportButton label={t.reportMembers} filename="ppa-report-members.csv" rows={data.users} /></div></Panel>
        </div>
      )}
      {section === "finance" && <ReportDataList amountLabel={t.reportFilteredAmount} dateGetter={(row) => row.paidAt} filename="ppa-payments.csv" lang={lang} renderTable={(rows) => <PaymentTable rows={rows} lang={lang} t={t} />} rows={data.payments} searchText={(row) => `${row.paymentNo} ${row.displayName} ${row.method} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "bookings" && <ReportDataList amountLabel={t.reportFilteredAmount} dateGetter={(row) => row.startsAt} filename="ppa-bookings.csv" lang={lang} renderTable={(rows) => <BookingTable rows={rows} lang={lang} t={t} />} rows={data.bookings} searchText={(row) => `${row.bookingNo} ${row.title} ${row.displayName} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "members" && <ReportDataList dateGetter={(row) => row.createdAt} filename="ppa-members.csv" lang={lang} renderTable={(rows) => <MemberTable rows={rows} lang={lang} t={t} />} rows={data.users} searchText={(row) => `${row.displayName} ${row.memberCode} ${row.phone || ""} ${row.email || ""} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "coupons" && <ReportDataList filename="ppa-coupons.csv" lang={lang} renderTable={(rows) => <CouponTable rows={rows} lang={lang} t={t} />} rows={data.coupons} searchText={(row) => `${row.name} ${row.code} ${row.category}`} statusGetter={(row) => row.active ? "active" : "off"} t={t} title={t.reportDetail} />}
      {section === "trainers" && <ReportDataList filename="ppa-trainers.csv" lang={lang} renderTable={(rows) => <TrainerTable rows={rows} lang={lang} t={t} />} rows={data.trainers} searchText={(row) => `${row.name} ${row.nickname} ${row.slug} ${row.role} ${row.experience} ${certificationText(row.certifications)}`} statusGetter={(row) => row.active ? "active" : "off"} t={t} title={t.reportDetail} />}
      {section === "courts" && <ReportDataList filename="ppa-courts.csv" lang={lang} renderTable={(rows) => <CourtReport rows={rows} t={t} />} rows={data.courts} searchText={(row) => `${row.name} ${row.zone || ""} ${row.sportName} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "engagement" && <ReportDataList amountLabel={t.reportFilteredAmount} dateGetter={(row) => row.startsAt} filename="ppa-engagement.csv" lang={lang} renderTable={(rows) => <BookingTable rows={rows} lang={lang} t={t} />} rows={data.bookings.filter((booking) => ["paid", "checked_in"].includes(booking.status))} searchText={(row) => `${row.bookingNo} ${row.title} ${row.displayName} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "audit" && <ReportDataList dateGetter={(row) => row.createdAt} filename="ppa-audit.csv" lang={lang} renderTable={(rows) => <AuditReportTable lang={lang} rows={rows} t={t} />} rows={data.auditLogs} searchText={(row) => `${row.staffName || ""} ${row.username || ""} ${row.action} ${row.targetType} ${row.targetId || ""} ${row.metadataText || ""}`} statusGetter={(row) => row.action} t={t} title={t.auditTitle} />}
    </div>
  );
}

function ReportCard({ label, value }: { label: string; value: number | string }) {
  return <div className="report-card"><span>{label}</span><b>{value}</b></div>;
}

function ReportRecommendation({ lang, paidRate, section, t }: { lang: Lang; paidRate: number; section: string; t: typeof copy[Lang] }) {
  const text = (() => {
    const recommendations = {
      th: {
        finance: paidRate < 70 ? "ตรวจรายการรอชำระและตั้ง reminder อัตโนมัติสำหรับ booking ที่ใกล้หมดอายุ" : "รายได้และอัตราชำระอยู่ในระดับดี ควรเพิ่ม package bundle เพื่อเพิ่ม average order value",
        bookings: "ควรดูช่วงเวลาที่สนามแน่นและสร้าง price rule ตาม peak/off-peak",
        members: "ควรเพิ่ม segment สมาชิก เช่น active, dormant, high value เพื่อทำ campaign ได้แม่นขึ้น",
        coupons: "ควรเพิ่มรายงาน redemption rate และ blacklist/blackout date สำหรับ campaign สำคัญ",
        trainers: "ควรเพิ่ม report commission, payout และ occupancy ตาม trainer/time slot",
        courts: "ควรเพิ่ม utilization heatmap รายสนามและ block ซ่อมบำรุงแบบ calendar",
        audit: "ควร review action ลบข้อมูลและเปลี่ยนรหัสผ่านเป็นประจำ พร้อม export ให้ผู้บริหารตรวจ",
        overview: "ควรติดตาม paid rate, utilization, active members และ failed/pending payments เป็น daily operations dashboard",
      },
      en: {
        finance: paidRate < 70 ? "Review pending payments and automate reminders for bookings close to expiry." : "Revenue and paid rate look healthy. Add package bundles to increase average order value.",
        bookings: "Review peak court times and add peak/off-peak pricing rules.",
        members: "Add member segments such as active, dormant, and high value for better campaigns.",
        coupons: "Add redemption-rate reporting, blacklist checks, and blackout dates for important campaigns.",
        trainers: "Add commission, payout, and occupancy reporting by trainer and time slot.",
        courts: "Add utilization heatmaps by court and calendar-based maintenance blocks.",
        audit: "Review delete and password-change actions regularly and export them for management.",
        overview: "Track paid rate, utilization, active members, and failed or pending payments as a daily operations dashboard.",
      },
    };
    return recommendations[lang][section as keyof typeof recommendations.th] || recommendations[lang].overview;
  })();
  return <div className="admin-report-note"><b>{t.reportRecommendation}</b><p>{text}</p></div>;
}

function CourtReport({ rows, t }: { rows: AdminCourt[]; t: typeof copy[Lang] }) {
  return (
    <table>
      <thead><tr><th>{t.reportCourts}</th><th>{t.courtMix}</th><th>{t.status}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}><td>{row.name}<small>{row.zone || "-"}</small></td><td>{row.sportName}</td><td><Badge tone={row.status === "available" ? "good" : row.status === "maintenance" ? "warn" : "bad"}>{statusLabel(row.status, t)}</Badge></td></tr>)}</tbody>
    </table>
  );
}

function AuditReportTable({ lang, rows, t }: { lang: Lang; rows: AdminAuditLog[]; t: typeof copy[Lang] }) {
  return (
    <table>
      <thead><tr><th>{t.auditTime}</th><th>{t.auditActor}</th><th>{t.auditAction}</th><th>{t.auditTarget}</th><th>{t.auditMetadata}</th></tr></thead>
      <tbody>
        {rows.length ? rows.map((row) => (
          <tr key={row.id}>
            <td>{formatDate(row.createdAt, lang)}</td>
            <td>{row.staffName || row.username || "System"}<small>{row.username || "-"}</small></td>
            <td><Badge tone="good">{auditActionLabel(row.action, lang)}</Badge></td>
            <td>{row.targetType}<small>{row.targetId || "-"}</small></td>
            <td>{compactJson(row.metadataText)}</td>
          </tr>
        )) : <tr><td colSpan={5}>{t.auditEmpty}</td></tr>}
      </tbody>
    </table>
  );
}

function AuditTrail({ lang, rows, t }: { lang: Lang; rows: AdminAuditLog[]; t: typeof copy[Lang] }) {
  const [action, setAction] = useState("");
  const [needle, setNeedle] = useState("");
  const actions = useMemo(() => Array.from(new Set(rows.map((row) => row.action))).sort(), [rows]);
  const filteredRows = useMemo(() => {
    const text = needle.trim().toLowerCase();
    return rows.filter((row) => {
      const actionMatches = !action || row.action === action;
      const textMatches = !text || `${row.staffName || ""} ${row.username || ""} ${row.targetType} ${row.targetId || ""} ${row.metadataText || ""}`.toLowerCase().includes(text);
      return actionMatches && textMatches;
    });
  }, [action, needle, rows]);

  return (
    <Panel title={t.auditTitle}>
      <div className="admin-filterbar">
        <label>{t.filterAction}<select value={action} onChange={(event) => setAction(event.target.value)}><option value="">{t.allActions}</option>{actions.map((item) => <option key={item} value={item}>{auditActionLabel(item, lang)}</option>)}</select></label>
        <label>{t.filterActor}<input value={needle} onChange={(event) => setNeedle(event.target.value)} /></label>
        <button type="button" onClick={() => { setAction(""); setNeedle(""); }}>{t.resetFilter}</button>
        <ExportButton label={t.exportCsv} filename="ppa-audit.csv" rows={filteredRows.map((row) => ({ ...row, action: auditActionLabel(row.action, lang), metadata: compactJson(row.metadataText) }))} />
      </div>
      <table>
        <thead><tr><th>{t.auditTime}</th><th>{t.auditActor}</th><th>{t.auditAction}</th><th>{t.auditTarget}</th><th>{t.auditMetadata}</th></tr></thead>
        <tbody>
          {filteredRows.length ? filteredRows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt, lang)}</td>
              <td>{row.staffName || row.username || "System"}<small>{row.username || "-"}</small></td>
              <td><Badge tone="good">{auditActionLabel(row.action, lang)}</Badge></td>
              <td>{row.targetType}<small>{row.targetId || "-"}</small></td>
              <td>{compactJson(row.metadataText)}</td>
            </tr>
          )) : <tr><td colSpan={5}>{t.auditEmpty}</td></tr>}
        </tbody>
      </table>
    </Panel>
  );
}

function SystemStatusPanel({ lang, rows, scoreItems, title, t }: { lang: Lang; rows: AdminSystemItem[]; scoreItems: AdminSystemItem[]; title: string; t: typeof copy[Lang] }) {
  const score = readiness(scoreItems);
  return (
    <div className="admin-system-grid">
      <Panel title={title}>
        <div className="admin-health-list">
          {rows.map((row) => (
            <article key={row.key}>
              <div><b>{lang === "th" ? row.labelTh : row.labelEn}</b><small>{lang === "th" ? row.hintTh : row.hintEn}</small></div>
              <strong>{row.value}</strong>
              <Badge tone={row.status}>{statusText(row.status, t)}</Badge>
            </article>
          ))}
        </div>
      </Panel>
      <Panel title={t.healthTitle}>
        <div className="admin-readiness">
          <div className="admin-score-ring" style={{ background: `conic-gradient(var(--admin-good) 0 ${score}%, var(--admin-chart-soft) ${score}% 100%)` }}><b>{score}%</b><span>{t.readinessScore}</span></div>
          <div className="admin-readiness-list">
            <p><Badge tone="good">{t.statusReady}</Badge><span>{scoreItems.filter((item) => item.status === "good").length}</span></p>
            <p><Badge tone="warn">{t.statusWarning}</Badge><span>{scoreItems.filter((item) => item.status === "warn").length}</span></p>
            <p><Badge tone="bad">{t.statusRisk}</Badge><span>{scoreItems.filter((item) => item.status === "bad").length}</span></p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function ExportButton({ filename, label, rows }: { filename: string; label: string; rows: Record<string, unknown>[] }) {
  return <button className="admin-export" type="button" onClick={() => downloadCsv(filename, rows)}>{label}</button>;
}

function Analysis({ lang, t }: { lang: Lang; t: typeof copy[Lang] }) {
  return (
    <div className="admin-analysis-grid">
      <Panel title={t.checklistTitle}>
        <div className="admin-checklist">
          {completionChecklist[lang].map((group) => (
            <article key={group.menu}>
              <h3>{group.menu}</h3>
              {group.items.map((item) => <p key={item.text}><Badge tone={item.ready ? "good" : "warn"}>{item.ready ? t.checklistStatusReady : t.checklistStatusNext}</Badge><span>{item.text}</span></p>)}
            </article>
          ))}
        </div>
      </Panel>
      <Panel title={t.recommendations}>
        <div className="recommend-list">{recommendations[lang].map((item, index) => <article key={item}><b>{String(index + 1).padStart(2, "0")}</b><span>{item}</span></article>)}</div>
      </Panel>
      <Panel title={lang === "th" ? "Roadmap ตามความสำคัญ" : "Priority Roadmap"}>
        <div className="admin-roadmap">
          {roadmap[lang].map((phase, index) => (
            <article key={phase.phase}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <div><h3>{phase.phase}</h3>{phase.items.map((item) => <p key={item}>{item}</p>)}</div>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function BarChart({ rows, moneyBars = false }: { rows: { label: string; value: number }[]; moneyBars?: boolean }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <div className="admin-bars">{rows.length ? rows.map((row) => <article key={row.label}><span>{row.label}</span><div><i style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }} /></div><b>{moneyBars ? `${money(row.value, "th")} ฿` : row.value}</b></article>) : null}</div>;
}

function DonutSummary({ rows, t }: { rows: { label: string; value: number }[]; t: typeof copy[Lang] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const paid = rows.find((row) => row.label === "paid")?.value || 0;
  const percent = total ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="admin-donut-wrap">
      <div className="admin-donut" style={{ background: `conic-gradient(var(--admin-accent) 0 ${percent}%, var(--admin-chart-soft) ${percent}% 100%)` }}><b>{percent}%</b><span>{statusLabel("paid", t)}</span></div>
      <div className="admin-status-list">{rows.map((row) => <p key={row.label}><span>{statusLabel(row.label, t)}</span><b>{row.value}</b></p>)}</div>
    </div>
  );
}

function PulseCard({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return <article className="pulse-card"><span>{label}</span><b>{value}</b><small>{hint}</small></article>;
}

function ActionQueue({ rows }: { rows: { label: string; value: number; hint: string; tone: AdminStatusTone }[] }) {
  return (
    <div className="admin-action-queue">
      {rows.map((row) => (
        <article key={row.label}>
          <div><b>{row.label}</b><span>{row.hint}</span></div>
          <strong>{row.value}</strong>
          <Badge tone={row.tone}>{row.tone === "good" ? "OK" : row.tone === "warn" ? "Review" : "Risk"}</Badge>
        </article>
      ))}
    </div>
  );
}

function RingMetric({ hint, label, value }: { hint: string; label: string; value: number }) {
  return (
    <article className="admin-ring-metric">
      <div style={{ background: `conic-gradient(var(--admin-accent) 0 ${value}%, var(--admin-chart-soft) ${value}% 100%)` }}><b>{value}%</b></div>
      <span>{label}</span>
      <small>{hint}</small>
    </article>
  );
}

function CapacityGrid({ rows, t }: { rows: { label: string; value: number }[]; t: typeof copy[Lang] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="admin-capacity-grid">
      {rows.map((row) => (
        <article key={row.label}>
          <span>{statusLabel(row.label, t)}</span>
          <b>{row.value}</b>
          <i style={{ height: `${Math.max((row.value / max) * 100, 10)}%` }} />
        </article>
      ))}
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "good" | "warn" | "bad" }) {
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}

function buildRevenueBars(payments: AdminPayment[], lang: Lang) {
  const paid = payments.filter((payment) => payment.status === "paid");
  const buckets = new Map<string, number>();
  for (const payment of paid) {
    const date = payment.paidAt ? new Date(payment.paidAt) : null;
    const label = date && !Number.isNaN(date.valueOf()) ? formatShortDate(payment.paidAt || "", lang) : "-";
    buckets.set(label, (buckets.get(label) || 0) + Number(payment.amount || 0));
  }
  return Array.from(buckets, ([label, value]) => ({ label, value })).slice(-7);
}

function buildStatusBars(bookings: AdminBooking[]) {
  const buckets = new Map<string, number>();
  for (const booking of bookings) buckets.set(booking.status, (buckets.get(booking.status) || 0) + 1);
  return Array.from(buckets, ([label, value]) => ({ label, value }));
}

function buildBookingActivityBars(bookings: AdminBooking[], lang: Lang) {
  const buckets = new Map<string, number>();
  for (const booking of bookings) {
    const label = formatShortDate(booking.startsAt, lang);
    buckets.set(label, (buckets.get(label) || 0) + 1);
  }
  return Array.from(buckets, ([label, value]) => ({ label, value })).slice(-7);
}

function buildCourtBars(courts: AdminCourt[]) {
  const buckets = new Map<string, number>();
  for (const court of courts) buckets.set(court.sportName, (buckets.get(court.sportName) || 0) + 1);
  return Array.from(buckets, ([label, value]) => ({ label, value })).slice(0, 8);
}

function buildCourtStatusBars(courts: AdminCourt[]) {
  const buckets = new Map<string, number>();
  for (const court of courts) buckets.set(court.status, (buckets.get(court.status) || 0) + 1);
  return Array.from(buckets, ([label, value]) => ({ label, value }));
}

function buildPaymentMethodBars(payments: AdminPayment[]) {
  const buckets = new Map<string, number>();
  for (const payment of payments.filter((row) => row.status === "paid")) buckets.set(payment.method || "-", (buckets.get(payment.method || "-") || 0) + Number(payment.amount || 0));
  return Array.from(buckets, ([label, value]) => ({ label, value })).slice(0, 8);
}

function buildMemberStatusBars(users: AdminUser[]) {
  const buckets = new Map<string, number>();
  for (const user of users) buckets.set(user.status, (buckets.get(user.status) || 0) + 1);
  return Array.from(buckets, ([label, value]) => ({ label, value }));
}

function buildTrainerPriceBars(trainers: AdminTrainer[]) {
  return [...trainers]
    .sort((a, b) => Number(b.startPrice || 0) - Number(a.startPrice || 0))
    .slice(0, 7)
    .map((trainer) => ({ label: trainer.nickname || trainer.name, value: Number(trainer.startPrice || 0) }));
}

function money(value: number | string | undefined, lang: Lang = "th") {
  return Number(value || 0).toLocaleString(lang === "th" ? "th-TH" : "en-US");
}

function formatDate(value: string, lang: Lang) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function formatShortDate(value: string, lang: Lang) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "-";
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", { month: "short", day: "numeric", timeZone: "Asia/Bangkok" }).format(date);
}

function statusLabel(value: string, t: typeof copy[Lang]) {
  return t.statuses[value as keyof typeof t.statuses] || value;
}

function passwordErrorMessage(message: string | undefined, t: typeof copy[Lang]) {
  if (message === "Current password is incorrect") return t.currentPasswordIncorrect;
  return t.changePasswordFailed;
}

function profileErrorMessage(message: string | undefined, t: typeof copy[Lang]) {
  if (message === "Username is already used") return t.usernameTaken;
  return message || t.saveFailed;
}

function auditActionLabel(action: string, lang: Lang) {
  const labels: Record<string, { th: string; en: string }> = {
    "staff.create": { th: "เพิ่มพนักงาน", en: "Create staff" },
    "staff.update": { th: "แก้ไขพนักงาน", en: "Update staff" },
    "staff.delete": { th: "ลบพนักงาน", en: "Delete staff" },
    "role.create": { th: "เพิ่มบทบาท", en: "Create role" },
    "role.update": { th: "แก้ไขสิทธิ์", en: "Update role" },
    "role.delete": { th: "ลบบทบาท", en: "Delete role" },
    "trainer.create": { th: "เพิ่มเทรนเนอร์", en: "Create trainer" },
    "trainer.update": { th: "แก้ไขเทรนเนอร์", en: "Update trainer" },
    "trainer.delete": { th: "ลบเทรนเนอร์", en: "Delete trainer" },
    "coupon.create": { th: "เพิ่มคูปอง", en: "Create coupon" },
    "coupon.update": { th: "แก้ไขคูปอง", en: "Update coupon" },
    "coupon.delete": { th: "ปิดคูปอง", en: "Disable coupon" },
    "profile.update": { th: "แก้ไขโปรไฟล์", en: "Update profile" },
    "profile.password.update": { th: "เปลี่ยนรหัสผ่าน", en: "Change password" },
  };
  return labels[action]?.[lang] || action;
}

function compactJson(value: string | null) {
  if (!value) return "-";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, item]) => `${key}: ${String(item)}`).join(" · ") || "-";
  } catch {
    return value;
  }
}

function trainerCertifications(trainer: Pick<AdminTrainer, "certifications">) {
  if (Array.isArray(trainer.certifications)) return trainer.certifications;
  if (typeof trainer.certifications === "string") {
    try {
      const parsed = JSON.parse(trainer.certifications) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return trainer.certifications.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function translatedMetrics(metrics: AdminMetric[], t: typeof copy[Lang]) {
  const labels = [
    [t.metricMembers, t.metricMembersHint],
    [t.metricBookings, t.metricBookingsHint],
    [t.metricPaid, t.metricPaidHint],
    [t.metricRevenue, t.metricRevenueHint],
  ];
  return metrics.map((metric, index) => ({
    ...metric,
    label: labels[index]?.[0] || metric.label,
    hint: labels[index]?.[1] || metric.hint,
  }));
}

function statusText(status: AdminStatusTone, t: typeof copy[Lang]) {
  if (status === "good") return t.statusReady;
  if (status === "warn") return t.statusWarning;
  return t.statusRisk;
}

function readiness(...groups: AdminSystemItem[][]) {
  const rows = groups.flat();
  if (!rows.length) return 0;
  const points = rows.reduce((sum, row) => sum + (row.status === "good" ? 1 : row.status === "warn" ? 0.55 : 0), 0);
  return Math.round((points / rows.length) * 100);
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  const csv = [headers.join(","), ...body].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function certificationText(value: AdminTrainer["certifications"]) {
  if (Array.isArray(value)) return value.join(" ");
  return value || "";
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function isAdminTab(value: string): value is AdminTab {
  return tabs.some(([id]) => id === value);
}

function isReportSection(value: string | null): value is ReportSection {
  return reportSectionIds.some((id) => id === value);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "A";
}
