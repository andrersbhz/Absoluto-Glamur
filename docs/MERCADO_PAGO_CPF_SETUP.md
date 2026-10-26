# Absoluto Glamour — Mercado Pago CPF setup

1. Register a Mercado Pago account as an individual with CPF at https://www.mercadopago.com.br/.
2. Complete KYC checks and configure a Pix key at Mercado Pago (not just Nubank).
3. At https://www.mercadopago.com.br/developers/panel/app, create an integration application for https://absolutoglamur.com.br.
4. Select Checkout Transparente / Pix, create test credentials first.
5. Configure encrypted server-side MERCADO_PAGO_ACCESS_TOKEN and a separate webhook secret. Do not store them in GitHub or Android.
6. Configure HTTPS webhook notifications on the actual deployed backend route after it exists.
7. Verify merchant API access, webhook replay resistance, eligibility and fee schedule before production activation.
8. Test the full checkout order > payment create > QR code > signed webhook > GET payment > atomic order paid > FCM push > device delivery.
9. Production checkout must not be enabled before all checks pass.

Official docs:
https://www.mercadopago.com.br/developers/pt/docs/getting-started
https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/overview
https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix

Android starter Gradle module requires Android SDK, Gradle environment and user-owned Firebase project with app/google-services.json (ignored by Git). APK is not yet compiled.
