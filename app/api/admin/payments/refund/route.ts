// ============================================================
// Admin API — issue a Stripe refund (POST { order_id })
// Service-role, password-gated. Loads the order, calls the Stripe
// Refunds API with the saved (decrypted) secret key for the order's
// PaymentIntent, then marks the order `refunded` in Supabase.
//
// Requires supabase/sql/06_payments.sql and a configured Stripe secret.
// ============================================================

import { NextResponse } from "next/server";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const ORDER_COLS =
  "id, customer_name, email, amount, status, created_at, stripe_payment_intent, refunded_at";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const orderId = String(body.order_id ?? "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "Missing order_id." }, { status: 400 });
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;

  const { data: order, error: loadErr } = await supabase
    .from("orders")
    .select(ORDER_COLS)
    .eq("id", orderId)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  if (order.status === "refunded") {
    return NextResponse.json({ error: "This order is already refunded." }, { status: 400 });
  }
  if (!order.stripe_payment_intent) {
    return NextResponse.json(
      {
        error:
          "No Stripe payment reference on this order, so it can't be auto-refunded. Refund it manually in your Stripe dashboard.",
      },
      { status: 400 },
    );
  }

  // Issue the refund via Stripe.
  let refundId: string;
  try {
    const { stripe } = await getStripe(supabase);
    const refund = await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent,
    });
    refundId = refund.id;
  } catch (e) {
    const msg =
      e instanceof Stripe.errors.StripeError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Stripe refund failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Mark the order refunded in Supabase.
  const { data: updated, error: updErr } = await supabase
    .from("orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", orderId)
    .select(ORDER_COLS)
    .single();
  if (updErr) {
    // The Stripe refund DID succeed; surface that so the admin doesn't retry.
    return NextResponse.json(
      {
        error: `Refund issued in Stripe (${refundId}) but updating the order failed: ${updErr.message}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ order: updated, refund_id: refundId });
}
