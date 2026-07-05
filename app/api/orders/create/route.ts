// ============================================================
// POST /api/orders/create
// Called by the checkout page AFTER Stripe reports the payment
// succeeded. Verifies the PaymentIntent server-side (never trusting
// the client that it was paid), then writes the order + line items to
// Supabase via the service role. Idempotent per PaymentIntent.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getCheckoutStripe } from "@/lib/stripe-checkout";
import { round2 } from "@/lib/pricing";

export const dynamic = "force-dynamic";

type Body = {
  paymentIntentId?: string;
  customer?: { name?: string; email?: string; phone?: string };
  address?: { line?: string; city?: string; postcode?: string };
  deliveryDate?: string;
  specialInstructions?: string;
  items?: { id: string; name: string; price: number; quantity: number }[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const paymentIntentId = String(body.paymentIntentId ?? "").trim();
  if (!paymentIntentId) {
    return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });
  }

  // 1) Verify the payment actually succeeded, straight from Stripe.
  let paidTotal: number;
  let metaSubtotal = 0;
  let metaDelivery = 0;
  try {
    const stripe = getCheckoutStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      return NextResponse.json(
        { error: "Payment has not completed." },
        { status: 402 },
      );
    }
    paidTotal = round2((pi.amount_received || pi.amount || 0) / 100);
    metaSubtotal = Number(pi.metadata?.subtotal) || 0;
    metaDelivery = Number(pi.metadata?.delivery_fee) || 0;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not verify payment." },
      { status: 500 },
    );
  }

  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  // 2) Idempotency — if this PaymentIntent already produced an order, reuse it.
  const existing = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent", paymentIntentId)
    .maybeSingle();
  if (existing.data?.id) {
    return NextResponse.json({ orderId: existing.data.id });
  }

  const addr = body.address ?? {};
  const deliveryAddress = [addr.line, addr.city].filter(Boolean).join(", ");
  const instructions = String(body.specialInstructions ?? "").trim() || null;

  // 3) Insert the order. status/payment_method match the admin panel + schema.
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      customer_name: String(body.customer?.name ?? "").trim(),
      email: String(body.customer?.email ?? "").trim(),
      phone: String(body.customer?.phone ?? "").trim(),
      delivery_address: deliveryAddress || null,
      postcode: String(addr.postcode ?? "").trim() || null,
      special_instructions: instructions,
      message: instructions, // surfaced by the admin Orders drawer
      delivery_date: body.deliveryDate || null,
      subtotal: metaSubtotal,
      delivery_charge: metaDelivery,
      total: paidTotal,
      amount: paidTotal,
      status: "received",
      payment_method: "stripe",
      stripe_payment_intent: paymentIntentId,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: orderErr?.message ?? "Could not save your order." },
      { status: 500 },
    );
  }

  // 4) Insert line items (best-effort snapshot for analytics / invoices).
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 0) {
    const rows = items.map((i) => {
      const qty = Math.max(1, Math.trunc(Number(i.quantity)) || 1);
      const unit = round2(Number(i.price) || 0);
      return {
        order_id: order.id,
        product_id: i.id,
        product_name: i.name,
        unit_price: unit,
        quantity: qty,
        line_total: round2(unit * qty),
      };
    });
    // Don't fail the whole order if items can't be written; the order is saved.
    await supabase.from("order_items").insert(rows);
  }

  return NextResponse.json({ orderId: order.id });
}
