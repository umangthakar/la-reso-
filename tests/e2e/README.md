# Stripe production-reliability suite

Proves one thing that unit tests cannot: **a payment that succeeds is never
lost, however the customer's browser behaves afterwards.**

Everything here runs against the real services the app uses — real Stripe
**test mode**, the real Supabase project — because the point is to verify the
production wiring, not a mock of it.

> ### ⚠️ Test mode is mandatory
>
> `helpers.ts` throws if the resolved Stripe key is not a `_test_` key, so the
> suite can never move real money. **This site is currently configured with
> LIVE keys** (`site_settings.stripe_config.mode = "live"`), which means the
> suite will refuse to run until the admin panel is switched back to test keys.
>
> That is the guard working, not a bug. If you see a checkout decline saying
> *"Your request was in live mode, but used a known test card"*, the app is on
> live keys and the browser tests cannot pass.

## Prerequisites

1. **`STRIPE_WEBHOOK_SECRET` in `.env`.** Without it the webhook rejects every
   delivery and most of the suite fails at preflight.
   - For these tests any `whsec_…` value works: the suite signs its own
     payloads with the same secret the endpoint verifies against, which
     exercises the identical signature-verification path Stripe's own
     deliveries take.
   - For a genuine end-to-end run against Stripe's servers, install the Stripe
     CLI and use the secret it prints:
     ```
     stripe listen --forward-to localhost:3100/api/stripe/webhook
     ```
2. **`supabase/sql/44_stripe_webhook.sql` applied.** Run it in the Supabase SQL
   editor. It ends with a verification query — read the result; a partial apply
   is the failure mode that matters.
3. **A server on `E2E_BASE_URL`** (default `http://localhost:3100`):
   ```
   npm run build && npx next start -p 3100
   ```
   `next dev` also works but compiles each route on first hit, which makes the
   first few tests look like timeouts.

## Running

```
npm run test:e2e                 # everything
npm run test:e2e -- 02-recovery  # one file
npm run test:e2e:headed          # watch the browser tests
```

Set a different target with `E2E_BASE_URL=https://staging.example.com`.

## What each file covers

| File | Task | What it proves |
| --- | --- | --- |
| `00-preflight.spec.ts` | — | The wiring is actually installed: webhook secret set, `ADMIN_ENCRYPTION_KEY` primary, Stripe in test mode, all of migration 44 applied **including the unique index**. |
| `01-encryption.spec.ts` | 1 | `ADMIN_ENCRYPTION_KEY` encrypts new secrets, secrets written before it existed still decrypt, a wrong key fails closed without leaking key material. |
| `02-recovery.spec.ts` | 3, 4 | A real succeeded payment the browser never saved is recovered **with its basket**; duplicate deliveries, distinct events for one payment, and both browser/webhook race orders all yield exactly one order. |
| `03-checkout-ui.spec.ts` | 7 | Real Chromium, real Stripe Elements, real test card: a customer can pay; a mid-checkout refresh loses nothing; and **a tab destroyed after the card is charged still ends up with an order**. |
| `04-refunds.spec.ts` | 5 | Refunds made *at Stripe* (including from the dashboard) land on the order; a failed refund is marked for retry; a late failure never downgrades a completed refund. |
| `05-admin-customer.spec.ts` | 7 | A recovered order is a normal order: it appears in the admin list and drawer, still starts Pending, and is reachable by the customer's email. Both APIs refuse unauthenticated callers. |
| `06-regression.spec.ts` | 8 | Pricing is still server-derived, size variants still price from the chosen size, the delivery and contact gates still refuse bad input, and the storefront still renders. |
| `webhook-security.spec.ts` | 6 | Unsigned, wrongly-signed and tampered payloads are rejected with 400 and write nothing. A *validly* signed payload still cannot invent an order Stripe will not confirm. |

## Cleanup

Every order, draft and ledger row the suite creates is deleted in `afterAll`
(`cleanup()` in `helpers.ts`). Test rows are tagged `E2E-STRIPE-RELIABILITY`
and every event id is prefixed `evt_e2e_`, so cleanup can never touch a real
payment. Stripe test-mode PaymentIntents are left in place — they cost nothing
and are useful evidence.
