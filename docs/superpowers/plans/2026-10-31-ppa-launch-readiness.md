# PPA Launch Readiness (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, chosen by the user). Steps use checkbox (`- [ ]`) syntax. TDD per task. No git commits unless the user asks.

**Goal:** เติมส่วนที่ขาดเพื่อให้เปิดใช้งานจริงที่ sport complex ได้ ได้แก่:
- จ่ายเงินได้จริงด้วย PromptPay QR + สลิป
- ขายหน้าเคาน์เตอร์ และดูสิทธิ์ของสมาชิก
- แจ้งเตือนสมาชิก
- แลก Coin ได้จริง
- ข้อมูลติดต่อและ PDPA ที่แก้จากหลังบ้านได้
- ประวัติการเข้าใช้บริการ

**Architecture:** ใช้ pattern เดียวกับ Phase 1:
- ราคาและเนื้อหาอยู่ใน DB (`app_content_items`) แก้จาก AdminConsole ได้
- เงินและสิทธิ์ทำใน transaction เดียว และ lock แถวก่อนแก้
- route หลังบ้านผ่าน `assertAdminRequest` (map resource → permission)

**Spec:**
- คำขอของผู้ใช้ 2026-10-31: "ควรเพิ่มอะไรอีก…ให้ระบบสมบูรณ์ที่สุดเปิดใช้งานกับ sport complex ได้เลย"
- `PRODUCTION_REVIEW.md` หัวข้อ Remaining launch requirements
- `FRONTEND_REVIEW.md` หัวข้อ Remaining product work

## Global Constraints

- **ไม่ใช้ provider ภายนอกที่ต้องสมัครเพิ่ม:**
  - PromptPay QR สร้างจากเลขพร้อมเพย์ใน env `PROMPTPAY_ID` (มือถือ 10 หลัก / เลขผู้เสียภาษี 13 หลัก / e-wallet 15 หลัก)
  - ถ้าไม่ได้ตั้งค่า ให้ทำงานแบบเดิม คือรายการรอยืนยัน
- **LINE push ปิดเป็นค่าเริ่มต้น:** เปิดด้วย `LINE_PUSH_ENABLED=true` (ใช้โควตาข้อความของ LINE OA)
- **สลิปเป็นข้อมูลการเงิน:**
  - เก็บนอก `public/` ที่ `SLIP_STORAGE_DIR` (ค่าเริ่มต้น `storage/payment-slips`)
  - ดูได้เฉพาะสิทธิ์ `payments.manage`
  - รับเฉพาะไฟล์ JPEG/PNG/WebP (ตรวจจาก magic bytes) ขนาดไม่เกิน 5 MB
- **ห้ามแต่งข้อความกฎหมาย:** seed นโยบาย PDPA เป็นร่างที่ `active = FALSE` แอปจะไม่ขอความยินยอมจนกว่าเจ้าของระบบตรวจข้อความแล้วเปิดใช้งาน
- **ข้อความ:** ทุกข้อความผ่าน `t()` และมี en/zh (เทสต์ coverage จาก Phase 1 บังคับอยู่)
- **การเปลี่ยน schema:**
  - ใช้ `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`
  - seed ใช้ `INSERT IGNORE`
  - ใช้ alias SQL แบบ `AS` ที่ไม่ชนคำสงวน

## Tasks

### L1 — PromptPay payload
**Files:** `lib/promptpay.ts`

- `promptPayPayload(target: string, amount?: number): string`
  - โครงสร้าง EMVCo:
    - `00` = "01"
    - `01` = "12" (มียอดเงิน) หรือ "11"
    - `29` = { `00`: "A000000677010111", `01` เบอร์ (0066…) | `02` เลข 13 หลัก | `03` e-wallet }
    - `53` = "764", `58` = "TH", `54` = ยอดเงินทศนิยม 2 ตำแหน่ง
    - `63` = CRC16-CCITT (init 0xFFFF)
- `promptPayTargetValid(target)`

**เทสต์:** เทียบกับค่า CRC ที่คำนวณจากการ implement อีกตัวที่ไม่เกี่ยวกัน (Python `binascii.crc_hqx`) และ parse TLV กลับมาตรวจ

### L2 — QR ชำระเงิน + สลิป (backend)
**Files:** `app/api/payments/promptpay/route.ts`, `app/api/payments/slip/route.ts`, `app/api/admin/payments/slip/route.ts`, `lib/slips.ts`, `database/schema.sql`, `app/api/wallet/topup/route.ts`

- schema: `payments.slip_path VARCHAR(255) NULL`, `payments.slip_uploaded_at DATETIME NULL`
- `GET /api/payments/promptpay?paymentNo=`
  - ต้องเป็นรายการของสมาชิกเอง, `method = promptpay`, `status = created`
  - ตอบ `{ paymentNo, amount, svg, payee }`
  - ยังไม่ได้ตั้ง `PROMPTPAY_ID` → 404 code `PROMPTPAY_NOT_CONFIGURED`
- `POST /api/payments/slip` (multipart: `paymentNo`, `file`)
  - ต้องเป็นรายการของสมาชิกเอง และ `status = created`
  - ตรวจ magic bytes และขนาด แล้ว UPDATE `slip_path`
- `GET /api/admin/payments/slip?paymentNo=` → ส่งไฟล์กลับ พร้อม header `private, no-store`
- `POST /api/wallet/topup` ตอบ `paymentNo` เพิ่ม

### L3 — หน้าชำระเงิน PromptPay (frontend)
- หลังสร้างรายการ PromptPay ไปหน้า `paypromptpay`
  - แสดงยอดเงิน, QR, เลขรายการ, วิธีจ่าย
  - อัปโหลดสลิป
  - ถ้าระบบยังไม่ได้ตั้งค่า แสดงข้อความแบบเดิม
- รายการรอยืนยันในวอลเล็ตมีปุ่ม "ชำระ / แนบสลิป"
- AdminConsole PaymentTable มีลิงก์ "ดูสลิป" เมื่อมีสลิป

### L4 — แจ้งเตือน
**Files:** `lib/notify.ts`, `app/api/notifications/read/route.ts`

- `notifyMember(conn, userId, title, body)` → INSERT แถว `notifications`
- เรียกเมื่อ:
  - พนักงานยืนยันชำระ (สถานะ paid หรือ cancelled)
  - ขายหน้าเคาน์เตอร์
  - แลกรางวัล
- LINE push (ถ้าเปิดไว้) ส่งหลัง commit แบบไม่บล็อกการทำงาน
- `POST /api/notifications/read` ตั้งค่าทุกรายการเป็นอ่านแล้ว (แอปเรียกเมื่อเปิดหน้าแจ้งเตือน)

### L5 — ขายหน้าเคาน์เตอร์ + สิทธิ์สมาชิก
**Files:** `app/api/admin/sales/route.ts`, `app/api/admin/members/rights/route.ts`, `lib/admin-auth.ts`, `database/schema.sql`, `components/admin-members.tsx`

- permission `sales.manage`
  - ให้ super_admin, manager, front_desk, finance
  - map `sales` → `["sales.manage"]`
- `GET /api/admin/members/rights?userId=` → memberships, pauses, coupons, entitlements, pending
- `GET /api/admin/sales` (catalog) → แพ็กเกจ/คูปองที่เปิดขาย พร้อมราคาจากเซิร์ฟเวอร์
- `POST /api/admin/sales { userId, kind: "content" | "coupon", itemId, method: "cash" | "card" | "promptpay", note? }`
  - ใช้ราคาจากเซิร์ฟเวอร์
  - ทำใน transaction: payment `paid` (metadata `{ channel: "counter", soldBy }`) → ให้สิทธิ์ (โค้ดเดียวกับการยืนยันชำระ) → audit `sale.create` → notify

### L6 — แลก Coin
**Files:** `app/api/rewards/redeem/route.ts`, `database/schema.sql`, `components/ppa-app.tsx`

- seed `reward` 5 รายการ (จาก `coinRewards` เดิม, metadata `{ cost }`)
- `POST /api/rewards/redeem { contentId }`
  - lock wallet และเช็ก coin
  - หัก coin + ledger `coin_redeem`
  - INSERT entitlement type `reward` (1 ครั้ง, 30 วัน)
  - notify
  - ตอบ `{ entitlementId }`
- แอป: รายการรางวัลอ่านจาก catalog แลกได้จริง แล้วเปิด QR สิทธิ์รางวัล

### L7 — ตั้งค่าเว็บ + PDPA
**Files:** `app/api/consent/route.ts`, `database/schema.sql`, `app/api/bootstrap/route.ts`, `components/ppa-app.tsx`

- content `site_setting`:
  - `support-contact`: metadata `{ phone, email, line, lineUrl, hours }` (seed ค่าที่แอปใช้อยู่)
  - `privacy-policy`: seed `active = FALSE`, metadata `{ version }`
- `users.pdpa_accepted_at DATETIME NULL`, `users.pdpa_version VARCHAR(20) NULL`
- bootstrap ส่ง `consent: { acceptedAt, version }`
- `POST /api/consent { version }`
- แอป:
  - หน้าช่วยเหลืออ่านข้อมูลจาก `support-contact`
  - ถ้า `privacy-policy` เปิดอยู่และยังไม่ยอมรับเวอร์ชันนั้น แสดง modal ให้ยินยอม

### L8 — ประวัติการเข้าใช้
**Files:** `database/schema.sql`, `app/api/admin/qr/verify/route.ts`, `app/api/bootstrap/route.ts`, `components/ppa-app.tsx`

- ตาราง `member_visits (id, user_id, purpose, ref_id, staff_id, created_at)` INSERT ตอน consume QR สำเร็จ
- bootstrap `visits` 20 รายการล่าสุด
- หน้า "การเข้าใช้บริการ" แสดงประวัติจริง

### L9 — ตรวจสอบ + เอกสาร
- เทสต์ทั้งหมด, lint, build, responsive fixtures ของหน้าจอใหม่
- README: env ใหม่ (`PROMPTPAY_ID`, `PROMPTPAY_NAME`, `SLIP_STORAGE_DIR`, `LINE_PUSH_ENABLED`) และขั้นตอน launch
