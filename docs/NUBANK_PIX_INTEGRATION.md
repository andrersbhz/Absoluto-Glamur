# Nubank Pix integration — verified status (2026-10-26)

## Publicly documented capabilities
Nu Empresas supports manually creating Pix charges, QR codes / copy-and-paste, and tracking invoices via its app/web portal:
- https://nubank.com.br/empresas/solucoes-para-cobranca
- https://nubank.com.br/empresas/solucoes-para-cobranca/assistente-de-cobrancas

## Integration block
No official publicly documented merchant Pix charge API / webhook credentials, endpoint, mTLS method, sandbox, or published API onboarding process was confirmed in the reviewed materials. Do not guess endpoints, reverse-engineer private app APIs, scrape banking sessions, or request bank passwords.
The adapter in server/pix/bank-provider.ts MUST stay unconfigured (fail closed) until legitimate bank API documentation and approved credentials exist.

## Paths forward
1. Ask official Nu Empresas support whether merchant Pix API access exists for this account and request official docs, sandbox, webhook, certificate and rate-limit specifications.
2. If unavailable, use a supported Pix PSP with official API and webhook, and ask whether the PSP can settle to the merchant's Nubank account. Evaluate settlement timing, fees and reconciliation before selecting it.
3. Manual Nubank QR code may be shown as an explicitly manual-payment method, but never auto-fulfil orders based on customer claims, screenshots or app events lacking settlement verification.

## Acceptance criteria
- Authenticated checkout computes BRL amount from server-side order record.
- UUID order IDs aligned with schema; bank txid unique; bank API returns actual payload.
- Authenticity validation of inbound notification; reconcile final paid state by querying trusted PSP/bank.
- Compare transaction id and amount in integer cents; idempotent settlement updates and inventory handling.
- FCM pushes only after transaction commits; retry via outbox; authorized admin devices only.
- All secrets server-side, audit log, replay/race/refund tests; production credentials in protected environment.
