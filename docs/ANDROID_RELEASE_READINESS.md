# Android release readiness — zero Lovable credits

Current behavior: Android shell loads new /admin/manual-pix route. Site login and manual approval database RPC are reused.
Cash register alert sounds only while the panel is open, connected, and opted in. No app-closed alert support.

## Checked this iteration
- Added guarded error handling for network interruptions and administrative approval failures.
- Added loading state so empty and unavailable queues are not confused.
- Existing checkout and current payment provider routing were not edited.
- Nothing merged into main or deployed.

## Blockers
- Database migrations unexecuted; verify manually against live Supabase schema and fulfillment triggers.
- Android Gradle build and instrumented testing not performed; APK unavailable.
- App-closed push requires additional infrastructure/Android-supported background delivery. Don't claim completion.
- Check WebView authentication redirects and exact route loading.
- Manual approval must only follow verification in Nubank app.

## Release gates
- Build the Android module independently, execute tests and secure sign-off.
- Validate the queue in staging with existing pix_manual data.
- Verify no impact to current payment methods and storefront when feature is not deployed.
- Enable manual review only after operator accepts that confirmation is manual, not bank-backed.
