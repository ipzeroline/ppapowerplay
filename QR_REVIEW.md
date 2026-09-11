# QR Issuance Diagnostics

## Reported Symptom

The supplied LINE screenshot shows a failed QR request, not a broken QR image.
Previously every request failure produced the same generic rights/payment message,
so a screenshot alone could not distinguish an entitlement denial from a network,
authentication, rate-limit or server failure.

The member tab requests `/api/qr?purpose=member`. Under the existing policy,
registration alone does not qualify: this endpoint requires an active, unexpired
membership plan. Booking, coupon and entitlement QR requests use their own
references and eligibility checks. This change does not grant or bypass rights.

## Changes

- Missing membership returns HTTP 404 with `NO_ACTIVE_MEMBERSHIP`; other missing
  rights return `NO_QR_RIGHTS`.
- QR lookup/storage/generation failure returns HTTP 503 with
  `QR_SERVICE_UNAVAILABLE`, without exposing internal database details.
- The frontend distinguishes HTTP 401, 403, 404, 429 and service/network failures.
  Messages support Thai, English and Simplified Chinese.
- Failed QR requests show a readable error and retry button instead of a large
  blank white square. Requests are aborted when the screen is left; expiration
  display accounts for time spent waiting for the response.

## Verification And Limits

- Unit tests cover rights denial without token insertion, service failure,
  successful generation using the real QR encoder, and hashed token storage.
- Browser fixtures exercise missing rights, service failure, manual retry, and
  successful image rendering. They do not authorize a real facility check-in.
- A read-only lookup of the reported member in the configured database failed
  with a network-unreachable error from this workstation, including after
  permission approval. The member's live entitlement status remains unconfirmed.
  This is not evidence that the production server cannot reach its database.
- Changes are local; no production deployment or member-data modification was
  performed. After deployment, inspect the actual QR request status: 404 requires
  an entitlement check, 401 requires reauthentication, and 503 requires checking
  server-side database/service availability.
