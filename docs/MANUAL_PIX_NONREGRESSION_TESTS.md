# Manual Pix feature: no-regression test matrix

Before merging or deploying, run the following in a staging clone:

| Case | Required result |
|---|---|
| Feature flag absent or false | Checkout and all existing payment providers remain unchanged |
| Client attempts to set amount or Pix key | Rejected; always use server stored order total and environment key |
| Unauthenticated user opens approval RPC | Permission denied |
| Customer attempts approval RPC | Permission denied |
| Admin approves pending after verifying Nubank | One audited state change |
| Admin double-taps approval / two admins race | One approval only |
| Admin rejects a payment | Attempt cancelled, order not mistakenly marked paid |
| Existing paid order gets new Pix request | Denied |
| Concurrent manual Pix creation | One pending record for same order |
| Incorrect amount, currency, order owner | Denied |
| Initial pending list sync | No cash register alert |
| New pending record while visible | One alert, not repeated each polling interval |
| App killed or locked | No promise of alert (background notifications not implemented) |
| Old card, PayPal, Mercado Pago, other methods | Exactly same processing behavior as baseline |
| Manual approval triggers fulfillment | Explicitly reviewed before enabling; no duplicate shipment |

No production activation until checkout integration, migration verification, Android compilation and these tests pass.
