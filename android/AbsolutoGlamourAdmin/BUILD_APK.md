# Build an Android APK without Lovable credits

Open the folder android/AbsolutoGlamourAdmin in Android Studio using JDK 17 and Android SDK 35. Android Gradle Plugin 8.7.3 is configured, but a Gradle wrapper is not committed. Let Android Studio provision a compatible Gradle version (8.9) or install it locally.

Run Gradle tasks:
1. :app:testDebugUnitTest
2. :app:assembleDebug

Debug output: app/build/outputs/apk/debug/app-debug.apk

Do NOT install as a production merchant admin until its login, server route, RPC migrations, permission boundaries, and payment confirmation have been tested in staging. The current Android shell opens the production URL but the new route has not been deployed.

Signed production builds require an owner-managed signing key. Do not commit JKS or passwords. Build only after approval and end-to-end validation.

The app does NOT yet provide Android background push when closed. Sound works only when the dashboard is visible and enabled. Manual approval requires reviewing a genuine incoming transfer in the Nubank account.
