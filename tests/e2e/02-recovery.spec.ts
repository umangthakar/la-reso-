// ============================================================
// TASKS 3 & 4 — order recovery and idempotency.
//
// This is the heart of the suite. Every test here starts with a REAL Stripe
// test-mode payment that genuinely succeeded, created through the app's own
// /api/checkout/create-intent so the server wrote the same metadata and
// checkout draft a customer would have produced.
//
// What none of them do is call /api/orders/create. That call is the browser's
// job, and the whole point of the webhook is that it is the one step a closed
// tab, a dead connection or a crashed renderer never reaches.
// ============================================================

import { test, expect } from "@playwright/test";
import {
  cleanup,
  deliverSucceeded,
  draftFor,
  itemsForOrder,
  ordersByIntent,
  payWithoutSavingOrder,
  webhookEvent,
} from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";

/** Every intent this file pays for, so the run cleans up after itself. */
const created: string[] = [];

test.afterAll(async () => {
  const removed = await cleanup(created);
  if (removed.length) console.log("[cleanup]", removed.join("\n           "));
});

test.describe("Order recovery", () => {
  test("a succeeded payment the browser never saved is recovered in full", async () => {
    const { paymentIntentId, total } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);

    // The money is taken and nothing has been written — the exact state a
    // customer is left in when their tab dies on the confirmation redirect.
    expect(
      await ordersByIntent(paymentIntentId),
      "precondition: no order exists yet",
    ).toHaveLength(0);

    const { status } = await deliverSucceeded(BASE, paymentIntentId);
    expect(status).toBe(200);

    const orders = await ordersByIntent(paymentIntentId);
    expect(orders, "the webhook must have created the order").toHaveLength(1);

    const order = orders[0];
    // The amount is Stripe's, not the payload's.
    expect(Number(order.total)).toBeCloseTo(total, 2);
    expect(order.payment_status).toBe("paid");
    // Recovered orders still enter the normal owner-approval lifecycle.
    expect(order.status).toBe("pending");
    // …and they say so, on the field the baker already reads.
    expect(String(order.message ?? "")).toContain("RECOVERED AUTOMATICALLY");
  });

  test("the recovered order carries the real basket, not a stub", async () => {
    const { paymentIntentId, product } = await payWithoutSavingOrder(BASE, { quantity: 2 });
    created.push(paymentIntentId);

    await deliverSucceeded(BASE, paymentIntentId);

    const [order] = await ordersByIntent(paymentIntentId);
    expect(order).toBeTruthy();

    // This is what the checkout draft buys us: the baker gets the actual cake
    // and quantity, priced from the database, rather than an amount with no
    // idea what was ordered.
    const items = await itemsForOrder(String(order.id));
    expect(items, "line items must be recovered from the checkout draft").toHaveLength(1);
    expect(String(items[0].product_id)).toBe(product.id);
    expect(Number(items[0].quantity)).toBe(2);
    expect(String(order.message ?? "")).not.toContain("ITEMS COULD NOT BE VERIFIED");
  });

  test("the draft is deleted once the order exists — no lingering copy of the PII", async () => {
    const { paymentIntentId } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);

    expect(await draftFor(paymentIntentId), "the draft is written at intent creation").toBeTruthy();

    await deliverSucceeded(BASE, paymentIntentId);

    expect(
      await draftFor(paymentIntentId),
      "the order row now holds these details, so the draft must be gone",
    ).toBeNull();
  });
});

test.describe("Idempotency — a payment can only ever produce ONE order", () => {
  test("the same webhook event delivered twice creates one order", async () => {
    const { paymentIntentId } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);

    // Stripe delivers at-least-once and retries for days; the identical event
    // id arriving again is routine, not an attack.
    const first = await deliverSucceeded(BASE, paymentIntentId);
    expect(first.status).toBe(200);

    const replay = await deliverSucceeded(BASE, paymentIntentId, first.eventId);
    expect(replay.status).toBe(200);
    expect(replay.body, "the replay must be recognised as a duplicate").toContain("duplicate");

    expect(await ordersByIntent(paymentIntentId)).toHaveLength(1);
  });

  test("a finished event is tombstoned with handled_at", async () => {
    const { paymentIntentId } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);

    const { eventId } = await deliverSucceeded(BASE, paymentIntentId);
    const row = await webhookEvent(eventId);

    expect(row, "the event must be in the ledger").toBeTruthy();
    expect(
      row!.handled_at,
      "handled_at is what makes the row a tombstone — set only after the " +
        "handler completed, so a process killed mid-flight leaves it null and " +
        "Stripe's retry is handled rather than dismissed",
    ).not.toBeNull();
  });

  test("DIFFERENT event ids for the same payment still create only one order", async () => {
    const { paymentIntentId } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);

    // The event ledger cannot help here — these are genuinely distinct events.
    // Only the per-PaymentIntent idempotency in order creation can stop this,
    // which is the guarantee that actually matters.
    const a = await deliverSucceeded(BASE, paymentIntentId);
    const b = await deliverSucceeded(BASE, paymentIntentId);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.eventId).not.toBe(b.eventId);

    expect(await ordersByIntent(paymentIntentId)).toHaveLength(1);
  });

  test("a webhook arriving AFTER the browser saved the order changes nothing", async () => {
    const { paymentIntentId, product } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);

    // The normal path: the browser gets there first.
    const res = await fetch(`${BASE}/api/orders/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentIntentId,
        customer: { name: "Browser Won", email: "e2e-browser@example.com", phone: "07700900123" },
        address: { line: "12 Baker Street", city: "London", postcode: "HA1 1AA" },
        deliveryDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        items: [{ id: product.id, productId: product.id, quantity: 1 }],
      }),
    });
    expect(res.status).toBe(200);
    const { orderId } = (await res.json()) as { orderId: string };

    // Then the webhook lands, as it always does.
    const { status } = await deliverSucceeded(BASE, paymentIntentId);
    expect(status).toBe(200);

    const orders = await ordersByIntent(paymentIntentId);
    expect(orders).toHaveLength(1);
    expect(String(orders[0].id)).toBe(orderId);
    // The browser's order is untouched — no recovery banner was bolted on.
    expect(String(orders[0].message ?? "")).not.toContain("RECOVERED AUTOMATICALLY");
  });

  test("the browser calling create AFTER the webhook recovered adopts the same order", async () => {
    const { paymentIntentId, product } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);

    // The reverse race: the tab comes back to life after the webhook already
    // recovered. It must not produce a second order for the same money.
    await deliverSucceeded(BASE, paymentIntentId);
    const [recovered] = await ordersByIntent(paymentIntentId);
    expect(recovered).toBeTruthy();

    const res = await fetch(`${BASE}/api/orders/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentIntentId,
        customer: { name: "Late Browser", email: "e2e-late@example.com", phone: "07700900123" },
        address: { line: "12 Baker Street", city: "London", postcode: "HA1 1AA" },
        items: [{ id: product.id, productId: product.id, quantity: 1 }],
      }),
    });
    expect(res.status).toBe(200);
    const { orderId } = (await res.json()) as { orderId: string };

    expect(String(orderId)).toBe(String(recovered.id));
    expect(await ordersByIntent(paymentIntentId)).toHaveLength(1);
  });
});
