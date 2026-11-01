# PPA App Revisions Part 1–5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับแอปตามเอกสาร "แก้ไข app ppa part 1-5" ให้ครบ 5 ข้อ ได้แก่ ริชเมนู 6 ปุ่ม, หน้าเลือกแพ็กเกจ 4 แท็บ, คูปองของฉัน, หาก๊วนเล่นกีฬา (3–4 สล็อต + LIVE + จำนวนคนที่ขาด) และ GYMNOS 7 ก้อน พร้อมแก้จุดบกพร่องหน้าบ้าน/หลังบ้านที่พบระหว่างตรวจ

**Architecture:**
- ราคาและแพ็กเกจเก็บใน DB (`app_content_items`, `coupons` + metadata JSON) เพื่อให้แก้จาก AdminConsole ได้ ไม่ฝังไว้ใน React
- ตอนสร้างรายการชำระเงิน เซิร์ฟเวอร์ snapshot เงื่อนไขสิทธิ์ (เดือน/วัน/จำนวนครั้ง) ลง payment metadata แล้วใช้ snapshot เดียวกันทั้งกรณีจ่าย Wallet และกรณีพนักงานยืนยัน PromptPay
- หน้าจอใหม่แยกเป็นไฟล์ component ตามหน้าที่ แล้วต่อเข้ากับ `components/ppa-app.tsx`

**Tech Stack:** Next.js 16.4 route handlers, React 19, TypeScript, MariaDB 10.5 (mysql2), zod 4, i18next (th/en/zh), node:test, Playwright + Chrome

**Spec:**
- `/Users/zeroline/Downloads/638548614767444224_แก้ไข app ppa part 1-5.pdf` (ภาพแต่ละหน้า: `/tmp/ppa-pdf/out/page-01..10.png`)
- ต้นแบบอ้างอิง `ppa-app-full.html`:
  - FYG บรรทัด 908–913
  - การ์ด GYMNOS 918–921
  - GYMNOS hub 1818–1838
  - คูปองของฉัน 2981–3017
  - plans/coupon 3020–3161
  - CSS 279–382, 480–484, 606–640

## Global Constraints

- **ค่าตามสเปก (ใช้ใน seed):**

  | แท็บ | ตัวเลือก | ราคา | Extra (Swim/Hyrox) |
  |---|---|---|---|
  | Monthly | 12 เดือน (badge "คุ้มสุด") | 19,200 | 19,700 |
  | Monthly | 1 เดือน | 2,000 | 2,700 |
  | Monthly | 6 เดือน | 10,885 | 11,485 |
  | Time | 1 ครั้ง (ใช้ได้ 1 วัน) | 200 | 300 |
  | Time | 1 สัปดาห์ | 1,000 | 1,500 |
  | Coupon Fitness | 10 ใบ / 60 วัน | 1,600 | 2,400 |
  | Coupon Fitness | 30 ใบ / 120 วัน | 4,200 | 6,300 |
  | Coupon Fitness | 60 ใบ / 180 วัน | 7,200 | 12,000 |
  | Coupon Fitness | 120 ใบ / 365 วัน (badge "BEST SELLER") | 12,000 | 18,000 |

  - พักแพ็กเกจ: 500 ฿/ครั้ง, ≤ 60 วัน/ครั้ง, แพ็กเกจ 6 เดือนพักได้ 1 ครั้ง, 12 เดือนพักได้ 2 ครั้ง
  - ต่ออายุคูปอง: 500 ฿ ต่อ 1 เดือน
- **ข้อความ UI:** ทุกข้อความผ่าน `t()` และมีแปล en/zh เทสต์ที่มีอยู่จะ fail ถ้า:
  - key ซ้ำ
  - placeholder ไม่ตรงกัน
  - JSX มีอักษรไทยตรงๆ
- **ห้ามข้อมูลปลอม** (ตามหลักใน FRONTEND_REVIEW.md): จำนวนคนที่ขาดและป้าย LIVE ต้องมาจากข้อมูลใน DB
- **Seed และ schema:**
  - seed ใหม่ใช้ `INSERT IGNORE` เพื่อไม่ทับค่าที่แอดมินแก้
  - `database/schema.sql` ต้องรันซ้ำได้ (ใช้ `ADD COLUMN IF NOT EXISTS` ของ MariaDB 10.5)
- **สีเน้น:** ส่วนที่แก้ใช้ `--brand-orange: #ff6a00` ตามต้นแบบ ห้ามแก้ `--orange` เดิม (ตอนนี้ตั้งเป็นเขียวมะนาวทั้งแอป)
- **สิ่งที่ทำเองไม่ได้ ต้องให้เจ้าของระบบสั่ง:**
  - รัน `npm run db:init` กับ DB จริง
  - รัน `npm run line:rich-menu:create`
  - commit หรือ push

## Review Focus

1. **ยืนยัน PromptPay แพ็กเกจยาว:** พนักงานยืนยันแพ็กเกจ 12 หรือ 6 เดือน ต้องได้สิทธิ์ 12 หรือ 6 เดือน ไม่ใช่ 1 เดือนจากการเดาชื่อแพ็กเกจ (Task 3)
2. **กดขอซ้ำ:** กดขอพักหรือต่ออายุซ้ำ หรือกดจากสองเครื่องพร้อมกัน ต้องเหลือรายการรอยืนยันเดียวและไม่หักเงินซ้ำ (Task 4)
3. **แย่งที่ในก๊วน:** ก๊วนเหลือ 1 ที่ มีสองคนกดเข้าร่วมพร้อมกัน ต้องได้แค่คนเดียว อีกคนได้ 409 (Task 5)
4. **ลิงก์จากริชเมนู:** เปิดผ่าน `liff.line.me` (มี `liff.state`) ต้องไปหน้าที่กด ไม่ค้างหน้าแรก (Task 13)
5. **QR ระหว่างพักแพ็กเกจ:** ขอ QR สมาชิกระหว่างช่วงพักต้องถูกปฏิเสธ และใช้ได้ตามปกติหลังพัก (Task 4)

## File Structure

**Create:**

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/package-grant.ts` | pure: แปลง metadata เป็นเงื่อนไขสิทธิ์ (ใช้ทั้ง payment และ approval) |
| `lib/package-presentation.ts` | pure, ใช้ฝั่ง client ได้: จัดกลุ่มแพ็กเกจ/Extra, อายุคูปอง, % คงเหลือ, สล็อตก๊วน |
| `lib/renewals.ts` | server: กติกาพักแพ็กเกจและต่ออายุคูปอง |
| `lib/wallet.ts` | server: หัก Wallet และสร้างแถว payment |
| `lib/groups.ts` | server: query ก๊วนพร้อมจำนวนสมาชิก |
| `lib/rich-menu.ts` | pure: อ่าน `screen` จาก URL และ `liff.state` |
| `app/api/memberships/pause/route.ts` | API ขอพักแพ็กเกจ |
| `app/api/coupons/renew/route.ts` | API ต่ออายุคูปอง |
| `app/api/groups/join/route.ts` | API เข้าร่วม/ออกจากก๊วน |
| `components/member-ui.tsx` | `Top`/`SectionTitle`/`Empty`/`money` ย้ายออกจาก ppa-app |
| `components/member-types.ts` | type ฝั่งสมาชิกที่ใช้ร่วมกัน |
| `components/member-packages.tsx` | หน้าเลือกแพ็กเกจ 4 แท็บ + `CouponPacks` |
| `components/member-coupons.tsx` | `MyCouponList` |
| `components/member-groups.tsx` | `FindYourGameRow` + `GroupsScreen` |
| `components/gymnos-hub.tsx` | `GymnosHub` + `ServiceClassScreen` |
| `lib/i18n/package-messages.ts` | ข้อความแปลชุดใหม่ |
| `scripts/render-rich-menu.mjs` | แปลง SVG เป็น PNG ด้วย Chrome (ตอนนี้ไม่มี sharp ในโปรเจกต์ สคริปต์เดิมจึงใช้ไม่ได้) |
| `tests/packages.test.mjs` | เทสต์ชุดใหม่ |

**Modify:**
- `database/schema.sql`
- `scripts/db-init.mjs`
- `lib/payment-catalog.ts`
- `lib/entitlements.ts`
- `app/api/{payments,coupons,coupons/buy,groups,bootstrap,qr,admin/payments,admin/coupons,admin/qr/verify}/route.ts`
- `app/AdminConsole/page.tsx`
- `components/ppa-app.tsx`
- `components/admin-console.tsx`
- `app/styles.css`
- `lib/i18n/index.ts`
- `config/line-rich-menu-main.json`
- `public/line/rich-menu-main.{svg,png}`
- `package.json` (script `line:rich-menu:image`)
- `tests/security.test.mjs`
- `scripts/responsive-check.mjs`
- `README.md`

---

### Task 1: Schema migration, catalog seed, ปิดช่องโหว่ db-init

**Files:**
- Modify: `database/schema.sql`
- Modify: `scripts/db-init.mjs`
- Test: `tests/packages.test.mjs`

**Interfaces — Produces:**

คอลัมน์ใหม่:
- `coupons.sort_order INT NOT NULL DEFAULT 0`
- `coupons.metadata JSON NULL`
- `user_coupons.total_uses INT NULL`
- `user_coupons.payment_id BIGINT UNSIGNED NULL`
- `groups_clubs.max_players INT NOT NULL DEFAULT 4`
- `groups_clubs.play_at DATETIME NULL`
- index `idx_groups_open (status, play_at)`

ตารางใหม่:
- `group_members(group_id, user_id, joined_at)`
  - PK `(group_id, user_id)`
  - FK ไป `groups_clubs` และ `users`
  - backfill เจ้าของก๊วนด้วย `INSERT IGNORE ... SELECT id, owner_user_id, created_at FROM groups_clubs`
- `membership_pauses(id, membership_id, user_id, payment_id NULL, starts_at, ends_at, days, status ENUM('active','cancelled'), created_at)`
  - KEY `(membership_id, status)`
  - KEY `(user_id, ends_at)`

Seed (ใช้ `INSERT IGNORE` ทั้งหมด):

`membership_plan` 9 แถว:

| slug | ราคา | metadata |
|---|---|---|
| `fitness-12m` | 19200 | `{"tab":"monthly","group":"12m","variant":"base","label":"Fitness (12 เดือน)","featured":true,"badge":"คุ้มสุด","perks":[3 ข้อจากสเปก],"months":12,"pausesAllowed":2,"services":["fitness"]}` |
| `fitness-swim-12m` | 19700 | variant `swim` |
| `fitness-hyrox-12m` | 19700 | variant `hyrox` |
| `fitness-1m` | 2000 | label `1 เดือน`, subtitle `เข้าใช้ไม่จำกัด` |
| `fitness-swim-1m` | 2700 | |
| `fitness-hyrox-1m` | 2700 | |
| `fitness-6m` | 10885 | label `6 เดือน`, `pausesAllowed` 1 |
| `fitness-swim-6m` | 11485 | |
| `fitness-hyrox-6m` | 11485 | |

`time_pass` 6 แถว:

| slug | ราคา | metadata |
|---|---|---|
| `fitness-1-visit` | 200 | `days` 1, `uses` 1, label `1 ครั้ง`, subtitle `ใช้ได้ 1 วัน` |
| Extra ของ 1 ครั้ง (2 แถว) | 300 | |
| `fitness-1-week` | 1000 | `days` 7, label `1 สัปดาห์` |
| Extra ของ 1 สัปดาห์ (2 แถว) | 1500 | |

`coupons` 12 แถว:

| code | ราคา / ครั้ง / วัน | category |
|---|---|---|
| `FIT-COUPON-10` | 1600 / 10 / 60 | `fitness` |
| `FIT-SWIM-COUPON-10`, `FIT-HYROX-COUPON-10` | 2400 / 10 / 60 | `fitness-swim`, `fitness-hyrox` |

…ไล่ไปจนครบ 30, 60, 120 ใบ
- metadata: `{"tab":"coupon","group":"c10","variant":"base"|"swim"|"hyrox","label":"Fitness + Swim"}`
- `badge:"BEST SELLER"` ที่ `c120` ตัว base

`renewal_option` 2 แถว:
- `package-pause` ราคา 500, metadata `{"kind":"membership_pause","maxDays":60}`
- `coupon-renewal` ราคา 500, metadata `{"kind":"coupon_renewal","months":1}`

Migration และ hardening:
- **ปิดแพ็กเกจเก่า:** UPDATE ให้ `active = FALSE` เฉพาะ `monthly` (1900), `quarterly` (5100), `annual` (18000) ที่ยังเป็นค่า seed เดิม และลบ 3 แถวนี้ออกจาก seed upsert
- **ซูเปอร์แอดมิน:** seed ต้องไม่เขียนทับ `password_hash`, `status`, `role_id` ของแถวที่มีอยู่แล้ว
- **`db-init.mjs`:** ห้ามมี fallback host/user/password ถ้าขาด `DB_HOST`, `DB_USER` หรือ `DB_NAME` ให้ throw

**Steps:**

- [ ] **Step 1:** เขียนเทสต์ `schema seeds the package catalog with spec prices and keeps admin edits` ให้ assert สิ่งต่อไปนี้ใน `schema.sql`:
  - มีคู่ slug/code กับราคาครบทุกตัวในตารางด้านบน
  - ทุก statement ที่มี `fitness-12m`, `FIT-COUPON-10`, `package-pause` ขึ้นต้นด้วย `INSERT IGNORE`
  - มี `CREATE TABLE IF NOT EXISTS group_members` และ `membership_pauses`
  - upsert ของ `admin_staff` ไม่มี `password_hash = VALUES(password_hash)`
  - `scripts/db-init.mjs` ไม่ match `/DB_PASSWORD\s*\|\|/`
- [ ] **Step 2:** รัน `node --test tests/packages.test.mjs` ต้อง FAIL
- [ ] **Step 3:** แก้ `schema.sql` และ `db-init.mjs` ตาม Interfaces ด้านบน โดยวาง ALTER ต่อจาก CREATE TABLE ของตารางนั้น
- [ ] **Step 4:** รันเทสต์ ต้อง PASS

### Task 2: Pure helpers สำหรับแพ็กเกจและก๊วน

**Files:**
- Create: `lib/package-grant.ts`
- Create: `lib/package-presentation.ts`
- Test: `tests/packages.test.mjs`

**Interfaces — Produces:**

`lib/package-grant.ts`:
- `type CatalogGrant = { months?: number; days?: number; uses?: number | null; services?: string[]; pausesAllowed?: number }`
- `normalizeGrant(metadata: unknown): CatalogGrant`
  - รับได้ทั้ง object และ JSON string
  - `months`: int 1–36
  - `days`: int 1–366
  - `uses`: int 1–999 หรือ `null` ถ้ามี key แล้วเป็น null
  - `services`: ไม่เกิน 6 ค่า แต่ละค่าตรง `/^[a-z][a-z0-9-]{0,31}$/`
  - `pausesAllowed`: int 0–4
  - ค่าที่ไม่ผ่านให้ทิ้ง
- `legacyMembershipMonths(itemName: string): number`
  - ตรง `(\d{1,2})\s*(เดือน|months?)` → ค่านั้น
  - มี `annual` หรือ `รายปี` → 12
  - มี `quarter` → 3
  - นอกนั้น → 1

`lib/package-presentation.ts`:
- `parseMeta(v: unknown): Record<string, unknown>`
- `groupPackages<T extends { id: number; sortOrder?: number | null; metadata?: unknown }>(items: T[]): { key: string; base: T; extras: T[] }[]`
  - group ตาม `meta.group` (ถ้าไม่มี key = `id-${id}`)
  - base คือ `variant` `"base"` หรือไม่มี variant (ถ้าไม่มี ใช้ตัวแรกตาม sort)
  - เรียงกลุ่มตาม sortOrder ต่ำสุด
- `validityLabel(days)` → `{ amount, unit: "day" | "month" | "year" }` (365/366 = 1 ปี, หาร 30 ลงตัว = เดือน)
- `perUnit(price, count)` → `Math.round`, ได้ 0 ถ้า count ≤ 0
- `usedCount(total, remaining)` → ไม่ติดลบ
- `remainingPercent(remaining, total)` → 0–100
- `daysLeft(iso, now)` → ceil, ต่ำสุด 0
- `missingPlayers({ maxPlayers, memberCount })` → ไม่ติดลบ
- `openGameSlots(groups, now, limit = 4)`
  - กรองเฉพาะที่ยังขาดคน และ `playAt` เป็น null หรือ > now − 1 ชม.
  - เรียง `playAt` ก่อน (null ไว้ท้าย) แล้วตามจำนวนที่ขาดน้อยไปมาก

**Steps:**

- [ ] **Step 1:** เขียนเทสต์ `package helpers group extras under their base and format coupon validity` ให้ assert:
  - `groupPackages` ของ 9 แผน Monthly ได้ลำดับ key `["12m","1m","6m"]` และ extras ของ `12m` เป็น `[swim, hyrox]`
  - `validityLabel(60)` = `{amount:2, unit:"month"}`
  - `validityLabel(365)` = `{amount:1, unit:"year"}`
  - `validityLabel(45)` = `{amount:45, unit:"day"}`
  - `perUnit(1000, 7)` = 143
  - `perUnit(10885, 6)` = 1814
  - `usedCount(10, 12)` = 0
  - `remainingPercent(7, 10)` = 70
- [ ] **Step 2:** เขียนเทสต์ `grant metadata is validated and legacy names map to months` ให้ assert:
  - `normalizeGrant('{"months":12,"uses":null,"services":["fitness","bad value"]}')` = `{months:12, uses:null, services:["fitness"]}`
  - `normalizeGrant({months:99})` = `{}`
  - `legacyMembershipMonths("Fitness 6 เดือน")` = 6
  - `legacyMembershipMonths("แพ็กเกจ Annual")` = 12
- [ ] **Step 3:** เขียนเทสต์ `open game slots show only joinable upcoming groups, soonest first` ให้ assert:
  - ก๊วนที่เต็มและก๊วนที่เวลาผ่านไปแล้วเกิน 1 ชม. ถูกตัดออก
  - ได้ไม่เกิน 4 รายการ
- [ ] **Step 4:** รันเทสต์ ต้อง FAIL แล้ว implement ทั้งสองไฟล์ แล้วรันใหม่ต้อง PASS

### Task 3: Catalog ฝั่งเซิร์ฟเวอร์, snapshot ใน payment, การยืนยันชำระ

**Files:**
- Modify: `lib/payment-catalog.ts`
- Modify: `lib/entitlements.ts`
- Modify: `app/api/payments/route.ts`
- Modify: `app/api/admin/payments/route.ts`
- Modify: `app/api/coupons/route.ts`
- Modify: `app/api/coupons/buy/route.ts`
- Modify: `app/AdminConsole/page.tsx`
- Test: `tests/security.test.mjs`
- Test: `tests/packages.test.mjs`

**Interfaces — Consumes:** `normalizeGrant`, `legacyMembershipMonths` จาก Task 2

**Interfaces — Produces:**
- `resolvePaymentItem(input)` → `Promise<{ amount: number; itemName: string; itemType: "membership" | "time_pass" | "class" | "trainer"; contentId?: number; grant: CatalogGrant } | null>`
  - SQL รับเฉพาะ content type `service_package`, `class_schedule`, `membership_plan`, `time_pass`
  - ห้ามรับ `renewal_option` (ต้องไปผ่าน API ของ Task 4)
- `grantPaidEntitlement(conn, { amount, itemName, itemType, paymentId, userId, grant?: CatalogGrant })`
  - **membership:**
    - เดือน = `grant.months ?? legacyMembershipMonths(itemName)`
    - metadata ของแถว `memberships` = `{amount, source, months, services?, pausesAllowed?}`
  - **time_pass:**
    - insert แถว `user_entitlements` type `time_pass`
    - `remaining_uses = grant.uses ?? NULL`
    - `ends_at = NOW() + grant.days ?? 1` วัน
- metadata ของ `payments` จาก `/api/payments` = `JSON.stringify({ itemName, itemType, contentId, grant })`
- การยืนยันชำระของพนักงาน:
  - type `membership`, `time_pass`, `class`, `trainer` → เรียก `grantPaidEntitlement` ด้วย `normalizeGrant(metadata.grant)`
  - type `coupon` → insert `user_coupons(total_uses, payment_id)` จาก snapshot `totalUses`/`validityDays` ถ้ามี
- รายการ payment (ทั้ง API และหน้า AdminConsole) เพิ่ม `itemName`, `itemType` จาก `JSON_UNQUOTE(JSON_EXTRACT(p.metadata,'$.itemName'))`
- `GET /api/coupons` คืน `sortOrder`, `metadata` เรียงตาม `sort_order, id`
- `coupons/buy`:
  - payment metadata เพิ่ม `totalUses`, `validityDays`
  - แถว `user_coupons` ใส่ `total_uses` และ `payment_id`

**Steps:**

- [ ] **Step 1:** อัปเดตเทสต์ `catalog ignores client amount and entitlement type` ให้คาดผล `{ amount: 1900, itemName: "Monthly", itemType: "membership", contentId: 1, grant: {} }`
- [ ] **Step 2:** เพิ่มเทสต์ `catalog snapshots plan months and time-pass days from metadata`
  - แถว `membership_plan` ที่มี `{"months":12}` → `grant.months === 12`
  - แถว `time_pass` → `itemType "time_pass"` และ `grant` = `{days:1, uses:1}`
  - SQL ที่ส่งเข้า query ไม่มีคำว่า `renewal_option`
- [ ] **Step 3:** เพิ่มเทสต์ `staff approval of a PromptPay 12-month plan grants 12 months`
  - ใช้ admin payments route กับ `lib/entitlements` ตัวจริง และ metadata `{itemType:"membership", itemName:"Fitness (12 เดือน)", grant:{months:12}}`
  - statement `INSERT INTO memberships` ต้องมี param 12
  - ถ้าไม่มี `grant` และชื่อ `"Fitness 6 เดือน"` ต้องได้ 6
- [ ] **Step 4:** รันเทสต์ ต้อง FAIL แล้ว implement ตาม Interfaces แล้วรัน `npm test` ต้อง PASS ทั้งหมด

### Task 4: พักแพ็กเกจและต่ออายุคูปอง (backend)

**Files:**
- Create: `lib/renewals.ts`
- Create: `lib/wallet.ts`
- Create: `app/api/memberships/pause/route.ts`
- Create: `app/api/coupons/renew/route.ts`
- Modify: `app/api/admin/payments/route.ts`
- Modify: `app/api/qr/route.ts`
- Modify: `app/api/admin/qr/verify/route.ts`
- Test: `tests/packages.test.mjs`

**Interfaces — Produces:**

ค่าคงที่:
- `PAUSE_MAX_DAYS = 60`
- `PAUSE_MAX_LEAD_DAYS = 30`
- `COUPON_RENEW_GRACE_DAYS = 30`

ฟังก์ชันใน `lib/renewals.ts`:
- `class RenewalError extends Error { status: 404 | 409 }`
- `pausesAllowedFor(meta, startsAt, endsAt): number`
  - ใช้ `meta.pausesAllowed` ถ้ามี
  - ถ้าไม่มี คำนวณจากระยะแพ็กเกจ: ≥ 12 เดือน → 2, ≥ 6 เดือน → 1, นอกนั้น → 0
- `renewalOption(kind: "membership_pause" | "coupon_renewal")` → `Promise<{ contentId; title; price; months; maxDays } | null>`
- `checkPauseRequest(conn, { userId, membershipId, startDate, days, today })`
  - lock แถว membership ด้วย `FOR UPDATE`
  - กติกา:
    - membership ต้อง active
    - `days` 1–60
    - `startDate` ≥ today และ ≤ today+30
    - `startDate` ต้องก่อน `ends_at`
    - จำนวนครั้งที่พักแล้วต้องน้อยกว่าสิทธิ์
    - ห้ามซ้อนกับช่วงพักเดิม
- `applyMembershipPause(conn, { userId, membershipId, startDate, days, paymentId })`
  - INSERT แถว `membership_pauses`
  - `UPDATE memberships SET ends_at = DATE_ADD(ends_at, INTERVAL ? DAY)`
- `applyCouponRenewal(conn, { userId, userCouponId, months, paymentId })`
  - ต่อได้เมื่อ `status = 'active'`, `remaining_uses > 0` และ `expires_at > NOW() - INTERVAL 30 DAY`
  - วันหมดอายุใหม่ = `DATE_ADD(GREATEST(expires_at, NOW()), INTERVAL ? MONTH)`
- `assertNoPendingRequest(conn, { userId, itemType, refKey, refId })` → 409 ถ้ามี payment `created` ที่ itemType และ ref ตรงกัน

ฟังก์ชันใน `lib/wallet.ts`:
- `debitWallet(conn, { userId, amount, note, paymentId }): Promise<boolean>` (lock wallet, หักเงิน, เขียน ledger)
- `createPaymentRow(conn, { userId, method, amount, paid, metadata })` → `{ paymentId, paymentNo }`

API:
- `POST /api/memberships/pause` body `{ membershipId, startDate: "YYYY-MM-DD", days: 1..60, method: "wallet" | "promptpay" }`
  - สำเร็จ → 201 `{ paymentNo, status }`
  - payment metadata `{ itemType: "membership_pause", itemName, contentId, membershipId, startDate, days }`
- `POST /api/coupons/renew` body `{ userCouponId, method }`
  - payment metadata `{ itemType: "coupon_renewal", itemName, contentId, userCouponId, months }`

การยืนยันชำระของพนักงาน:
- type `membership_pause` และ `coupon_renewal` เรียก `apply*`
- ถ้าเกิด `RenewalError` ให้ตอบ 409 พร้อมข้อความ

QR สมาชิก (ทั้งตอนออก QR, preview และ consume):
- เพิ่มเงื่อนไข `NOT EXISTS (membership_pauses mp WHERE mp.membership_id = … AND mp.status = 'active' AND mp.starts_at <= NOW() AND mp.ends_at > NOW())`

**Steps:**

- [ ] **Step 1:** เขียนเทสต์ `pause rules cap 60 days, block past or post-expiry starts and enforce the allowed count` ให้ assert ว่าแต่ละกรณีต่อไปนี้ throw `RenewalError` 409:
  - `days` 61
  - `startDate` เมื่อวาน
  - start ≥ `ends_at`
  - แพ็กเกจ 6 เดือนที่พักไปแล้ว 1 ครั้ง
  - ช่วงพักซ้อนกับของเดิม
- [ ] **Step 2:** เขียนเทสต์ `pause extends membership end by the paused days` ให้ assert ว่ามี `INSERT INTO membership_pauses` และ UPDATE ที่ได้ param `[30, membershipId]`
- [ ] **Step 3:** เขียนเทสต์ `coupon renewal extends from the later of expiry and now and rejects exhausted coupons` ให้ assert:
  - SQL มี `GREATEST(expires_at, NOW())`
  - ถ้า `remaining_uses` = 0 ต้องได้ `RenewalError`
- [ ] **Step 4:** เขียนเทสต์ route `pause request with insufficient wallet rolls back without a pause` และ `duplicate pending pause is rejected` ให้ assert:
  - กรณี Wallet ไม่พอ → status 409, rollback และไม่มี `INSERT INTO membership_pauses`
  - กรณีมีคำขอรอยืนยันอยู่แล้ว → status 409
- [ ] **Step 5:** เขียนเทสต์ `member QR is refused during an active pause` ให้ assert ว่า SQL ของ member ใน `app/api/qr/route.ts` และ `admin/qr/verify` มี `membership_pauses`
- [ ] **Step 6:** รันเทสต์ ต้อง FAIL แล้ว implement แล้วรัน `npm test` ต้อง PASS ทั้งหมด

### Task 5: Find Your Game (backend)

**Files:**
- Create: `lib/groups.ts`
- Modify: `app/api/groups/route.ts`
- Create: `app/api/groups/join/route.ts`
- Test: `tests/packages.test.mjs`

**Interfaces — Produces:**
- `type GroupRow = { id; name; levelName; description; sportSlug; sportName; sportIcon; maxPlayers; memberCount; playAt: string | null; joined: number; isOwner: number }`
- `listGroups(userId: number, limit: number): Promise<GroupRow[]>`
  - เงื่อนไข: `status = 'active'` และ (`play_at` เป็น NULL หรือ `play_at > NOW() - INTERVAL 1 HOUR`)
  - LIMIT เป็นตัวเลขตายตัว จำกัดช่วง 1–50
- `GET /api/groups` → `{ groups }`
- `POST /api/groups`
  - body เพิ่ม `maxPlayers` (2–30, ค่าเริ่มต้น 4) และ `playAt` ไม่บังคับ (รูปแบบ `"YYYY-MM-DDTHH:mm"` เวลากรุงเทพ ต้องอยู่ในอนาคตไม่เกิน 60 วัน)
  - ทำใน transaction: insert ก๊วน + insert เจ้าของเป็นสมาชิก
  - สำเร็จ → 201 `{ ok, groupId }`
- `DELETE /api/groups?id=` → เจ้าของปิดก๊วน (เปลี่ยนเป็น archived), คนอื่นได้ 403
- `POST /api/groups/join { groupId }`
  - lock แถวก๊วน `FOR UPDATE`
  - เข้าร่วมสำเร็จ → 201
  - อยู่ในก๊วนแล้ว → 200
  - ก๊วนเต็ม → 409
  - ไม่พบก๊วน หรือเวลาผ่านไปแล้ว → 404
- `DELETE /api/groups/join { groupId }` → ออกจากก๊วน, เจ้าของออกไม่ได้ → 409

**Steps:**

- [ ] **Step 1:** เขียนเทสต์ให้ครอบคลุม:
  - `joining a full group is rejected under the group row lock` (assert ว่ามี `FOR UPDATE` ก่อน INSERT และได้ 409)
  - `joining twice is idempotent`
  - `owner cannot leave own group`
  - `create stores owner as first member and rejects past playAt`
- [ ] **Step 2:** รันเทสต์ ต้อง FAIL แล้ว implement แล้วรันใหม่ต้อง PASS

### Task 6: ข้อมูล bootstrap สำหรับหน้าจอใหม่

**Files:**
- Modify: `app/api/bootstrap/route.ts`
- Test: `tests/packages.test.mjs`

**Interfaces — Consumes:** `listGroups` จาก Task 5

**Interfaces — Produces (field ใน response):**
- `coupons`: เพิ่ม `purchasedAt` (จาก `uc.created_at`), `totalUses` (จาก `COALESCE(uc.total_uses, c.total_uses)`), `code`
- `expiredCoupons`: คูปองที่ `remaining > 0` และหมดอายุไม่เกิน 30 วัน
- `memberships`: เพิ่ม `metadata`
- `membershipPauses`: `[{ id, membershipId, startsAt, endsAt, days }]` เฉพาะที่ active และยังไม่สิ้นสุด
- `pendingPayments`: `[{ paymentNo, amount, createdAt, itemType, itemName, refId }]` เฉพาะที่ `status = 'created'`
- `walletLedger`: 20 รายการล่าสุด `[{ id, kind, amount, coinDelta, pointDelta, note, createdAt }]`
- `groups`: `listGroups(user.id, 12)`

**Steps:**

- [ ] **Step 1:** เขียนเทสต์ `bootstrap returns coupon purchase date, total uses and new datasets` โดย mock query ตาม SQL แล้ว assert:
  - query ของคูปองเลือก `created_at` และ `total_uses`
  - response มีครบทุก key ข้างบน
- [ ] **Step 2:** รันเทสต์ ต้อง FAIL แล้ว implement แล้วรันใหม่ต้อง PASS

### Task 7: AdminConsole รองรับแคตตาล็อกใหม่

**Files:**
- Modify: `app/api/admin/coupons/route.ts`
- Modify: `components/admin-console.tsx`
- Test: `tests/packages.test.mjs`

**Interfaces — Produces:**

API คูปองหลังบ้าน:
- body รับ `sortOrder` (int 0–999999, ค่าเริ่มต้น 0) และ `metadata` (record, ค่าเริ่มต้น `{}`)
- SELECT คืนทั้งสองค่า

หน้าจอ AdminConsole:
- **CouponManager:**
  - เพิ่มช่องลำดับการแสดงผล และช่อง metadata JSON (ตรวจ JSON แบบเดียวกับ ContentManager)
  - เพิ่ม category `fitness-swim`, `fitness-hyrox`, `swim`, `airfit`
- **PaymentTable:** แสดง `itemName` ใต้เลขรายการ เพื่อให้พนักงานรู้ว่ากำลังยืนยันรายการอะไร (พักแพ็กเกจ/ต่ออายุ/แพ็กเกจ)
- **ContentManager:** ช่องประเภทมี datalist `membership_plan`, `time_pass`, `renewal_option`, `service_package`, `class_schedule`, `home_slide`, `live_tv`, `feature_screen`

**Steps:**

- [ ] **Step 1:** เขียนเทสต์ `coupon admin persists sort order and metadata` ให้ assert ว่าพารามิเตอร์ของ INSERT มี `sortOrder` และ metadata ที่ถูก stringify แล้ว
- [ ] **Step 2:** implement แล้วรัน `npm test` และ `npm run lint` ต้อง PASS

### Task 8: พื้นฐาน UI สมาชิก (refactor + i18n + สี)

**Files:**
- Create: `components/member-ui.tsx`
- Create: `components/member-types.ts`
- Create: `lib/i18n/package-messages.ts`
- Modify: `components/ppa-app.tsx`
- Modify: `lib/i18n/index.ts`
- Modify: `app/styles.css`
- Modify: `tests/security.test.mjs`

**Interfaces — Produces:**
- export `Top`, `SectionTitle`, `Empty`, `money` จาก `member-ui.tsx` (ย้ายมาจาก ppa-app แบบไม่เปลี่ยนพฤติกรรม)
- type ใน `member-types.ts`:
  - `Screen`, `ContentItem`
  - `Coupon` (+ `purchasedAt`, `metadata`, `sortOrder`)
  - `Membership` (+ `metadata`)
  - `MembershipPause`, `PendingPayment`, `WalletLedgerEntry`
  - `Group` (รูปเดียวกับ `GroupRow`)
  - `Bootstrap` (เพิ่ม field ใหม่จาก Task 6)
- `allMessages = [...messages, ...additionalMessages, ...packageMessages]`
- ตัวแปรสีใน `:root`: `--brand-orange: #ff6a00`, `--brand-orange-2: #ff8a2a`
- เทสต์สแกน JSX ภาษาไทยต้องครอบคลุม component ไฟล์ใหม่ทั้ง 4 ไฟล์

**Steps:**

- [ ] **Step 1:** ย้ายโค้ดและเพิ่มไฟล์ตาม Interfaces
- [ ] **Step 2:** รัน `npm test`, `npm run lint`, `npx tsc --noEmit` ต้อง PASS ทั้งหมด (พฤติกรรมเดิมต้องไม่เปลี่ยน)

### Task 9: แก้ 2 — หน้าเลือกแพ็กเกจ 4 แท็บ

**Files:**
- Create: `components/member-packages.tsx`
- Modify: `components/ppa-app.tsx`
- Modify: `app/styles.css`
- Modify: `lib/i18n/package-messages.ts`

**Interfaces — Consumes:**
- `groupPackages`, `validityLabel`, `perUnit` จาก Task 2
- type จาก Task 8

**Interfaces — Produces:**
- `type PlanTab = "monthly" | "time" | "coupon" | "renew"`
- `PackagePlansScreen` props:
  - `{ tab, onTab, contentItems, couponStore, data, now, busy }`
  - `onBack()`
  - `onSelectContent(item: ContentItem)`
  - `onBuyCoupon(coupon: Coupon)`
  - `onRequestPause({ membershipId, startDate, days, option })`
  - `onRenewCoupon({ userCouponId, option, title })`
- export `CouponPacks({ coupons, onBuy })` (นำไปใช้ซ้ำใน Task 10)

**หน้าตา (ตามรูปหน้า 3–5 ในเอกสาร และต้นแบบ):**

ส่วนบน:
- Top "เลือกแพ็กเกจ"
- `.seg.seg4` 4 แท็บ: Monthly · Time · Coupon · ต่ออายุ

**Monthly:**
- กลุ่ม featured แสดงเป็นการ์ดเขียว `.plan`:
  - ชื่อแพ็กเกจ + badge "คุ้มสุด"
  - ราคา `(เฉลี่ย X ฿ / เดือน)`
  - perks มี ✓ นำหน้า
  - ปุ่มเขียว "เลือกแพ็กเกจนี้"
  - ใต้การ์ดมีแถบ "Extra · 12 เดือน ▾"
- แพ็กเกจอื่นแสดงเป็น `.fit-item`:
  - ราคาสีส้ม
  - แถบ "Extra ▾" ที่กดแล้วเปลี่ยนเป็น "ปิด ▴" (ใช้ key `plans.extra.hide` ที่มี Thai override เป็น "ปิด" เพราะ key "ปิด" เดิมแปลว่า Closed)
- แถว Extra:
  - ชื่อ Extra
  - บรรทัดย่อย "{{base}} + {{diff}} ฿"
  - ราคาสีเขียว

**Time:**
- หัวข้อ "TIME · รายครั้ง (FITNESS)"
- ตัวเลือก "1 ครั้ง / ใช้ได้ 1 วัน" และ "1 สัปดาห์ / เฉลี่ย 143 ฿/ครั้ง"
- แถว Extra ไม่มีบรรทัดย่อย

**Coupon:**
- หัวข้อ "คูปอง (Fitness)"
- กล่อง share-note "🤝 คูปอง 1 ใบ สามารถแชร์ให้เพื่อนได้ 1 คน"
- `CouponPacks` แต่ละชุดแสดง:
  - ตัวเลขใหญ่สีส้ม + "ใบ"
  - "{{n}} ใบ / {{validity}}"
  - "{{price}} ฿ · เฉลี่ย {{avg}} ฿/วัน"
  - ปุ่ม + สีเขียว
  - badge BEST SELLER
  - Extra แสดงบรรทัดย่อย "ใช้งานได้ {{validity}}"
- ปุ่ม "ข้อมูลการใช้งาน" กดแล้วเปิด/ปิดกติกาการใช้คูปองตามระบบจริง

**ต่ออายุ:**
- seg ย่อย แพ็กเกจ | คูปอง
- **แพ็กเกจ:**
  - การ์ดขอบส้ม "พักการใช้งานแพ็กเกจ · 500 ฿/ครั้ง" + คำอธิบาย
  - แถวข้อมูล "📦 แพ็กเกจ 6 เดือน — หยุดได้ 1 ครั้ง" และ "📦 แพ็กเกจรายปี (12 เดือน) — หยุดได้ 2 ครั้ง"
  - สรุปแพ็กเกจปัจจุบัน: ชื่อ, หมดอายุ, ใช้สิทธิ์พักไปแล้ว/ทั้งหมด, พักถึงวันที่
  - ฟอร์มขอพัก:
    - วันเริ่ม (date input, ช่วง today ถึง +30 วัน)
    - จำนวนวัน (select 7/15/30/45/60)
  - ปุ่ม "ขอพักการใช้งาน 500 ฿" (กดไม่ได้ถ้าไม่มีสิทธิ์ หรือมีคำขอรออยู่)
- **คูปอง:**
  - การ์ดขอบเขียว "ต่ออายุคูปอง · 500 ฿/เดือน"
  - select คูปองที่ต่อได้ (active + `expiredCoupons`)
  - แสดงวันหมดอายุใหม่ให้ดูก่อนจ่าย
  - ปุ่ม "ต่ออายุคูปอง 500 ฿/เดือน"

**การต่อเข้ากับ ppa-app:**
- เพิ่ม state `planTab`, `plansReturn` และฟังก์ชัน `openPlans(tab, from)`
- เมนู "แพ็กเกจของฉัน" → `openPlans("monthly")`
- `pendingItem.save` เพิ่มค่า `"pause"` และ `"renewal"`
- `pay()` ส่งไป `/api/memberships/pause` และ `/api/coupons/renew`
- ลบแพ็กเกจสำรองที่ฝังราคาไว้ (1900/5100/18000) ซึ่งตอนนี้กดซื้อแล้ว API ปฏิเสธ

**Steps:**

- [ ] **Step 1:** implement
- [ ] **Step 2:** ตรวจด้วย fixture และภาพหน้าจอตาม Task 15

### Task 10: แก้ 3 — คูปองของฉัน

**Files:**
- Create: `components/member-coupons.tsx`
- Modify: `components/ppa-app.tsx`
- Modify: `app/styles.css`
- Modify: `lib/i18n/package-messages.ts`

**Interfaces — Produces:**
- `MyCouponList({ coupons, expiredCoupons, now, onOpenQr, onRenew, onBuy })`
- การ์ด `.cp-card` แต่ละใบแสดง:
  - ชื่อ + badge "เหลือ N"
  - "ซื้อเมื่อ {{date}} · {{time}} น." (เวลา Asia/Bangkok, รูปแบบตาม `localeTag()`)
  - กล่องสถิติ 3 ช่อง: ทั้งหมด / ใช้ไป (ส้ม) / คงเหลือ (เขียว)
  - "หมดอายุ {{date}} · ใช้ได้อีก {{days}} วัน"
  - แถบ progress = `remainingPercent`
  - กดการ์ดเพื่อเปิด QR คูปอง
- ส่วน "หมดอายุแล้ว (ต่ออายุได้)" มีปุ่ม "ต่ออายุ" ไปแท็บต่ออายุ › คูปอง
- ถ้ายังไม่มีคูปอง แสดง empty state พร้อมปุ่ม "ซื้อคูปอง"

**การต่อเข้ากับ ppa-app:**
- หน้า `mycoupons`:
  - Top "🎟️ คูปองของฉัน", ปุ่มย้อนกลับไป `membership`
  - เอาออกจาก `managedPrototypeScreens`
- เมนู "คูปองของฉัน" ในหน้าสมาชิก → `mycoupons`
- หน้า `coupon` (ปุ่มคูปองในริชเมนู):
  - seg "คูปองของฉัน | ซื้อคูปอง" (ถ้ามีคูปองเริ่มที่ "ของฉัน")
  - ฝั่ง "ซื้อคูปอง" = `CouponPacks` + คูปองอื่นที่ไม่ได้อยู่ในชุดแพ็กเกจ

**Steps:**

- [ ] **Step 1:** implement
- [ ] **Step 2:** ตรวจด้วย fixture และภาพหน้าจอตาม Task 15

### Task 11: แก้ 4 — หาก๊วนเล่นกีฬา

**Files:**
- Create: `components/member-groups.tsx`
- Modify: `components/ppa-app.tsx`
- Modify: `app/styles.css`
- Modify: `lib/i18n/package-messages.ts`

**Interfaces — Produces:**

`FindYourGameRow({ groups, now, onOpen })`:
- หัวข้อ "🎯 Find Your Game" + pill "● LIVE" แสดงเมื่อมีสล็อตเปิดรับอย่างน้อย 1
  - จุดกะพริบ ปิดแอนิเมชันเมื่อผู้ใช้ตั้ง `prefers-reduced-motion`
- การ์ดสูงสุด 4 ใบจาก `openGameSlots` แต่ละใบแสดง:
  - "{{icon}} {{name}}"
  - "ขาดอีก {{value0}} คน"
  - เวลา (วันนี้/พรุ่งนี้ HH:mm หรือวันที่) หรือระดับ ถ้าไม่ได้ตั้งเวลา
- การ์ดขอบซ้ายสีส้ม
- grid 3 คอลัมน์ ถ้ามีใบที่ 4 ให้เลื่อนแนวนอนได้
- ถ้ามีไม่ถึง 3 ใบ เติมการ์ด "＋ สร้างก๊วน" 1 ใบ (ไม่สร้างข้อมูลปลอม)

`GroupsScreen({ groups, sports, now, busy, onBack, onCreate, onJoin, onLeave, onClose })`:
- รายการก๊วนแต่ละอันแสดง:
  - ผู้เล่น "3/4" + จำนวนที่ขาด
  - เวลาเล่น
  - ปุ่ม เข้าร่วม / ออกจากก๊วน / ปิดก๊วน (เฉพาะเจ้าของ) / เต็มแล้ว
- ฟอร์มสร้างก๊วนเลือกกีฬาได้เอง (บั๊กเดิม: ใช้กีฬาที่เลือกค้างไว้ล่าสุดโดยไม่ให้ผู้ใช้เลือก), วันเวลา, จำนวนผู้เล่นสูงสุด 2–20

**การต่อเข้ากับ ppa-app:**
- polling `GET /api/groups` ทุก 60 วินาที เฉพาะตอนอยู่หน้า `home` หรือ `groups` และหน้าเว็บมองเห็นอยู่ เพื่อให้ป้าย LIVE ตรงกับข้อมูลจริง

**Steps:**

- [ ] **Step 1:** implement
- [ ] **Step 2:** ตรวจด้วย fixture 3 กรณี: 0 ก๊วน, 2 ก๊วน, 4 ก๊วน (มีก๊วนเต็ม 1)

### Task 12: แก้ 5 — GYMNOS

**Files:**
- Create: `components/gymnos-hub.tsx`
- Modify: `components/ppa-app.tsx`
- Modify: `app/styles.css`
- Modify: `lib/i18n/package-messages.ts`

**Interfaces — Produces:**

หน้าแรก:
- หัวข้อ "กีฬา & บริการ"
- การ์ด `.gymnos-banner`:
  - ขอบและไล่สีส้มเข้ม
  - "GYMNOS" ตัวเอียงสีส้ม
  - บรรทัดย่อย "Fitness · Swim · HYROX · Pilates · Airfit · Promotion"
  - ลายน้ำ 💪 และลูกศร ›

`GymnosHub({ onBack, onOpen })`:
- Top "GYMNOS" ตัวเอียงสีส้ม + บรรทัด "เลือกบริการที่ต้องการ"
- 6 ก้อนใน `.gx-grid`:

  | ก้อน | คำอธิบาย | ไอคอน | สีพื้น |
  |---|---|---|---|
  | FITNESS | แพ็กเกจ & คูปอง | 🏋️ | #3a2416 |
  | SWIM | แพ็กเกจ & คูปอง | 🏊 | #0e3348 |
  | HYROX | Simulation & Class | 🔥 | #42160f |
  | PILATES | Private & Group | 🤸 | #33203f |
  | AIRFIT | Private & Class | 🪂 | #123a3f |
  | SERVICE CLASS | ฟรี! เฉพาะสมาชิก | 🧘 | #1d3a28 |

- ก้อนที่ 7 `.promo-hero` เต็มความกว้าง ใหญ่ที่สุด:
  - pill "🔥 HOT DEALS", 🎁, "PROMOTION"
  - "ดีลประจำสัปดาห์ & Member ราคาพิเศษ" และลูกศร ›
  - ไล่สี #ff6a00 → #ff2d6b → #a020f0

ปลายทางของแต่ละก้อน:
- FITNESS → `openPlans("monthly", "gymnos")`
- SWIM → หน้า `swim` + ปุ่ม "ดูแพ็กเกจ Fitness + Swim"
- ทุกหน้าที่เปิดจาก hub ปุ่มย้อนกลับต้องกลับมา `gymnos`

`ServiceClassScreen({ items, hasActiveMembership, onBack, onSchedule })`:
- อ่าน `class_schedule` ที่ `metadata.category = "service"`
- ไม่มีรายการ → empty state

`ManagedFeatureScreen`:
- เอาการ์ด "🧩 MANAGED / จัดการได้จาก Backoffice" ออก (เป็นข้อความสำหรับนักพัฒนา ไม่ควรแสดงให้สมาชิกเห็น)

**Steps:**

- [ ] **Step 1:** implement
- [ ] **Step 2:** ตรวจด้วย fixture และภาพหน้าจอตาม Task 15

### Task 13: แก้ 1 — ริชเมนู LINE OA

**Files:**
- Modify: `config/line-rich-menu-main.json`
- Modify: `public/line/rich-menu-main.svg`
- Modify: `public/line/rich-menu-main.png`
- Create: `lib/rich-menu.ts`
- Create: `scripts/render-rich-menu.mjs`
- Modify: `package.json`
- Modify: `components/ppa-app.tsx`
- Test: `tests/packages.test.mjs`

**Interfaces — Produces:**

ปุ่มใน config (bounds เดิม 3×2):

| ลำดับ | ปุ่ม | screen |
|---|---|---|
| 1 | หน้าหลัก | `home` |
| 2 | แพ็กเกจ | `plans` |
| 3 | คูปอง | `coupon` |
| 4 | จองสนาม | `sports` |
| 5 | วอลเล็ต | `wallet` |
| 6 | ช่วยเหลือ | `help` |

SVG:
- ใช้สไตล์การ์ดเดิม
- สีสลับ ส้ม-เขียว-ส้ม / เขียว-ส้ม-เขียว
- ไอคอนใหม่: บ้าน และกล่องแพ็กเกจ
- บรรทัดย่อยของแต่ละปุ่ม:

  | ปุ่ม | บรรทัดย่อย |
  |---|---|
  | หน้าหลัก | ภาพรวม ข่าวสาร โปรโมชัน |
  | แพ็กเกจ | Monthly · Time · Coupon |
  | คูปอง | คูปองของฉัน ซื้อเพิ่ม |
  | จองสนาม | คอร์ท เวลา กีฬา |
  | วอลเล็ต | เติมเงิน Coin Point |
  | ช่วยเหลือ | ติดต่อทีม PPA |

`scripts/render-rich-menu.mjs`:
- render ด้วย Playwright Chrome
- ต้องได้ PNG 2500×1686 ขนาดไม่เกิน 1 MB

`lib/rich-menu.ts`:
- `screenFromSearch(search: string, allowed: readonly string[]): string | null` อ่าน `screen` ทั้งจาก query ตรงๆ และที่ซ้อนอยู่ใน `liff.state`
- `richMenuScreens` ต้องรวม `home`, `plans`, `coupon`, `mycoupons`, `sports`, `wallet`, `help`, `membership`, `trainer`, `gymnos`, `groups`, `classhub`, `classschedule`, `livetv`, `promotion`
- หลัง `liff.init` เสร็จ ให้อ่าน screen จาก URL ซ้ำอีกครั้ง

**Steps:**

- [ ] **Step 1:** เขียนเทสต์ให้ครอบคลุม:
  - `rich menu has the six requested buttons in order` (label และ screen ของแต่ละปุ่ม)
  - `deep link reads screen from query or liff.state` เช่น `"?liff.state=%3Fscreen%3Dplans"` → `"plans"` และ `"?screen=admin"` → `null`
  - `rich menu PNG is 2500x1686 and under 1 MB` (อ่านขนาดภาพจาก IHDR)
- [ ] **Step 2:** รันเทสต์ ต้อง FAIL แล้ว implement แล้วรันใหม่ต้อง PASS
- [ ] **Step 3:** รัน `LINE_RICH_MENU_DRY_RUN=true node scripts/create-line-rich-menu.mjs` ต้องเห็น 6 areas และ URI ถูกต้อง
- [ ] **Step 4:** เปิดดู PNG ด้วยตา ต้องเห็นอักษรไทยชัด ไม่เป็นกล่องสี่เหลี่ยม

### Task 14: ปรับวอลเล็ต (จากการตรวจระบบ)

**Files:**
- Modify: `components/ppa-app.tsx`
- Modify: `app/styles.css`
- Modify: `lib/i18n/package-messages.ts`

**Interfaces — Produces:**
- ปุ่มเลือกจำนวนเติมเงิน 300 / 500 / 1,000 / 2,000 (ส่งเข้า `topup(amount)` เดิม; เซิร์ฟเวอร์ตรวจช่วง 50–50,000 อยู่แล้ว)
- ประวัติธุรกรรมจาก `walletLedger`:
  - ป้ายตามประเภท: เติมเงิน / ชำระเงิน / คืนเงิน / เหรียญ / คะแนน
  - หมายเหตุ, วันที่, ยอดเงินสีเขียวหรือแดงตามทิศทาง
- แสดง `pendingPayments` เป็นรายการ "รอยืนยัน"

**Steps:**

- [ ] **Step 1:** implement
- [ ] **Step 2:** ตรวจด้วย fixture และภาพหน้าจอตาม Task 15

### Task 15: ตรวจสอบรวมและอัปเดตเอกสาร

**Files:**
- Modify: `scripts/responsive-check.mjs`
- Modify: `README.md`

**Steps:**

- [ ] **Step 1:** รัน `npm test`, `npm run lint`, `npm run build` ต้อง PASS ทั้งหมด
- [ ] **Step 2:** เพิ่ม fixture ใน `responsive-check.mjs`:
  - แคตตาล็อกตาม seed ของ Task 1
  - คูปองที่มีวันที่ซื้อ
  - ก๊วน 4 อัน (มีอันที่เต็ม)
  - membership 12 เดือน
  - ledger ของวอลเล็ต
- [ ] **Step 3:** เพิ่มหน้าจอที่ต้องตรวจ:
  - plans ทั้ง 4 แท็บ และแท็บต่ออายุทั้ง 2 แท็บย่อย
  - mycoupons, coupon, groups, gymnos, svcclass, wallet
- [ ] **Step 4:** รัน `npm run dev` แล้วรัน `npm run test:responsive` ต้องไม่มีหน้าจอล้น
- [ ] **Step 5:** ถ่ายภาพหน้าจอขนาด 390×844 แล้วเทียบกับรูปในเอกสารหน้า 2–8
- [ ] **Step 6 (ต้องได้รับอนุญาตก่อน):** ติดตั้ง MariaDB ชั่วคราวในเครื่อง (data dir อยู่ใน /tmp) แล้วรัน `schema.sql` 2 รอบ เพื่อตรวจว่ารันซ้ำได้ และ query ใหม่ทำงานจริง
- [ ] **Step 7:** README เพิ่มขั้นตอน release:
  - backup DB → `npm run db:init`
  - `npm run line:rich-menu:image` → `line:rich-menu:dry-run` → `line:rich-menu:create`
  - เปลี่ยนรหัส DB เพราะรหัสเดิมหลุดอยู่ใน git history
