# Responsive Frontend Review

Date: 2026-09-10

## Changes

- Removed the fixed-size simulated phone frame, notch and overflowing shadows.
  The member shell uses the available viewport height, with independent content
  scrolling and a stable bottom navigation bar. Safe-area insets are respected.
- Admin navigation becomes an accessible drawer below 1024px. The sidebar and
  main content have separate scroll areas; opening the drawer makes the main area
  inert. Escape closes the drawer and focus returns to its trigger.
- Tables retain local horizontal scrolling. Responsive grids, long member names,
  form fields and controls no longer expand the page horizontally.
- Admin edit dialogs use native modal dialogs with bounded viewport dimensions,
  keyboard focus containment, Escape handling and scrollable form content.
- Browser zoom remains enabled. Small-screen form controls use 16px text to avoid
  automatic input zoom. Reduced-motion preferences are respected.
- Removed the CSS Google Fonts import and standardized on the existing self-hosted
  Next.js fonts. No new runtime image or font service was added.
- Removed the promotional auto-carousel in favor of a stable booking-first home.
  Superseded court
  availability requests are cancelled. Initial loading failures expose a retry.
- Image sources are limited to local paths or HTTPS without embedded credentials;
  executable/data schemes and protocol-relative URLs are rejected. Configurable
  trainer images do not send referrer headers. LINE initialization errors fail
  closed when LINE access is required. API authorization remains server-enforced.

## Verification

- `npm run build`, `npm run lint`, and all 21 `npm test` regressions passed.
- `npm run test:responsive` uses Chrome through Playwright, real source components
  and the running app's compiled styles. LIFF/backend, Next navigation and the
  Next Image wrapper are mocked only in isolated component fixtures; no application
  authentication bypass or test route is added to the server.
- 105 fixture views passed document/content horizontal-overflow and viewport-height
  checks: 7 member screens and 8 admin sections at each of seven viewport sizes:
  320x568, 390x844, 768x1024, 1024x768, 1440x900, 1920x1080, and 844x390.
- Additional checks cover mobile navigation, dark/light themes, modal dimensions,
  repeated Tab focus containment, Escape, reaching the final form actions, and
  recovering from a bootstrap error at 390x360.
- Actual localhost LINE-gate and admin-login pages passed viewport overflow checks
  at five sizes. Screenshots were visually inspected for mobile, tablet, desktop,
  a scrolled profile dialog, the light theme and the LINE gate.
- Screenshots and measured fixture results are saved in
  `/private/tmp/ppa-responsive/`. Run the command with the existing localhost:3000
  development server available. The checks use synthetic data and do not modify
  production records.

This verifies Chrome with simulated viewports, not every physical device. Actual
LINE WebView/iOS keyboard behavior, Safari, Firefox, production load and real
payment flows were not exercised in this frontend pass.

## Member Experience Follow-Up

- Reorganized home around booking, access QR, the next real reservation, sports,
  actual membership/wallet information, configured news and trainers. Removed
  hardcoded live matches, invented occupancy statistics and limited-place claims.
- Removed sample bookings, wallet transactions, member phone numbers and fake
  QR patterns. Empty accounts show explicit empty states. Premium membership
  is displayed only for an active, currently valid membership.
- Removed generated trainer availability and class slots. A fully booked class
  schedule remains disabled rather than falling back to invented available times.
  Service packages come from configured catalog content, not hardcoded prices.
- Booking history separates expired/cancelled/past bookings, uses Bangkok dates,
  and displays payment/check-in status. Cancellation uses a confirmation dialog
  and a separate keyboard-accessible button instead of a nested click target.
- Replaced navigation drawings with tree-shaken Lucide icons. Back controls have
  accessible names, the active navigation item is announced, and notices use a
  live region. Member logout now expires server cookies and clears visible data;
  it does not sign the person out of their LINE account.
- Browser assertions cover empty accounts, inactive membership, cancellation
  dismissal, actual logout request/UI clearing, and empty/full class schedules.

Remaining product work: wallet transaction history needs an authenticated data
source; support contact details and rewards policies require operator verification.
Trainer booking/payment acceptance still needs an end-to-end business review.
Do not present these remaining areas as production-certified.
