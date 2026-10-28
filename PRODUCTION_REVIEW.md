# Production review — 2026-10-28

Status: local fixes and listed verification completed; **not
deployed**, and full production acceptance is not yet complete.

## Implemented

- Added `/AdminConsole/scanner`, camera QR decoding using jsQR, keyboard scanner/URL
  entry, member preview, explicit redemption confirmation, request locking, camera
  error recovery and camera cleanup. Navigation supports relevant staff permissions.
- Enabled same-origin camera use in Permissions-Policy. No microphone access needed.
- QR preview and redemption recheck active rights, expiry and remaining uses.
  Consumption remains transactional, records staff in the audit log, and rejects
  replay. Unavailable DB returns a controlled 503.
- Issuance excludes memberships/entitlements that have not started and bookings
  already checked in or ended.
- Removed wallet-funded wallet top-up from checkout. Pending top-ups no longer
  report a successful wallet payment. Renamed the unimplemented PromptPay QR action
  to a payment request without changing its pending/manual-confirmation behavior.
- Production/identity audit scripts load environment files with Next.js precedence.
- Updated vulnerable locked dependencies (including Next.js 16.4.3, Zod 4.6.7,
  sharp 0.35.5 and axios 1.21.0); npm audit reported zero vulnerabilities.

## Payment follow-up

- Restored staff payment approval for session-authenticated users. The UI now checks
  `payments.manage` instead of the obsolete non-empty admin key, prevents concurrent
  submissions, and handles response/network failures.
- Payment approval records the acting staff ID and reads its response on the same
  connection before commit, avoiding a second pool acquisition while holding one.
- Unavailable coupons and malformed entitlement metadata reject approval and roll
  back, rather than silently issuing an unrelated entitlement.
- Wallet coupon purchases now create a paid payment row and link the wallet debit to
  that payment, so new purchases appear in financial reports. Coupon terms are read
  under a transaction lock. Historical missing payment rows were not backfilled.
- Real SQL fixture checks passed approval → wallet/membership/coupon grant → reject
  duplicate approval → audit attribution. Membership/coupon grants then passed QR
  redemption. Wallet coupon purchase recorded payment + ledger; insufficient funds
  left no extra payment. Unavailable coupon approval stayed pending after rollback.
- Browser fixtures passed session-based approval without an admin key, error/retry
  handling, and disabling the action after payment; all 327 fixture views passed.
- These are transaction fixture tests, not a real bank settlement or provider test.

## Evidence

| Check | Result / scope |
| --- | --- |
| Unit/regression tests | 33 passed: sessions, permissions, payments, booking races, i18n, QR decoding, validity, replay, outage and scanner permission checks |
| ESLint | Passed without warnings |
| Production build | Passed using Next.js 16.4.3 |
| Production environment + DB hardening | Passed against configured DB |
| LINE identity audit | Passed indexes, duplicates, missing wallets and orphan-record checks; not a real LIFF login test |
| HTTP smoke | Passed staff/member access rejection, staff scanner page, malformed scan rejection, camera header, and calendar/day consistency for all configured booking sports |
| Real SQL QR integration | Member, entitlement, coupon and booking: issue → decode generated image → preview → consume → reject replay. Fixture rows rolled back; no real member right consumed |
| Responsive browser fixtures | 327 views passed on the final run; generated QR video decoded through the actual camera loop, preview did not consume rights, camera tracks stopped after detection |

## Remaining launch requirements

- Provide the deployment host/access and release mechanism for gymnos234.com.
- Select and configure a real payment collection method. Current PromptPay flow only
  creates a pending request; no merchant QR, provider webhook or settlement is wired.
  Real bank payments and paid purchases were not exercised against production data.
- Pilates and Airfit have no bookable courts/resources in the configured database;
  availability correctly reports closed. Configure real resources if those services
  should accept court-style bookings.
- Verify a real LINE login and physical camera scan on the intended iPhone/Android
  devices over HTTPS. Browser fixtures and generated video frames cannot verify
  physical camera focus, permission settings or LINE webview behavior on site.
- Confirm persistent uploaded-image storage, host process supervision, TLS/proxy
  configuration, and backup restoration with the deployment owner.

This review verifies the listed flows; it is not evidence that every business
operation, payment-provider workflow, device, or production infrastructure condition
has been exercised. Existing review files describe earlier checks, not deployment
status for this release.
