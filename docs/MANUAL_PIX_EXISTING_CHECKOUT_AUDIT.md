# Existing checkout audit — preserve live operation

Read existing src/lib/checkout.functions.ts and src/integrations/supabase/types.ts on main branch.

## Confirmed existing behavior
- Existing checkout function createCheckout checks payment_method_routing and integrations, and constructs server-calculated order totals.
- It already supports provider pix_manual and dispatches to handleManualPix(ctx, integ).
- handleManualPix uses ./pix-brcode to generate QR copy-and-paste, persists payment in existing payments table with provider='pix_manual', method='pix', status='pending', the real order total, and order reference.
- Existing order statuses include awaiting_payment and paid; payment statuses pending and confirmed.
- Existing user_roles defines admin/superadmin/finance roles.

## Minimal change decision
DO NOT edit checkout.functions.ts, pix-brcode.ts, existing payment routing, integrations, existing database enums, or live checkout UX.
Use existing pending pix_manual payment records as the source of truth for the new admin review queue. The manual-pix SQL migration has been updated to use the existing pix_manual provider.
No new Pix generation flow is needed. The standalone server/pix/manual-checkout.ts and src/lib/manual-pix-brcode.ts were earlier proof-of-concept modules; DO NOT wire them in. They are redundant and should be removed from the PR after final review.

## Release blockers
- Compare current database migration history before applying new SQL migrations.
- Examine order paid triggers and fulfillment automations; manual approval may trigger downstream automatic order shipment.
- Validate RLS/security-definer functions, actor role, audit history, and concurrent updates.
- Android WebView sound only works when panel is visible and audio enabled. A reliable app-closed alert requires separately implemented background notification infrastructure.
- No APK assembled and no production changes made.

## Next code only in isolated Android app and manual Pix admin modules
1. Show queue sourced from existing pix_manual records (implemented as draft).
2. Manual approve/reject writes to existing payments and orders under role-restricted audited DB function (draft; needs staging tests).
3. Audio cash-register notification for newly observed pending payment IDs while dashboard visible (implemented in draft).
4. Add Android signed build/tests and optional background alert mechanisms independently.
