# PPA Phase 4: counter operations, cash-up, reminders, backups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, the user's standing choice; user asked 2026-11-02 to "do it all in one go"). Steps use checkbox (`- [ ]`) syntax. TDD per task. No git commits unless the user asks.

**Goal:** Give the front desk a court calendar with counter and walk-in bookings, give finance a daily cash-up and printable receipts, keep members informed with reminders, clean up abandoned payment requests, back up the database, and make every report figure carry a period.

**Architecture:** Same patterns as Phases 1–3: server route handlers under `app/api/admin/*` behind `assertAdminRequest`, money and rights changed in one transaction with row locks, SQL verified with mocked connections, admin UI in `components/admin-*.tsx` styled by `app/admin.css`. Walk-in customers book through one shared system user (`users.line_user_id = 'system:walk-in'`) with the guest's name and phone on the booking, so no foreign key becomes nullable. Scheduled work runs from one secret-protected endpoint called by the server's cron.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, zod 4, mysql2 → MariaDB 10.5, lucide-react, node:test, Playwright harness.

**Spec:** User decisions 2026-11-02 (this conversation): scope = the 5 priority items + Analysis page; walk-in guests allowed with name + phone; unpaid requests without a slip auto-cancel after 3 days (court bookings once the session has ended). Advice given the same day (Analysis page review) defines the items. `PRODUCT.md` (role-aware, every number has a period, calm, counter + phone).

## Global Constraints

- Money and rights: one transaction, `SELECT … FOR UPDATE` on the rows that decide the outcome; every staff action writes `admin_audit_logs` with `staff_id`.
- A court slot is taken by bookings `status IN ('paid','checked_in')` or `status IN ('hold','pending_payment') AND (expires_at IS NULL OR expires_at > NOW())`, and by court blocks with `cancelled_at IS NULL`. Every path that creates a booking or a block locks the court row first (`SELECT id FROM courts WHERE id = ? FOR UPDATE`).
- Opening hours and slot rules come from `lib/booking-rules.ts` (`buildSlotRange`, `rateForSlot`, `isPastSlot`); dates are Bangkok wall-clock `YYYY-MM-DD` / `HH:00`.
- Member-facing strings through `t()` with th/en/zh catalog rows; every new notification title gets a catalog row (enforced by the existing test).
- Schema changes additive only: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` (nullable or defaulted), seeds `INSERT IGNORE`; MariaDB 10.5 syntax.
- No new dependencies. Scripts load env with `@next/env` (`loadEnvConfig(process.cwd(), false)`).
- The walk-in system user never appears as a member (lists, counts, reports) and never receives notifications or LINE pushes.
- Auto-cancel touches only `payments.status = 'created'` with `slip_uploaded_at IS NULL`; never a paid payment or one with a slip.

## Review Focus

- A member booking in the app and a staff counter booking for the same court and hour at the same moment: exactly one wins (both lock the court row, both check bookings and blocks inside the transaction). Test in Task 2.
- Blocking a court over existing active bookings: refused with the list of bookings, nothing inserted. Test in Task 3.
- Bangkok day boundaries: a counter booking for today 18:00 stores `YYYY-MM-DD 18:00:00`; the cash-up for a date covers that Bangkok day only; backup/restore does not shift TIMESTAMP values. Tests in Tasks 2, 6, 9.
- Running the scheduled job twice (or concurrently) never sends a reminder twice and never cancels a payment twice or one that got a slip in between. Test in Task 7.
- Two staff printing the same payment's receipt at once get the same receipt number; numbers are unique and sequential per year. Test in Task 5.

---

### Task 1: Walk-in system user, court blocks and conflict rules

**Files:**
- Modify: `database/schema.sql`, `app/api/courts/availability/route.ts`, `app/api/bookings/route.ts`, `lib/admin-dashboard.ts`, `app/api/admin/members/route.ts`, `app/AdminConsole/page.tsx`, `scripts/line-identity-audit.mjs` (skip the system user)
- Create: `lib/walk-in.ts`, `lib/court-schedule.ts`
- Test: `tests/counter.test.mjs`

**Interfaces:**
- Produces `lib/walk-in.ts`: `WALK_IN_LINE_ID = "system:walk-in"`; `notWalkIn(alias = "u"): string` → `` `${alias}.line_user_id <> 'system:walk-in'` ``; `walkInUserId(conn): Promise<number>` (throws `Error("walk-in user missing")` when db:init has not run).
- Produces `lib/court-schedule.ts`: `courtConflict(conn, courtId: number, startsAt: string, endsAt: string): Promise<"booked" | "blocked" | null>` — runs the taken-slot booking query `FOR UPDATE` and `SELECT id FROM court_blocks WHERE court_id = ? AND cancelled_at IS NULL AND starts_at < ? AND ends_at > ? LIMIT 1`.
- Schema: users seed `('system:walk-in', 'ลูกค้าหน้าเคาน์เตอร์', 'WALK-IN', 'active')`; `bookings` + `guest_name VARCHAR(160) NULL`, `guest_phone VARCHAR(32) NULL`, `series_key VARCHAR(64) NULL` (+ index), `created_by BIGINT UNSIGNED NULL`; table `court_blocks (id, court_id FK courts, starts_at DATETIME, ends_at DATETIME, reason VARCHAR(160) NOT NULL, created_by BIGINT UNSIGNED NULL, created_at TIMESTAMP, cancelled_at DATETIME NULL, KEY (court_id, starts_at, ends_at))`.

- [ ] Write failing tests: `availability treats an active court block like a booked slot` (mock rows: one block 18:00–20:00 → slots 18:00/19:00 not available, 20:00 available; cancelled blocks ignored via `cancelled_at IS NULL` in SQL); `a member cannot book a blocked slot` (POST /api/bookings with block row → 409 "ช่วงเวลานี้ไม่เปิดให้จอง", no INSERT); `the walk-in user is never counted or listed as a member` (dashboard members SQL and members GET SQL contain `line_user_id <> 'system:walk-in'`); schema test for the seed, columns and table.
- [ ] Run `node --test tests/counter.test.mjs` → FAIL.
- [ ] Implement: schema; `lib/walk-in.ts`; `lib/court-schedule.ts`; member POST uses `courtConflict` after locking the court ("blocked" → 409 `ช่วงเวลานี้ไม่เปิดให้จอง`, "booked" → existing 409); availability merges active blocks into the occupancy list; walk-in filter in dashboard member counts, members GET list/search, AdminConsole users query; identity audit skips `system:%`.
- [ ] Run the file and the full suite → PASS.

### Task 2: Counter booking API (members and walk-in guests, weekly repeat, pay now or later)

**Files:**
- Modify: `app/api/admin/bookings/route.ts` (add `POST`; list query shows `COALESCE(b.guest_name, u.display_name)` and `b.guest_phone`), `app/AdminConsole/page.tsx` and `lib/admin-dashboard.ts` (same name rule in booking lists and schedule), `lib/i18n/package-messages.ts` (notification title row)
- Create: `lib/counter-booking.ts`
- Test: `tests/counter.test.mjs`

**Interfaces:**
- Consumes: `courtConflict`, `walkInUserId`, `rateForSlot`, `buildSlotRange`, `isPastSlot`, `notifyMember`, `pushAfterResponse`, `pushText`.
- Produces `lib/counter-booking.ts`: `weeklyDates(date: string, weeks: number): string[]` (1–12 dates, +7 days each, `YYYY-MM-DD`); `counterBookingSchema` (zod): `{ courtId, date, time, durationHours 1–4, players 1–20, customer: { kind: "member", userId } | { kind: "guest", name 1–160 trimmed, phone /^\+?[0-9][0-9 -]{5,19}$/ }, repeatWeeks 1–12, payNow: { method: "cash" | "card" | "promptpay" } | null, note ≤ 200, requestId requestIdPattern }`.
- Produces `POST /api/admin/bookings` → 201 `{ created: { bookingNo, startsAt, endsAt, amount, status }[], skipped: { date, reason: "booked" | "blocked" | "past" | "closed" }[], bookings }`; 409 with `skipped` when nothing could be created; replay (any booking with `series_key = requestId`) → 200 `{ created, skipped: [], replayed: true }`.
- Each created booking: `status = payNow ? 'paid' : 'pending_payment'`, `expires_at = NULL` (held until staff act), `series_key = requestId`, `created_by = admin.id`, guest name/phone for guests (user = walk-in). Pay now: one `payments` row per booking (`status 'paid'`, `paid_at NOW()`, `booking_id`, `request_id = ${requestId}-${index}`, metadata `{ itemName: title, itemType: "booking", channel: "counter", soldBy, guestName?, guestPhone?, note? }`). Members get one notice "จองสนามจากเคาน์เตอร์" (body lists the dates); guests none. Audit `booking.create` `{ count, skipped, method }`.

- [ ] Write failing tests: `weeklyDates gives one date per week across month ends`; `counter booking locks the court and books each free week, skipping taken and blocked weeks` (mock: week 2 booked, week 3 blocked → created 2, skipped `[{ reason: "booked" }, { reason: "blocked" }]`, court `FOR UPDATE` before any INSERT); `a walk-in booking uses the walk-in user and keeps the guest name and phone` (INSERT params); `pay now records one paid counter payment per booking at the slot price` (amount = `rateForSlot`, 18:00 slot ×1.5, metadata soldBy); `a member counter booking notifies the member, a guest booking notifies no one`; `a replayed counter booking request returns the bookings it made` (no INSERT); `a suspended member or the walk-in user cannot be chosen as the member` (404/409).
- [ ] Run → FAIL. Implement. Run file + suite → PASS.

### Task 3: Take payment for a held booking; court blocks; calendar data

**Files:**
- Create: `app/api/admin/bookings/pay/route.ts`, `app/api/admin/bookings/calendar/route.ts`, `app/api/admin/courts/blocks/route.ts`
- Test: `tests/counter.test.mjs`

**Interfaces:**
- `POST /api/admin/bookings/pay { bookingNo, method: "cash" | "card" | "promptpay", requestId }` → locks the booking (`hold`/`pending_payment`, `expires_at IS NULL OR > NOW()`); refuses (409 `มีรายการรอชำระของการจองนี้ กรุณายืนยันผ่านรายการชำระเงิน`) when a `created` payment exists for it; inserts a paid payment (same metadata as Task 2, `itemName = booking.title`, guest fields from the booking), sets the booking `paid`, notifies members ("ชำระเงินสำเร็จ"), audit `booking.pay`; replay by request id.
- `GET /api/admin/bookings/calendar?date=YYYY-MM-DD` → `{ date, courts: { id, name, sportId, sportName, status, hourlyRate }[], bookings: { bookingNo, courtId, startsAt, endsAt, status, name, phone, guest: boolean, amount, title, seriesKey, paymentNo }[], blocks: { id, courtId, startsAt, endsAt, reason }[] }` for that Bangkok day (active bookings only; `paymentNo` = latest paid payment of the booking).
- `POST /api/admin/courts/blocks { courtId, date, from: "HH:00", to: "HH:00", reason 1–160 }` → locks the court; 409 `{ message, bookings: [...] }` when active bookings overlap; inserts; audit `court.block`. `DELETE /api/admin/courts/blocks?id=` → `cancelled_at = NOW()`, audit `court.unblock`.

- [ ] Write failing tests: `taking payment for a held counter booking records the money and marks it paid`; `a booking with an open app payment request must be confirmed through the payment queue`; `blocking a court over active bookings is refused and lists them` (no INSERT); `a block over free time is saved and the calendar shows it`; `the calendar returns one Bangkok day of courts, bookings with names and blocks` (SQL day bounds `>= ? AND < ?` with `YYYY-MM-DD 00:00:00`/next day).
- [ ] Run → FAIL. Implement. Run file + suite → PASS.

### Task 4: Court calendar UI

**Files:**
- Create: `components/admin-court-calendar.tsx`
- Modify: `components/admin-console.tsx` (render the calendar at the top of the Bookings tab, refresh the list after changes), `app/admin.css` (`.cal-*`), `scripts/responsive-check.mjs` (fixtures + checks)

**Interfaces:**
- Consumes the three Task 3 endpoints and Task 2 `POST /api/admin/bookings`; `/api/admin/members?search=` for the member picker.
- Produces `AdminCourtCalendar({ lang, onBookingsChange }: { lang: "th" | "en"; onBookingsChange?: () => void })`.
- Layout: toolbar (previous / today / next day, date input, sport filter, "บล็อกสนาม" button); a timeline grid, rows = courts (grouped by sport), columns = hours 08:00–23:00; bookings span their hours and show name + status text; blocks show the reason; free cells are buttons ("ว่าง 18:00 Court A, จอง") that open the booking dialog prefilled. Booking dialog: customer (member search or guest name + phone), duration 1–4 h, players, repeat weekly 1–12, pay now (method) or pay at the counter later, live price from the court rate (server price wins). Booking detail dialog: name, phone, time, status, amount, actions "รับชำระ" (method), "เช็คอิน", "ยกเลิก" (reason), receipt link when `paymentNo`. Status never color alone (text label in every block). Phone: horizontal scroll inside the panel.

- [ ] Add harness fixtures (calendar day with a paid member booking, a held guest booking, a block) and failing checks: grid shows courts × 15 hours, the guest booking shows the guest name and "รอชำระ", clicking a free cell and saving a guest booking sends the expected POST body (`customer.kind = "guest"`, `repeatWeeks`, `payNow`), the block dialog sends the expected body, no page overflow at 7 viewports.
- [ ] Run harness → FAIL. Implement. Run harness → PASS; eslint, tsc.

### Task 5: Sequential receipts

**Files:**
- Modify: `database/schema.sql`, `lib/site-settings.ts` (`receiptInfo`, `contentProblem` for `receipt-info`), `lib/admin-permissions.ts` (`receipts`, `reports` resources), `components/admin-console.tsx` (receipt link on paid payment rows)
- Create: `lib/receipts.ts`, `app/api/admin/receipts/route.ts`, `app/AdminConsole/receipt/[paymentNo]/page.tsx`, `components/admin-receipt.tsx`
- Test: `tests/counter.test.mjs`

**Interfaces:**
- Schema: `receipt_sequences (year SMALLINT PRIMARY KEY, last_no INT NOT NULL)`, `payment_receipts (payment_id BIGINT UNSIGNED PRIMARY KEY, receipt_no VARCHAR(24) NOT NULL UNIQUE, issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, issued_by BIGINT UNSIGNED NULL)`; seed site_setting `receipt-info` metadata `{ businessName: "PPA Power Play Sport Club", branch: "สำนักงานใหญ่", address: "", taxId: "", phone: "", vatRegistered: false, footer: "ขอบคุณที่ใช้บริการ" }`.
- `lib/receipts.ts`: `formatReceiptNo(beYear: number, seq: number): string` → `RC2569-000123`; `vatIncluded(amount: number): { net: number; vat: number }` (7/107, 2 decimals, net + vat = amount).
- `lib/site-settings.ts`: `type ReceiptInfo = { businessName; branch; address; taxId; phone; vatRegistered: boolean; footer }`; `receiptInfo(items)`; `contentProblem("site_setting", "receipt-info", meta)` rejects a tax ID that is not 13 digits (empty allowed).
- `POST /api/admin/receipts { paymentNo }` (permissions payments.manage | sales.manage | reports.view) → locks the payment (must be `paid`), returns the existing receipt or issues the next number for the current Bangkok BE year (`INSERT … ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)`), audit `receipt.issue` on first issue; response `{ receiptNo, issuedAt, business: ReceiptInfo, payment: { paymentNo, paidAt, method, amount, itemName }, customer: { name, memberCode | null, phone | null }, staffName | null, vat: { net, vat } | null }`.
- Page `/AdminConsole/receipt/[paymentNo]`: server checks the admin session and permission, renders `AdminReceipt` (POSTs once, print button, A5/80 mm friendly print CSS, "ใบเสร็จรับเงิน" or "ใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ" when VAT registered).

- [ ] Write failing tests: `receipt numbers count up per Buddhist year and keep six digits`; `VAT-included breakdown adds back to the amount`; `issuing a receipt twice returns the same number`; `only paid payments get receipts` (409); `the receipt setting rejects a tax ID that is not 13 digits`.
- [ ] Run → FAIL. Implement. Run → PASS.

### Task 6: Daily cash-up

**Files:**
- Create: `lib/cashup.ts`, `app/api/admin/reports/cashup/route.ts`, `components/admin-cashup.tsx`
- Modify: `app/api/admin/payments/route.ts` (record `metadata.confirmedBy` when staff confirm a payment), `components/admin-console.tsx` (report section `cashup` = "ปิดยอดประจำวัน" / "Daily cash-up"), `app/admin.css` (print styles), `tests/counter.test.mjs`

**Interfaces:**
- `loadCashup(date: string, run?: (sql: string, params: unknown[]) => Promise<unknown[]>): Promise<Cashup>`; `Cashup = { date, cashIn: { method, amount, count }[], cashInTotal, walletFunded: { amount, count }, byStaff: { staffId: number | null, staffName: string | null, method, amount, count }[], refunds: { paymentNo, amount, refundedAt, staffName, note }[], refundTotal, rows: { paidAt, paymentNo, itemName, customer, method, amount, staffName }[] }`. Day = `paid_at >= 'YYYY-MM-DD 00:00:00' AND paid_at < next day`. Cash-in = paid, `method <> 'wallet'`; staff = `COALESCE(soldBy, confirmedBy)`; refunds = payments whose `metadata.refund.status = 'done'` with `refund.at` on that day.
- `GET /api/admin/reports/cashup?date=` → `Cashup` (`private, no-store`).
- UI: date input (default today), totals by channel, by staff, refunds, transactions, "พิมพ์" (window.print; print CSS hides the console shell).

- [ ] Write failing tests: `cash-up totals one Bangkok day by channel and staff, wallet-funded apart` (SQL bounds + grouping); `staff confirmation of a payment records who confirmed it`; `cash-up lists refunds recorded that day`.
- [ ] Run → FAIL. Implement. Run → PASS; harness check that the section renders totals and a print button.

### Task 7: Scheduled job: reminders and auto-cancel of unpaid requests

**Files:**
- Create: `lib/scheduled-jobs.ts`, `app/api/cron/run/route.ts`
- Modify: `database/schema.sql` (`member_reminders`), `lib/i18n/package-messages.ts` (titles), `app/AdminConsole/page.tsx` (throttled sweep), `.env.production.example`, `scripts/production-check.mjs` (warn when `CRON_SECRET` is unset), `tests/counter.test.mjs`

**Interfaces:**
- Schema: `member_reminders (kind VARCHAR(32) NOT NULL, ref_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL, sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (kind, ref_id))`.
- `cancelStalePayments(conn): Promise<{ userId: number; title: string; body: string }[]>` — locks `payments` with `status = 'created' AND slip_uploaded_at IS NULL AND ((booking_id IS NULL AND created_at < NOW() - INTERVAL 3 DAY) OR (booking_id IS NOT NULL AND <booking ends_at> < NOW()))`; sets `cancelled`, metadata `{ cancelReason, autoCancelled: true }`; held booking → `expired`; in-app notice "รายการชำระหมดเวลา" (body names the item and says nothing was charged).
- `sendReminders(conn): Promise<{ userId: number; title: string; body: string }[]>` — `booking_soon`: paid member bookings (not walk-in) starting in `(NOW(), NOW() + INTERVAL 2 HOUR]`, title "ใกล้ถึงเวลาจองสนาม"; `membership_ending`: active memberships ending in `(NOW(), NOW() + INTERVAL 3 DAY]` without a later active membership, title "แพ็กเกจใกล้หมดอายุ". `INSERT IGNORE INTO member_reminders` first; notify only when `affectedRows = 1`.
- `runStalePaymentSweep(): Promise<void>` — at most once per 10 minutes per process (module-level timestamp), own connection, used by the AdminConsole page so the queue stays clean without cron.
- `POST /api/cron/run` with `Authorization: Bearer <CRON_SECRET>` (timing-safe compare; 404 when `CRON_SECRET` is unset; 401 on mismatch) → runs both in one transaction each, LINE pushes after the response, returns `{ cancelled, reminders }`.

- [ ] Write failing tests: `unpaid requests without a slip are cancelled after 3 days and court bookings once the session has ended` (SQL conditions, slip/paid untouched, booking expired, notice); `reminders are sent once per booking and per membership` (`INSERT IGNORE` then notify only on affectedRows 1); `the scheduled job needs the secret` (no secret configured → 404, wrong → 401, right → 200); catalog rows for the new titles (existing coverage test).
- [ ] Run → FAIL. Implement. Run → PASS.

### Task 8: Reports with stated periods

**Files:**
- Create: `lib/report-figures.ts`
- Modify: `app/AdminConsole/page.tsx` (load figures, role-gated), `components/admin-console.tsx` (`Reports` cards read the figures with a period label; `ReportDataList` summary states the coverage "ข้อมูล N รายการล่าสุด ตั้งแต่ <date>"), `tests/counter.test.mjs`

**Interfaces:**
- `loadReportFigures(can, run?): Promise<ReportFigures>`; `ReportFigures = { period: { from: string; to: string }, finance?: { salesMonth, paymentsMonth, avgBookingValueMonth }, bookings?: { month: number, paidMonth: number, pendingNow: number, cancelledMonth: number, paidRate: number | null }, members?: { total: number, active: number, newMonth: number, checkinsMonth: number }, courts?: { total, available, maintenance }, coupons?: { total, active, soldMonth }, trainers?: { total, active, avgPrice }, audit?: { eventsMonth, sensitiveMonth } }` — month-to-date SQL aggregates (sales = paid excluding wallet top-ups, as the dashboard), walk-in excluded from members.
- Cards show the period under each label ("เดือนนี้ 1–2 พ.ย.", "ตอนนี้", "ทั้งหมด").

- [ ] Write failing tests: `report figures come from SQL for the month to date and only for permitted sections`; `report lists say how many recent rows they cover`.
- [ ] Run → FAIL. Implement. Run → PASS.

### Task 9: Backups and health check

**Files:**
- Create: `scripts/lib/db-dump.mjs`, `scripts/db-backup.mjs`, `scripts/db-restore-check.mjs`, `app/api/health/route.ts`
- Modify: `package.json` (`db:backup`, `db:restore-check`), `.env.production.example` (`BACKUP_DIR`, `BACKUP_KEEP_DAYS`, `RESTORE_DB_NAME`), `README.md`, `tests/release.test.mjs`

**Interfaces:**
- `scripts/lib/db-dump.mjs`: `insertStatements(table: string, columns: string[], rows: unknown[][], escape): string[]` (one statement per line, ≤ 500 rows each, identifiers back-quoted); `splitDump(text: string): string[]` (statements end with `;\n`); `dumpHeader()` (`SET NAMES utf8mb4; SET time_zone = '+00:00'; SET FOREIGN_KEY_CHECKS = 0;`) / `dumpFooter()`.
- `db-backup.mjs`: connection with `dateStrings: true`, session `time_zone = '+00:00'`, JSON columns read as strings (`typeCast`), every base table (`SHOW CREATE TABLE` + rows by primary key in batches), gzip to `${BACKUP_DIR:-storage/backups}/ppa-YYYYMMDD-HHmm.sql.gz` plus `.json` manifest of row counts, deletes `ppa-*.sql.gz` older than `BACKUP_KEEP_DAYS` (default 14).
- `db-restore-check.mjs <file>`: refuses when `RESTORE_DB_NAME` is unset or equals `DB_NAME`; restores into it and compares row counts with the manifest; exit 1 on mismatch.
- `GET /api/health` → `SELECT 1` → 200 `{ ok: true }` / 503 `{ ok: false }`, `no-store`, no other detail.
- README: daily cron (`0 3 * * *`), copy offsite (another machine / cloud storage), monthly restore check, uptime monitor on `/api/health` every 5 minutes.

- [ ] Write failing tests: `backup statements escape quotes, backslashes, Thai text, JSON and NULL and split back exactly`; `restore check refuses to restore over the live database`; `health check answers 200 with a database and 503 without one`.
- [ ] Run → FAIL. Implement. Run → PASS.

### Task 10: Analysis page, docs and full verification

**Files:**
- Modify: `components/admin-console.tsx` (`completionChecklist`, `recommendations`, `roadmap` th/en: built items marked ready, the "later" list as next, the "not now" list stated as such), `README.md` (release 2026-11-02: migration, env, cron, receipt setup, calendar use), `docs/superpowers/plans/…` ledger, `tests/counter.test.mjs`

- [ ] Write failing test: `the analysis checklist marks counter booking, court calendar, cash-up, receipts, reminders and backups as ready`.
- [ ] Run → FAIL. Implement. Run → PASS.
- [ ] Full verification: `npm test`, `npx eslint .`, `npx tsc --noEmit`, `npx next build` (0 warnings), `node scripts/responsive-check.mjs` (dev server on :3000) — all pass.
