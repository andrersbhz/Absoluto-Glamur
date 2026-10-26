# Build Android app without Lovable

No Lovable editor, Lovable AI, Lovable credits or production deployment.

## Requirements on local computer
- Android Studio with Android SDK Platform 35, Build Tools, and JDK 17.
- Gradle 8.9 or compatible Android Gradle Plugin 8.7.3 setup.
- Network access for initial Android dependency download.

## Procedure
1. Clone and checkout branch `feature/pix-bank-android-notifications`.
2. In Android Studio open `android/AbsolutoGlamourAdmin`.
3. Let Android Studio import Gradle project (this scaffold does not yet commit Gradle wrapper files).
4. Run `testDebugUnitTest` for PaymentAlertPolicyTest (unit tests).
5. Run `assembleDebug` and install on a test device, with no production release signing.
6. Verify existing admin sign-in with shop account, permissions, offline screen and manual Pix queue on a staging deployment.
7. Verify notification chime only when a *new* pending Pix enters the queue and app is in foreground with sound enabled.
8. Do not approve real payments during testing. Use a staging database and mocked/dummy transactions.
9. Recheck existing store checkout, payment provider routing and order fulfillment before even considering merging.

## Known blockers
- New route and SQL migrations are not deployed anywhere; opening the Android app against production will not show this feature.
- External identity provider/browser login may require additional deep-link auth handling; not tested.
- Android build cannot be executed in this agent runtime because Android SDK/Gradle are not installed; no APK produced.
- Background alerts when app is closed are not implemented; do not market them as working.
- Github/Lovable syncing can cause unintended effects if merged; keep draft PR until reviewed.

## Security notes
No financial API and no third-party payment provider required. Existing supabase is reused.
Never store the Nubank Pix EVP or credentials in the APK.
Manual approval is never proof of bank settlement.
