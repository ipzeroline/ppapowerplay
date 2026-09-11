# Booking Verification

Reviewed on 2026-09-10 against the local application and its configured database.

## Findings and Changes

- The database contained 26 available courts across six sports and no bookings starting today or later. The old UI labeled elapsed time slots as full, even without reservations.
- The monthly calendar now distinguishes available, full, elapsed and closed days. Only available days can be selected. Monthly and daily results share the same calculation and Bangkok timezone.
- Availability uses three read-only queries per request, with a bounded booking range and expired holds excluded. It requires member authentication and returns no booking identities.
- The hourly slot list now matches the existing backend opening window, 08:00-23:00. Starts at 21:00 and 22:00 were previously missing. Multi-hour requests extending beyond closing time are unavailable.
- Changing dates clears the selected court/time. Loading and failed requests cannot offer stale slots. Availability refreshes every 30 seconds while the booking screen is visible; confirmation still checks the database transactionally.
- Booking creation locks and rechecks the court, capacity, rate and overlapping bookings. A conflict returns 409 and sends the UI back to court selection. The response uses the same connection before commit to avoid waiting for another pool connection.
- Pilates and Airfit are configured as requiring bookings but have no courts. They remain closed for court booking until real resources are configured; no placeholder resources were created.

## Verification

- `npm test`: 19 passing tests, including date boundaries, full calendars, overlapping slots, locked court changes, and two concurrent requests against a simulated transactional DB boundary.
- `npm run test:security:http`: authenticated monthly/day availability agrees for every booking sport against the live configured database; invalid dates and unauthenticated access are rejected. No database writes.
- `npm run test:responsive`: 105 member/admin fixture views over seven desktop/mobile sizes, plus full-day disabling, date changes, conflict recovery and calendar network failure/retry. Screenshots are in `/private/tmp/ppa-responsive`.
- Browser fixtures render the actual components and styles, with mocked member authentication/API data. They do not replace a real LINE sign-in and payment acceptance test.
- No paid booking or payment was created in the live database during verification.
