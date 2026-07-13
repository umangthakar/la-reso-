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
import { getStripe } from "@/lib/stripe";
import { round2 } from "@/lib/pricing";

export const dynamic = "force-dynamic";

/**
 * True when an insert failed because a column doesn't exist on this DB
 * (e.g. the setup SQL hasn't been re-run to add the newer order columns).
 * Lets us retry with the guaranteed core columns instead of failing.
 */
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST204") return true; // column not in PostgREST schema cache
  return /column .* does not exist|could not find the .* column/i.test(
    err.message ?? "",
  );
}

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

  // The admin client is created first because the Stripe key itself now lives
  // in site_settings (admin panel), with the env key as the fallback.
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  // 1) Verify the payment actually succeeded, straight from Stripe.
  let paidTotal: number;
  let metaSubtotal = 0;
  let metaDelivery = 0;
  let metaDiscount = 0;
  let metaCoupon: string | null = null;
  let metaOffer: string | null = null;
  try {
    const { stripe } = await getStripe(supabase);
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
    metaDiscount = Number(pi.metadata?.discount_amount) || 0;
    metaCoupon = (pi.metadata?.coupon_code || "").trim() || null;
    metaOffer = (pi.metadata?.offer_id || "").trim() || null;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not verify payment." },
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
  const postcode = String(addr.postcode ?? "").trim();
  const instructions = String(body.specialInstructions ?? "").trim() || null;

  // Columns present on every version of the orders table.
  const coreOrder = {
    customer_name: String(body.customer?.name ?? "").trim(),
    email: String(body.customer?.email ?? "").trim(),
    phone: String(body.customer?.phone ?? "").trim(),
    message: instructions, // surfaced by the admin Orders drawer
    delivery_date: body.deliveryDate || null,
    subtotal: metaSubtotal,
    delivery_charge: metaDelivery,
    total: paidTotal,
    amount: paidTotal,
    status: "received",
    stripe_payment_intent: paymentIntentId,
  };

  // Extra columns added by the latest setup SQL (may not exist yet).
  const fullOrder = {
    ...coreOrder,
    payment_method: "stripe",
    delivery_address: deliveryAddress || null,
    postcode: postcode || null,
    special_instructions: instructions,
    // Discount columns from 16_order_discounts.sql (may not exist yet — the
    // isMissingColumn() fallback below drops them if the migration isn't run).
    discount_amount: metaDiscount,
    coupon_code: metaCoupon,
    offer_id: metaOffer,
  };

  // 3) Insert the order. If the DB predates the newer columns, retry with
  //    the core set — folding the address into `message` so the baker still
  //    sees where to deliver — instead of failing the whole order.
  let { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert(fullOrder)
    .select("id")
    .single();

  if (orderErr && isMissingColumn(orderErr)) {
    const addressNote = deliveryAddress
      ? `Deliver to: ${deliveryAddress}${postcode ? ` ${postcode}` : ""}`
      : "";
    const fallbackOrder = {
      ...coreOrder,
      message: [instructions, addressNote].filter(Boolean).join("\n\n") || null,
    };
    ({ data: order, error: orderErr } = await supabase
      .from("orders")
      .insert(fallbackOrder)
      .select("id")
      .single());
  }

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

  // 5) Record the offer redemption (powers usage limits / analytics). Same
  //    best-effort posture as the line items — never fail a saved order if
  //    this ledger write can't complete (e.g. the offers tables aren't
  //    migrated yet).
  if (metaOffer) {
    try {
      await supabase.from("offer_redemptions").insert({
        offer_id: metaOffer,
        order_id: order.id,
        email: coreOrder.email || null,
        discount_amount: metaDiscount,
      });
    } catch {
      /* ignore — the order is already saved */
    }
  }

  return NextResponse.json({ orderId: order.id });
}
