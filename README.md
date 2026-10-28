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
   restoration separately. This change does not require schema migration.

PromptPay currently creates a pending payment for staff confirmation; it does not
provide a bank payment QR or automatic bank settlement. Merchant/payment-provider
configuration is still required for that integration. The UI now calls this a
payment request and does not claim to display a PromptPay QR.
