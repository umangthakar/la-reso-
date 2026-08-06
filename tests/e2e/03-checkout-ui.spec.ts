// ============================================================
// TASK 7 — the real browser.
//
// Everything else in this suite talks to the API. These tests drive Chromium
// through the actual checkout — the real cart, the real Stripe Elements iframe,
// a real test card — because the failure this work exists to prevent happens in
// a browser, and only a browser can produce it faithfully.
//
// The important test here is the last one: the tab is DESTROYED in the window
// between Stripe capturing the money and the app saving the order. Before this
// work that was an unrecoverable lost order.
// ============================================================

import { test, expect, type Frame, type Page } from "@playwright/test";
import { slugify } from "../../lib/slug";
import {
  TEST_CUSTOMER,
  admin,
  anyProduct,
  cleanup,
  deliverSucceeded,
  deliverablePostcode,
  ensureTestCustomer,
  ordersByIntent,
  removeTestCustomer,
} from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const created: string[] = [];

test.beforeAll(async () => {
  await ensureTestCustomer();
});

test.afterAll(async () => {
  const removed = await cleanup(created);
  if (removed.length) console.log("[cleanup]", removed.join("\n           "));
  // A run that failed part-way can leave a draft for an intent it never paid,
  // and those hold contact details — clear this customer's outright.
  await admin()
    .from("checkout_drafts")
    .delete()
    .eq("payload->customer->>email", "e2e-browser-ui@example.com");
  await removeTestCustomer();
});

/**
 * Get the cookie banner out of the way.
 *
 * It renders over the page and swallows clicks, exactly as it does for a real
 * first-time visitor — so accepting it is part of the flow, not a workaround.
 */
async function acceptCookies(page: Page) {
  const accept = page.getByRole("button", { name: /accept all/i });
  if (await accept.count()) {
    await accept.first().click();
    await expect(accept.first()).toBeHidden({ timeout: 15_000 });
  }
}

/** Sign in — /checkout is behind the account gate. */
async function signIn(page: Page) {
  await page.goto(`${BASE}/account/login?next=%2Fcheckout`, { waitUntil: "domcontentloaded" });
  await acceptCookies(page);
  await page.fill("#email", TEST_CUSTOMER.email);
  await page.fill("#password", TEST_CUSTOMER.password);
  await page.getByRole("button", { name: /^login$/i }).click();
  // The gate sends us on to checkout once the session exists.
  await page.waitForURL((url) => !url.pathname.startsWith("/account/login"), {
    timeout: 60_000,
  });
}

/**
 * Put one real product in the cart via its product page.
 *
 * Products have no slug column — the storefront derives the URL from the name
 * with lib/slug#slugify, so the test uses the very same function rather than
 * guessing at the format.
 */
async function addToCart(page: Page) {
  const product = await anyProduct();
  await page.goto(`${BASE}/menu/${slugify(product.name)}`, { waitUntil: "domcontentloaded" });
  await acceptCookies(page);

  // The detail view is client-rendered, so wait for it rather than racing it.
  const add = page.getByRole("button", { name: /add to (cart|basket)/i }).first();
  await add.waitFor({ state: "visible", timeout: 60_000 });
  await add.click();

  // The cart is persisted to localStorage; don't navigate until it has landed.
  await expect
    .poll(
      async () => page.evaluate(() => JSON.parse(localStorage.getItem("lerasa_cart") ?? "[]").length),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);

  return product;
}

/** Walk steps 1–3 of checkout and land on the payment step. */
async function fillCheckout(page: Page) {
  const postcode = await deliverablePostcode();
  const deliveryDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  await page.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded" });
  await acceptCookies(page);

  await page.waitForSelector("#name", { timeout: 60_000 });
  // Digits are rejected by the real name validator, so no "E2E" in the name.
  await page.fill("#name", "Bella Browser");
  await page.fill("#email", "e2e-browser-ui@example.com");
  await page.fill("#phone", "07700900123");
  await page.getByRole("button", { name: /continue/i }).first().click();

  await page.fill("#address", "12 Baker Street");
  await page.fill("#city", "London");
  await page.fill("#postcode", postcode);
  await page.fill("#deliveryDate", deliveryDate);
  await page.getByRole("button", { name: /continue/i }).first().click();

  // Review → "Go to payment" creates the PaymentIntent and mounts Stripe
  // Elements. This is the click that takes the customer past the point of no
  // return, so the tests below hang everything off it.
  await page.getByRole("button", { name: /go to payment/i }).click();

  await cardFrame(page);
}

/**
 * The Stripe frame that actually holds the card inputs.
 *
 * PaymentElement nests several frames and the one carrying the fields has no
 * title of its own, so it is found by its CONTENT — the field Stripe names
 * `number` — rather than by a title or URL fragment that is Stripe's to change.
 */
async function cardFrame(page: Page): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const hit = await frame
            .locator('input[name="number"]')
            .count()
            .catch(() => 0);
          if (hit > 0) {
            found = frame;
            return true;
          }
        }
        return false;
      },
      { timeout: 60_000, message: "Stripe's card fields never mounted" },
    )
    .toBe(true);
  return found!;
}

/** Type the Stripe test card into the PaymentElement iframe. */
async function fillCard(page: Page) {
  const frame = await cardFrame(page);
  await frame.fill('input[name="number"]', "4242424242424242");
  await frame.fill('input[name="expiry"]', `12${String(new Date().getFullYear() + 3).slice(2)}`);
  await frame.fill('input[name="cvc"]', "123");
  const postal = frame.locator('input[name="postalCode"]');
  if (await postal.count()) await postal.fill("HA1 1AA");
}

/** Capture the PaymentIntent id the page is paying, from its client secret. */
function watchIntentId(page: Page): { get(): string | null } {
  let id: string | null = null;
  page.on("response", async (res) => {
    if (!res.url().includes("/api/checkout/create-intent")) return;
    try {
      const body = (await res.json()) as { clientSecret?: string };
      if (body.clientSecret) id = body.clientSecret.split("_secret_")[0];
    } catch {
      /* not JSON — ignore */
    }
  });
  return { get: () => id };
}

test.describe("Checkout in a real browser", () => {
  test("a customer can pay and lands on their confirmation", async ({ page }) => {
    await signIn(page);
    await addToCart(page);
    const intent = watchIntentId(page);
    await fillCheckout(page);
    await fillCard(page);

    await page.getByRole("button", { name: /^pay/i }).click();
    await page.waitForURL(/\/order-confirmation\//, { timeout: 90_000 });

    const paymentIntentId = intent.get();
    expect(paymentIntentId, "the page should have created a PaymentIntent").toBeTruthy();
    created.push(paymentIntentId!);

    // The browser path did its job: one order, no recovery banner.
    const orders = await ordersByIntent(paymentIntentId!);
    expect(orders).toHaveLength(1);
    expect(orders[0].payment_status).toBe("paid");
    expect(String(orders[0].message ?? "")).not.toContain("RECOVERED AUTOMATICALLY");
  });

  test("refreshing mid-checkout keeps the cart and the customer can still pay", async ({ page }) => {
    await signIn(page);
    await addToCart(page);
    await page.goto(`${BASE}/checkout`, { waitUntil: "domcontentloaded" });
    await acceptCookies(page);

    await page.waitForSelector("#name", { timeout: 60_000 });
    await page.fill("#name", "Rosa Refresh");
    await page.fill("#email", "e2e-refresh@example.com");
    await page.fill("#phone", "07700900123");

    // The moment a customer reaches for F5.
    await page.reload({ waitUntil: "domcontentloaded" });

    // The basket survives (it is persisted by the cart context) — the customer
    // is not dumped back onto an empty checkout having lost their order.
    await expect(page.locator("#name")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /continue/i }).first()).toBeVisible();

    const intent = watchIntentId(page);
    await fillCheckout(page);
    await fillCard(page);
    await page.getByRole("button", { name: /^pay/i }).click();
    await page.waitForURL(/\/order-confirmation\//, { timeout: 90_000 });

    const paymentIntentId = intent.get();
    expect(paymentIntentId).toBeTruthy();
    created.push(paymentIntentId!);
    expect(await ordersByIntent(paymentIntentId!)).toHaveLength(1);
  });

  test("THE CRASH: the tab dies after the card is charged — the order is still recovered", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await signIn(page);
    await addToCart(page);
    const intent = watchIntentId(page);
    await fillCheckout(page);

    // Sever the one call the browser makes AFTER the money is taken. This is
    // precisely what a closed laptop, a dead mobile signal or a renderer crash
    // does — Stripe has the payment, the app never hears about it.
    await page.route("**/api/orders/create", (route) => route.abort("failed"));

    await fillCard(page);
    await page.getByRole("button", { name: /^pay/i }).click();

    // Wait for Stripe to actually capture, then kill the browser context
    // outright. Nothing this tab could still do can save the order now.
    await page.waitForTimeout(12_000);
    const paymentIntentId = intent.get();
    expect(paymentIntentId, "the payment should have been created").toBeTruthy();
    created.push(paymentIntentId!);
    await context.close();

    // The money is gone and there is no order. This is the state that used to
    // be permanent.
    expect(
      await ordersByIntent(paymentIntentId!),
      "precondition: the dead tab left no order behind",
    ).toHaveLength(0);

    // Stripe now tells the server directly, as it does in production.
    const { status } = await deliverSucceeded(BASE, paymentIntentId!);
    expect(status).toBe(200);

    const orders = await ordersByIntent(paymentIntentId!);
    expect(orders, "the webhook must have saved the order the tab could not").toHaveLength(1);
    expect(orders[0].payment_status).toBe("paid");
    expect(String(orders[0].message ?? "")).toContain("RECOVERED AUTOMATICALLY");
  });
});
