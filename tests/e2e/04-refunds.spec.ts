// ============================================================
// TASK 5 — refunds.
//
// The refund SYSTEM is not under test here and has not been touched: the admin
// panel still issues refunds through the same cancelAndRefund path it always
// did. What is under test is the webhook's narrow new job — noticing refunds
// that happened at Stripe and writing that fact onto the order.
//
// That matters for one case the app previously could not see at all: a refund
// issued straight from the Stripe dashboard. The money leaves the account and
// nothing in the database ever knew.
// ============================================================

import { test, expect } from "@playwright/test";
import {
  cleanup,
  deliverEvent,
  deliverSucceeded,
  ordersByIntent,
  payWithoutSavingOrder,
  stripeClient,
} from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const created: string[] = [];

test.afterAll(async () => {
  const removed = await cleanup(created);
  if (removed.length) console.log("[cleanup]", removed.join("\n           "));
});

/** An order that exists and is paid — the starting point for every case here. */
async function paidOrder() {
  const { paymentIntentId } = await payWithoutSavingOrder(BASE);
  created.push(paymentIntentId);
  await deliverSucceeded(BASE, paymentIntentId);
  const [order] = await ordersByIntent(paymentIntentId);
  expect(order, "setup: the order should exist").toBeTruthy();
  expect(order.payment_status).toBe("paid");
  return { paymentIntentId, order };
}

test.describe("Refund events update the order", () => {
  test("a REAL Stripe refund reported by charge.refunded marks the order refunded", async () => {
    const { paymentIntentId } = await paidOrder();

    // Refund at Stripe exactly as the dashboard would — outside the app.
    const stripe = await stripeClient();
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
    expect(refund.status).toBe("succeeded");

    const charges = await stripe.charges.list({ payment_intent: paymentIntentId, limit: 1 });
    const charge = charges.data[0];
    expect(charge, "the payment should have a charge").toBeTruthy();

    const { status } = await deliverEvent(BASE, "charge.refunded", charge);
    expect(status).toBe(200);

    const [after] = await ordersByIntent(paymentIntentId);
    expect(after.payment_status).toBe("refunded");
    expect(after.refund_id, "the Stripe refund id is recorded").toBeTruthy();
    expect(after.refunded_at).toBeTruthy();
  });

  test("refund.updated → succeeded marks the order refunded", async () => {
    const { paymentIntentId } = await paidOrder();

    const stripe = await stripeClient();
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });

    const { status } = await deliverEvent(BASE, "refund.updated", refund);
    expect(status).toBe(200);

    const [after] = await ordersByIntent(paymentIntentId);
    expect(after.payment_status).toBe("refunded");
    expect(String(after.refund_id)).toBe(refund.id);
  });

  test("a failed refund is recorded as pending so the admin can retry", async () => {
    const { paymentIntentId } = await paidOrder();

    // Stripe will not fail a test refund on demand, so the FAILED event is
    // synthesised. The signature is genuine; only the outcome is contrived.
    const { status } = await deliverEvent(BASE, "refund.updated", {
      id: `re_e2e_failed_${Date.now()}`,
      object: "refund",
      payment_intent: paymentIntentId,
      status: "failed",
      failure_reason: "expired_or_canceled_card",
    });
    expect(status).toBe(200);

    const [after] = await ordersByIntent(paymentIntentId);
    expect(after.payment_status).toBe("refund_pending");
  });

  test("a refund event never DOWNGRADES a refund the app already completed", async () => {
    const { paymentIntentId } = await paidOrder();

    const stripe = await stripeClient();
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
    await deliverEvent(BASE, "refund.updated", refund);

    const [refunded] = await ordersByIntent(paymentIntentId);
    expect(refunded.payment_status).toBe("refunded");

    // A late 'failed' event for the same payment must not undo a completed
    // refund — otherwise a retry storm could flip a settled order backwards.
    await deliverEvent(BASE, "refund.updated", {
      id: `re_e2e_late_${Date.now()}`,
      object: "refund",
      payment_intent: paymentIntentId,
      status: "failed",
      failure_reason: "a late failure for an already-refunded payment",
    });

    const [after] = await ordersByIntent(paymentIntentId);
    expect(after.payment_status).toBe("refunded");
    expect(String(after.refund_id)).toBe(refund.id);
  });

  test("a refund for a payment we have no order for is ignored, not invented", async () => {
    const { status } = await deliverEvent(BASE, "charge.refunded", {
      id: "ch_e2e_unknown",
      object: "charge",
      payment_intent: "pi_e2e_no_such_order",
      refunds: { data: [{ id: "re_e2e_unknown" }] },
    });
    expect(status).toBe(200);

    expect(await ordersByIntent("pi_e2e_no_such_order")).toHaveLength(0);
  });
});
