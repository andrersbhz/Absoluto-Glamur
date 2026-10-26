# Hard change boundary — preserve working Absoluto Glamour storefront

Owner instruction: DO NOT change anything except what is essential for the new manual Pix Android feature.

## Safe boundaries
- Never replace or refactor current checkout routes, payment gateway routing, auth, order fulfillment, product catalog, pricing, localization, shipping, or global UI.
- Keep all code in its isolated feature branch; no auto-merge or production migration.
- Additive files only, unless fixing a defect wholly within newly introduced manual-Pix files.
- Existing payment processing must have exactly the same behavior when `VITE_MANUAL_PIX_ENABLED` is absent or false.
- New manual Pix method must be opt-in, not default. Rollout behind tested server-side setting and a separate client visibility flag.
- Inspect order triggers/fulfillment and migration compatibility before granting any approval procedure the ability to mark paid.
- No automatic confirmation of bank receipt. Admin must verify the Nubank transfer manually.
- No new financial provider or login provider. Use the shop's existing authentication and Supabase.
- No public Pix key embedded in source; provide via deployment environment variable.

## Current gaps
The server-only helper and standalone /admin/manual-pix route are not yet hooked into the existing checkout. Migrations are NOT applied. APK is NOT compiled; sound currently works while application is open with user-unlocked audio only. New route requires admin role at the database RPC level.

## Before a production merge
1. Review exact existing checkout/fulfillment code; inventory and payment hooks.
2. Reconcile manual Pix migrations with current schema and remove obsolete migration filenames from the PR.
3. Run build/type-check, DB migration dry-run, security tests, and Android instrumentation tests.
4. Test existing payment methods unchanged with the feature flag OFF.
5. Confirm merchant-only login, amount matching, concurrency controls, manual approval audit log.
6. Confirm signed Android package and live notification behavior.
7. Deploy in a reversible staging environment and monitor logs; no production cutover without explicit authorization.
