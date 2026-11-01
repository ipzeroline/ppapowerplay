# PPA Power Play

Next.js member app, LINE sign-in, staff console, bookings, wallet, memberships,
coupons and access QR. The frontend and API use the same origin and MySQL database.

## Run locally

Use a Node.js version supported by the installed Next.js release.

```sh
npm ci
# Configure .env.local using .env.production.example as the template.
npm run dev
```

Member app: `/`. Staff login: `/AdminConsole`. Staff scanner:
`/AdminConsole/scanner`.

## Verify a release

```sh
npm run verify
npm audit
npm run production:hardening:audit
npm run line:identity:audit
```

For runtime checks, start the production build in one terminal:

```sh
npm run start -- -p 3000
```

Then run:

```sh
npm run test:security:http
npm run test:responsive
npm run test:qr:integration
```

- HTTP checks target localhost and read the configured database.
- Responsive checks use isolated browser fixtures; they never create real payments.
- QR integration also checks payment approvals, wallet coupon payment/ledger records,
  duplicate approval and grants followed by QR redemption. It uses real SQL and
  generated QR images, with fixture inserts inside
  an outer transaction that is always rolled back. It requires InnoDB and an active
  staff row. Auto-increment counters may advance. Authentication is isolated in
  this test; HTTP checks separately verify session and access controls.
- Screenshots and the browser report are written to `/private/tmp/ppa-responsive`.

## Staff scanning

1. Sign in to the staff console with booking or coupon management permission.
2. Open **สแกน QR / Scan QR** and allow the camera. HTTPS is required outside localhost.
3. Scan the member's current QR, or enter its URL using a keyboard barcode scanner.
4. Check the member and reference, then confirm redemption/check-in once.
5. Wait for the recorded-success response. If a request times out after confirmation,
   inspect the audit log before retrying.

The scanner decodes QR frames in JavaScript, without requiring native
`BarcodeDetector`. It closes the camera after detection, when hidden, and on exit.
The server rechecks rights, locks rows, consumes the token and writes an audit record
in one transaction. Payment QR is informational and cannot grant facility access.

## Production deployment

The current review and outstanding launch requirements are in `PRODUCTION_REVIEW.md`.
No production deployment has been performed by the review.

1. Supply the production environment from `.env.production.example` through the host's
   secret store or `.env.production.local`. Do not commit credentials. `NEXT_PUBLIC_*`
   values must be set **before building**. Check that an old `.env.local` is not
   overriding production values; audit scripts follow Next.js environment precedence.
2. Back up the database and preserve `public/uploads/trainers` across releases. The
   upload endpoint uses local storage, so a persistent writable volume is required.
3. Run `npm ci`, the release verification commands, and `npm run build` on the host or
   build environment. Do not use `next dev` to serve production traffic.
4. Run `npm start` under the chosen process supervisor; the default port is 2344.
   Terminate TLS at the reverse proxy and forward the original host/protocol. Confirm
   that the proxy does not override `Permissions-Policy: camera=(self)`.
5. Configure the LINE LIFF endpoint for the final HTTPS domain, then test a real LINE
   login and a physical phone-to-staff-camera scan before opening to customers.
6. Run runtime acceptance against a staging database first. Verify manual payment
   confirmation and the resulting wallet, membership, booking or coupon state.
7. Keep the previous release and its lockfile for rollback; verify database backup
   restoration separately. Releases that change `database/schema.sql` need the
   migration below.

### Deploying a release with `git pull`

Run on the server, in the app folder, outside opening hours (the app can return errors
between `npm ci` and the restart). Every script reads the same env files as the app:
shell variables, then `.env.production.local`, `.env.local`, `.env.production`, `.env`.

```sh
# 1. Back up the database first (provider snapshot or mysqldump).
git status                              # nothing should be modified except generated files
git checkout -- next-env.d.ts tsconfig.tsbuildinfo 2>/dev/null || true   # only needed once, see below
git pull --ff-only origin main
npm ci --include=dev                    # the build needs the dev dependencies (TypeScript)
npm run production:check                # fix every error before going on
npm run db:init                         # migration: before the new build serves traffic
npm run build
# 2. Restart the app with your supervisor, e.g. `pm2 restart <name>` or `systemctl restart <service>`.
npm run line:rich-menu:dry-run          # six buttons, all pointing to the production LIFF URL
npm run line:rich-menu:create           # becomes the default rich menu for every member
```

- `next-env.d.ts` and `tsconfig.tsbuildinfo` are regenerated by every build and are no
  longer tracked by git. The `git checkout` line clears a copy left by an earlier build so
  this pull can remove them; later pulls do not need it.
- Members see the new rich menu after closing and reopening the chat with the OA.
- The migration only adds tables, nullable or defaulted columns and seed rows (plus the
  one-time retirement of the old placeholder plans), so the running app keeps working
  while it runs, and rolling the code back does not need a database rollback.
- `SLIP_STORAGE_DIR` defaults to `storage/payment-slips` in the app folder. `git pull`
  leaves that folder alone (it is ignored by git), but include it in backups, or point the
  variable at a backed-up volume.

## Release 2026-10-31: package page, coupons, Find Your Game, GYMNOS, rich menu

Covers revisions 1–5 from the LINE OA feedback. The plan and decisions are in
`docs/superpowers/plans/2026-10-31-ppa-app-revisions-part-1-5.md`.

**1. Database migration (required before the new build)**

1. Back up the database.
2. Run `npm run db:init` against staging first, then production. It applies:
   - the `membership_pauses` and `group_members` tables;
   - new columns on `coupons`, `user_coupons` and `groups_clubs`.
3. It seeds the package catalog: Monthly 12/1/6 months, Time passes, Fitness coupon
   packs, plus package-pause and coupon-renewal prices.
4. Re-running it keeps operator data:
   - All seeds (sports, courts, coupons, trainers, app content, package catalog) are
     insert-only, so names, prices, schedules and active flags edited in AdminConsole
     are kept. Earlier releases overwrote some of them on every run.
   - Only the built-in role and permission names are refreshed.
   - The old Monthly/Quarterly/Annual placeholder plans are retired only if they still
     have their original seeded values.
   - Existing staff passwords are no longer reset.
   - New: `payments.request_id` with a unique key, so retried checkouts never charge twice.
   - New: `payments.slip_path` / `slip_uploaded_at` for PromptPay slips.
   - `INSERT IGNORE` turns errors into warnings, so run `SHOW WARNINGS` after the first
     staging run and check the seed counts before production.
5. `scripts/db-init.mjs` no longer contains fallback database credentials; it reads
   the host environment or the env files, with the same precedence as the app.

**2. LINE rich menu (6 buttons)**

Run these to upload the new rich menu:

```sh
npm run line:rich-menu:image     # renders the SVG with Google Chrome
npm run line:rich-menu:dry-run   # check the six URIs
npm run line:rich-menu:create    # uploads and sets it as the default menu for all users
```

- The buttons are: Home, Packages, Coupons, Book a court, Wallet, Help.
- `create` changes the live LINE OA for all users, so run it only when the release is live.

**3. Where to manage the catalog**

All of these prices and settings can be edited in AdminConsole:

| What | Where | Content type / field |
| --- | --- | --- |
| Monthly and Time packages | App Content | `membership_plan` / `time_pass` |
| Package-pause and coupon-renewal prices | App Content | `renewal_option` |
| Coupon packs | Coupons | coupon `metadata` |

Grant terms (`months`, `days`, `uses`, `pausesAllowed`) are copied into each payment.
Editing a package later never changes rights that were already paid.

**4. Staff workflow**

- PromptPay requests for packages, pauses and coupon renewals appear under Reports →
  finance with the item name.
- "ยืนยันชำระ" grants the item: 12-month plans get 12 months, a pause extends the
  package end date, a coupon renewal adds one month.
- Member QR access is refused during a paused period.

**5. Security follow-up**

- The database password that used to be hard-coded in `scripts/db-init.mjs` remains in
  git history. Rotate the database password and update `.env.local` and the host
  secrets.
- The bootstrap super-admin password hash is also in `database/schema.sql` and its
  history. After the first login, change that account's password in AdminConsole.
  `db:init` no longer resets it.

## Release 2026-11-01: launch readiness

Adds what the club needs to open: PromptPay QR with slip upload, counter sales, member
rights for staff, in-app notifications, Coin rewards, editable contact details, PDPA
consent and visit history. The plan and decisions are in
`docs/superpowers/plans/2026-10-31-ppa-launch-readiness.md`.

**1. Environment** (see `.env.production.example`)

| Variable | Purpose |
| --- | --- |
| `PROMPTPAY_ID` | Receiving PromptPay ID: mobile (10 digits), tax ID (13) or e-wallet (15). Empty = no QR, payments stay staff-confirmed requests. `npm run production:check` rejects a mistyped value. |
| `PROMPTPAY_NAME` | Account name shown under the QR. |
| `SLIP_STORAGE_DIR` | Where transfer slips are stored (default `storage/payment-slips`). Use a persistent, backed-up volume outside `public/`. Slips are served only to staff with payment permission. |
| `DB_CONNECTION_LIMIT` / `DB_QUEUE_LIMIT` | Database pool size (default 10) and how many requests may wait for a connection (default 1000). Each member app open runs about 16 queries, so a burst of opens waits briefly instead of failing. |
| `LINE_PUSH_ENABLED` | `true` also sends payment notices as LINE OA push messages (uses the OA message quota and needs `LINE_CHANNEL_ACCESS_TOKEN`). The LINE Login (LIFF) channel and the Messaging API channel must belong to the same LINE provider, otherwise user IDs differ and pushes silently reach no one. Default off; in-app notifications always work. |

**2. Database migration (run before deploying this build)**

The new build reads the new columns and tables, so deploying it before the migration breaks
the member app and QR check-in. Back up, run `npm run db:init` on staging, check
`SHOW WARNINGS`, then run it on production, then deploy the build.
It adds `users.pdpa_accepted_at` / `pdpa_version`, the `member_visits` table and the
`sales.manage` permission (granted to manager, front desk and finance). It also seeds
5 Coin rewards and 2 site settings. All seeds are insert-only.

**3. Before opening**

1. App Content → `site_setting` → `support-contact`: set the real phone, email, LINE ID,
   LINE link (`line.me` / `lin.ee`) and opening hours shown on the Help page.
2. App Content → `site_setting` → `privacy-policy`: the seeded text is a **draft and is
   off**. Have the owner (and legal adviser) approve the wording, keep or change
   `metadata.version`, then activate it. Members must accept it once. Publishing a new
   version asks everyone again. Staff can see each member's consent in Members.
3. App Content → `reward`: check the reward list and Coin prices (`metadata.cost`).
4. Set `PROMPTPAY_ID`, then make one small real transfer end to end: member pays the QR,
   attaches the slip, staff open "ดูสลิป" and confirm, the right appears for the member.

**4. Staff workflow**

- **PromptPay:** the member scans the QR (exact amount) and attaches the slip. Payments
  awaiting confirmation are listed first (Dashboard shows "รอยืนยัน n"). In Reports →
  finance, check the slip with "ดูสลิป", then "ยืนยันชำระ" or "ยกเลิกรายการ". The member
  gets an in-app notification either way.
- **Court bookings paid by PromptPay:** a booking is held for 15 minutes and the QR screen
  shows the deadline. A slip sent in time keeps the court reserved until staff confirm or
  cancel (at most until the session ends). A late slip re-reserves the court only if the
  slot is still free; otherwise the member is told to contact staff with the slip.
  Cancelling the payment releases the court immediately.
- **Counter sale:** Members → member → counter sale sells a package or coupon at the
  catalog price. It needs `sales.manage` and is recorded with the staff member's name.
- **Member rights:** Members → member shows active packages, pauses, coupons, rights
  and payments waiting for confirmation.
- **Coin rewards:** members redeem Coins in the app and get a one-use QR (valid 30
  days). Staff scan it in Scanner to hand over the reward.
- **Visits:** every QR that staff consume is recorded. Members see it under
  "การเข้าใช้บริการ".

**5. Back-office dashboard**

The dashboard shows each staff member only what their role can act on, and refreshes
every minute while it is open:

- **ต้องทำตอนนี้:** slips to check (with how long the oldest slip has waited), payments
  without a slip, refunds due, packages ending in 7 days, courts in maintenance, system
  items. The queue table below it confirms or cancels payments in place: slips to check
  come first (oldest slip first), then refunds due, then requests without a slip (newest
  first, so a member paying at the counter finds theirs on top).
- **วันนี้:** visits (staff-scanned QR codes), the day's bookings and check-ins, courts
  playing now and coming up next (finished games drop off; "ดูการจองทั้งหมด" lists the
  whole day), today's sales and new members.
- **เดือนนี้:** sales compared with last month up to the same point in time, orders,
  cash in, wallet top-ups, a 30-day sales chart (arrow keys move between days, "ดูเป็นตาราง"
  shows the numbers) and sales by type / cash in by channel.
- **สมาชิก:** totals and the packages ending within 7 days, with phone numbers for renewal calls.

Definitions: **ยอดขาย** counts paid payments except wallet top-ups (the purchase made from
the wallet is the sale); **เงินเข้า** counts paid payments not funded from a wallet (money
actually received, including top-ups).

**6. Payment corrections**

- Cancelling a payment asks for a reason, which the member sees. If the member already
  sent a slip, the payment shows "รอคืนเงิน": transfer the money back, then press
  "บันทึกคืนเงินแล้ว" (status becomes refunded and the member is notified).
- When a member replaces a slip, the earlier one is kept and listed as "สลิปเดิม n".
- Counter sales record the price the staff member confirmed; if the catalog price changed
  in the meantime the sale is refused and the new price is shown. Finance staff
  (sales.manage) can open Members to sell, without edit rights.

PromptPay QR is a standard Thai QR with the exact amount. Payment is confirmed by staff
from the slip; there is no automatic bank reconciliation.
