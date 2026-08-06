// ============================================================
// TASK 6 — webhook security.
//
// The webhook is the one endpoint on this site that an unauthenticated caller
// can POST to and have it write orders. These tests are the proof that only
// Stripe can make it do anything.
// ============================================================

import { test, expect } from "@playwright/test";
import { env, postWebhook, paymentIntentEvent, admin } from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const SECRET = env().STRIPE_WEBHOOK_SECRET ?? "";

/** A payload that WOULD create an order if it were ever trusted. */
function forgedIntent(id: string) {
  return {
    id,
    object: "payment_intent",
    amount: 1,
    amount_received: 1,
    currency: "gbp",
    status: "succeeded",
    metadata: {
      subtotal: "0.01",
      delivery_fee: "0.00",
      total: "0.01",
      customer_name: "Forged Attacker",
      customer_email: "forged@example.com",
      customer_phone: "07000000000",
    },
  } as never;
}

test.describe("Stripe webhook — signature enforcement", () => {
  test("rejects a request with no stripe-signature header", async () => {
    const res = await fetch(`${BASE}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paymentIntentEvent(forgedIntent("pi_e2e_nosig"))),
    });
    expect(res.status).toBe(400);
  });

  test("rejects a forged payload signed with the wrong secret", async () => {
    const { status } = await postWebhook(
      BASE,
      paymentIntentEvent(forgedIntent("pi_e2e_wrongsecret")),
      { secret: "whsec_this_is_not_the_configured_secret" },
    );
    expect(status).toBe(400);
  });

  test("rejects a correctly-signed payload whose signature was then tampered with", async () => {
    const { status } = await postWebhook(
      BASE,
      paymentIntentEvent(forgedIntent("pi_e2e_tampered")),
      { secret: SECRET, corrupt: true },
    );
    expect(status).toBe(400);
  });

  test("a rejected request writes NOTHING to the database", async () => {
    for (const id of ["pi_e2e_nosig", "pi_e2e_wrongsecret", "pi_e2e_tampered"]) {
      const { data } = await admin()
        .from("orders")
        .select("id")
        .eq("stripe_payment_intent", id)
        .maybeSingle();
      expect(data, `no order may exist for the rejected intent ${id}`).toBeNull();
    }
  });

  test("accepts a genuinely-signed event (unknown PaymentIntent is acknowledged, not actioned)", async () => {
    // Signature is valid, so the endpoint acts on it — and the FIRST thing
    // order creation does is ask Stripe about the intent. Stripe has never
    // heard of this id, so the handler fails and the endpoint returns 500 so
    // Stripe will retry. What matters here: it got past the signature gate and
    // still refused to invent an order out of the payload's own numbers.
    const { status } = await postWebhook(
      BASE,
      paymentIntentEvent(forgedIntent("pi_e2e_signed_but_unknown")),
      { secret: SECRET },
    );
    expect([200, 500]).toContain(status);

    const { data } = await admin()
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent", "pi_e2e_signed_but_unknown")
      .maybeSingle();
    expect(
      data,
      "a signed payload must still not create an order Stripe cannot confirm",
    ).toBeNull();
  });
});
