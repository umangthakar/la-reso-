// ============================================================
// POST /api/orders/create
// Called by the checkout page AFTER Stripe reports the payment
// succeeded. Verifies the PaymentIntent server-side (never trusting
// the client that it was paid), then writes the order + line items to
// Supabase via the service role. Idempotent per PaymentIntent.
//
// The work itself lives in lib/order-create.ts, because the Stripe webhook
// (/api/stripe/webhook) has to be able to write the SAME order when the
// customer's browser never gets to make this call. This route is unchanged in
// behaviour: same request shape, same responses, same status codes.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { createOrderFromPayment } from "@/lib/order-create";
import type { IncomingItem } from "@/lib/basket-pricing";

export const dynamic = "force-dynamic";

type Body = {
  paymentIntentId?: string;
  customer?: { name?: string; email?: string; phone?: string };
  address?: { line?: string; city?: string; postcode?: string };
  deliveryDate?: string;
  specialInstructions?: string;
  items?: IncomingItem[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
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

  const result = await createOrderFromPayment(supabase, {
    paymentIntentId: String(body.paymentIntentId ?? ""),
    customer: body.customer,
    address: body.address,
    deliveryDate: body.deliveryDate,
    specialInstructions: body.specialInstructions,
    items: body.items,
    source: "checkout",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ orderId: result.orderId });
}
