# Deployment checklist — manual Pix, random Nubank key

This is NOT a banking integration: BR Code is generated locally and merchant approval is manual.
No Mercado Pago, no Nubank banking session scraping, no Firebase account.

- Set NUBANK_PIX_RANDOM_KEY, PIX_MERCHANT_NAME, PIX_MERCHANT_CITY in protected server deployment configuration. Never prefix with VITE_ and never ship the key as source code.
- The generated Pix payload necessarily exposes the receiver key to customers (EVP is preferred over CPF).
- Create backend checkout action with authenticated user and the EXISTING order ID. Source amount from orders.total_cents; authenticate and authorize; do not expose service-role credentials.
- Database unique index protects against two pending Pix charges for one order. Migration scripts must be reviewed against production schema and applied in staging first.
- Existing order lifecycle hooks might ship orders automatically on 'paid'. Inspect fulfillment triggers BEFORE enabling manual approval.
- Set delivery state as waiting until admin verifies the funds in Nubank app. Customer-provided receipt is never authoritative.
- Manual admin page refreshes every 15 seconds when in foreground. This is not a background Android notification.
- To deliver native background notifications without Firebase, implement a user-authorized Android foreground service with a persistent notification and server polling, respecting Android restrictions, or use the shop's existing Web Push infrastructure in a PWA. Neither approach is yet implemented.
- Verify order attribution manually: static QR payload and text reference do not ensure that the payer transmitted an identifying order code.
- Test race conditions, refunds, cancellation, multiple customer sessions, permission bypass, balance discrepancies, and mobile usability.
- Production is NOT enabled, APK has NOT been compiled.
