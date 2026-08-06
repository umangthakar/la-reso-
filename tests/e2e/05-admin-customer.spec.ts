// ============================================================
// TASK 7 — a recovered order is a NORMAL order.
//
// Recovery is only worth anything if the order it produces behaves like every
// other order: the owner sees it in the admin panel and can work it through
// the lifecycle, and the customer sees it in their history. An order that
// exists only as a database row nobody's screens can reach has not really been
// recovered.
// ============================================================

import { test, expect } from "@playwright/test";
import {
  admin,
  cleanup,
  deliverSucceeded,
  env,
  ordersByIntent,
  payWithoutSavingOrder,
} from "./helpers";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const created: string[] = [];

test.afterAll(async () => {
  const removed = await cleanup(created);
  if (removed.length) console.log("[cleanup]", removed.join("\n           "));
});

/** Sign in to the admin API and return the session cookie header. */
async function adminCookie(): Promise<string | null> {
  const e = env();
  if (!e.ADMIN_PASSWORD) return null;
  // ADMIN_EMAIL is an allowlist — one or more addresses, comma separated.
  // Sign in as the first of them.
  const email = (e.ADMIN_EMAIL ?? "").split(",")[0].trim() || "admin@example.com";
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: e.ADMIN_PASSWORD }),
  });
  if (!res.ok) return null;
  const setCookie = res.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : null;
}

test.describe("The owner's view of a recovered order", () => {
  test("it appears in the admin orders list and opens in the drawer", async () => {
    const cookie = await adminCookie();
    test.skip(!cookie, "ADMIN_PASSWORD not configured, or admin login refused");

    const { paymentIntentId } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);
    await deliverSucceeded(BASE, paymentIntentId);

    const [order] = await ordersByIntent(paymentIntentId);
    expect(order).toBeTruthy();

    // The list the owner actually looks at.
    const listRes = await fetch(`${BASE}/api/admin/orders`, { headers: { cookie: cookie! } });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { orders?: Array<{ id: string }> };
    const rows = list.orders ?? [];
    expect(
      rows.some((o) => String(o.id) === String(order.id)),
      "a recovered order must show up in the admin list like any other",
    ).toBe(true);

    // And the drawer's detail call, which carries the payment/refund fields.
    const detailRes = await fetch(`${BASE}/api/admin/orders/${order.id}`, {
      headers: { cookie: cookie! },
    });
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as { order?: { status: string; payment_status: string } };
    expect(detail.order?.payment_status).toBe("paid");
    // It arrives Pending, so the owner still approves it — recovery does not
    // skip the lifecycle.
    expect(detail.order?.status).toBe("pending");
  });

  test("the admin orders API refuses an unauthenticated caller", async () => {
    const res = await fetch(`${BASE}/api/admin/orders`);
    expect([401, 403]).toContain(res.status);
  });
});

test.describe("The customer's view of a recovered order", () => {
  test("it is scoped to their email, exactly as My Orders reads it", async () => {
    const { paymentIntentId } = await payWithoutSavingOrder(BASE);
    created.push(paymentIntentId);
    await deliverSucceeded(BASE, paymentIntentId);

    const [order] = await ordersByIntent(paymentIntentId);

    // /api/account/orders resolves the caller's verified email from the
    // Supabase session, then reads orders WHERE email = that address. Signing
    // a real customer in is out of scope for this suite, so the assertion is
    // on the query that endpoint performs: the recovered order must be
    // reachable by the customer's own email, or it will never appear for them.
    const { data } = await admin()
      .from("orders")
      .select("id, email, total, status")
      .eq("email", "e2e-recovery@example.com")
      .eq("id", order.id)
      .maybeSingle();

    expect(
      data,
      "the recovered order must carry the customer's email, or My Orders cannot find it",
    ).toBeTruthy();
  });

  test("the account orders API refuses an unauthenticated caller", async () => {
    const res = await fetch(`${BASE}/api/account/orders`);
    expect([401, 403]).toContain(res.status);
  });
});
