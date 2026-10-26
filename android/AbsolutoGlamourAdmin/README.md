# Absoluto Glamour Admin — Pix manual

Native Android WebView container for https://absolutoglamur.com.br/admin/manual-pix.
No new payment-provider account; Nubank personal Pix key is configured only on the shop server.

## Implemented
- Android Gradle project scaffold, MainActivity, secure HTTPS WebView shell.
- Authenticated mobile dashboard (React route), permission-limited database list/review procedures.
- Dark premium mobile UI, pending orders, pending total, manual approve/reject, visual warnings.
- Cash-register-style chime synthesized by Web Audio; opt-in sound activation; new IDs detected on polling (5-second interval while visible).
- No alarm on first sync (avoids replaying all old orders as newly generated).

## Not finished / required before release
- Checkout API endpoint binding createPendingManualPix() to the verified authenticated customer and existing order; QR code UI on store.
- Install SQL migrations and secure environment variables; review existing order auto-fulfillment triggers.
- Add tested Android launcher icon and signing configuration; run Android build and device tests.
- Background alerts with app closed are not implemented. Foreground sound needs user interaction to unlock audio; system power policies may pause it when app is not active.
- Test database RLS, refresh flow, logging, manual payment approvals, replay, customer concurrency.
- No APK built and nothing deployed to production.
