"use client";
import Image from "next/image";
import { AdminMembers } from "@/components/admin-members";
import { AdminQrScanner } from "@/components/admin-qr-scanner";
import { safeImageSource } from "@/lib/media";
import { AdminDialog } from "@/components/admin-dialog";
import { AdminCourtCalendar, CounterPaymentDialog } from "@/components/admin-court-calendar";
import { AdminCashup } from "@/components/admin-cashup";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays, ChartColumn, ChevronDown, ChevronRight, Download, Dumbbell, KeyRound, LayoutDashboard, Lightbulb, LogOut, Menu, PanelsTopLeft, RefreshCw,
  ScanLine, ScrollText, Search, Server, ShieldCheck, Ticket, UserCog, UserRound, Users, X, type LucideIcon,
} from "lucide-react";
import { canAccessSection, canViewSlips } from "@/lib/admin-permissions";
import { AdminDashboard } from "@/components/admin-dashboard";
import type { DashboardSnapshot } from "@/lib/admin-dashboard";
import type { ReportFigures } from "@/lib/report-figures";
import { coverageLabel, periodLabel } from "@/lib/report-periods";
import { completionChecklist, recommendations, roadmap } from "@/lib/admin-analysis";
import { adminLangCookie, adminThemeCookie, type AdminLang, type AdminTheme } from "@/lib/admin-preferences";

type Lang = AdminLang;
type Theme = AdminTheme;
type AdminMetric = { label: string; value: number | string; hint: string };
type AdminUser = { id: number; displayName: string; memberCode: string; phone?: string | null; email?: string | null; status: string; createdAt?: string };
type AdminBooking = {
  id?: number;
  bookingNo: string;
  title: string;
  displayName: string;
  sportName?: string | null;
  courtName?: string | null;
  startsAt: string;
  endsAt?: string | null;
  players?: number | null;
  amount: number;
  status: string;
  expiresAt?: string | null;
  cancelReason?: string | null;
  checkedInAt?: string | null;
};
type AdminCoupon = { id: number; code: string; name: string; category: string; price: number; totalUses: number; validityDays: number; active: number | boolean; sortOrder?: number | null; metadata?: string | Record<string, unknown> | null };
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
  bio?: string | null;
  specialties?: string[] | string | null;
  packages?: TrainerPackage[] | string | null;
  weeklySchedule?: TrainerScheduleDay[] | string | null;
  socialLine?: string | null;
  certifications?: string[] | string | null;
  startPrice: number;
  sortOrder?: number | null;
  active: number | boolean;
};
type TrainerPackage = { title: string; text: string; price: number };
type TrainerScheduleDay = { day: string; date?: string; slots: { time: string; status: "available" | "full" | "off" }[] };
type AdminPayment = { paymentNo: string; displayName: string; method: string; amount: number; status: string; createdAt?: string | null; paidAt?: string | null; itemName?: string | null; itemType?: string | null; slipUploadedAt?: string | null; previousSlipCount?: number | null; refundStatus?: string | null; cancelReason?: string | null };
type AdminCourt = { id: number; sportId?: number; sportName: string; name: string; zone?: string | null; capacity?: number | null; surface?: string | null; hourlyRate?: number | null; sortOrder?: number | null; notes?: string | null; status: string };
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
  permissionCodes: string[];
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
type AdminContentItem = {
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
  active: number | boolean;
  sortOrder?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminConsoleData = {
  // Role-gated figures for the dashboard (lib/admin-dashboard.ts); refreshed from /api/admin/dashboard.
  dashboard?: DashboardSnapshot;
  // Reports cards, counted in SQL for a stated period (lib/report-figures.ts).
  reportFigures?: ReportFigures;
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
  contentItems: AdminContentItem[];
  systemHealth: AdminSystemItem[];
  securityItems: AdminSystemItem[];
};

const copy = {
  th: {
    ops: "ระบบจัดการสปอร์ตคอมเพล็กซ์",
    eyebrow: "PPA POWER PLAY",
    backOffice: "หลังบ้าน",
    accountMenu: "เมนูบัญชีผู้ใช้",
    editProfileLong: "แก้ไขโปรไฟล์และรหัสผ่าน",
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
    scanner: "สแกน QR",
    bookings: "ระบบจอง",
    trainers: "เทรนเนอร์",
    content: "App Content",
    audit: "ตรวจสอบระบบ",
    security: "ความปลอดภัย",
    system: "สถานะระบบ",
    analysis: "ควรเพิ่มอะไร",
    recentBookings: "รายการจองล่าสุด",
    recentPayments: "ชำระเงินล่าสุด",
    revenueTrend: "กราฟรายได้",
    bookingStatus: "สถานะการจอง",
    bookingManager: "จัดการการจองและสนาม",
    bookingSearch: "ค้นหา booking / สมาชิก / กีฬา / สนาม",
    bookingUpdated: "อัปเดตรายการจองแล้ว",
    bookingCancelled: "ยกเลิกรายการจองแล้ว",
    bookingCheckin: "เช็คอิน",
    bookingMarkPaid: "รับชำระ",
    paymentMarkPaid: "ยืนยันชำระ",
    paymentCancel: "ยกเลิกรายการ",
    viewSlip: "ดูสลิป",
    receipt: "ใบเสร็จ",
    previousSlip: "สลิปเดิม",
    queueEmpty: "ไม่มีรายการรอยืนยันหรือรอคืนเงิน รายการใหม่จะขึ้นที่นี่เองภายใน 1 นาที",
    awaitingConfirmation: "รอยืนยัน",
    cancelReasonLabel: "เหตุผลที่ยกเลิก (แจ้งสมาชิก)",
    cancelReasons: ["ยอดโอนไม่ตรง", "ไม่พบยอดโอนในบัญชี", "สลิปไม่ถูกต้อง", "ลูกค้าขอยกเลิก", "อื่นๆ"],
    cancelOther: "ระบุเหตุผล",
    cancelSlipWarning: "สมาชิกส่งสลิปแล้ว หากได้รับเงินจริงต้องโอนคืนให้สมาชิก แล้วกด \"บันทึกคืนเงินแล้ว\" ที่รายการนี้",
    confirmCancel: "ยืนยันยกเลิกรายการ",
    keepPayment: "กลับ",
    refundPending: "รอคืนเงิน",
    recordRefund: "บันทึกคืนเงินแล้ว",
    refundNote: "หมายเหตุการโอนคืน (ไม่บังคับ)",
    confirmRefund: "ยืนยันว่าโอนคืนแล้ว",
    paymentUpdated: "อัปเดต payment แล้ว",
    bookingExpire: "หมดอายุ",
    cancelReason: "เหตุผลยกเลิก",
    courtManager: "จัดการสนาม",
    addCourt: "เพิ่มสนาม",
    editCourt: "แก้ไขสนาม",
    courtCreated: "เพิ่มสนามแล้ว",
    courtUpdated: "อัปเดตสนามแล้ว",
    courtDeleted: "ซ่อนสนามแล้ว",
    courtSearch: "ค้นหาสนาม / กีฬา / โซน",
    sport: "กีฬา",
    courtName: "ชื่อสนาม",
    zone: "โซน",
    capacity: "ความจุ",
    surface: "พื้นสนาม",
    hourlyRate: "ราคาเฉพาะสนาม",
    notes: "หมายเหตุ",
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
    reportAudit: "บันทึกการทำงาน",
    reportCashup: "ปิดยอดประจำวัน",
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
    recommendations: "ทำต่อเมื่อมีข้อมูลหรือความต้องการจริง",
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
    checklistTitle: "ความพร้อมตามเมนู",
    checklistStatusReady: "พร้อมใช้",
    checklistStatusNext: "ทำภายหลัง",
    paidBookingRate: "อัตราการจองที่ชำระแล้ว",
    salesExTopup: "ยอดขาย (ไม่รวมเติมเงิน)",
    paidPayments: "รายการชำระสำเร็จ",
    bookingsMade: "การจองที่ทำ",
    newMembers: "สมาชิกใหม่",
    memberVisits: "เข้าใช้บริการ",
    couponsSold: "คูปองที่ขาย",
    checkedInBookings: "การจองที่เช็คอินแล้ว",
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
    staffPermissions: "สิทธิ์ที่ทำได้",
    noPermissions: "ยังไม่มีสิทธิ์",
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
    bio: "ประวัติ/แนวทางสอน",
    specialties: "ความเชี่ยวชาญ",
    specialtiesHint: "ใส่ 1 รายการต่อ 1 บรรทัด เช่น HYROX",
    packages: "แพ็กเกจเทรน",
    packagesHint: "รูปแบบ: ชื่อ | รายละเอียด | ราคา",
    weeklySchedule: "ตารางว่างรายสัปดาห์",
    weeklyScheduleHint: "รูปแบบ: วัน | วันที่ | เวลา | สถานะ เช่น จันทร์ | 13 | 08:00 | available",
    socialLine: "LINE / ช่องทางติดต่อ",
    sortOrder: "ลำดับแสดงผล",
    addContent: "เพิ่มคอนเทนต์",
    editContent: "แก้ไขคอนเทนต์",
    contentList: "คอนเทนต์ในแอป",
    contentCreated: "เพิ่มคอนเทนต์แล้ว",
    contentUpdated: "อัปเดตคอนเทนต์แล้ว",
    contentDeleted: "ปิดใช้งานคอนเทนต์แล้ว",
    contentSearch: "ค้นหา type / slug / title / target",
    contentType: "ประเภท",
    title: "หัวข้อ",
    subtitle: "คำโปรย",
    body: "รายละเอียด",
    actionLabel: "ปุ่มกระทำ",
    targetScreen: "Screen ปลายทาง",
    metadata: "Metadata JSON",
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
      memberId: "รหัสสมาชิก",
      contact: "ติดต่อ",
      status: "สถานะ",
      booking: "การจอง",
      time: "เวลา",
      amount: "ยอด",
      coupon: "คูปอง",
      category: "หมวด",
      price: "ราคา",
      usage: "จำนวนใช้",
      trainer: "เทรนเนอร์",
      role: "บทบาท",
      startPrice: "ราคาเริ่ม",
      payment: "รายการชำระ",
      method: "ช่องทาง",
    },
    methods: { promptpay: "พร้อมเพย์", cash: "เงินสด", card: "บัตร", wallet: "Wallet", line_pay: "LINE Pay" },
  },
  en: {
    ops: "Sport complex operations",
    eyebrow: "PPA POWER PLAY",
    backOffice: "Back office",
    accountMenu: "Account menu",
    editProfileLong: "Edit profile and password",
    search: "Search members / bookings / coupons",
    language: "Language",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    refresh: "Refresh",
    home: "Home",
    signedIn: "Signed in",
    editProfile: "Profile",
    logout: "Sign out",
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
    scanner: "Scan QR",
    bookings: "Bookings",
    trainers: "Trainers",
    content: "App Content",
    audit: "Audit",
    security: "Security",
    system: "System",
    analysis: "Analysis",
    recentBookings: "Recent Bookings",
    recentPayments: "Recent Payments",
    revenueTrend: "Revenue Trend",
    bookingStatus: "Booking Status",
    bookingManager: "Booking and court manager",
    bookingSearch: "Search booking / member / sport / court",
    bookingUpdated: "Booking updated",
    bookingCancelled: "Booking cancelled",
    bookingCheckin: "Check in",
    bookingMarkPaid: "Take payment",
    paymentMarkPaid: "Confirm paid",
    paymentCancel: "Cancel",
    viewSlip: "View slip",
    receipt: "Receipt",
    previousSlip: "Earlier slip",
    queueEmpty: "Nothing is waiting. New payment requests appear here within a minute.",
    awaitingConfirmation: "Awaiting confirmation",
    cancelReasonLabel: "Reason (sent to the member)",
    cancelReasons: ["Amount does not match", "Transfer not found", "Invalid slip", "Customer asked to cancel", "Other"],
    cancelOther: "Describe the reason",
    cancelSlipWarning: "The member sent a slip. If the money arrived, transfer it back, then use \"Record refund\" on this payment.",
    confirmCancel: "Cancel payment",
    keepPayment: "Back",
    refundPending: "Refund due",
    recordRefund: "Record refund",
    refundNote: "Refund note (optional)",
    confirmRefund: "Confirm refund sent",
    paymentUpdated: "Payment updated",
    bookingExpire: "Expire",
    cancelReason: "Cancel reason",
    courtManager: "Court manager",
    addCourt: "Add court",
    editCourt: "Edit court",
    courtCreated: "Court created",
    courtUpdated: "Court updated",
    courtDeleted: "Court hidden",
    courtSearch: "Search court / sport / zone",
    sport: "Sport",
    courtName: "Court name",
    zone: "Zone",
    capacity: "Capacity",
    surface: "Surface",
    hourlyRate: "Court rate",
    notes: "Notes",
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
    reportCashup: "Daily cash-up",
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
    recommendations: "Next, once there is real data or demand",
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
    checklistTitle: "What each menu can do",
    checklistStatusReady: "Ready",
    checklistStatusNext: "Later",
    paidBookingRate: "Paid booking rate",
    salesExTopup: "Sales (excl. top-ups)",
    paidPayments: "Paid payments",
    bookingsMade: "Bookings made",
    newMembers: "New members",
    memberVisits: "Visits",
    couponsSold: "Coupons sold",
    checkedInBookings: "Checked-in bookings",
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
    staffPermissions: "Allowed actions",
    noPermissions: "No permissions",
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
    bio: "Bio / Coaching approach",
    specialties: "Specialties",
    specialtiesHint: "One item per line, e.g. HYROX",
    packages: "Training packages",
    packagesHint: "Format: Title | Detail | Price",
    weeklySchedule: "Weekly availability",
    weeklyScheduleHint: "Format: Day | Date | Time | Status, e.g. Monday | 13 | 08:00 | available",
    socialLine: "LINE / contact channel",
    sortOrder: "Display order",
    addContent: "Add content",
    editContent: "Edit content",
    contentList: "App content",
    contentCreated: "Content created",
    contentUpdated: "Content updated",
    contentDeleted: "Content disabled",
    contentSearch: "Search type / slug / title / target",
    contentType: "Type",
    title: "Title",
    subtitle: "Subtitle",
    body: "Body",
    actionLabel: "Action label",
    targetScreen: "Target screen",
    metadata: "Metadata JSON",
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
    methods: { promptpay: "PromptPay", cash: "Cash", card: "Card", wallet: "Wallet", line_pay: "LINE Pay" },
  },
} as const;

const tabs = [
  ["dashboard", "Dashboard", "dashboard", LayoutDashboard],
  ["members", "Members", "members", Users],
  ["staff", "Staff", "staff", UserCog],
  ["roles", "Roles", "roles", KeyRound],
  ["reports", "Reports", "reports", ChartColumn],
  ["content", "Content", "content", PanelsTopLeft],
  ["coupons", "Coupons", "coupons", Ticket],
  ["bookings", "Bookings", "bookings", CalendarDays],
  ["scanner", "Scan QR", "scanner", ScanLine],
  ["trainers", "Trainers", "trainers", Dumbbell],
  ["audit", "Audit", "audit", ScrollText],
  ["security", "Security", "security", ShieldCheck],
  ["system", "System", "system", Server],
  ["analysis", "Analysis", "analysis", Lightbulb],
] as const satisfies readonly (readonly [string, string, string, LucideIcon])[];

type AdminTab = (typeof tabs)[number][0];
type ReportSection = "overview" | "finance" | "cashup" | "bookings" | "members" | "coupons" | "trainers" | "courts" | "engagement" | "audit";
type AdminNavGroup = { labelTh: string; labelEn: string; items: AdminTab[] };

const reportSectionIds = ["overview", "finance", "cashup", "bookings", "members", "coupons", "trainers", "courts", "engagement", "audit"] as const;
const adminNavGroups: AdminNavGroup[] = [
  { labelTh: "ภาพรวม", labelEn: "Overview", items: ["dashboard"] },
  { labelTh: "งานบริการหลัก", labelEn: "Core Operations", items: ["bookings", "scanner", "members", "trainers", "coupons", "content"] },
  { labelTh: "รายงานและวิเคราะห์", labelEn: "Reports & Analytics", items: ["reports", "analysis"] },
  { labelTh: "ทีมงานและสิทธิ์", labelEn: "Team & Access", items: ["staff", "roles"] },
  { labelTh: "ระบบและความปลอดภัย", labelEn: "System & Security", items: ["audit", "security", "system"] },
];

function pageDescription(tab: AdminTab, lang: Lang) {
  const descriptions = {
    th: {
      dashboard: "ศูนย์ควบคุมภาพรวมรายได้ การจอง สนาม และความพร้อมระบบ",
      members: "ค้นหาและตรวจสอบข้อมูลสมาชิก สถานะ และช่องทางติดต่อ",
      scanner: "ตรวจสอบ QR และยืนยันใช้สิทธิ์หน้างาน",
      bookings: "ติดตามรายการจอง เวลาใช้งาน ยอดชำระ และสถานะสนาม",
      trainers: "จัดการโปรไฟล์ รูปภาพ ราคา และสถานะเทรนเนอร์ของสปอร์ตคอมเพล็กซ์",
      content: "จัดการ banner, promotion, class schedule, live TV, membership และ screen จาก prototype",
      coupons: "ตรวจสอบคูปอง หมวดหมู่ ราคา และการใช้งาน",
      reports: "วิเคราะห์ข้อมูลรายงานพร้อมตัวกรอง สรุปรวม และส่งออก CSV",
      analysis: "สิ่งที่ระบบทำได้แล้ว สิ่งที่ควรทำต่อเมื่อมีข้อมูลจริง และสิ่งที่ยังไม่คุ้มที่จะทำ",
      staff: "จัดการบัญชีพนักงาน บทบาท สถานะ และการเข้าถึงระบบ",
      roles: "กำหนดสิทธิ์ตามบทบาทและควบคุม permission สำคัญ",
      audit: "ตรวจสอบประวัติการทำงาน การแก้ไข และ action เสี่ยง",
      security: "ติดตามความปลอดภัย LINE-only, admin key และ control สำคัญ",
      system: "ตรวจสถานะระบบ ฐานข้อมูล การแจ้งเตือน และ readiness",
    },
    en: {
      dashboard: "Control revenue, bookings, courts, and system readiness in one view.",
      members: "Search and review member profiles, status, and contact data.",
      scanner: "Verify member QR codes and confirm access.",
      bookings: "Track bookings, session times, payments, and court states.",
      trainers: "Manage trainer profiles, photos, prices, and active status.",
      content: "Manage banners, promotions, class schedules, live TV, membership, and prototype screens.",
      coupons: "Review coupons, categories, pricing, and usage.",
      reports: "Analyze reports with filters, summaries, and CSV export.",
      analysis: "What is built, what comes next once there is real data, and what is not worth doing now.",
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
    ["cashup", t.reportCashup, "🧮"],
    ["bookings", t.reportBookings, "📅"],
    ["members", t.reportMembers, "👤"],
    ["coupons", t.reportCoupons, "🎟️"],
    ["trainers", t.reportTrainers, "🏋️"],
    ["courts", t.reportCourts, "🏟️"],
    ["engagement", t.reportEngagement, "📡"],
    ["audit", t.reportAudit, "🧾"],
  ];
}

export function AdminConsole({ adminKey, data, initialReportSection, initialTab = "dashboard", initialTheme = "light", initialLang = "th" }: { adminKey: string; data: AdminConsoleData; initialReportSection?: string; initialTab?: string; initialTheme?: Theme; initialLang?: Lang }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = sidebarRef.current;
    const previous = document.activeElement as HTMLElement | null;
    sidebar?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); }
      if (event.key !== "Tab" || !sidebar) return;
      const controls = Array.from(sidebar.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')).filter((node) => node.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const onResize = () => { if (window.innerWidth >= 1024) setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      previous?.focus();
    };
  }, [menuOpen]);
  const canAccessTab = useCallback((id: string) => data.currentAdmin?.roleCode === "super_admin" || canAccessSection(id, (permission) => Boolean(data.currentAdmin?.permissionCodes.includes(permission))), [data.currentAdmin]);
  const [tab, setTab] = useState<AdminTab>(isAdminTab(initialTab) ? initialTab : "dashboard");
  const initialReport = isReportSection(initialReportSection || null) ? initialReportSection as ReportSection : "overview";
  const [reportSection, setReportSection] = useState<ReportSection>(initialReport);
  const [reportMenuOpen, setReportMenuOpen] = useState(initialTab === "reports");
  const [query, setQuery] = useState("");
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  // Remembered for a year, read by the server so the next visit renders in the same theme and language.
  const remember = (name: string, value: string) => { document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`; };
  const setLang = (value: Lang) => { setLangState(value); remember(adminLangCookie, value); };
  const setTheme = (value: Theme) => { setThemeState(value); remember(adminThemeCookie, value); };
  const [bookingRows, setBookingRows] = useState(data.bookings);
  const [courtRows, setCourtRows] = useState(data.courts);
  const [paymentRows, setPaymentRows] = useState(data.payments);
  const [staffRows, setStaffRows] = useState(data.staff);
  const [couponRows, setCouponRows] = useState(data.coupons);
  const [trainerRows, setTrainerRows] = useState(data.trainers);
  const [contentRows, setContentRows] = useState(data.contentItems);
  const [roleRows, setRoleRows] = useState(data.roles);
  const [permissionRows, setPermissionRows] = useState(data.permissions);
  const [adminMessage, setAdminMessage] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const t = copy[lang];

  useEffect(() => {
    const syncFromPath = () => {
      const section = window.location.pathname.split("/").filter(Boolean)[1] || "dashboard";
      if (isAdminTab(section) && canAccessTab(section)) {
        setTab(section);
        setReportMenuOpen(section === "reports");
      }
      const nextReport = new URLSearchParams(window.location.search).get("report");
      setReportSection(isReportSection(nextReport) ? nextReport : "overview");
    };
    window.addEventListener("popstate", syncFromPath);
    return () => window.removeEventListener("popstate", syncFromPath);
  }, [canAccessTab]);

  const activeTab = tabs.find(([id]) => id === tab);
  const currentAdminRaw = staffRows.find((row) => row.id === data.currentAdmin?.id) || data.currentAdmin;
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
    if (!canAccessTab(id)) return;
    setMenuOpen(false);
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
    if (!canAccessTab("reports")) return;
    setMenuOpen(false);
    setReportSection(section);
    setTab("reports");
    setReportMenuOpen(true);
    window.history.pushState({}, "", adminPath("reports", section));
  };
  const logout = async () => {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.replace("/AdminConsole");
    router.refresh();
  };
  const reportTabs = reportMenu(t);

  return (
    <main className="admin admin-console" data-theme={theme} data-menu-open={menuOpen}>
      {menuOpen ? <button className="admin-menu-backdrop" tabIndex={-1} aria-label="Close menu" onClick={() => setMenuOpen(false)} /> : null}
      <aside className="admin-sidebar" id="admin-navigation" ref={sidebarRef} role={menuOpen ? "dialog" : undefined} aria-modal={menuOpen || undefined} aria-label="Admin navigation">
        <button className="admin-menu-close" type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X aria-hidden="true" /></button>
        <div className="admin-brand">
          <div className="admin-logo">PPA<span>.</span></div>
          <small>{t.ops}</small>
        </div>
        <nav>
          {adminNavGroups.filter((group) => group.items.some(canAccessTab)).map((group) => (
            <section className="admin-nav-section" key={group.labelEn}>
              {group.items.length > 1 ? <p>{lang === "th" ? group.labelTh : group.labelEn}</p> : null}
              {group.items.filter(canAccessTab).map((itemId) => {
                const item = tabs.find(([id]) => id === itemId);
                if (!item) return null;
                const [id, , key, Icon] = item;
                return (
                  <div className="admin-nav-group" key={id}>
                    <button
                      aria-current={tab === id && id !== "reports" ? "page" : undefined}
                      aria-expanded={id === "reports" ? reportMenuOpen : undefined}
                      className={`${tab === id ? "on" : ""} ${id === "reports" && reportMenuOpen ? "expanded" : ""}`}
                      onClick={() => (id === "reports" ? toggleReportMenu() : goTab(id))}
                      type="button"
                    >
                      <Icon className="admin-nav-icon" aria-hidden="true" />
                      <span className="admin-nav-label">{t[key]}</span>
                      {id === "reports" ? <ChevronDown className="admin-nav-caret" aria-hidden="true" /> : null}
                    </button>
                    {id === "reports" && reportMenuOpen ? (
                      <div className="admin-subnav">
                        {reportTabs.map(([section, label]) => (
                          <button aria-current={tab === "reports" && reportSection === section ? "page" : undefined} className={tab === "reports" && reportSection === section ? "on" : ""} key={section} type="button" onClick={() => goReport(section)}>
                            <span className="admin-nav-label">{label}</span>
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
      <section className="admin-main" inert={menuOpen}>
        <header className="admin-navbar">
          <button className="admin-menu-toggle" type="button" ref={menuButtonRef} aria-label="Open menu" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(true)}><Menu aria-hidden="true" /></button>
          <p className="admin-crumbs">
            <span>{t.backOffice}</span>
            <ChevronRight aria-hidden="true" />
            <b>{tab === "reports" ? reportTabs.find(([id]) => id === reportSection)?.[1] || currentTitle : currentTitle}</b>
          </p>
          <div className="admin-navbar-actions">
            {currentAdmin ? (
              <UserMenu admin={currentAdmin} lang={lang} theme={theme} t={t} onLang={setLang} onTheme={setTheme} onLogout={logout} onOpenProfile={() => setProfileOpen(true)} />
            ) : null}
          </div>
        </header>

        {profileOpen && currentAdmin ? (
          <ProfileModal admin={currentAdmin} adminKey={adminKey} lang={lang} onClose={() => setProfileOpen(false)} onProfileSaved={(updated) => setStaffRows((existing) => [...existing.filter((row) => !updated.some((item) => item.id === row.id)), ...updated])} t={t} />
        ) : null}

        {/* The dashboard has its own header (date, last update, refresh). */}
        {tab !== "dashboard" ? <header className="admin-top">
          <div>
            <h1>{currentTitle}</h1>
            <span>{currentDescription}</span>
          </div>
          <div className="admin-page-toolbar">
            {showHeaderSearch ? (
              <label className="admin-page-search">
                <Search aria-hidden="true" />
                <span className="admin-sr-only">{t.search} {searchScope}</span>
                <input type="search" placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} />
              </label>
            ) : null}
            <button className="admin-refresh" type="button" onClick={() => window.location.reload()}><RefreshCw aria-hidden="true" />{t.refresh}</button>
          </div>
        </header> : null}

        {tab === "dashboard" && (
          <AdminDashboard
            initial={data.dashboard}
            lang={lang}
            systemIssues={canAccessTab("system") ? [...data.securityItems, ...data.systemHealth].filter((item) => item.status !== "good").length : null}
            onNavigate={goTab}
            renderQueue={(rows, onChange) => (
              <PaymentTable canManage={canViewSlips(data.currentAdmin)} adminKey={adminKey} rows={rows} lang={lang} t={t} emptyText={t.queueEmpty} onPaymentsChange={(payments) => { setPaymentRows(payments); onChange(payments); }} />
            )}
          />
        )}
        {tab === "members" && <AdminMembers search={query} lang={lang} canSell={data.currentAdmin?.roleCode === "super_admin" || Boolean(data.currentAdmin?.permissionCodes.includes("sales.manage"))} canManage={data.currentAdmin?.roleCode === "super_admin" || Boolean(data.currentAdmin?.permissionCodes.includes("members.manage"))} />}
        {tab === "staff" && (
          <StaffManager
            adminKey={adminKey}
            lang={lang}
            message={adminMessage}
            permissions={permissionRows}
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
        {tab === "reports" && <Reports adminKey={adminKey} data={{ ...data, payments: paymentRows }} lang={lang} onPaymentsChange={setPaymentRows} section={reportSection} t={t} />}
        {tab === "content" && <ContentManager adminKey={adminKey} lang={lang} message={adminMessage} rows={contentRows} setMessage={setAdminMessage} setRows={setContentRows} t={t} />}
        {tab === "coupons" && <CouponManager adminKey={adminKey} lang={lang} message={adminMessage} rows={couponRows} setMessage={setAdminMessage} setRows={setCouponRows} t={t} />}
        {tab === "scanner" && <AdminQrScanner lang={lang} />}
        {tab === "bookings" && <BookingManager adminKey={adminKey} courts={courtRows} lang={lang} message={adminMessage} rows={bookingRows} setCourts={setCourtRows} setMessage={setAdminMessage} setRows={setBookingRows} t={t} />}
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

// Account menu in the top bar: a native popover (top layer, Esc and outside click close it,
// focus returns to the trigger). Profile, language, theme and sign-out live here.
function UserMenu({ admin, lang, theme, t, onLang, onTheme, onLogout, onOpenProfile }: {
  admin: AdminStaff;
  lang: Lang;
  theme: Theme;
  t: typeof copy[Lang];
  onLang: (value: Lang) => void;
  onTheme: (value: Theme) => void;
  onLogout: () => void;
  onOpenProfile: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const role = lang === "th" ? admin.roleNameTh : admin.roleNameEn;
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const onToggle = (event: Event) => {
      const isOpen = (event as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen) menu.querySelector<HTMLElement>("button")?.focus();
    };
    menu.addEventListener("toggle", onToggle);
    return () => menu.removeEventListener("toggle", onToggle);
  }, []);
  const close = () => menuRef.current?.hidePopover();
  return (
    <>
      <button className="admin-user-trigger" type="button" popoverTarget="admin-user-menu" aria-haspopup="dialog" aria-expanded={open}>
        <span className="admin-avatar" aria-hidden="true">{initials(admin.displayName || admin.username)}</span>
        <span><b>{admin.displayName}</b><small>{role}</small></span>
        <ChevronDown aria-hidden="true" />
      </button>
      <div ref={menuRef} id="admin-user-menu" className="admin-user-menu" popover="auto" role="dialog" aria-label={t.accountMenu}>
        <div className="admin-user-menu-head">
          <span className="admin-avatar" aria-hidden="true">{initials(admin.displayName || admin.username)}</span>
          <div><b>{admin.displayName}</b><small>{role} · {admin.username}</small></div>
        </div>
        <button type="button" className="admin-menu-item" onClick={() => { close(); onOpenProfile(); }}><UserRound aria-hidden="true" />{t.editProfileLong}</button>
        <div className="admin-menu-row"><span>{t.language}</span><Segment label={t.language} value={lang} options={[["th", "ไทย"], ["en", "EN"]]} onChange={(value) => onLang(value as Lang)} /></div>
        <div className="admin-menu-row"><span>{t.theme}</span><Segment label={t.theme} value={theme} options={[["light", t.light], ["dark", t.dark]]} onChange={(value) => onTheme(value as Theme)} /></div>
        <hr className="admin-menu-separator" />
        <button type="button" className="admin-menu-item admin-menu-signout" onClick={() => { close(); onLogout(); }}><LogOut aria-hidden="true" />{t.logout}</button>
      </div>
    </>
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
    <AdminDialog onClose={onClose}>
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
    </AdminDialog>
  );
}

function Segment({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return (
    <div className="admin-segment" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button aria-pressed={value === id} className={value === id ? "on" : ""} key={id} type="button" onClick={() => onChange(id)}>{text}</button>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="admin-panel"><h2>{title}</h2>{children}</section>;
}

function MemberTable({ rows, lang, t }: { rows: AdminUser[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.cols.member}</th><th>{t.cols.memberId}</th><th>{t.cols.contact}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.displayName}<small>{formatDate(r.createdAt || "", lang)}</small></td><td>{r.memberCode}</td><td>{r.phone || r.email || "-"}</td><td><Badge tone={r.status === "active" ? "good" : "bad"}>{statusLabel(r.status, t)}</Badge></td></tr>)}</tbody></table>;
}

function BookingTable({ rows, lang, t }: { rows: AdminBooking[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.cols.booking}</th><th>{t.cols.member}</th><th>{t.cols.time}</th><th className="num">{t.cols.amount}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.bookingNo}><td>{r.title}<small>{r.bookingNo} · {r.sportName || "-"} · {r.courtName || "-"}</small></td><td>{r.displayName}<small>{r.players || 1} players</small></td><td>{formatDate(r.startsAt, lang)}<small>{r.endsAt ? formatDate(r.endsAt, lang) : ""}</small></td><td className="num">{money(r.amount, lang)} ฿</td><td><Badge tone={r.status === "paid" || r.status === "checked_in" ? "good" : r.status === "cancelled" || r.status === "expired" ? "bad" : "warn"}>{statusLabel(r.status, t)}</Badge></td></tr>)}</tbody></table>;
}

function CouponTable({ rows, lang, t }: { rows: AdminCoupon[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.cols.coupon}</th><th>{t.cols.category}</th><th className="num">{t.cols.price}</th><th>{t.cols.usage}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}<small>{r.code}</small></td><td>{r.category}</td><td className="num">{money(r.price, lang)} ฿</td><td>{r.totalUses} / {r.validityDays}d</td><td><Badge tone={r.active ? "good" : "bad"}>{statusLabel(r.active ? "active" : "off", t)}</Badge></td></tr>)}</tbody></table>;
}

function BookingManager({
  adminKey,
  courts,
  lang,
  message,
  rows,
  setCourts,
  setMessage,
  setRows,
  t,
}: {
  adminKey: string;
  courts: AdminCourt[];
  lang: Lang;
  message: string;
  rows: AdminBooking[];
  setCourts: (rows: AdminCourt[]) => void;
  setMessage: (message: string) => void;
  setRows: (rows: AdminBooking[]) => void;
  t: typeof copy[Lang];
}) {
  const [bookingSearch, setBookingSearch] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  // The calendar and the list show the same bookings: a change in one reloads the other.
  const [calendarKey, setCalendarKey] = useState(0);
  const [paying, setPaying] = useState<AdminBooking | null>(null);
  const reloadBookings = useCallback(async () => {
    const response = await adminFetch(adminKey, "/api/admin/bookings", { method: "GET" });
    if (response.ok) setRows((await response.json()).bookings);
  }, [adminKey, setRows]);
  const [courtModalOpen, setCourtModalOpen] = useState(false);
  const [editingCourtId, setEditingCourtId] = useState<number | null>(null);
  const [courtSearch, setCourtSearch] = useState("");
  const sportOptions = useMemo(() => uniqueSports(courts), [courts]);
  const [courtForm, setCourtForm] = useState({
    sportId: sportOptions[0]?.id || 1,
    name: "",
    zone: "Main",
    capacity: 4,
    surface: "",
    hourlyRate: 0,
    sortOrder: 0,
    notes: "",
    status: "available",
  });
  const filteredBookings = useMemo(() => {
    const needle = bookingSearch.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.bookingNo} ${row.title} ${row.displayName} ${row.sportName || ""} ${row.courtName || ""} ${row.status}`.toLowerCase().includes(needle));
  }, [bookingSearch, rows]);
  const filteredCourts = useMemo(() => {
    const needle = courtSearch.trim().toLowerCase();
    if (!needle) return courts;
    return courts.filter((row) => `${row.sportName} ${row.name} ${row.zone || ""} ${row.status}`.toLowerCase().includes(needle));
  }, [courtSearch, courts]);

  const updateBooking = async (booking: AdminBooking, status: string) => {
    setMessage("");
    const response = await adminFetch(adminKey, "/api/admin/bookings", {
      method: "PUT",
      body: JSON.stringify({ bookingNo: booking.bookingNo, status, reason: cancelReason }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.saveFailed);
    setRows(result.bookings);
    setCancelReason("");
    setCalendarKey((value) => value + 1);
    setMessage(status === "cancelled" ? t.bookingCancelled : t.bookingUpdated);
  };
  const resetCourt = () => {
    setEditingCourtId(null);
    setCourtForm({ sportId: sportOptions[0]?.id || 1, name: "", zone: "Main", capacity: 4, surface: "", hourlyRate: 0, sortOrder: 0, notes: "", status: "available" });
  };
  const editCourt = (court: AdminCourt) => {
    setEditingCourtId(court.id);
    setCourtForm({ sportId: court.sportId || sportOptions[0]?.id || 1, name: court.name, zone: court.zone || "Main", capacity: Number(court.capacity || 4), surface: court.surface || "", hourlyRate: Number(court.hourlyRate || 0), sortOrder: Number(court.sortOrder || 0), notes: court.notes || "", status: court.status });
    setCourtModalOpen(true);
  };
  const submitCourt = async () => {
    setMessage("");
    const response = await adminFetch(adminKey, "/api/admin/courts", { method: editingCourtId ? "PUT" : "POST", body: JSON.stringify({ ...courtForm, id: editingCourtId || undefined }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.saveFailed);
    setCourts(result.courts);
    setMessage(editingCourtId ? t.courtUpdated : t.courtCreated);
    resetCourt();
    setCourtModalOpen(false);
  };
  const removeCourt = async (court: AdminCourt) => {
    setMessage("");
    const response = await adminFetch(adminKey, `/api/admin/courts?id=${court.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.deleteFailed);
    setCourts(result.courts);
    setMessage(t.courtDeleted);
  };

  return (
    <div className="admin-trainer-layout">
      <AdminCourtCalendar lang={lang} onBookingsChange={reloadBookings} refreshKey={calendarKey} />
      <Panel title={t.bookingManager}>
        <div className="admin-list-toolbar">
          <input placeholder={t.bookingSearch} value={bookingSearch} onChange={(event) => setBookingSearch(event.target.value)} />
          <label className="admin-inline-field">{t.cancelReason}<input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label>
          <span>{t.rowsShowing} {filteredBookings.length} / {rows.length}</span>
        </div>
        <div className="admin-booking-cards">
          {filteredBookings.slice(0, 80).map((booking) => (
            <article key={booking.bookingNo}>
              <div><b>{booking.title}</b><span>{booking.bookingNo} · {booking.displayName}</span><small>{booking.sportName || "-"} · {booking.courtName || "-"} · {formatDate(booking.startsAt, lang)}</small><small>{booking.cancelReason || ""}</small></div>
              <Badge tone={booking.status === "paid" || booking.status === "checked_in" ? "good" : booking.status === "cancelled" || booking.status === "expired" ? "bad" : "warn"}>{statusLabel(booking.status, t)}</Badge>
              <div className="admin-row-actions">
                <button type="button" disabled={!["hold", "pending_payment"].includes(booking.status)} onClick={() => { setMessage(""); setPaying(booking); }}>{t.bookingMarkPaid}</button>
                <button type="button" disabled={booking.status !== "paid"} onClick={() => updateBooking(booking, "checked_in")}>{t.bookingCheckin}</button>
                <button type="button" disabled={["checked_in", "cancelled", "expired"].includes(booking.status)} onClick={() => updateBooking(booking, "expired")}>{t.bookingExpire}</button>
                <button type="button" className="danger" disabled={["checked_in", "cancelled", "expired"].includes(booking.status)} onClick={() => updateBooking(booking, "cancelled")}>{t.cancel}</button>
              </div>
            </article>
          ))}
        </div>
        {message ? <p className="admin-message">{message}</p> : null}
      </Panel>
      <Panel title={t.courtManager}>
        <div className="admin-list-toolbar">
          <input placeholder={t.courtSearch} value={courtSearch} onChange={(event) => setCourtSearch(event.target.value)} />
          <button type="button" onClick={() => { resetCourt(); setCourtModalOpen(true); }}>{t.addCourt}</button>
          <span>{t.rowsShowing} {filteredCourts.length} / {courts.length}</span>
        </div>
        <div className="admin-court-grid">
          {filteredCourts.map((court) => (
            <article key={court.id}>
              <div><b>{court.name}</b><span>{court.sportName} · {court.zone || "-"}</span><small>{t.capacity} {court.capacity || 0} · {court.surface || "-"} · {court.hourlyRate ? `${money(court.hourlyRate, lang)} ฿` : "-"}</small></div>
              <Badge tone={court.status === "available" ? "good" : court.status === "maintenance" ? "warn" : "bad"}>{statusLabel(court.status, t)}</Badge>
              <div className="admin-row-actions"><button type="button" onClick={() => editCourt(court)}>{t.edit}</button><button className="danger" type="button" onClick={() => removeCourt(court)}>{t.delete}</button></div>
            </article>
          ))}
        </div>
      </Panel>
      {paying ? (
        <CounterPaymentDialog lang={lang} booking={paying} onClose={() => setPaying(null)} onDone={(text) => { setPaying(null); setMessage(text); setCalendarKey((value) => value + 1); void reloadBookings(); }} />
      ) : null}
      {courtModalOpen ? (
        <AdminDialog onClose={() => { resetCourt(); setCourtModalOpen(false); }}>
          <section className="admin-modal">
            <header><div><small>{t.courtManager}</small><h2>{editingCourtId ? t.editCourt : t.addCourt}</h2></div><button type="button" onClick={() => { resetCourt(); setCourtModalOpen(false); }}>×</button></header>
            <div className="admin-form">
              <label>{t.sport}<select value={courtForm.sportId} onChange={(event) => setCourtForm({ ...courtForm, sportId: Number(event.target.value) })}>{sportOptions.map((sport) => <option key={sport.id} value={sport.id}>{sport.name}</option>)}</select></label>
              <label>{t.courtName}<input value={courtForm.name} onChange={(event) => setCourtForm({ ...courtForm, name: event.target.value })} /></label>
              <label>{t.zone}<input value={courtForm.zone} onChange={(event) => setCourtForm({ ...courtForm, zone: event.target.value })} /></label>
              <label>{t.capacity}<input type="number" value={courtForm.capacity} onChange={(event) => setCourtForm({ ...courtForm, capacity: Number(event.target.value) })} /></label>
              <label>{t.surface}<input value={courtForm.surface} onChange={(event) => setCourtForm({ ...courtForm, surface: event.target.value })} /></label>
              <label>{t.hourlyRate}<input type="number" value={courtForm.hourlyRate} onChange={(event) => setCourtForm({ ...courtForm, hourlyRate: Number(event.target.value) })} /></label>
              <label>{t.sortOrder}<input type="number" value={courtForm.sortOrder} onChange={(event) => setCourtForm({ ...courtForm, sortOrder: Number(event.target.value) })} /></label>
              <label>{t.status}<select value={courtForm.status} onChange={(event) => setCourtForm({ ...courtForm, status: event.target.value })}><option value="available">{t.statuses.available}</option><option value="maintenance">{t.statuses.maintenance}</option><option value="hidden">{t.statuses.hidden}</option></select></label>
              <label className="wide">{t.notes}<textarea value={courtForm.notes} onChange={(event) => setCourtForm({ ...courtForm, notes: event.target.value })} /></label>
              <div className="admin-form-actions"><button type="button" onClick={submitCourt}>{t.save}</button><button type="button" className="ghost" onClick={() => { resetCourt(); setCourtModalOpen(false); }}>{t.cancel}</button></div>
            </div>
          </section>
        </AdminDialog>
      ) : null}
    </div>
  );
}

function TrainerTable({ rows, lang, t }: { rows: AdminTrainer[]; lang: Lang; t: typeof copy[Lang] }) {
  return <table><thead><tr><th>{t.imagePreview}</th><th>{t.cols.trainer}</th><th>{t.cols.role}</th><th>{t.experience}</th><th className="num">{t.cols.startPrice}</th><th>{t.cols.status}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td><TrainerPhoto row={r} /></td><td>{r.name}<small>{r.nickname} · {r.slug}</small></td><td>{r.role}</td><td>{r.experience}</td><td className="num">{money(r.startPrice, lang)} ฿</td><td><Badge tone={r.active ? "good" : "bad"}>{statusLabel(r.active ? "active" : "off", t)}</Badge></td></tr>)}</tbody></table>;
}

function PaymentTable({ adminKey, canManage, rows, lang, onPaymentsChange, t, emptyText }: { adminKey?: string; canManage: boolean; rows: AdminPayment[]; lang: Lang; onPaymentsChange?: (rows: AdminPayment[]) => void; t: typeof copy[Lang]; emptyText?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // One inline form at a time: cancel a waiting payment (with a reason) or record a refund.
  const [form, setForm] = useState<{ paymentNo: string; mode: "cancel" | "refund"; preset: string; text: string } | null>(null);
  const pending = useRef(false);
  const actionable = canManage && Boolean(onPaymentsChange);
  const updatePayment = async (paymentNo: string, status: "paid" | "cancelled" | "refunded", reason?: string) => {
    if (!actionable || !onPaymentsChange || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await adminFetch(adminKey || "", "/api/admin/payments", { method: "PUT", body: JSON.stringify({ paymentNo, status, ...(reason ? { reason } : {}) }) });
      const result = await response.json();
      if (!response.ok) return setMessage(result.message || t.saveFailed);
      onPaymentsChange(result.payments);
      setForm(null);
      setMessage(t.paymentUpdated);
    } catch {
      setMessage(lang === "th" ? "ไม่ทราบผลการยืนยัน กรุณารีเฟรชตรวจสถานะก่อนลองใหม่" : "Confirmation result is unknown. Refresh and check the status before retrying.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const other = t.cancelReasons[t.cancelReasons.length - 1];
  const formReason = form ? (form.mode === "cancel" && form.preset !== other ? form.preset : form.text.trim()) : "";
  return (
    <>
      {emptyText && !rows.length ? <p className="dash-empty">{emptyText}</p> : null}
      {!emptyText || rows.length ? <table>
        <thead><tr><th>{t.cols.payment}</th><th>{t.cols.member}</th><th>{t.cols.method}</th><th className="num">{t.cols.amount}</th><th>{t.cols.status}</th><th>{t.action}</th></tr></thead>
        <tbody>{rows.map((r) => (
          <Fragment key={r.paymentNo}>
            <tr>
              <td>{r.paymentNo}<small>{paymentItemLabel(r, lang)}</small><small>{formatDate(r.paidAt || r.createdAt || "", lang)}</small>{canManage && r.slipUploadedAt ? <a className="admin-slip-link" href={`/api/admin/payments/slip?paymentNo=${encodeURIComponent(r.paymentNo)}`} target="_blank" rel="noopener noreferrer">{t.viewSlip} · {formatDate(r.slipUploadedAt, lang)}</a> : null}{canManage && Number(r.previousSlipCount) > 0 ? <span className="admin-slip-previous">{Array.from({ length: Math.min(Number(r.previousSlipCount), 10) }, (_, index) => <a key={index} href={`/api/admin/payments/slip?paymentNo=${encodeURIComponent(r.paymentNo)}&previous=${index}`} target="_blank" rel="noopener noreferrer">{t.previousSlip} {index + 1}</a>)}</span> : null}</td>
              <td>{r.displayName}</td>
              <td>{t.methods[r.method as keyof typeof t.methods] || r.method}</td>
              <td className="num">{money(r.amount, lang)} ฿</td>
              <td>
                {r.refundStatus === "pending" && r.status === "cancelled" ? <Badge tone="warn">{t.refundPending}</Badge> : <Badge tone={r.status === "paid" ? "good" : r.status === "failed" || r.status === "cancelled" ? "bad" : r.status === "refunded" ? "neutral" : "warn"}>{r.status === "created" ? t.awaitingConfirmation : statusLabel(r.status, t)}</Badge>}
                {r.cancelReason ? <small>{r.cancelReason}</small> : null}
              </td>
              <td>
                {r.status === "created" ? <button type="button" disabled={!actionable || busy} onClick={() => updatePayment(r.paymentNo, "paid")}>{t.paymentMarkPaid}</button> : null}
                {r.status === "created" && actionable ? <button type="button" className="danger" disabled={busy} aria-expanded={form?.paymentNo === r.paymentNo} onClick={() => setForm({ paymentNo: r.paymentNo, mode: "cancel", preset: t.cancelReasons[0], text: "" })}>{t.paymentCancel}</button> : null}
                {r.status === "cancelled" && r.refundStatus === "pending" && actionable ? <button type="button" disabled={busy} aria-expanded={form?.paymentNo === r.paymentNo} onClick={() => setForm({ paymentNo: r.paymentNo, mode: "refund", preset: "", text: "" })}>{t.recordRefund}</button> : null}
                {r.status === "paid" ? <a className="admin-button" href={`/AdminConsole/receipt/${encodeURIComponent(r.paymentNo)}`} target="_blank" rel="noopener">{t.receipt}</a> : null}
              </td>
            </tr>
            {form?.paymentNo === r.paymentNo ? (
              <tr className="payment-action-row">
                <td colSpan={6}>
                  <form className="payment-action-form" onSubmit={(event) => { event.preventDefault(); if (form.mode === "cancel" && !formReason) return; void updatePayment(r.paymentNo, form.mode === "cancel" ? "cancelled" : "refunded", formReason || undefined); }}>
                    {form.mode === "cancel" ? (
                      <>
                        <label>{t.cancelReasonLabel}<select value={form.preset} disabled={busy} onChange={(event) => setForm({ ...form, preset: event.target.value })}>{t.cancelReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></label>
                        {form.preset === other ? <label>{t.cancelOther}<input required pattern={".*\\S.*"} maxLength={200} value={form.text} disabled={busy} onChange={(event) => setForm({ ...form, text: event.target.value })} /></label> : null}
                        {r.slipUploadedAt ? <p className="payment-action-note" role="note">{t.cancelSlipWarning}</p> : null}
                      </>
                    ) : (
                      <label>{t.refundNote}<input maxLength={200} value={form.text} disabled={busy} onChange={(event) => setForm({ ...form, text: event.target.value })} /></label>
                    )}
                    <div className="payment-action-buttons">
                      <button type="submit" className={form.mode === "cancel" ? "danger" : ""} disabled={busy}>{form.mode === "cancel" ? t.confirmCancel : t.confirmRefund}</button>
                      <button type="button" disabled={busy} onClick={() => setForm(null)}>{t.keepPayment}</button>
                    </div>
                  </form>
                </td>
              </tr>
            ) : null}
          </Fragment>
        ))}</tbody>
      </table> : null}
      {message ? <p className="admin-message" role="status">{message}</p> : null}
    </>
  );
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
  const oldest = useMemo(() => (dateGetter ? oldestOf(rows.map(dateGetter)) : null), [dateGetter, rows]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <Panel title={title}>
      <div className="admin-report-list">
        <div className="admin-filterbar">
          <label>{t.reportSearchRows}<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          {dateGetter ? <label>{t.reportDateFrom}<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label> : null}
          {dateGetter ? <label>{t.reportDateTo}<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label> : null}
          {statusGetter ? <label>{t.reportStatus}<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">{t.reportAllStatus}</option>{statusOptions.map((item) => <option key={item} value={item}>{statusLabel(item, t)}</option>)}</select></label> : null}
          <label>{t.reportPageSize}<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
          <button type="button" onClick={() => { setQuery(""); setDateFrom(""); setDateTo(""); setStatus(""); setPage(1); }}>{t.resetFilter}</button>
          <ExportButton label={t.exportCsv} filename={filename} rows={filteredRows.map((row) => row as Record<string, unknown>)} />
        </div>
        <div className="admin-report-summary">
          <article><span>{t.total}</span><b>{rows.length}</b><small>{coverageLabel(rows.length, oldest, lang)}</small></article>
          <article><span>{t.reportFilteredRows}</span><b>{filteredRows.length}</b><small>{t.rowsShowing} {pagedRows.length}</small></article>
          <article><span>{amountLabel || t.reportSummary}</span><b>{amountLabel ? `${money(sumReportAmount(filteredRows), lang)} ฿` : filteredRows.length}</b><small>{t.total}</small></article>
        </div>
        <div className="admin-table-scroll">{renderTable(pagedRows)}</div>
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
    sortOrder: 0,
    metadataText: "{}",
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
    setForm({ code: "", name: "", category: "fitness", price: 0, totalUses: 1, validityDays: 30, active: true, sortOrder: 0, metadataText: "{}" });
  };
  const openCreate = () => {
    reset();
    setMessage("");
    setModalOpen(true);
  };
  const edit = (row: AdminCoupon) => {
    setEditingId(row.id);
    setForm({ code: row.code, name: row.name, category: row.category, price: Number(row.price || 0), totalUses: Number(row.totalUses || 1), validityDays: Number(row.validityDays || 30), active: Boolean(row.active), sortOrder: Number(row.sortOrder || 0), metadataText: formatMetadata(row.metadata) });
    setMessage("");
    setModalOpen(true);
  };
  const submit = async () => {
    setMessage("");
    let metadata: Record<string, unknown>;
    try {
      const parsed = JSON.parse(form.metadataText || "{}") as unknown;
      metadata = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      setMessage(`${t.metadata} ${lang === "th" ? "ไม่ถูกต้อง" : "is invalid"}`);
      return;
    }
    const { metadataText: _metadataText, ...fields } = form;
    void _metadataText;
    const response = await adminFetch(adminKey, "/api/admin/coupons", { method: editingId ? "PUT" : "POST", body: JSON.stringify({ ...fields, metadata, id: editingId || undefined }) });
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
        <AdminDialog onClose={() => { reset(); setModalOpen(false); }}>
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
              <label>{t.sortOrder}<input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></label>
              <label className="wide">{t.metadata}<textarea placeholder='{"tab":"coupon","group":"c10","variant":"base","badge":"BEST SELLER"}' value={form.metadataText} onChange={(event) => setForm({ ...form, metadataText: event.target.value })} /></label>
              <div className="admin-form-actions"><button type="button" onClick={submit}>{t.save}</button><button type="button" className="ghost" onClick={() => { reset(); setModalOpen(false); }}>{t.cancel}</button></div>
              {message ? <p className="admin-message">{message}</p> : null}
            </div>
          </section>
        </AdminDialog>
      ) : null}
    </div>
  );
}

function ContentManager({
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
  rows: AdminContentItem[];
  setMessage: (message: string) => void;
  setRows: (rows: AdminContentItem[]) => void;
  t: typeof copy[Lang];
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [contentSearch, setContentSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [form, setForm] = useState({
    contentType: "feature_screen",
    slug: "",
    title: "",
    subtitle: "",
    body: "",
    icon: "📌",
    imageUrl: "",
    actionLabel: "",
    targetScreen: "",
    price: 0,
    metadataText: "{}",
    active: true,
    sortOrder: 0,
  });
  const filteredRows = useMemo(() => {
    const needle = contentSearch.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.contentType} ${row.slug} ${row.title} ${row.subtitle || ""} ${row.targetScreen || ""}`.toLowerCase().includes(needle));
  }, [contentSearch, rows]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / perPage), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * perPage, currentPage * perPage);

  const reset = () => {
    setEditingId(null);
    setForm({ contentType: "feature_screen", slug: "", title: "", subtitle: "", body: "", icon: "📌", imageUrl: "", actionLabel: "", targetScreen: "", price: 0, metadataText: "{}", active: true, sortOrder: 0 });
  };
  const openCreate = () => {
    reset();
    setMessage("");
    setModalOpen(true);
  };
  const edit = (row: AdminContentItem) => {
    setEditingId(row.id);
    setForm({
      contentType: row.contentType,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle || "",
      body: row.body || "",
      icon: row.icon || "📌",
      imageUrl: row.imageUrl || "",
      actionLabel: row.actionLabel || "",
      targetScreen: row.targetScreen || "",
      price: Number(row.price || 0),
      metadataText: formatMetadata(row.metadata),
      active: Boolean(row.active),
      sortOrder: Number(row.sortOrder || 0),
    });
    setMessage("");
    setModalOpen(true);
  };
  const submit = async () => {
    setMessage("");
    let metadata: Record<string, unknown>;
    try {
      const parsed = JSON.parse(form.metadataText || "{}") as unknown;
      metadata = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      setMessage(`${t.metadata} ไม่ถูกต้อง`);
      return;
    }
    const response = await adminFetch(adminKey, "/api/admin/content", { method: editingId ? "PUT" : "POST", body: JSON.stringify({ ...form, metadata, id: editingId || undefined }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.saveFailed);
    setRows(result.contentItems);
    setMessage(editingId ? t.contentUpdated : t.contentCreated);
    reset();
    setModalOpen(false);
  };
  const remove = async (row: AdminContentItem) => {
    setMessage("");
    const response = await adminFetch(adminKey, `/api/admin/content?id=${row.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage(result.message || t.deleteFailed);
    setRows(result.contentItems);
    setMessage(t.contentDeleted);
  };

  return (
    <div className="admin-coupon-layout">
      <Panel title={t.contentList}>
        <div className="admin-list-toolbar">
          <input placeholder={t.contentSearch} value={contentSearch} onChange={(event) => { setContentSearch(event.target.value); setPage(1); }} />
          <button type="button" onClick={openCreate}>{t.addContent}</button>
          <span>{t.rowsShowing} {pagedRows.length} / {filteredRows.length}</span>
        </div>
        <div className="admin-coupon-cards">
          {pagedRows.map((row) => (
            <article key={row.id}>
              <div className="admin-content-icon">{row.icon}</div>
              <div><b>{row.title}</b><span>{row.contentType} · {row.slug}</span><small>{row.subtitle || row.body || "-"}</small><small>{row.targetScreen || "-"} · {money(row.price, lang)} ฿</small></div>
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
        <AdminDialog onClose={() => { reset(); setModalOpen(false); }}>
          <section className="admin-modal">
            <header><div><small>{t.content}</small><h2>{editingId ? t.editContent : t.addContent}</h2></div><button type="button" onClick={() => { reset(); setModalOpen(false); }}>×</button></header>
            <div className="admin-form">
              <label>{t.contentType}<input list="admin-content-types" value={form.contentType} onChange={(event) => setForm({ ...form, contentType: event.target.value.trim().toLowerCase() })} /><datalist id="admin-content-types">{contentTypes.map((type) => <option key={type} value={type} />)}</datalist></label>
              <label>{t.slug}<input value={form.slug} onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })} /></label>
              <label>{t.title}<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label>{t.subtitle}<input value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} /></label>
              <label>{t.avatar}<input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} /></label>
              <label>{t.imageUrl}<input value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} /></label>
              <label>{t.actionLabel}<input value={form.actionLabel} onChange={(event) => setForm({ ...form, actionLabel: event.target.value })} /></label>
              <label>{t.targetScreen}<input value={form.targetScreen} onChange={(event) => setForm({ ...form, targetScreen: event.target.value })} /></label>
              <label>{t.cols.price}<input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></label>
              <label>{t.sortOrder}<input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></label>
              <label>{t.status}<select value={form.active ? "active" : "off"} onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}><option value="active">{t.active}</option><option value="off">{t.inactive}</option></select></label>
              <label className="wide">{t.body}<textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></label>
              <label className="wide">{t.metadata}<textarea value={form.metadataText} onChange={(event) => setForm({ ...form, metadataText: event.target.value })} /></label>
              <div className="admin-form-actions"><button type="button" onClick={submit}>{t.save}</button><button type="button" className="ghost" onClick={() => { reset(); setModalOpen(false); }}>{t.cancel}</button></div>
              {message ? <p className="admin-message">{message}</p> : null}
            </div>
          </section>
        </AdminDialog>
      ) : null}
    </div>
  );
}

const couponCategories = ["food", "promotion", "fitness", "fitness-swim", "fitness-hyrox", "swim", "court", "trainer", "tennis", "badminton", "pickleball", "padel", "hyrox", "pilates", "airfit"];
// Member package page reads membership_plan / time_pass (tabs) and renewal_option (pause, coupon renewal);
// reward items (metadata {"cost": coins}) are the coin rewards members redeem. site_setting holds
// support-contact (Help page) and privacy-policy (PDPA consent, metadata {"version"}).
const contentTypes = ["membership_plan", "time_pass", "renewal_option", "reward", "site_setting", "service_package", "class_schedule", "home_slide", "live_tv", "feature_screen"];

function paymentItemLabel(payment: AdminPayment, lang: Lang) {
  if (payment.itemType === "wallet_topup") return lang === "th" ? "เติมเงิน Wallet" : "Wallet top-up";
  return payment.itemName || payment.itemType || "-";
}

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
  const icons: Record<string, string> = { food: "🍜", promotion: "🛍️", fitness: "💪", "fitness-swim": "🏊", "fitness-hyrox": "🔥", swim: "🏊", court: "🏟️", trainer: "🏋️", tennis: "🎾", badminton: "🏸", pickleball: "🥒", padel: "🎯", hyrox: "🔥", pilates: "🧘", airfit: "🪂" };
  return icons[category] || "🎟️";
}

function TrainerManager({
  adminKey,
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
    bio: "",
    specialtiesText: "",
    packagesText: "รายวัน | 1 ครั้ง · 1 ชม. | 1200\nรายสัปดาห์ | 5 ครั้ง/สัปดาห์ | 5400\nรายเดือน | 20 ครั้ง/เดือน | 20000",
    weeklyScheduleText: "จันทร์ | 13 | 08:00 | available\nจันทร์ | 13 | 18:00 | available\nพุธ | 15 | 19:30 | full",
    socialLine: "",
    certificationsText: "",
    startPrice: 0,
    sortOrder: 0,
    active: true,
  });
  const [uploading, setUploading] = useState(false);
  const [trainerSearch, setTrainerSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 6;
  const filteredRows = useMemo(() => {
    const needle = trainerSearch.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => `${row.name} ${row.nickname} ${row.role} ${row.slug} ${row.experience} ${row.zodiac || ""} ${row.birthYear || ""} ${row.bloodType || ""} ${row.bio || ""} ${trainerSpecialties(row).join(" ")} ${trainerCertifications(row).join(" ")}`.toLowerCase().includes(needle));
  }, [rows, trainerSearch]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / perPage), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((currentPage - 1) * perPage, currentPage * perPage);

  const reset = () => {
    setEditingId(null);
    setForm({ slug: "", name: "", nickname: "", role: "", avatar: "🏋️", imageUrl: "", experience: "", zodiac: "", birthYear: 2537, bloodType: "O", contactPhone: "02-123-4567", bio: "", specialtiesText: "", packagesText: "รายวัน | 1 ครั้ง · 1 ชม. | 1200\nรายสัปดาห์ | 5 ครั้ง/สัปดาห์ | 5400\nรายเดือน | 20 ครั้ง/เดือน | 20000", weeklyScheduleText: "จันทร์ | 13 | 08:00 | available\nจันทร์ | 13 | 18:00 | available\nพุธ | 15 | 19:30 | full", socialLine: "", certificationsText: "", startPrice: 0, sortOrder: 0, active: true });
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
      bio: row.bio || "",
      specialtiesText: trainerSpecialties(row).join("\n"),
      packagesText: formatTrainerPackages(row),
      weeklyScheduleText: formatTrainerSchedule(row),
      socialLine: row.socialLine || "",
      certificationsText: trainerCertifications(row).join("\n"),
      startPrice: Number(row.startPrice || 0),
      sortOrder: Number(row.sortOrder || 0),
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
        specialties: form.specialtiesText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
        packages: parseTrainerPackages(form.packagesText),
        weeklySchedule: parseTrainerSchedule(form.weeklyScheduleText),
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
              <div><b>{row.name}</b><span>{row.nickname} · {row.role}</span><small>{row.experience} · {row.zodiac || "-"} · {row.birthYear || "-"} · {row.bloodType || "-"}</small><small>{trainerSpecialties(row).slice(0, 3).join(" · ") || trainerCertifications(row).slice(0, 2).join(" · ") || "-"}</small></div>
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
        <AdminDialog onClose={() => { reset(); setModalOpen(false); }}>
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
              <label>{t.socialLine}<input value={form.socialLine} onChange={(event) => setForm({ ...form, socialLine: event.target.value })} /></label>
              <label>{t.cols.startPrice}<input type="number" value={form.startPrice} onChange={(event) => setForm({ ...form, startPrice: Number(event.target.value) })} /></label>
              <label>{t.sortOrder}<input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} /></label>
              <label>{t.status}<select value={form.active ? "active" : "off"} onChange={(event) => setForm({ ...form, active: event.target.value === "active" })}><option value="active">{t.active}</option><option value="off">{t.inactive}</option></select></label>
              <label className="wide">{t.uploadImage}<input accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => upload(event.target.files?.[0] || null)} /></label>
              <label className="wide">{t.bio}<textarea maxLength={1200} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></label>
              <label className="wide">{t.specialties}<textarea placeholder={t.specialtiesHint} value={form.specialtiesText} onChange={(event) => setForm({ ...form, specialtiesText: event.target.value })} /></label>
              <label className="wide">{t.packages}<textarea placeholder={t.packagesHint} value={form.packagesText} onChange={(event) => setForm({ ...form, packagesText: event.target.value })} /></label>
              <label className="wide">{t.weeklySchedule}<textarea placeholder={t.weeklyScheduleHint} value={form.weeklyScheduleText} onChange={(event) => setForm({ ...form, weeklyScheduleText: event.target.value })} /></label>
              <label className="wide">{t.certifications}<textarea placeholder={t.certificationsHint} value={form.certificationsText} onChange={(event) => setForm({ ...form, certificationsText: event.target.value })} /></label>
              <div className="admin-form-actions"><button type="button" onClick={submit}>{editingId ? t.save : t.add}</button><button type="button" className="ghost" onClick={() => { reset(); setModalOpen(false); }}>{t.cancel}</button></div>
              {uploading ? <p className="admin-message">{t.uploadImage}...</p> : null}
              {message ? <p className="admin-message">{message}</p> : null}
            </div>
          </section>
        </AdminDialog>
      ) : null}
    </div>
  );
}

function TrainerPhoto({ row }: { row: Pick<AdminTrainer, "avatar" | "imageUrl" | "name"> }) {
  const src = safeImageSource(row.imageUrl);
  if (src) return <Image unoptimized width={160} height={160} alt={row.name} className="admin-trainer-photo" src={src} referrerPolicy="no-referrer" />;
  return <div className="admin-trainer-photo fallback">{row.avatar || "🏋️"}</div>;
}

function StaffManager({
  adminKey,
  lang,
  message,
  permissions,
  roles,
  rows,
  setMessage,
  setRows,
  t,
}: {
  adminKey: string;
  lang: Lang;
  message: string;
  permissions: AdminPermission[];
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
  const permissionMap = useMemo(() => new Map(permissions.map((permission) => [permission.code, permission])), [permissions]);
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
              <div className="admin-staff-detail">
                <b>{row.displayName}</b>
                <span>{row.username} · {lang === "th" ? row.roleNameTh : row.roleNameEn}</span>
                <small>{row.phone || row.email || "-"}</small>
                <div className="admin-staff-permissions" aria-label={t.staffPermissions}>
                  {row.permissionCodes.length ? row.permissionCodes.map((code) => {
                    const permission = permissionMap.get(code);
                    return <em key={code} title={code}>{permission ? (lang === "th" ? permission.nameTh : permission.nameEn) : code}</em>;
                  }) : <em className="empty">{t.noPermissions}</em>}
                </div>
              </div>
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
        <AdminDialog onClose={() => { reset(); setModalOpen(false); }}>
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
        </AdminDialog>
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

function Reports({ adminKey, data, lang, onPaymentsChange, section, t }: { adminKey: string; data: AdminConsoleData; lang: Lang; onPaymentsChange: (rows: AdminPayment[]) => void; section: ReportSection; t: typeof copy[Lang] }) {
  // Every card states its period: month to date (from the 1st to today), now, or all time.
  const f = data.reportFigures;
  const month = periodLabel("month", f?.period, lang);
  const now = periodLabel("now", f?.period, lang);
  const all = periodLabel("all", f?.period, lang);
  const show = (value: number | null | undefined, format: (value: number) => string = String) => (value === null || value === undefined ? "-" : format(value));
  const baht = (value: number) => `${money(value, lang)} ฿`;
  const percent = (value: number) => `${value}%`;
  const paidRate = f?.bookings?.paidRate ?? 0;
  const reportTabs = reportMenu(t);

  const cards: Record<ReportSection, [string, string, string][]> = {
    overview: [
      [t.salesExTopup, show(f?.finance?.salesMonth, baht), month],
      [t.paidBookingRate, show(f?.bookings?.paidRate, percent), month],
      [t.activeMembers, show(f?.members?.active), now],
      [t.availableCourts, f?.courts ? `${f.courts.available}/${f.courts.total}` : "-", now],
    ],
    finance: [[t.salesExTopup, show(f?.finance?.salesMonth, baht), month], [t.paidPayments, show(f?.finance?.paymentsMonth), month], [t.avgBookingValue, show(f?.finance?.avgBookingValueMonth, baht), month]],
    cashup: [],
    bookings: [[t.bookingsMade, show(f?.bookings?.month), month], [t.paidBookingRate, show(f?.bookings?.paidRate, percent), month], [t.pendingBookings, show(f?.bookings?.pendingNow), now], [t.cancelledBookings, show(f?.bookings?.cancelledMonth), month]],
    members: [[t.allMembers, show(f?.members?.total), all], [t.activeMembers, show(f?.members?.active), now], [t.newMembers, show(f?.members?.newMonth), month], [t.memberVisits, show(f?.members?.checkinsMonth), month]],
    coupons: [[t.total, show(f?.coupons?.total), all], [t.activeCoupons, show(f?.coupons?.active), now], [t.couponsSold, show(f?.coupons?.soldMonth), month]],
    trainers: [[t.total, show(f?.trainers?.total), all], [t.activeTrainers, show(f?.trainers?.active), now], [t.trainerAvgPrice, show(f?.trainers?.avgPrice, baht), now]],
    courts: [[t.allCourts, show(f?.courts?.total), all], [t.availableCourts, show(f?.courts?.available), now], [t.courtMaintenance, show(f?.courts?.maintenance), now]],
    engagement: [[t.utilizationSignal, show(f?.bookings?.paidRate, percent), month], [t.checkedInBookings, show(f?.bookings?.checkedInMonth), month], [t.memberVisits, show(f?.members?.checkinsMonth), month]],
    audit: [[t.auditEvents, show(f?.audit?.eventsMonth), month], [t.highRiskActions, show(f?.audit?.sensitiveMonth), month], [t.staff, String(data.staff.length), all]],
  };

  // The cash-up loads its own day from the server; it has no summary cards.
  if (section === "cashup") return <div className="admin-report-content"><AdminCashup lang={lang} /></div>;
  return (
    <div className="admin-report-content">
      <Panel title={reportTabs.find(([id]) => id === section)?.[1] || t.reports}>
        <div className="admin-report-kpis">
          {cards[section].map(([label, value, period]) => <ReportCard key={label} label={label} period={period} value={value} />)}
        </div>
        <ReportRecommendation lang={lang} section={section} t={t} paidRate={paidRate} />
      </Panel>
      {section === "overview" && (
        <div className="admin-report-grid">
          <Panel title={t.revenueTrend}><BarChart rows={buildRevenueBars(data.payments, lang)} moneyBars /><p className="admin-report-coverage">{coverageLabel(data.payments.length, oldestOf(data.payments.map((row) => row.paidAt || row.createdAt)), lang)}</p></Panel>
          <Panel title={t.bookingStatus}><DonutSummary rows={buildStatusBars(data.bookings)} t={t} /><p className="admin-report-coverage">{coverageLabel(data.bookings.length, oldestOf(data.bookings.map((row) => row.startsAt)), lang)}</p></Panel>
          <Panel title={t.courtMix}><BarChart rows={buildCourtBars(data.courts)} /></Panel>
          <Panel title={t.reportExportAll}><div className="admin-report-export-grid"><ExportButton label={t.reportFinance} filename="ppa-report-payments.csv" rows={data.payments} /><ExportButton label={t.reportBookings} filename="ppa-report-bookings.csv" rows={data.bookings} /><ExportButton label={t.reportMembers} filename="ppa-report-members.csv" rows={data.users} /></div></Panel>
        </div>
      )}
      {section === "finance" && <ReportDataList amountLabel={t.reportFilteredAmount} dateGetter={(row) => row.paidAt || row.createdAt} filename="ppa-payments.csv" lang={lang} renderTable={(rows) => <PaymentTable canManage={canViewSlips(data.currentAdmin)} adminKey={adminKey} onPaymentsChange={onPaymentsChange} rows={rows} lang={lang} t={t} />} rows={data.payments} searchText={(row) => `${row.paymentNo} ${row.displayName} ${row.method} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "bookings" && <ReportDataList amountLabel={t.reportFilteredAmount} dateGetter={(row) => row.startsAt} filename="ppa-bookings.csv" lang={lang} renderTable={(rows) => <BookingTable rows={rows} lang={lang} t={t} />} rows={data.bookings} searchText={(row) => `${row.bookingNo} ${row.title} ${row.displayName} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "members" && <ReportDataList dateGetter={(row) => row.createdAt} filename="ppa-members.csv" lang={lang} renderTable={(rows) => <MemberTable rows={rows} lang={lang} t={t} />} rows={data.users} searchText={(row) => `${row.displayName} ${row.memberCode} ${row.phone || ""} ${row.email || ""} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "coupons" && <ReportDataList filename="ppa-coupons.csv" lang={lang} renderTable={(rows) => <CouponTable rows={rows} lang={lang} t={t} />} rows={data.coupons} searchText={(row) => `${row.name} ${row.code} ${row.category}`} statusGetter={(row) => row.active ? "active" : "off"} t={t} title={t.reportDetail} />}
      {section === "trainers" && <ReportDataList filename="ppa-trainers.csv" lang={lang} renderTable={(rows) => <TrainerTable rows={rows} lang={lang} t={t} />} rows={data.trainers} searchText={(row) => `${row.name} ${row.nickname} ${row.slug} ${row.role} ${row.experience} ${row.bio || ""} ${trainerSpecialties(row).join(" ")} ${certificationText(row.certifications)}`} statusGetter={(row) => row.active ? "active" : "off"} t={t} title={t.reportDetail} />}
      {section === "courts" && <ReportDataList filename="ppa-courts.csv" lang={lang} renderTable={(rows) => <CourtReport rows={rows} t={t} />} rows={data.courts} searchText={(row) => `${row.name} ${row.zone || ""} ${row.sportName} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "engagement" && <ReportDataList amountLabel={t.reportFilteredAmount} dateGetter={(row) => row.startsAt} filename="ppa-engagement.csv" lang={lang} renderTable={(rows) => <BookingTable rows={rows} lang={lang} t={t} />} rows={data.bookings.filter((booking) => ["paid", "checked_in"].includes(booking.status))} searchText={(row) => `${row.bookingNo} ${row.title} ${row.displayName} ${row.status}`} statusGetter={(row) => row.status} t={t} title={t.reportDetail} />}
      {section === "audit" && <ReportDataList dateGetter={(row) => row.createdAt} filename="ppa-audit.csv" lang={lang} renderTable={(rows) => <AuditReportTable lang={lang} rows={rows} t={t} />} rows={data.auditLogs} searchText={(row) => `${row.staffName || ""} ${row.username || ""} ${row.action} ${row.targetType} ${row.targetId || ""} ${row.metadataText || ""}`} statusGetter={(row) => row.action} t={t} title={t.auditTitle} />}
    </div>
  );
}

// Oldest of the given dates (ISO strings or Date objects from the server), or null.
function oldestOf(values: (string | Date | null | undefined)[]) {
  const times = values.map((value) => (value ? new Date(value).getTime() : Number.NaN)).filter(Number.isFinite);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function ReportCard({ label, period, value }: { label: string; period: string; value: number | string }) {
  return <div className="report-card"><span>{label}</span><b>{value}</b><small>{period}</small></div>;
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
            <td><Badge tone={sensitiveAuditAction(row.action) ? "warn" : "neutral"}>{auditActionLabel(row.action, lang)}</Badge></td>
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
      <div className="admin-table-scroll"><table>
        <thead><tr><th>{t.auditTime}</th><th>{t.auditActor}</th><th>{t.auditAction}</th><th>{t.auditTarget}</th><th>{t.auditMetadata}</th></tr></thead>
        <tbody>
          {filteredRows.length ? filteredRows.map((row) => (
            <tr key={row.id}>
              <td>{formatDate(row.createdAt, lang)}</td>
              <td>{row.staffName || row.username || "System"}<small>{row.username || "-"}</small></td>
              <td><Badge tone={sensitiveAuditAction(row.action) ? "warn" : "neutral"}>{auditActionLabel(row.action, lang)}</Badge></td>
              <td>{row.targetType}<small>{row.targetId || "-"}</small></td>
              <td>{compactJson(row.metadataText)}</td>
            </tr>
          )) : <tr><td colSpan={5}>{t.auditEmpty}</td></tr>}
        </tbody>
      </table></div>
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
  return <button className="admin-export" type="button" onClick={() => downloadCsv(filename, rows)}><Download aria-hidden="true" />{label}</button>;
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
      <Panel title={lang === "th" ? "สรุปลำดับความสำคัญ" : "Priorities"}>
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





function Badge({ children, tone }: { children: React.ReactNode; tone: "good" | "warn" | "bad" | "neutral" }) {
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


function buildCourtBars(courts: AdminCourt[]) {
  const buckets = new Map<string, number>();
  for (const court of courts) buckets.set(court.sportName, (buckets.get(court.sportName) || 0) + 1);
  return Array.from(buckets, ([label, value]) => ({ label, value })).slice(0, 8);
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
    "content.create": { th: "เพิ่มคอนเทนต์", en: "Create content" },
    "content.update": { th: "แก้ไขคอนเทนต์", en: "Update content" },
    "content.delete": { th: "ลบคอนเทนต์", en: "Delete content" },
    "court.create": { th: "เพิ่มสนาม", en: "Create court" },
    "court.update": { th: "แก้ไขสนาม", en: "Update court" },
    "court.delete": { th: "ลบสนาม", en: "Delete court" },
    "booking.status": { th: "เปลี่ยนสถานะการจอง", en: "Change booking status" },
    "member.update": { th: "แก้ไขข้อมูลสมาชิก", en: "Update member" },
    "member.credit": { th: "ปรับเครดิตสมาชิก", en: "Adjust member credit" },
    "payment.status": { th: "ยืนยัน/ยกเลิกการชำระ", en: "Confirm or cancel payment" },
    "payment.refund": { th: "บันทึกคืนเงิน", en: "Record refund" },
    "sale.create": { th: "ขายหน้าเคาน์เตอร์", en: "Counter sale" },
    "qr.consume": { th: "สแกนใช้สิทธิ์", en: "Redeem QR" },
  };
  return labels[action]?.[lang] || action;
}

function compactJson(value: string | null) {
  if (!value) return "-";
  try {
    return describeAuditValue(JSON.parse(value)) || "-";
  } catch {
    return value;
  }
}

// Audit metadata can nest (member.update stores { before: {...}, after: {...} }): spell it out.
function describeAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.map(describeAuditValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${item && typeof item === "object" && !Array.isArray(item) ? `(${describeAuditValue(item)})` : describeAuditValue(item)}`)
      .join(" · ");
  }
  return String(value);
}

// Actions that change access or money stand out in the audit trail.
function sensitiveAuditAction(action: string) {
  return /delete|password|refund|role\.|credit|status/.test(action);
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

function trainerSpecialties(trainer: Pick<AdminTrainer, "specialties">) {
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

function trainerPackages(trainer: Pick<AdminTrainer, "packages">) {
  const rows = parseJsonArray<TrainerPackage>(trainer.packages);
  return rows.filter((row) => row.title && row.text && Number(row.price) >= 0);
}

function formatTrainerPackages(trainer: Pick<AdminTrainer, "packages">) {
  return trainerPackages(trainer).map((item) => `${item.title} | ${item.text} | ${item.price}`).join("\n");
}

function parseTrainerPackages(text: string): TrainerPackage[] {
  return text.split(/\r?\n/).map((line) => {
    const [title = "", detail = "", price = "0"] = line.split("|").map((item) => item.trim());
    return { title, text: detail, price: Number(price) || 0 };
  }).filter((item) => item.title && item.text);
}

function trainerSchedule(trainer: Pick<AdminTrainer, "weeklySchedule">) {
  return parseJsonArray<TrainerScheduleDay>(trainer.weeklySchedule).filter((item) => item.day && Array.isArray(item.slots));
}

function formatTrainerSchedule(trainer: Pick<AdminTrainer, "weeklySchedule">) {
  return trainerSchedule(trainer).flatMap((day) => day.slots.map((slot) => `${day.day} | ${day.date || ""} | ${slot.time} | ${slot.status || "available"}`)).join("\n");
}

function parseTrainerSchedule(text: string): TrainerScheduleDay[] {
  const map = new Map<string, TrainerScheduleDay>();
  text.split(/\r?\n/).forEach((line) => {
    const [day = "", date = "", time = "", rawStatus = "available"] = line.split("|").map((item) => item.trim());
    if (!day || !/^\d{2}:\d{2}$/.test(time)) return;
    const status = rawStatus === "full" || rawStatus === "off" ? rawStatus : "available";
    const key = `${day}|${date}`;
    const entry = map.get(key) || { day, date, slots: [] };
    entry.slots.push({ time, status });
    map.set(key, entry);
  });
  return [...map.values()];
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

function formatMetadata(value: AdminContentItem["metadata"]) {
  if (!value) return "{}";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return "{}";
    }
  }
  return JSON.stringify(value, null, 2);
}

function uniqueSports(courts: AdminCourt[]) {
  const map = new Map<number, string>();
  courts.forEach((court) => {
    if (court.sportId) map.set(court.sportId, court.sportName);
  });
  return [...map.entries()].map(([id, name]) => ({ id, name }));
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
  const safeText = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
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
