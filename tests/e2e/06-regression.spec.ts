// ============================================================
// TASK 8 — regression.
//
// The reliability work moved order creation into lib/order-create.ts and added
// a draft write to /api/checkout/create-intent. Both sit directly on the money
// path, so this file re-checks the behaviour around them that was already
// correct and must stay that way: pricing is still server-derived, size
// variants still price from the chosen size, the delivery gate still refuses
// out-of-area postcodes, and the storefront still renders.
// ============================================================

import { test, expect } from "@playwright/test";
import { admin, anyProduct, deliverablePostcode, draftFor } from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";

const futureDate = () => new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

/**
 * Intents this file creates but never pays for.
 *
 * Each one leaves a checkout draft behind — that is the feature working, not a
 * leak — but they hold (test) contact details, so the file clears its own
 * rather than waiting for the 7-day sweep.
 */
const abandoned: string[] = [];

test.afterAll(async () => {
  if (abandoned.length === 0) return;
  await admin().from("checkout_drafts").delete().in("payment_intent_id", abandoned);
});

async function createIntent(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/checkout/create-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await res.json()) as Record<string, unknown>;
  if (typeof parsed.clientSecret === "string") {
    abandoned.push(parsed.clientSecret.split("_secret_")[0]);
  }
  return { status: res.status, body: parsed };
}

async function baseIntentBody(items: unknown[]) {
  return {
    items,
    deliveryDate: futureDate(),
    postcode: await deliverablePostcode(),
    email: "e2e-regression@example.com",
    // Must satisfy the real name validator — digits are rejected, so no "E2E".
    name: "Rita Regression",
    phone: "07700900123",
    address: { line: "12 Baker Street", city: "London", postcode: await deliverablePostcode() },
  };
}

test.describe("Pricing is still derived on the server", () => {
  test("a client-supplied price is ignored", async () => {
    const product = await anyProduct();

    const honest = await createIntent(
      await baseIntentBody([{ id: product.id, productId: product.id, quantity: 1 }]),
    );
    expect(honest.status).toBe(200);

    // The same basket, with a price the client made up.
    const lying = await createIntent(
      await baseIntentBody([
        { id: product.id, productId: product.id, quantity: 1, price: 0.01, name: "Free cake" },
      ]),
    );
    expect(lying.status).toBe(200);

    expect(
      lying.body.subtotal,
      "the charged subtotal must come from the database, not the request",
    ).toBe(honest.body.subtotal);
    expect(Number(lying.body.subtotal)).toBeGreaterThan(0.01);
  });

  test("quantity still multiplies the real price", async () => {
    const product = await anyProduct();
    const one = await createIntent(
      await baseIntentBody([{ id: product.id, productId: product.id, quantity: 1 }]),
    );
    const three = await createIntent(
      await baseIntentBody([{ id: product.id, productId: product.id, quantity: 3 }]),
    );
    expect(Number(three.body.subtotal)).toBeCloseTo(Number(one.body.subtotal) * 3, 2);
  });

  test("size variants still price from the chosen size", async () => {
    // Sizes live in their own table (26_product_variants.sql), keyed by product.
    const { data: sizeRows } = await admin()
      .from("product_sizes")
      .select("id, product_id, price")
      .gt("price", 0)
      .limit(500);

    // A product with two DIFFERENTLY-priced sizes is what makes the assertion
    // meaningful — otherwise both intents would agree for the wrong reason.
    type Size = { id: string; price: number };
    const byProduct: Record<string, Size[]> = {};
    for (const row of sizeRows ?? []) {
      const key = String(row.product_id);
      (byProduct[key] ??= []).push({ id: String(row.id), price: Number(row.price) });
    }
    const candidate = Object.entries(byProduct).find(
      ([, sizes]) => new Set(sizes.map((s: Size) => s.price)).size > 1,
    );
    test.skip(!candidate, "no product with two differently-priced sizes on this deployment");

    const [productId, sizes] = candidate!;
    sizes.sort((a: Size, b: Size) => a.price - b.price);
    const cheapest = sizes[0];
    const dearest = sizes[sizes.length - 1];

    const small = await createIntent(
      await baseIntentBody([{ id: productId, productId, sizeId: cheapest.id, quantity: 1 }]),
    );
    const large = await createIntent(
      await baseIntentBody([{ id: productId, productId, sizeId: dearest.id, quantity: 1 }]),
    );

    expect(small.status).toBe(200);
    expect(large.status).toBe(200);
    expect(Number(small.body.subtotal)).toBeCloseTo(cheapest.price, 2);
    expect(Number(large.body.subtotal)).toBeCloseTo(dearest.price, 2);
    expect(Number(large.body.subtotal)).toBeGreaterThan(Number(small.body.subtotal));
  });
});

test.describe("The gates around checkout still hold", () => {
  test("an out-of-area postcode is still refused", async () => {
    const { data } = await admin().from("site_settings").select("delivery_zones").limit(1).maybeSingle();
    const zones = (data?.delivery_zones ?? []) as unknown[];
    test.skip(zones.length === 0, "no delivery zones configured, so the gate is off by design");

    const product = await anyProduct();
    const body = await baseIntentBody([{ id: product.id, productId: product.id, quantity: 1 }]);
    const { status } = await createIntent({ ...body, postcode: "ZZ99 9ZZ" });
    expect(status).toBe(400);
  });

  test("invalid contact details are still refused before a charge exists", async () => {
    const product = await anyProduct();
    const body = await baseIntentBody([{ id: product.id, productId: product.id, quantity: 1 }]);
    const { status } = await createIntent({ ...body, email: "not-an-email" });
    expect(status).toBe(400);
  });

  test("an empty basket is still refused", async () => {
    const { status } = await createIntent(await baseIntentBody([]));
    expect(status).toBe(400);
  });
});

test.describe("The draft write did not change the intent response", () => {
  test("create-intent still returns the client secret and the price breakdown", async () => {
    const product = await anyProduct();
    const { status, body } = await createIntent(
      await baseIntentBody([{ id: product.id, productId: product.id, quantity: 1 }]),
    );

    expect(status).toBe(200);
    expect(typeof body.clientSecret).toBe("string");
    expect(typeof body.subtotal).toBe("number");
    expect(typeof body.deliveryFee).toBe("number");
    expect(typeof body.total).toBe("number");

    // …and it now also leaves the draft the webhook would need.
    const paymentIntentId = String(body.clientSecret).split("_secret_")[0];
    expect(await draftFor(paymentIntentId)).toBeTruthy();
    await admin().from("checkout_drafts").delete().eq("payment_intent_id", paymentIntentId);
  });
});

test.describe("The storefront still renders", () => {
  // The basket is a drawer, not a route, so there is no /cart to load.
  for (const path of ["/", "/menu", "/checkout", "/account"]) {
    test(`${path} loads without a server error`, async ({ page }) => {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} should not 5xx`).toBeLessThan(400);
    });
  }

  test("the categories API still responds", async () => {
    const res = await fetch(`${BASE}/api/categories`);
    expect(res.status).toBe(200);
  });
});
