// ============================================================
// Shared helpers for the Stripe reliability suite.
//
// Everything here talks to the SAME services the app does — real Stripe test
// mode, the real Supabase project — because the point of the suite is to prove
// the production wiring, not a mock of it.
//
// Rows created by the suite are tagged (E2E_TAG) so cleanup can find and
// delete exactly what the tests made and nothing else.
// ============================================================

import { readFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";

const ROOT = path.resolve(__dirname, "..", "..");

/** Marks every row this suite creates, so cleanup can be exact. */
export const E2E_TAG = "E2E-STRIPE-RELIABILITY";

/** Read .env by hand — the suite runs outside Next's env loading. */
export function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const file of [".env", ".env.local"]) {
    let raw = "";
    try {
      raw = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  // A value exported into the process wins, so the test runner can override.
  for (const k of Object.keys(out)) {
    if (process.env[k]) out[k] = process.env[k]!;
  }
  return out;
}

/** Service-role Supabase client (Node 20 needs the ws transport). */
export function admin(): SupabaseClient {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    // Same cast lib/supabase/server.ts uses: Node 20 has no global WebSocket,
    // so supabase-js needs the `ws` implementation handed to it, and the two
    // constructor signatures don't line up in the type system.
    realtime: { transport: ws as unknown as never },
  });
}

/**
 * Stripe client using the SAME key the server will use: the admin-panel config
 * on site_settings wins, the env var is the fallback — mirroring lib/stripe.ts.
 * Without this the suite could create intents on a different account than the
 * app reads them from.
 */
export async function stripeClient(): Promise<Stripe> {
  const e = env();
  const supabase = admin();
  const { data } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
  const enc = (data as { stripe_config?: { secret_key_enc?: string } } | null)
    ?.stripe_config?.secret_key_enc;

  let secret = e.STRIPE_SECRET_KEY ?? "";
  if (enc) {
    // Same scheme as lib/crypto.ts: AES-256-GCM, scrypt-derived key, primary
    // then legacy secret.
    const { createDecipheriv, scryptSync } = await import("node:crypto");
    const [tag, payload] = enc.split(":");
    if (tag === "v1" && payload) {
      const raw = Buffer.from(payload, "base64");
      for (const master of [e.ADMIN_ENCRYPTION_KEY, e.SUPABASE_SERVICE_ROLE_KEY].filter(
        Boolean,
      )) {
        try {
          const d = createDecipheriv(
            "aes-256-gcm",
            scryptSync(master, "le-rasa-secret-store", 32),
            raw.subarray(0, 12),
          );
          d.setAuthTag(raw.subarray(12, 28));
          secret = Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
          break;
        } catch {
          /* try the next master secret */
        }
      }
    }
  }

  if (!/_test_/.test(secret)) {
    throw new Error(
      "Refusing to run: the resolved Stripe key is not a TEST key. " +
        "This suite must never touch live money.",
    );
  }
  return new Stripe(secret);
}

/** Sign a payload exactly as Stripe does, so the endpoint accepts it. */
export function signPayload(payload: string, secret: string): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

/** POST a signed event to the webhook. */
export async function postWebhook(
  baseURL: string,
  event: unknown,
  opts: { secret: string; corrupt?: boolean } = { secret: "" },
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(event);
  let signature = signPayload(payload, opts.secret);
  if (opts.corrupt) signature = signature.replace(/,v1=.*/, ",v1=deadbeef");

  const res = await fetch(`${baseURL}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

/** A minimal, well-formed Stripe event envelope around a PaymentIntent. */
export function paymentIntentEvent(
  pi: Stripe.PaymentIntent,
  type = "payment_intent.succeeded",
  eventId = `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
) {
  return {
    id: eventId,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    data: { object: pi },
  };
}

/** An in-stock product to build a basket from. */
export async function anyProduct(): Promise<{ id: string; name: string; price: number }> {
  const { data, error } = await admin()
    .from("products")
    .select("id, name, price, in_stock, visible")
    .eq("in_stock", true)
    .order("price", { ascending: true })
    .limit(1);
  if (error) throw new Error(`could not read products: ${error.message}`);
  const p = data?.[0];
  if (!p) throw new Error("no in-stock product to test with");
  return { id: String(p.id), name: String(p.name), price: Number(p.price) };
}

/** The delivery postcode prefix this site actually delivers to. */
export async function deliverablePostcode(): Promise<string> {
  const { data } = await admin()
    .from("site_settings")
    .select("delivery_zones")
    .limit(1)
    .maybeSingle();
  const zones = (data?.delivery_zones ?? []) as { postcode_prefix?: string }[];
  const prefix = zones[0]?.postcode_prefix;
  // No zones configured → the gate is disabled, so anything is deliverable.
  return prefix ? `${prefix} 1AA`.toUpperCase() : "HA2 0WR";
}

export function orderByIntent(paymentIntentId: string) {
  return admin()
    .from("orders")
    .select("*")
    .eq("stripe_payment_intent", paymentIntentId)
    .maybeSingle();
}

/** EVERY order for an intent — the duplicate tests must count, not fetch one. */
export async function ordersByIntent(paymentIntentId: string) {
  const { data, error } = await admin()
    .from("orders")
    .select("id, total, status, payment_status, message, refund_id, refunded_at")
    .eq("stripe_payment_intent", paymentIntentId);
  if (error) throw new Error(`order lookup failed: ${error.message}`);
  return data ?? [];
}

export async function itemsForOrder(orderId: string) {
  const { data } = await admin().from("order_items").select("*").eq("order_id", orderId);
  return data ?? [];
}

export async function draftFor(paymentIntentId: string) {
  const { data } = await admin()
    .from("checkout_drafts")
    .select("payment_intent_id")
    .eq("payment_intent_id", paymentIntentId)
    .maybeSingle();
  return data;
}

export async function webhookEvent(eventId: string) {
  const { data } = await admin()
    .from("stripe_webhook_events")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  return data as { event_id: string; type: string; handled_at: string | null } | null;
}

/** Does a table have this column? Probed through a select, which is all PostgREST offers. */
export async function hasColumn(table: string, column: string): Promise<boolean> {
  const { error } = await admin().from(table).select(column).limit(1);
  return !error;
}

/**
 * Is the unique index on orders.stripe_payment_intent actually enforced?
 *
 * PostgREST cannot read pg_indexes, so this proves it the only way available:
 * insert the same PaymentIntent twice and see whether the database refuses.
 * Both probe rows are deleted before returning, whatever the outcome, and the
 * intent id is namespaced so it can never collide with a real payment.
 */
export async function uniqueIndexEnforced(): Promise<boolean> {
  const sb = admin();
  const pi = `pi_e2e_indexprobe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    customer_name: `${E2E_TAG} index probe`,
    email: "e2e-probe@example.com",
    phone: "07000000000",
    total: 0.01,
    amount: 0.01,
    status: "pending",
    stripe_payment_intent: pi,
  };
  try {
    const first = await sb.from("orders").insert(row).select("id").single();
    if (first.error) throw new Error(`probe insert failed: ${first.error.message}`);
    const second = await sb.from("orders").insert(row).select("id").single();
    return Boolean(second.error);
  } finally {
    await sb.from("orders").delete().eq("stripe_payment_intent", pi);
  }
}

/**
 * A real, genuinely-succeeded PaymentIntent, created THROUGH THE APP so the
 * server writes the same metadata and checkout draft a customer would produce,
 * then confirmed with a Stripe test card.
 *
 * This is what makes the recovery tests meaningful: the intent the webhook is
 * told about is a real one Stripe will confirm on lookup, not a fixture. What
 * is deliberately NOT done is the call to /api/orders/create — that is exactly
 * the step a closed tab never reaches.
 */
export async function payWithoutSavingOrder(
  baseURL: string,
  overrides: { quantity?: number; instructions?: string } = {},
): Promise<{ paymentIntentId: string; total: number; product: { id: string; name: string } }> {
  const product = await anyProduct();
  const postcode = await deliverablePostcode();
  const quantity = overrides.quantity ?? 1;

  const deliveryDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

  const res = await fetch(`${baseURL}/api/checkout/create-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ id: product.id, productId: product.id, quantity }],
      deliveryDate,
      postcode,
      email: "e2e-recovery@example.com",
      // A name the REAL validator accepts — the suite must go through the same
      // contact gate a customer does, not around it. Test rows are identified
      // by their PaymentIntent id, so nothing here needs the E2E tag.
      name: "Ella Recovery",
      phone: "07700900123",
      address: { line: "12 Baker Street", city: "London", postcode },
      specialInstructions: overrides.instructions ?? `${E2E_TAG} automated test`,
    }),
  });
  const body = (await res.json()) as { clientSecret?: string; total?: number; error?: string };
  if (!res.ok || !body.clientSecret) {
    throw new Error(`create-intent failed (${res.status}): ${body.error ?? "no clientSecret"}`);
  }

  const paymentIntentId = body.clientSecret.split("_secret_")[0];
  const stripe = await stripeClient();
  const confirmed = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: "pm_card_visa",
    return_url: `${baseURL}/checkout`,
  });
  if (confirmed.status !== "succeeded") {
    throw new Error(`test payment did not succeed: ${confirmed.status}`);
  }
  return { paymentIntentId, total: Number(body.total ?? 0), product };
}

/**
 * The signed-in customer the browser tests use.
 *
 * /checkout is behind the account gate, so a browser test cannot reach it at
 * all without a real Supabase auth user. One is created with the service role
 * (email pre-confirmed, so there is no inbox to poll) and removed again in
 * teardown, rather than leaving a permanent test account on the project.
 */
export const TEST_CUSTOMER = {
  email: "e2e-checkout-customer@example.com",
  password: "E2e-Checkout-Pass-9f3a!",
};

export async function ensureTestCustomer(): Promise<void> {
  const sb = admin();
  const { error } = await sb.auth.admin.createUser({
    email: TEST_CUSTOMER.email,
    password: TEST_CUSTOMER.password,
    email_confirm: true,
  });
  // Already there from an earlier run — reuse it.
  if (error && !/already (been )?registered|already exists/i.test(error.message)) {
    throw new Error(`could not create the test customer: ${error.message}`);
  }
}

export async function removeTestCustomer(): Promise<void> {
  const sb = admin();
  try {
    const { data } = await sb.auth.admin.listUsers({ perPage: 200 });
    const user = data?.users?.find((u) => u.email === TEST_CUSTOMER.email);
    if (user) await sb.auth.admin.deleteUser(user.id);
  } catch {
    /* best-effort — a leftover test account is harmless */
  }
}

/** Deliver a payment_intent.succeeded for a real intent, signed properly. */
export async function deliverSucceeded(
  baseURL: string,
  paymentIntentId: string,
  eventId?: string,
): Promise<{ status: number; body: string; eventId: string }> {
  const stripe = await stripeClient();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  const id = eventId ?? `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const secret = env().STRIPE_WEBHOOK_SECRET ?? "";
  const out = await postWebhook(baseURL, paymentIntentEvent(pi, "payment_intent.succeeded", id), {
    secret,
  });
  return { ...out, eventId: id };
}

/** Deliver an arbitrary signed event built around any Stripe object. */
export async function deliverEvent(
  baseURL: string,
  type: string,
  object: unknown,
  eventId?: string,
): Promise<{ status: number; body: string; eventId: string }> {
  const id = eventId ?? `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const secret = env().STRIPE_WEBHOOK_SECRET ?? "";
  const out = await postWebhook(
    baseURL,
    {
      id,
      object: "event",
      api_version: "2024-06-20",
      created: Math.floor(Date.now() / 1000),
      type,
      livemode: false,
      data: { object },
    },
    { secret },
  );
  return { ...out, eventId: id };
}

/** Delete everything this suite created. Safe to call repeatedly. */
export async function cleanup(paymentIntentIds: string[]): Promise<string[]> {
  const removed: string[] = [];
  const supabase = admin();
  for (const pi of paymentIntentIds) {
    const { data } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent", pi)
      .maybeSingle();
    if (data?.id) {
      await supabase.from("order_items").delete().eq("order_id", data.id);
      await supabase.from("orders").delete().eq("id", data.id);
      removed.push(`order ${data.id} (${pi})`);
    }
    await supabase.from("checkout_drafts").delete().eq("payment_intent_id", pi);
  }
  // Every event id this suite mints is prefixed evt_e2e_, so this can never
  // remove the ledger entry of a real Stripe delivery.
  await supabase.from("stripe_webhook_events").delete().like("event_id", "evt_e2e_%");
  return removed;
}
