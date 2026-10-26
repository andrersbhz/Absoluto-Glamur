# Manual Pix — Nubank PF (no new provider accounts)

Current scope: storefront creates a pending Pix payment with provider=manual_nubank and method=pix (not implemented in checkout yet). The merchant inspects incoming transfers IN THEIR NUBANK APP, then approves or rejects the corresponding payment from the authenticated mobile admin page /admin/manual-pix.

This is a merchant decision, not bank verification. Never call it an authenticated bank settlement. Customer payment proof is insufficient.

Existing database: orders, payments, user_roles. The SQL migration creates a restricted, audited, idempotent server-side review RPC and a pending list RPC. No new external payment provider or bank account.

Pending: integrate creation of manual Pix records inside the EXISTING checkout server transaction, sourcing amount from orders.total_cents, with a valid static or generated Pix copia-e-cola. Obtain explicit consent before storing Pix key publicly in checkout; avoid showing raw CPF if undesired. A static QR does not independently identify which customer paid. Recommend asking buyers to use order code in the transfer description and reviewing transfer amount/date/payer in Nubank.

Mobile dashboard: /admin/manual-pix works in a browser and can be packaged into an Android WebView wrapper. Polls every 15 seconds WHILE OPEN. Background push is NOT available from this page alone; choose optional existing VAPID/Web Push PWA or implement native background work (subject to Android limits) if needed.

No automatic payment approval. Database migration has not been executed. Do not deploy without reviewing database triggers, existing fulfillment automation, and current checkout routes.
