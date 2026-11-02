// AdminConsole → "ควรเพิ่มอะไร": what each menu can do, what comes next once there is real data or
// demand, and what is not worth building now. Agreed with the owner on 2026-11-02; update it when
// the system changes so staff never read built features as missing.

type Lang = "th" | "en";
type ChecklistGroup = { menu: string; items: { ready: boolean; text: string }[] };

export const completionChecklist: Record<Lang, ChecklistGroup[]> = {
  th: [
    { menu: "ภาพรวม", items: [
      { ready: true, text: "งานที่ต้องทำตอนนี้ ยอดขายวันนี้และเดือนนี้เทียบเดือนก่อน กราฟ 30 วัน ตารางสนามวันนี้ และสมาชิกที่แพ็กเกจใกล้หมด" },
      { ready: false, text: "ตัวกรองตามช่วงเวลาและกีฬา เมื่อมีข้อมูลหลายเดือน" },
    ] },
    { menu: "ระบบจอง", items: [
      { ready: true, text: "ตารางสนามรายวัน (สนาม × ชั่วโมง) และจองจากเคาน์เตอร์ให้สมาชิกหรือลูกค้าทั่วไป (ชื่อ + เบอร์โทร)" },
      { ready: true, text: "จองประจำทุกสัปดาห์สูงสุด 12 สัปดาห์ ชำระทันที หรือค้างชำระที่เคาน์เตอร์แล้วรับชำระภายหลัง" },
      { ready: true, text: "บล็อกสนามช่วงซ่อมบำรุง จัดกิจกรรม หรือเช่าเหมา ปิดการจองทั้งในแอปและที่เคาน์เตอร์" },
      { ready: true, text: "เช็คอินด้วย QR และยกเลิกการจองพร้อมเหตุผล" },
      { ready: false, text: "ติดตามคนที่จองแล้วไม่มา (no-show) จากข้อมูลเช็คอิน" },
      { ready: false, text: "ราคาช่วง peak/off-peak ตามการใช้สนามจริง (ตอนนี้ ×1.5 ตั้งแต่ 17:00)" },
    ] },
    { menu: "สมาชิก", items: [
      { ready: true, text: "แก้ไข ระงับหรือเปิดใช้ ดูการยินยอม PDPA เครดิตและประวัติ แพ็กเกจ คูปอง และรายการรอชำระของแต่ละคน" },
      { ready: true, text: "ขายแพ็กเกจและคูปองหน้าเคาน์เตอร์ พร้อมพิมพ์ใบเสร็จ" },
      { ready: false, text: "เครื่องมือลบข้อมูลสมาชิกตามคำขอ PDPA (ตอนนี้ทำด้วยมือเมื่อมีคำขอ)" },
    ] },
    { menu: "เทรนเนอร์", items: [
      { ready: true, text: "เพิ่ม แก้ไข ลบ รูปภาพ แพ็กเกจ ตารางเวลา ค้นหา และแบ่งหน้า" },
      { ready: false, text: "ค่าคอมมิชชันและการจ่ายเงินเทรนเนอร์ (เฉพาะถ้าจ่ายแบบคอมมิชชัน)" },
    ] },
    { menu: "คูปอง", items: [
      { ready: true, text: "คูปองหลายครั้ง วันหมดอายุ การต่ออายุ และขายหน้าเคาน์เตอร์" },
      { ready: false, text: "โค้ดส่วนลดอย่างง่าย (ลดเป็น % หรือบาท วันหมดอายุ จำกัดจำนวนครั้ง)" },
    ] },
    { menu: "การเงิน", items: [
      { ready: true, text: "คิวยืนยันการชำระพร้อมสลิป ยกเลิกพร้อมเหตุผล บันทึกคืนเงิน และยกเลิกอัตโนมัติเมื่อไม่ชำระตามเวลา" },
      { ready: true, text: "ปิดยอดประจำวันแยกตามช่องทางและพนักงาน พิมพ์พร้อมช่องเซ็นชื่อ" },
      { ready: true, text: "ใบเสร็จเลขที่ต่อเนื่องรายปี พิมพ์ซ้ำได้เลขเดิม และใบกำกับภาษีอย่างย่อเมื่อจด VAT" },
      { ready: false, text: "ยืนยัน PromptPay อัตโนมัติผ่านผู้ให้บริการชำระเงิน เมื่อมีสลิปต่อวันจำนวนมาก (มีค่าธรรมเนียมต่อรายการ)" },
    ] },
    { menu: "พนักงานและสิทธิ์", items: [
      { ready: true, text: "บัญชีพนักงาน บทบาท สิทธิ์ตามเมนู กันการเพิ่มสิทธิ์ตัวเอง รหัสผ่านอย่างน้อย 10 ตัว และออกจากระบบเองหลัง 8 ชั่วโมง" },
      { ready: false, text: "ยืนยันตัวตน 2 ขั้น (2FA) สำหรับบัญชีเจ้าของและการเงิน" },
    ] },
    { menu: "รายงาน", items: [
      { ready: true, text: "ทุกตัวเลขระบุช่วงเวลา (เดือนนี้ ตอนนี้ หรือทั้งหมด) และทุกรายการบอกว่าครอบคลุมกี่รายการล่าสุด" },
      { ready: true, text: "ตัวกรอง ช่วงวันที่ สรุป แบ่งหน้า และส่งออก CSV" },
      { ready: false, text: "Heatmap การใช้สนามรายชั่วโมง หลังมีข้อมูล 1–2 เดือน" },
    ] },
    { menu: "LINE และการแจ้งเตือน", items: [
      { ready: true, text: "แจ้งเตือนในแอป และ LINE push (เปิดด้วย LINE_PUSH_ENABLED)" },
      { ready: true, text: "แจ้งเตือนก่อนเวลาจองสนาม 2 ชั่วโมง และแพ็กเกจใกล้หมดอายุ 3 วัน ส่งครั้งเดียวต่อรายการ" },
      { ready: true, text: "Rich menu 6 ปุ่มสำหรับสมาชิก" },
    ] },
    { menu: "ตรวจสอบและความปลอดภัย", items: [
      { ready: true, text: "บันทึกการทำงานของพนักงานทุกการกระทำสำคัญ" },
      { ready: false, text: "เก็บ IP และเบราว์เซอร์ในบันทึกการทำงาน" },
    ] },
    { menu: "ระบบและข้อมูล", items: [
      { ready: true, text: "สำรองข้อมูลรายวัน เก็บ 14 วัน และตรวจการกู้คืนรายเดือน (npm run db:backup, db:restore-check)" },
      { ready: true, text: "ตรวจสถานะ /api/health สำหรับ uptime monitor และงานตั้งเวลา /api/cron/run" },
    ] },
  ],
  en: [
    { menu: "Dashboard", items: [
      { ready: true, text: "To-do queue, today's and this month's sales against last month, a 30-day chart, today's courts, and members whose package ends soon" },
      { ready: false, text: "Period and sport filters once there are several months of data" },
    ] },
    { menu: "Bookings", items: [
      { ready: true, text: "Daily court calendar (courts × hours) with counter booking for members or walk-in guests (name + phone)" },
      { ready: true, text: "Weekly repeat bookings up to 12 weeks, paid now or held at the counter and paid later" },
      { ready: true, text: "Court blocks for maintenance, events or private hire, closed to app and counter bookings" },
      { ready: true, text: "QR check-in and cancellation with a reason" },
      { ready: false, text: "No-show tracking from check-in data" },
      { ready: false, text: "Peak/off-peak prices from real court use (today ×1.5 from 17:00)" },
    ] },
    { menu: "Members", items: [
      { ready: true, text: "Edit, suspend or reactivate, PDPA consent, credit and its history, packages, coupons and open payments per member" },
      { ready: true, text: "Counter sales of packages and coupons, with a printed receipt" },
      { ready: false, text: "A tool to erase a member's data on PDPA request (handled by hand for now)" },
    ] },
    { menu: "Trainers", items: [
      { ready: true, text: "Create, edit, delete, photos, packages, schedules, search and pagination" },
      { ready: false, text: "Trainer commission and payouts (only if trainers are paid on commission)" },
    ] },
    { menu: "Coupons", items: [
      { ready: true, text: "Multi-use coupons, expiry, renewal and counter sales" },
      { ready: false, text: "Simple discount codes (percent or amount off, expiry, usage limit)" },
    ] },
    { menu: "Finance", items: [
      { ready: true, text: "Payment queue with slips, cancel with a reason, recorded refunds, and automatic cancellation of unpaid requests" },
      { ready: true, text: "Daily cash-up by channel and staff member, printable with signature lines" },
      { ready: true, text: "Receipts numbered per year, reprinted with the same number, and abbreviated tax invoices when VAT-registered" },
      { ready: false, text: "Automatic PromptPay confirmation through a payment provider once slip volume is high (per-transaction fees)" },
    ] },
    { menu: "Staff & Roles", items: [
      { ready: true, text: "Staff accounts, roles, menu permissions, no self-escalation, passwords of 10+ characters and 8-hour sessions" },
      { ready: false, text: "Two-factor login for owner and finance accounts" },
    ] },
    { menu: "Reports", items: [
      { ready: true, text: "Every figure states its period (this month, now or all time) and every list says how many recent rows it holds" },
      { ready: true, text: "Filters, date range, summary, pagination and CSV export" },
      { ready: false, text: "Court usage heatmap by hour after 1–2 months of data" },
    ] },
    { menu: "LINE & notifications", items: [
      { ready: true, text: "In-app notifications and LINE push (switch on with LINE_PUSH_ENABLED)" },
      { ready: true, text: "Reminders 2 hours before a court booking and 3 days before a package ends, sent once each" },
      { ready: true, text: "Six-button rich menu for members" },
    ] },
    { menu: "Audit & security", items: [
      { ready: true, text: "Audit log of every important staff action" },
      { ready: false, text: "IP address and browser in the audit log" },
    ] },
    { menu: "System & data", items: [
      { ready: true, text: "Daily backups kept 14 days and a monthly restore check (npm run db:backup, db:restore-check)" },
      { ready: true, text: "/api/health for an uptime monitor and the /api/cron/run scheduled job" },
    ] },
  ],
};

export const recommendations: Record<Lang, string[]> = {
  th: [
    "Heatmap การใช้สนามรายชั่วโมง หลังมีข้อมูล 1–2 เดือน: เห็นช่วงที่สนามว่าง แล้วตั้งราคา peak/off-peak (ตอนนี้ ×1.5 ตั้งแต่ 17:00 ตายตัว)",
    "โค้ดส่วนลดอย่างง่าย (ลด % หรือบาท วันหมดอายุ จำกัดจำนวนครั้ง) แทนระบบแคมเปญเต็มรูปแบบ",
    "สมาชิกที่จองแล้วไม่มา (no-show): ทำได้ไม่ยากเพราะมีข้อมูลเช็คอินแล้ว",
    "ลบข้อมูลสมาชิกตามคำขอ PDPA: ทำด้วยมือก่อน แล้วค่อยทำเครื่องมือเมื่อเริ่มมีคำขอ",
    "ยืนยันตัวตน 2 ขั้นสำหรับบัญชีเจ้าของและการเงิน พร้อมเก็บ IP และเบราว์เซอร์ในบันทึกการทำงาน",
    "ค่าคอมมิชชันและการจ่ายเงินเทรนเนอร์ เฉพาะถ้าจ่ายเทรนเนอร์แบบคอมมิชชัน",
    "ยืนยัน PromptPay อัตโนมัติผ่านผู้ให้บริการชำระเงิน: ลดงานตรวจสลิปซึ่งเป็นงานหลักประจำวัน คุ้มเมื่อมีสลิปจำนวนมาก (มีค่าธรรมเนียมต่อรายการ)",
  ],
  en: [
    "Court usage heatmap by hour after 1–2 months of data: see when courts sit empty and set peak/off-peak prices (today a fixed ×1.5 from 17:00).",
    "Simple discount codes (percent or amount off, expiry, usage limit) instead of a full campaign builder.",
    "Members who book but do not show up: cheap now that check-in exists.",
    "Erasing a member's data on PDPA request: by hand first, a tool once requests come in.",
    "Two-factor login for owner and finance accounts, plus IP address and browser in the audit log.",
    "Trainer commission and payouts, only if trainers are paid on commission.",
    "Automatic PromptPay confirmation through a payment provider: removes manual slip checks, the biggest daily task. Worth it once slip volume is high (per-transaction fees).",
  ],
};

export const roadmap: Record<Lang, { phase: string; items: string[] }[]> = {
  th: [
    { phase: "พร้อมใช้งานแล้ว · 2 พ.ย. 2569", items: ["ตารางสนามและจองจากเคาน์เตอร์ (สมาชิกหรือลูกค้าทั่วไป จองประจำทุกสัปดาห์)", "บล็อกสนามช่วงซ่อมบำรุงหรือกิจกรรม", "ปิดยอดประจำวันและใบเสร็จเลขที่ต่อเนื่อง", "แจ้งเตือนก่อนเวลาจองและแพ็กเกจใกล้หมด ยกเลิกรายการค้างชำระอัตโนมัติ", "สำรองข้อมูลรายวัน ตรวจการกู้คืน และตรวจสถานะระบบ", "ทุกตัวเลขในรายงานระบุช่วงเวลา"] },
    { phase: "ทำต่อเมื่อมีข้อมูลหรือความต้องการจริง", items: ["Heatmap การใช้สนามและราคา peak/off-peak", "โค้ดส่วนลดอย่างง่าย", "ติดตาม no-show", "เครื่องมือลบข้อมูลตาม PDPA", "2FA และ IP ในบันทึกการทำงาน", "คอมมิชชันเทรนเนอร์", "ยืนยัน PromptPay อัตโนมัติ"] },
    { phase: "ยังไม่คุ้มที่จะทำตอนนี้", items: ["หลายสาขา: มีสาขาเดียว", "ขั้นตอนอนุมัติ OTP และบันทึกที่แก้ไขไม่ได้: มากเกินไปสำหรับทีมเล็ก", "อีเมลหรือ SMS สำรอง: สมาชิกใช้ LINE และ SMS มีค่าใช้จ่าย", "Rich menu ตามบทบาทและบรอดแคสต์แยกกลุ่ม: ใช้ LINE OA Manager", "ติดตาม webhook ผู้ให้บริการชำระเงิน: ยังไม่มีผู้ให้บริการ", "สต็อกโปรช็อปและ POS: ใช้แอป POS สำเร็จรูป", "ใบสั่งซ่อมและเช็คลิสต์อุปกรณ์: ใช้กลุ่ม LINE ไปก่อน", "Cohort, churn, ระดับสมาชิก, ตรวจทุจริตคูปอง และส่งออก PDF: รอธุรกิจโตกว่านี้"] },
  ],
  en: [
    { phase: "Built · 2 Nov 2026", items: ["Court calendar and counter booking (members or walk-in guests, weekly repeats)", "Court blocks for maintenance or events", "Daily cash-up and numbered receipts", "Booking and package reminders, automatic cancellation of unpaid requests", "Daily backups, restore check and health check", "Every report figure states its period"] },
    { phase: "Next, once there is real data or demand", items: ["Court usage heatmap and peak/off-peak prices", "Simple discount codes", "No-show tracking", "PDPA erasure tool", "2FA and IP in the audit log", "Trainer commission", "Automatic PromptPay confirmation"] },
    { phase: "Not worth doing now", items: ["Multi-branch: there is one branch", "Approval workflows, OTP and tamper-proof audit storage: too much for a small team", "Email or SMS fallback: members use LINE and SMS costs money", "Per-role rich menus and segmented broadcasts: LINE OA Manager does broadcasts", "Payment gateway webhook monitoring: there is no gateway", "Pro shop stock and POS: use a ready-made POS app", "Repair work orders and equipment checklists: a LINE group is enough", "Cohort and churn analysis, member tiers, coupon fraud checks and PDF export: not until the business is bigger"] },
  ],
};
