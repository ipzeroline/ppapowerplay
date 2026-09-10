# Security and Reliability Review

Reviewed: 2026-09-10. Scope: Next.js app, admin/member authentication, route
authorization, bookings, payments, QR redemption, database access, frontend request
handling, configuration and installed dependencies. This is a code review and
targeted hardening pass, not certification or a production penetration test.

## Addressed

| Finding | Result |
| --- | --- |
| Unsigned member identity cookie | Signed, purpose-bound, expiring session; legacy identity cookies are ignored. |
| Admin development/key bypass and unscoped sessions | Staff sessions are required; every admin API checks the active account and assigned permissions. Unknown resources deny access. |
| Suspended/deleted accounts retained access | Member/admin status is checked; LINE login no longer reactivates deleted members. |
| Staff password changes left sessions usable | Admin sessions bind to the stored password hash; changed hashes invalidate old sessions. Self-service password changes issue a replacement cookie. |
| Profile accepted another staff ID | Self-service routes reject any ID other than the authenticated administrator. |
| Privilege escalation through staff management | Non-super administrators cannot manage peers, higher roles, themselves, or roles granting permissions they lack. Super-admin accounts are protected from staff CRUD. Role-definition mutations require super-admin. |
| Sensitive data included for all admin users | Unauthorized datasets are not queried or serialized. Menus and direct page access follow permissions. |
| Client-controlled product prices and entitlement names | Payments resolve content/trainer IDs against the active server catalog. Browser amounts and entitlement names are not authoritative. |
| Booking payment races | Booking rows are locked before wallet debit; already-paid/expired bookings and existing pending payments reject duplicate submissions. Admin confirmation also rechecks booking state. |
| Booking status bypassed finance | Booking management cannot mark payments paid or reopen paid bookings as unpaid. Status transitions and audit writes use a transaction. |
| QR consumed stale rights or used coupons early | Redemption checks current rights, expiry, permission and affected rows. Failed redemption rolls back the token. Status is calculated before decrementing uses. |
| QR UI displayed simulated codes on failure | Only server-issued QR images are shown; expiry countdown is local to the scanner component and expired codes are hidden. |
| Booking end time depended on server timezone | Slot arithmetic uses the booking's local hour; impossible calendar dates are rejected. |
| Unbounded JSON/upload body reads | Streaming reads enforce 256 KiB JSON and a bounded multipart upload envelope. |
| Cross-origin mutations | Admin guards and JSON parsing reject cross-origin browser requests. |
| CSV formula injection | Spreadsheet formula prefixes are escaped during export. |

## Performance and Maintenance

- Removed two table-wide expiry UPDATEs from every bootstrap request; reads filter
  expired member rights directly, with bounded coupon results.
- Database connection queue is bounded, connections have a timeout, and existing
  parameterized queries/read-only transient retries are retained.
- Rate-limit memory is bounded and cleanup runs periodically rather than scanning
  the map on every request once it reaches 1,000 entries.
- QR countdown no longer rerenders the entire member app each second. Requests
  cannot overlap within a QR refresh cycle. Member fetches and LINE verification
  have timeouts. Report filters reset pagination within their change handlers.
- Trainer images have explicit dimensions and lazy loading; remote image proxying
  remains disabled for these configurable URLs.
- Replaced removed `next lint` command with ESLint flat configuration. Added
  reproducible regression and read-only HTTP security checks.
- Environment files are ignored by Git except the production example.

## Validation

- `npm run build`: production compilation and TypeScript passed.
- `npm run lint`: checked with Next.js and TypeScript recommended rules.
- `npm test`: 14 regression tests, using actual TS modules with mocked DB/framework
  boundaries for authorization and transaction branches.
- `npm run test:security:http`: localhost checks unauthenticated admin routes,
  invalid login, cross-origin login, forged member cookies, authenticated admin
  reads, and denied cross-account profile edits. No persistent data is changed.
- `npm audit --json`: zero reported vulnerabilities in installed dependencies.
- `npm run production:hardening:audit`: environment/database-index checks passed.
- Observed local development requests: login page 50 ms; authenticated admin page
  533 ms. These are individual observations, not a production benchmark or a
  before/after comparison.

## Operational Changes and Remaining Work

- Existing sessions must log in again. Configure `SESSION_SECRET` or the fallback
  `ADMIN_ACCESS_KEY` with at least 32 random characters, shared across instances.
  Development-only random secrets do not survive restart.
- Package purchases require catalog content IDs or trainer/package IDs. Prototype
  products without configured catalog records are rejected. External API clients
  using only `amount`/`itemName` must migrate to these IDs.
- Payment confirmation is still manual; this review does not add a payment-provider
  integration, refunds, settlement reconciliation, or idempotency for all package
  purchases. Coupon wallet purchases still use their existing ledger workflow;
  financial reporting should reconcile that ledger as well as the payments table.
- Rate limits are process-local and depend on trusted proxy IP headers. A public
  deployment needs ingress limits, sanitized forwarding headers and shared limits
  when scaled to multiple workers.
- Logout clears the browser cookie; individual stolen tokens are not stored in a
  server-side revocation list. Password/secret rotation invalidates admin sessions.
  MFA and persistent per-device session management are not implemented here.
- CSP still allows inline scripts and broad HTTPS origins for the existing LIFF
  integration. A nonce-based policy needs browser validation before tightening it.
- Database backup/restore, multi-client transaction stress tests, production load
  testing, actual LINE-device login, successful username/password login with a
  known credential, payment-provider settlement, and desktop/mobile visual testing
  were not performed. In-app browser execution was unavailable in this session.
- No deployment, database migration, or production data modification was performed.
