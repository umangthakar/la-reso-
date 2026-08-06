// ============================================================
// ORDER EMAILS — triggers, duplicate protection, and what the customer reads.
//
// These drive lib/order-email.ts directly against a FAKE Supabase client and a
// stubbed fetch, because the properties that matter cannot be observed from
// the outside:
//
//   • an email goes out EXACTLY ONCE per order per type, however many times
//     the trigger fires (a retried admin request, two overlapping auto-cancel
//     sweeps, the browser and the Stripe webhook writing the same order);
//   • a send that genuinely FAILED can be retried, and a send that succeeded
//     never can;
//   • a send failure NEVER throws into the caller — checkout, the admin panel
//     and the refund path have all already committed by the time we email;
//   • the customer never sees the internal ⚠️/ℹ️ annotations the order-create
//     path writes onto special_instructions for the baker.
//
// No live services: the fake client is the ledger, so the test can assert on
// exactly what was claimed and what was sent.
// ============================================================

import { test, expect } from "@playwright/test";
// MUST come before lib/order-email — it and its imports are server-only.
import "./allow-server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sendOrderPlacedEmail,
  sendOrderAcceptedEmail,
  sendOrderCancelledEmail,
  sendOrderRefundedEmail,
} from "../../lib/order-email";

// ------------------------------------------------------------
// The fake Supabase client. Supports exactly the query shapes
// lib/order-email builds, and nothing else.
// ------------------------------------------------------------

type LedgerRow = {
  order_id: string;
  email_type: string;
  recipient: string;
  status: string;
  error: string | null;
  attempts: number;
};

const ORDER_ID = "11112222-3333-4444-5555-666677778888";

type FakeOptions = {
  /** Simulate a database where supabase/sql/45 hasn't been run. */
  ledgerMissing?: boolean;
  /** Override fields on the orders row. */
  order?: Record<string, unknown>;
  /** Line items to return. */
  items?: Record<string, unknown>[];
};

class Fake {
  ledger = new Map<string, LedgerRow>();
  opts: FakeOptions;

  constructor(opts: FakeOptions = {}) {
    this.opts = opts;
  }

  private orderRow(): Record<string, unknown> {
    return {
      id: ORDER_ID,
      customer_name: "Priya Sharma",
      email: "priya@example.com",
      phone: "+447700900456",
      created_at: "2026-08-06T13:03:00.000Z",
      delivery_date: "2026-08-12",
      delivery_address: "42 Rose Lane, Manchester",
      postcode: "M14 5TP",
      subtotal: 122,
      delivery_charge: 5.5,
      discount_amount: 10,
      total: 117.5,
      amount: 117.5,
      status: "pending",
      payment_status: "paid",
      payment_method: "stripe",
      special_instructions:
        "Please ring the bell twice.\n\n⚠️ ITEMS COULD NOT BE VERIFIED — the basket did not re-price.\n\nℹ️ RECOVERED AUTOMATICALLY from the Stripe webhook.",
      ...(this.opts.order ?? {}),
    };
  }

  private itemRows(): Record<string, unknown>[] {
    return (
      this.opts.items ?? [
        {
          order_id: ORDER_ID,
          product_id: "prod-1",
          product_name: "Belgian Chocolate Truffle Cake — 8 inch",
          unit_price: 54,
          quantity: 1,
          line_total: 63,
          addons_total: 9,
          customization: {
            lines: [{ key: "c", label: "Candles", value: "Sparkler", quantity: 2, price: 6 }],
          },
        },
      ]
    );
  }

  from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const filters: Record<string, unknown> = {};
    let op: "select" | "insert" | "update" = "select";
    let payload: Record<string, unknown> = {};

    const missing = { code: "42P01", message: 'relation "order_email_log" does not exist' };
    const key = () => `${filters.order_id}|${filters.email_type}`;

    function resolve(): { data: unknown; error: unknown } {
      if (table === "order_email_log") {
        if (self.opts.ledgerMissing) return { data: null, error: missing };

        if (op === "insert") {
          const k = `${payload.order_id}|${payload.email_type}`;
          if (self.ledger.has(k)) {
            return { data: null, error: { code: "23505", message: "duplicate key value" } };
          }
          self.ledger.set(k, {
            order_id: String(payload.order_id),
            email_type: String(payload.email_type),
            recipient: String(payload.recipient ?? ""),
            status: String(payload.status ?? "pending"),
            error: null,
            attempts: 1,
          });
          return { data: null, error: null };
        }

        const row = self.ledger.get(key());
        if (op === "select") return { data: row ?? null, error: null };

        // update — honour the conditional `status` guard when present.
        if (!row) return { data: [], error: null };
        if (filters.status !== undefined && row.status !== filters.status) {
          return { data: [], error: null };
        }
        Object.assign(row, payload);
        return { data: [{ order_id: row.order_id }], error: null };
      }

      if (table === "orders") return { data: self.orderRow(), error: null };
      if (table === "order_items") return { data: self.itemRows(), error: null };
      if (table === "products") {
        return { data: [{ id: "prod-1", image_url: "https://cdn.example.com/cake.jpg" }], error: null };
      }
      // site_settings — no admin-configured Resend, so the env client is used.
      if (table === "site_settings") return { data: { notification_config: {} }, error: null };
      return { data: null, error: null };
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (v: Record<string, unknown>) => {
        op = "insert";
        payload = v;
        return builder;
      },
      update: (v: Record<string, unknown>) => {
        op = "update";
        payload = v;
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      in: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(resolve()),
      then: (onOk: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onOk),
    };
    return builder;
  }
}

function fakeClient(opts: FakeOptions = {}): { client: SupabaseClient; fake: Fake } {
  const fake = new Fake(opts);
  return { client: fake as unknown as SupabaseClient, fake };
}

// ------------------------------------------------------------
// Transport stub — captures what would have gone to Resend.
// ------------------------------------------------------------

type Sent = { to: string; subject: string; html: string };

let sent: Sent[] = [];
let failNextSends = 0;
let realFetch: typeof globalThis.fetch;
let savedKey: string | undefined;

test.beforeEach(() => {
  sent = [];
  failNextSends = 0;
  savedKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_key_for_the_order_email_suite";
  realFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api.resend.com")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (failNextSends > 0) {
        failNextSends -= 1;
        return new Response("provider is down", { status: 503 });
      }
      sent.push({ to: body.to?.[0] ?? "", subject: body.subject, html: body.html });
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }
    // Site settings (brand) — no row, so the built-in brand defaults apply.
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  if (savedKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedKey;
});

// ------------------------------------------------------------
// 1. Each email sends once, with real order data.
// ------------------------------------------------------------

test("order confirmation carries the saved order, not a hardcoded stub", async () => {
  const { client } = fakeClient();

  const result = await sendOrderPlacedEmail(client, ORDER_ID);

  expect(result.status).toBe("sent");
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe("priya@example.com");
  expect(sent[0].subject).toBe("Order Confirmed — Thank you for your order!");

  const html = sent[0].html;
  // Order number derived from the id exactly as everywhere else.
  expect(html).toContain("11112222".toUpperCase());
  expect(html).toContain("Priya Sharma");
  expect(html).toContain("42 Rose Lane");
  expect(html).toContain("M14 5TP");
  // The size suffix is split out of the product name into its own field.
  expect(html).toContain("Belgian Chocolate Truffle Cake");
  expect(html).toContain("8 inch");
  // Accessories, money and the pending status all come from the row.
  expect(html).toContain("Sparkler");
  expect(html).toContain("£117.50");
  expect(html).toContain("Pending");
});

test("the customer never reads the internal baker annotations", async () => {
  const { client } = fakeClient();

  await sendOrderPlacedEmail(client, ORDER_ID);

  const html = sent[0].html;
  expect(html).toContain("Please ring the bell twice.");
  expect(html).not.toContain("ITEMS COULD NOT BE VERIFIED");
  expect(html).not.toContain("RECOVERED AUTOMATICALLY");
});

test("accepted, cancelled and refunded each send their own email", async () => {
  const { client } = fakeClient();

  const accepted = await sendOrderAcceptedEmail(client, ORDER_ID);
  const cancelled = await sendOrderCancelledEmail(client, ORDER_ID, {
    by: "auto",
    refundState: "refunded",
  });
  const refunded = await sendOrderRefundedEmail(client, ORDER_ID);

  expect([accepted.status, cancelled.status, refunded.status]).toEqual(["sent", "sent", "sent"]);
  expect(sent.map((s) => s.subject)).toEqual([
    "Your Order Has Been Accepted!",
    "Your Order Has Been Cancelled",
    "Your Refund Has Been Processed",
  ]);

  // The cancellation states the refund honestly, and names the auto-cancel
  // reason rather than implying the customer asked for it.
  expect(sent[1].html).toContain("Refunded");
  expect(sent[1].html).toContain("Not confirmed by our bakery in time");
  // The refund email leads with the amount and the processing window.
  expect(sent[2].html).toContain("£117.50");
  expect(sent[2].html).toContain("5–10 business days");
});

test("a cancellation whose refund failed does not promise the money is on its way", async () => {
  const { client } = fakeClient();

  await sendOrderCancelledEmail(client, ORDER_ID, {
    by: "admin",
    refundState: "refund_pending",
  });

  expect(sent[0].html).toContain("Refund in progress");
  expect(sent[0].html).toContain("Cancelled by our bakery");
});

// ------------------------------------------------------------
// 2. Duplicate protection.
// ------------------------------------------------------------

test("the same trigger firing twice sends one email", async () => {
  const { client } = fakeClient();

  const first = await sendOrderAcceptedEmail(client, ORDER_ID);
  const second = await sendOrderAcceptedEmail(client, ORDER_ID);

  expect(first.status).toBe("sent");
  expect(second.status).toBe("duplicate");
  expect(sent).toHaveLength(1);
});

test("concurrent triggers on one order still send one email", async () => {
  const { client } = fakeClient();

  const results = await Promise.all([
    sendOrderPlacedEmail(client, ORDER_ID),
    sendOrderPlacedEmail(client, ORDER_ID),
    sendOrderPlacedEmail(client, ORDER_ID),
  ]);

  expect(results.filter((r) => r.status === "sent")).toHaveLength(1);
  expect(results.filter((r) => r.status === "duplicate")).toHaveLength(2);
  expect(sent).toHaveLength(1);
});

test("the four types are tracked independently", async () => {
  const { client, fake } = fakeClient();

  await sendOrderPlacedEmail(client, ORDER_ID);
  await sendOrderAcceptedEmail(client, ORDER_ID);
  await sendOrderCancelledEmail(client, ORDER_ID, { by: "customer", refundState: "refunded" });
  await sendOrderRefundedEmail(client, ORDER_ID);

  expect(sent).toHaveLength(4);
  expect(Array.from(fake.ledger.values()).map((r) => r.email_type).sort()).toEqual([
    "order_accepted",
    "order_cancelled",
    "order_placed",
    "order_refunded",
  ]);
  expect(Array.from(fake.ledger.values()).every((r) => r.status === "sent")).toBe(true);
});

// ------------------------------------------------------------
// 3. Failure handling.
// ------------------------------------------------------------

test("a failed send is recorded as failed and can be retried exactly once more", async () => {
  const { client, fake } = fakeClient();
  failNextSends = 1;

  const first = await sendOrderPlacedEmail(client, ORDER_ID);
  expect(first.status).toBe("failed");
  expect(sent).toHaveLength(0);
  expect(fake.ledger.get(`${ORDER_ID}|order_placed`)?.status).toBe("failed");

  // The retry is allowed, because nothing was ever delivered.
  const retry = await sendOrderPlacedEmail(client, ORDER_ID);
  expect(retry.status).toBe("sent");
  expect(sent).toHaveLength(1);

  // And once it HAS been delivered, no further attempt can duplicate it.
  const third = await sendOrderPlacedEmail(client, ORDER_ID);
  expect(third.status).toBe("duplicate");
  expect(sent).toHaveLength(1);
});

test("an order with no email address is skipped, not attempted", async () => {
  const { client } = fakeClient({ order: { email: "" } });

  const result = await sendOrderPlacedEmail(client, ORDER_ID);

  expect(result.status).toBe("skipped");
  expect(sent).toHaveLength(0);
});

test("a provider failure never throws into the caller", async () => {
  const { client } = fakeClient();
  failNextSends = 5;

  // Every one of these runs after money has moved — none may reject.
  await expect(sendOrderPlacedEmail(client, ORDER_ID)).resolves.toMatchObject({ status: "failed" });
  await expect(
    sendOrderCancelledEmail(client, ORDER_ID, { by: "auto", refundState: "refunded" }),
  ).resolves.toMatchObject({ status: "failed" });
  await expect(sendOrderRefundedEmail(client, ORDER_ID)).resolves.toMatchObject({
    status: "failed",
  });
});

test("a missing ledger table degrades instead of blocking the email", async () => {
  const { client } = fakeClient({ ledgerMissing: true });

  const first = await sendOrderPlacedEmail(client, ORDER_ID);
  const second = await sendOrderPlacedEmail(client, ORDER_ID);

  // The email still goes out (an unmigrated database must not silence the
  // customer), and the in-process guard still catches the immediate repeat.
  expect(first.status).toBe("sent");
  expect(second.status).toBe("duplicate");
  expect(sent).toHaveLength(1);
});
