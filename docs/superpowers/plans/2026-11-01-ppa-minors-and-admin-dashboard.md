# PPA Phase 3: deferred minors + back-office dashboard

> Executor: superpowers:executing-plans (inline, user's standing choice). TDD per task. No git commits unless the user asks.

**Goal:** Fix every deferred minor from the Phase 2 review, and redesign the AdminConsole dashboard so each staff role can run the sport complex from it ("ดูง่าย ครอบคลุมการใช้ระบบมืออาชีพ").

**Spec:** user request 2026-11-01 ("งานเล็กที่ยังไม่แก้ ช่วยทำให้ครบ และปรับหน้า dashboard ให้ดูง่ายครอบคลุมการใช้ระบบมืออาชีพ", "dashboard คือส่วนหลังบ้าน"); PRODUCT.md (role-aware, calm/clear/professional, counter computer + phone, WCAG AA); the Phase 2 ledger's `minor (deferred)` lines.

## Global constraints
- Same patterns as Phase 1/2: money and rights change inside one transaction with row locks; admin routes go through `assertAdminRequest`; member strings go through `t()` with th/en/zh catalog rows; no new dependencies.
- No real database: SQL is verified with mocked connections; keep MariaDB 10.5 syntax.
- Dashboard numbers always carry a period (today / this month / last 30 days). Sales exclude wallet top-ups (top-ups are prepaid balance, the wallet purchase is the sale); cash-in excludes wallet-funded payments.

## Tasks
- **M1 Slips:** upload only for `method = 'promptpay'`; replacing a slip keeps the earlier file and records it in `metadata.previousSlips` (staff can open them); member app checks 5 MB before upload and maps 413 to the Thai message.
- **M2 Rewards:** replay with a different `contentId` → 409; the app reuses the same requestId when retrying the same reward after a network failure; rewards whose cost is not a positive integer are disabled.
- **M3 Counter sale:** `expectedAmount` must equal the server price (409 + current price otherwise); catalog/coupon lookup happens before the transaction; one shared coupon grant helper for sale and approval; finance (sales.manage without members.manage) can open Members read-only to sell.
- **M4 i18n:** catalog rows for every server notification title; LINE push carries Thai + English.
- **M5 Staff cancel:** cancel takes a reason; a cancelled payment with a slip is marked `refund: pending`, staff record "โอนคืนแล้ว" (status `refunded`); member notice carries the reason.
- **M6 Wallet/QR:** bootstrap sends `promptPayEnabled` and each pending payment's `method`; "ชำระ / แนบสลิป" only for PromptPay when enabled; zero-amount QR → 409 instead of 500.
- **M7:** "ดูสลิป" only for staff with payments.manage.
- **M8:** LINE push scheduled with `after()` (fallback to a detached promise outside a request).
- **M9:** remove `/api/checkin`; POST /api/bookings no longer returns `qr_secret`.
- **M10:** consent dialog is a native modal `<dialog>` (focus trap, inert background, Esc blocked while required) and shows the support contact.
- **M11:** DB pool queue limit configurable (`DB_QUEUE_LIMIT`, default 1000) so bursts of app opens queue instead of failing.
- **M12:** README states the Phase 2 migration runs before deploying the build.
- **M13:** legacy placeholder plans are retired once (schema marker), never again after an admin re-activates them.
- **D1 Dashboard data:** `lib/admin-dashboard.ts` builds role-gated sections with SQL aggregates (action queue, today, this month, 30-day sales, sales by category, cash-in by channel, expiring memberships); `GET /api/admin/dashboard`; AdminConsole page passes the initial snapshot.
- **D2 Dashboard UI:** `components/admin-dashboard.tsx`: header with date + last update + refresh (auto every 60 s while visible); "ต้องทำตอนนี้" action list + pending payments; "วันนี้" figures + court schedule; "เดือนนี้" figures with deltas, 30-day sales columns (hover/focus tooltip + table view), ranked category/channel bars; memberships expiring in 7 days. Replaces the hero/rings/10-chart layout.
- **D3 Verify:** responsive fixtures for the new dashboard, README section, full suite / lint / tsc / build / harness.
