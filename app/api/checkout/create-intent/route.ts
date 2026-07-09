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
import { resolveDeliveryFee, round2, toPence } from "@/lib/pricing";
import {
  offerFromRow,
  resolveActiveOffers,
  isOfferCurrentlyActive,
  checkCartConditions,
  checkAudienceEligibility,
  computeOfferDiscount,
  type Offer,
  type OfferCartItem,
} from "@/lib/offers";

export const dynamic = "force-dynamic";

type IncomingItem = { id: string; quantity: number };
type DeliveryZone = { postcode_prefix?: string; fee?: number };

export async function POST(req: Request) {
  let body: {
    items?: IncomingItem[];
    deliveryDate?: string;
    postcode?: string;
    couponCode?: string;
    email?: string;
  };
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
    .select("id,name,price,in_stock,category")
    .in("id", Array.from(wanted.keys()));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    id: string;
    name: string;
    price: number;
    in_stock: boolean | null;
    category: string | null;
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

  // Authoritative, zone-aware delivery fee from the admin-configured zones.
  const zonesRes = await supabase
    .from("site_settings")
    .select("delivery_zones")
    .limit(1)
    .maybeSingle();
  const zones = Array.isArray(zonesRes.data?.delivery_zones)
    ? (zonesRes.data!.delivery_zones as DeliveryZone[])
    : [];

  // ---- OFFER DISCOUNT (inserted between subtotal and delivery fee) --------
  // Computed from the SAME server-verified cart items + DB prices as the
  // subtotal above — never the client's numbers. Any failure here (e.g. the
  // offers tables aren't migrated yet) leaves the discount at 0, so checkout
  // with no active offer stays byte-identical to before this phase.
  const serverCartItems: OfferCartItem[] = rows
    .map((r) => ({
      id: r.id,
      category: r.category ?? null,
      price: Number(r.price) || 0,
      quantity: wanted.get(r.id) ?? 0,
    }))
    .filter((i) => Number(i.quantity) > 0);
  const cartQuantity = serverCartItems.reduce((s, i) => s + Number(i.quantity), 0);

  let discountAmount = 0;
  let freeDelivery = false;
  let appliedOfferId: string | null = null;
  let appliedCouponCode: string | null = null;
  let couponConflict: string | null = null;

  try {
    const now = new Date();
    const couponCode = String(body.couponCode ?? "").trim();

    const { data: offerRows } = await supabase
      .from("offers")
      .select(
        "*, offer_category_rules(category,mode), offer_product_rules(product_id,mode), offer_emails(email)",
      )
      .eq("enabled", true);
    const allOffers = (offerRows ?? []).map((r) => offerFromRow(r as Record<string, unknown>));

    // Auto (non-coupon) offers → the primary banner offer plus any stackables.
    const { primary, stackable } = resolveActiveOffers(
      allOffers.filter((o) => o.type !== "coupon"),
      now,
    );

    // Only apply a coupon the customer actually entered, if it matches + is live.
    let coupon: Offer | null = null;
    if (couponCode) {
      coupon =
        allOffers.find(
          (o) =>
            o.type === "coupon" &&
            (o.coupon_code ?? "").toLowerCase() === couponCode.toLowerCase() &&
            isOfferCurrentlyActive(o, now),
        ) ?? null;
    }

    // Audience facts (first order / new customer) need a DB lookup — only run
    // it when an applicable offer requires it and we have an email to key on.
    const email = String(body.email ?? "").trim().toLowerCase();
    const applicable = [primary, ...stackable, coupon].filter(Boolean) as Offer[];
    let isFirstOrder: boolean | undefined;
    let isNewCustomer: boolean | undefined;
    if (
      email &&
      applicable.some((o) => o.audience === "first_order" || o.audience === "new_customer")
    ) {
      const prior = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("email", email);
      const count = prior.count ?? 0;
      isFirstOrder = count === 0;
      isNewCustomer = count === 0;
    }
    const audienceCtx = { email: email || undefined, isFirstOrder, isNewCustomer };

    // Auto offers: silently skip any that don't currently qualify (so a cart
    // below the minimum simply shows no discount, consistent everywhere).
    for (const offer of [primary, ...stackable].filter(Boolean) as Offer[]) {
      if (!checkCartConditions(offer, subtotal, cartQuantity).ok) continue;
      if (!checkAudienceEligibility(offer, audienceCtx).ok) continue;
      const d = computeOfferDiscount(offer, serverCartItems, subtotal);
      discountAmount += d.discountAmount;
      if (d.freeDelivery) freeDelivery = true;
      if (offer === primary) appliedOfferId = offer.id;
    }

    // A coupon the customer explicitly entered: if the basket no longer meets
    // its conditions, that's a 409 — not a silent skip.
    if (coupon) {
      const cond = checkCartConditions(coupon, subtotal, cartQuantity);
      const aud = checkAudienceEligibility(coupon, audienceCtx);
      if (!cond.ok) couponConflict = cond.reason ?? "This coupon no longer applies to your basket.";
      else if (!aud.ok) couponConflict = aud.reason ?? "This coupon isn't available for your account.";
      else {
        const d = computeOfferDiscount(coupon, serverCartItems, subtotal);
        discountAmount += d.discountAmount;
        if (d.freeDelivery) freeDelivery = true;
        appliedCouponCode = coupon.coupon_code ?? couponCode;
        if (!appliedOfferId) appliedOfferId = coupon.id;
      }
    }

    discountAmount = round2(Math.min(Math.max(discountAmount, 0), subtotal));
  } catch {
    // Offers unavailable / not migrated → no discount, existing behavior.
    discountAmount = 0;
    freeDelivery = false;
    appliedOfferId = null;
    appliedCouponCode = null;
  }

  if (couponConflict) {
    return NextResponse.json({ error: couponConflict }, { status: 409 });
  }

  // Free delivery unlocked by an offer → 0; otherwise the existing zone-aware
  // rule is unchanged.
  const deliveryFee = freeDelivery ? 0 : resolveDeliveryFee(subtotal, body.postcode, zones);
  const total = round2(subtotal - discountAmount + deliveryFee);

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
        discount_amount: discountAmount.toFixed(2),
        coupon_code: appliedCouponCode ?? "",
        offer_id: appliedOfferId ?? "",
      },
    });

    return NextResponse.json({
      clientSecret: intent.client_secret,
      subtotal,
      deliveryFee,
      total,
      discount: discountAmount,
      freeDelivery,
      couponCode: appliedCouponCode,
      offerId: appliedOfferId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start payment." },
      { status: 500 },
    );
  }
}
