# Decision: Nubank personal account (CPF) — 2026-10-26

The merchant has a Nubank personal CPF account, not Nu Empresas.
Do not treat Nu Empresas features as available. No official Nubank PF charge creation API + webhooks were verified.
Recommended optional integration: Mercado Pago Pix payment API (account approval/eligibility to be verified).
Docs:
https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix
https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications

Important: Mercado Pago receives funds in merchant Mercado Pago account first. Transferring to Nubank is a separate action and automation of settlements is NOT promised.
Use Mercado Pago only after account eligibility, fees, and merchant compliance are checked.

Implemented: isolated server-side payment API adapter with idempotency header; settlement matching helper; Android notification service + Android manifest. No public endpoints or production deployment yet.

Before release:
- Map the store's actual order/payment database schema and confirm admin roles.
- Bind authenticated checkout route to stored order lines, verify ownership, never accept client-supplied amount.
- Add verified x-signature webhook receiver with authenticated provider GET and idempotent database transaction.
- Protect checkout from repeated attempts, order races, fake emails, webhook replay and invalid states.
- Install Firebase Messaging dependency, Gradle project, Firebase config, login, notification permission and secure token enrollment.
- Add payment outbox worker, delivery retry, test plans and deployment secrets.
- Obtain merchant's own Mercado Pago API credentials via secret manager, never chat or public source control.
