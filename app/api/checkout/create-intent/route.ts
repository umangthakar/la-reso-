// ============================================================
// POST /api/checkout/create-intent
// Creates a Stripe PaymentIntent for the customer's basket.
//
// The amount is computed SERVER-SIDE from authoritative product
// prices in Supabase (never trusting client-sent prices), plus the
// shared delivery rule. Returns the PaymentIntent client secret.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getCheckoutStripe } from "@/lib/stripe-checkout";
import { deliveryFeeFor, round2, toPence } from "@/lib/pricing";

export const dynamic = "force-dynamic";

type IncomingItem = { id: string; quantity: number };

export async function POST(req: Request) {
  let body: { items?: IncomingItem[]; deliveryDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "Your basket is empty." }, { status: 400 });
  }

  // Normalise + validate quantities.
  const wanted = new Map<string, number>();
  for (const it of items) {
    const qty = Math.max(0, Math.trunc(Number(it.quantity)) || 0);
    if (it.id && qty > 0) wanted.set(String(it.id), qty);
  }
  if (wanted.size === 0) {
    return NextResponse.json({ error: "Your basket is empty." }, { status: 400 });
  }

  // Look up authoritative prices from the DB (service role — read only here).
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("products")
    .select("id,name,price,in_stock")
    .in("id", Array.from(wanted.keys()));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    id: string;
    name: string;
    price: number;
    in_stock: boolean | null;
  }[];

  let subtotal = 0;
  for (const row of rows) {
    if (row.in_stock === false) {
      return NextResponse.json(
        { error: `"${row.name}" is currently unavailable.` },
        { status: 409 },
      );
    }
    subtotal += (Number(row.price) || 0) * (wanted.get(row.id) ?? 0);
  }
  subtotal = round2(subtotal);

  if (subtotal <= 0) {
    return NextResponse.json({ error: "Could not price your basket." }, { status: 400 });
  }

  const deliveryFee = deliveryFeeFor(subtotal);
  const total = round2(subtotal + deliveryFee);

  try {
    const stripe = getCheckoutStripe();
    const intent = await stripe.paymentIntents.create({
      amount: toPence(total),
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      metadata: {
        subtotal: subtotal.toFixed(2),
        delivery_fee: deliveryFee.toFixed(2),
        total: total.toFixed(2),
        delivery_date: body.deliveryDate ?? "",
      },
    });

    return NextResponse.json({
      clientSecret: intent.client_secret,
      subtotal,
      deliveryFee,
      total,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start payment." },
      { status: 500 },
    );
  }
}
