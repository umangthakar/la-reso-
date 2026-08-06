// ============================================================
// POST /api/stripe/webhook — the server-side safety net for payments.
//
// WHY THIS EXISTS. Orders are normally written by the customer's browser: it
// confirms the payment with Stripe, then calls /api/orders/create. That works,
// and it stays the primary path — but it makes the order depend on the tab
// surviving the moment after the card is charged. Close it, lose signal, crash,
// or simply walk away, and Stripe has taken real money with no order behind it.
//
// Stripe tells THIS endpoint about the payment directly, server to server, and
// retries for days until we acknowledge. So the same order can always be
// recovered even when the browser never came back.
//
// WHAT IT DOES NOT DO. It does not re-implement checkout. Order creation is
// lib/order-create.ts — the very function /api/orders/create calls — so pricing,
// verification, line items, offers and notifications behave identically no
// matter which path wins. Refunds are likewise untouched: this endpoint only
// records refunds that happened (including ones made straight from the Stripe
// dashboard), it never issues one.
//
// SECURITY. Every request is signature-verified against STRIPE_WEBHOOK_SECRET
// before a single byte of the payload is trusted; unsigned or mis-signed
// requests are rejected with 400 and nothing else happens. Stripe's signature
// carries a timestamp and its tolerance window is what stops a captured
// payload being replayed later; on top of that every event id is claimed
// exactly once (stripe_webhook_events), so a duplicate delivery is a no-op.
// ============================================================

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { createOrderFromPayment } from "@/lib/order-create";
import { loadCheckoutDraft, type CheckoutDraft } from "@/lib/checkout-draft";

// The raw body is required for signature verification, and node crypto for the
// HMAC — so this route must not be edge-rendered or statically analysed.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS_TABLE = "stripe_webhook_events";

/** True when a table simply isn't there yet (44_stripe_webhook.sql not run). */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42P01 = undefined_table; PGRST205 = unknown table in the schema cache.
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(err.message ?? "");
}

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key value|unique constraint/i.test(err.message ?? "");
}

/** True when the ledger predates the handled_at column (older 44_…sql). */
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42703 = undefined_column; PGRST204 = column not in the schema cache.
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(err.message ?? "");
}

/**
 * Take ownership of an event id.
 *
 * "claimed"   → go and handle it.
 * "duplicate" → an earlier delivery already handled it to completion;
 *               acknowledge and do nothing.
 * "unlogged"  → the ledger table isn't migrated yet. We still handle the event:
 *               every downstream action is independently idempotent (the unique
 *               index on orders.stripe_payment_intent, the refund_id guard), so
 *               a replay is harmless — it is only less efficient.
 *
 * WHY THE CLAIM IS NOT ENOUGH ON ITS OWN. Inserting the id up front stops a
 * duplicate delivery re-running a handler, but it also stakes the claim BEFORE
 * the work is done. If the process then dies mid-handler — a serverless
 * timeout while order-create is waiting on Stripe or on a notification
 * provider, an OOM kill, a deploy — the row survives, Stripe's retry is waved
 * through as a duplicate, and the order that retry existed to save is lost for
 * good. That is precisely the failure this endpoint is here to prevent.
 *
 * So the row is only a TOMBSTONE once handled_at is set. A claim whose
 * handled_at is still null means the previous attempt never finished, and the
 * event is handled again. Re-handling is safe by construction: order creation
 * is idempotent per PaymentIntent and refund recording never overwrites a
 * refund already on the order.
 */
async function claimEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<"claimed" | "duplicate" | "unlogged"> {
  const { error } = await supabase.from(EVENTS_TABLE).insert({
    event_id: event.id,
    type: event.type,
  });
  if (!error) return "claimed";

  if (isUniqueViolation(error)) {
    const { data, error: readErr } = await supabase
      .from(EVENTS_TABLE)
      .select("handled_at")
      .eq("event_id", event.id)
      .maybeSingle();

    // Ledger without the completion marker: fall back to the old, purely
    // insert-based rule rather than re-running every duplicate for ever.
    if (readErr) {
      if (!isMissingColumn(readErr)) {
        console.warn("[stripe/webhook] could not read event claim:", readErr.message);
      }
      return "duplicate";
    }

    if (data && data.handled_at == null) {
      console.warn(
        "[stripe/webhook] retrying an event whose previous attempt never completed",
        { eventId: event.id, type: event.type },
      );
      return "claimed";
    }
    return "duplicate";
  }

  if (isMissingTable(error)) return "unlogged";
  console.warn("[stripe/webhook] could not claim event:", error.message);
  return "unlogged";
}

/**
 * Turn the claim into a tombstone, now that the handler has actually finished.
 * Best-effort: if this write is lost the worst case is that a later delivery of
 * the same event is handled a second time, which changes nothing.
 */
async function completeEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from(EVENTS_TABLE)
      .update({ handled_at: new Date().toISOString() })
      .eq("event_id", eventId);
    if (error && !isMissingColumn(error)) {
      console.warn("[stripe/webhook] could not mark event handled:", error.message);
    }
  } catch {
    /* a re-handled duplicate is harmless; every handler is idempotent */
  }
}

/**
 * Give the claim back after a failed handler, so Stripe's retry can pick the
 * event up again instead of being waved through as a duplicate.
 */
async function releaseEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  try {
    await supabase.from(EVENTS_TABLE).delete().eq("event_id", eventId);
  } catch {
    /* the retry will be treated as a duplicate; the order paths are idempotent */
  }
}

/** Build recovery input from the PaymentIntent's own metadata. */
function draftFromMetadata(pi: Stripe.PaymentIntent | null): CheckoutDraft {
  const m = (pi?.metadata ?? {}) as Record<string, string | undefined>;
  return {
    customer: {
      name: m.customer_name ?? "",
      email: m.customer_email ?? "",
      phone: m.customer_phone ?? "",
    },
    address: {
      line: m.address_line ?? "",
      city: m.address_city ?? "",
      postcode: m.delivery_postcode ?? "",
    },
    deliveryDate: m.delivery_date ?? "",
    // No basket here — order-create records the order without line items and
    // flags it, which is the whole point: the payment is never lost.
    items: [],
  };
}

/**
 * Recover the order for a succeeded PaymentIntent.
 *
 * Idempotent twice over: createOrderFromPayment returns the existing order for
 * an intent that already has one, and the unique index on
 * orders.stripe_payment_intent settles any race with the browser.
 */
async function recoverOrder(
  supabase: SupabaseClient,
  paymentIntentId: string,
  pi: Stripe.PaymentIntent | null,
): Promise<void> {
  // Prefer the full draft written when the PaymentIntent was created; fall back
  // to what Stripe itself holds, so recovery works even un-migrated.
  const draft = (await loadCheckoutDraft(supabase, paymentIntentId)) ?? draftFromMetadata(pi);

  const result = await createOrderFromPayment(supabase, {
    paymentIntentId,
    customer: draft.customer,
    address: draft.address,
    deliveryDate: draft.deliveryDate,
    specialInstructions: draft.specialInstructions,
    items: draft.items,
    source: "webhook",
  });

  if (!result.ok) {
    // Thrown so the caller releases the claim and returns 500 — Stripe then
    // retries, which is exactly what we want for a transient DB failure.
    throw new Error(`could not recover order: ${result.error}`);
  }

  if (result.created) {
    console.warn("[stripe/webhook] RECOVERED an order the browser never saved", {
      paymentIntentId,
      orderId: result.orderId,
    });
  }
  // The draft is dropped by createOrderFromPayment itself, on both callers'
  // paths, so the order row is the only remaining copy of the customer's PII.
}

/**
 * Record a refund that has already happened at Stripe — including one issued
 * straight from the Stripe dashboard, which the app would otherwise never learn
 * about. Deliberately narrow: it touches the PAYMENT columns only and leaves
 * the order's own status to the existing admin/lifecycle flows, and it never
 * overwrites a refund those flows have already recorded.
 */
async function recordRefund(
  supabase: SupabaseClient,
  paymentIntentId: string,
  refundId: string | null,
): Promise<void> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, payment_status, refund_id")
    .eq("stripe_payment_intent", paymentIntentId)
    .maybeSingle();
  if (error) {
    console.warn("[stripe/webhook] refund lookup failed:", error.message);
    return;
  }
  if (!order) return; // nothing of ours was refunded
  if (String(order.payment_status ?? "") === "refunded" && order.refund_id) return;

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("orders")
    .update({
      payment_status: "refunded",
      refund_id: order.refund_id ?? refundId,
      refund_error: null,
      refunded_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", order.id);
  if (updErr) {
    console.warn("[stripe/webhook] could not record refund:", updErr.message);
  }
}

/** Record a refund that Stripe reports as failed, so the admin can retry it. */
async function recordRefundFailure(
  supabase: SupabaseClient,
  paymentIntentId: string,
  reason: string,
): Promise<void> {
  const { data: order } = await supabase
    .from("orders")
    .select("id, refund_id")
    .eq("stripe_payment_intent", paymentIntentId)
    .maybeSingle();
  if (!order || order.refund_id) return; // never downgrade a completed refund

  const { error } = await supabase
    .from("orders")
    .update({ payment_status: "refund_pending", refund_error: reason })
    .eq("id", order.id);
  if (error) {
    console.warn("[stripe/webhook] could not record refund failure:", error.message);
  }
}

/** The PaymentIntent id off a charge/refund, whichever shape Stripe sends. */
function intentIdOf(value: string | { id?: string } | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : String(value.id ?? "");
}

export async function POST(req: Request) {
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!webhookSecret) {
    // 500 (not 200) on purpose: Stripe keeps retrying, so events are not lost
    // while the secret is being configured.
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  // MUST be the raw, unparsed body — the signature covers the exact bytes.
  const rawBody = await req.text();

  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    console.error("[stripe/webhook] admin client unavailable:", e);
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const { stripe } = await getStripe(supabase);
    // Async variant: uses WebCrypto, so it works on every Next.js runtime.
    // Throws on a bad signature AND on a timestamp outside Stripe's tolerance,
    // which is what makes a captured payload unusable later.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (e) {
    // Never leak why it failed to an unauthenticated caller.
    console.warn(
      "[stripe/webhook] signature verification failed:",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // ---- From here the payload is authenticated and safe to act on. ----------
  const claim = await claimEvent(supabase, event);
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        await recoverOrder(supabase, pi.id, pi);
        break;
      }

      case "payment_intent.payment_failed": {
        // No order exists for a failed payment and none should be created —
        // the customer is still on the checkout page and can retry. Logged so
        // a rise in failures is visible.
        const pi = event.data.object as Stripe.PaymentIntent;
        console.warn("[stripe/webhook] payment failed", {
          paymentIntentId: pi.id,
          reason: pi.last_payment_error?.message ?? null,
        });
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = intentIdOf(charge.payment_intent);
        if (paymentIntentId) {
          let refundId = charge.refunds?.data?.[0]?.id ?? null;
          if (!refundId) {
            // `refunds` is a sub-list that Stripe does not always expand on the
            // charge, so it cannot be relied on to carry the id. Recording the
            // refund without one would leave the owner with an order marked
            // refunded and nothing to reconcile it against in Stripe, so ask
            // Stripe directly instead.
            try {
              const { stripe } = await getStripe(supabase);
              const list = await stripe.refunds.list({
                payment_intent: paymentIntentId,
                limit: 1,
              });
              refundId = list.data[0]?.id ?? null;
            } catch (e) {
              console.warn(
                "[stripe/webhook] could not look up the refund id:",
                e instanceof Error ? e.message : e,
              );
            }
          }
          await recordRefund(supabase, paymentIntentId, refundId);
        }
        break;
      }

      case "refund.updated": {
        const refund = event.data.object as Stripe.Refund;
        const paymentIntentId = intentIdOf(refund.payment_intent);
        if (paymentIntentId) {
          if (refund.status === "succeeded") {
            await recordRefund(supabase, paymentIntentId, refund.id);
          } else if (refund.status === "failed" || refund.status === "canceled") {
            await recordRefundFailure(
              supabase,
              paymentIntentId,
              refund.failure_reason ?? `Stripe reported the refund as ${refund.status}.`,
            );
          }
        }
        break;
      }

      case "checkout.session.completed": {
        // This storefront drives Stripe with PaymentIntents rather than hosted
        // Checkout Sessions, so this normally never fires. Handled anyway so a
        // future payment link recovers through the same one path.
        const session = event.data.object as Stripe.Checkout.Session;
        const paymentIntentId = intentIdOf(session.payment_intent);
        if (paymentIntentId && session.payment_status === "paid") {
          const { stripe } = await getStripe(supabase);
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          await recoverOrder(supabase, paymentIntentId, pi);
        }
        break;
      }

      default:
        // Anything else is acknowledged and ignored, so enabling extra events
        // in the Stripe dashboard can never pile up failed deliveries.
        break;
    }
  } catch (e) {
    // Hand the event back so Stripe retries it rather than us losing it.
    if (claim === "claimed") await releaseEvent(supabase, event.id);
    console.error("[stripe/webhook] handler failed", {
      eventId: event.id,
      type: event.type,
      error: e instanceof Error ? e.message : e,
    });
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  // Only NOW is the claim a tombstone. Anything that killed the process before
  // this line leaves handled_at null, so Stripe's retry is handled rather than
  // dismissed as a duplicate.
  if (claim === "claimed") await completeEvent(supabase, event.id);

  return NextResponse.json({ received: true });
}
