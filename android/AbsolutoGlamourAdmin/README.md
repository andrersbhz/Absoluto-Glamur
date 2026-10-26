# Absoluto Glamour Admin — Android starter

Status: architecture scaffold, not an installable APK yet.

Build a Kotlin Android app with Jetpack Compose and Firebase Cloud Messaging (FCM).
The app signs in through Supabase Auth; a protected server endpoint verifies admin status
before registering the user's FCM token. On Firebase token refresh, register again.
Notifications should be sent only from a trusted backend with Firebase Admin SDK.

## Security rules
- Never ship bank credentials, Supabase service-role key, or Firebase service-account JSON inside the APK.
- Never use a Pix screenshot/QR display as evidence of payment.
- Disable notifications on logout and unregister the token server-side.
- Configure explicit admin authorization and avoid exposing customer data in push payloads.
- Avoid logging transaction IDs, access tokens and personal data.

## Pending integrations
1. Confirm bank, official Pix API docs, sandbox access and webhook signature or mTLS method.
2. Identify existing checkout/order model and map order_id to its primary key.
3. Create authenticated payment endpoints, persist dynamic Pix charges and validate payment confirmation.
4. Deploy secure Firebase push sender and administrator device-registration endpoint.
5. Create native Android module, Gradle configuration, icon, login, orders dashboard and FCM handler.
6. Run tests including replayed callbacks, partial payments, duplicate notifications and refunds.
7. Generate signed APK/AAB once Firebase and Android signing credentials are configured.

Never mark a payment paid without authoritative bank confirmation.
