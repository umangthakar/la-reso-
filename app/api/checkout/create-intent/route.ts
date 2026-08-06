// ============================================================
// POST /api/checkout/create-intent
// Creates a Stripe PaymentIntent for the customer's basket.
//
// The amount is computed SERVER-SIDE from authoritative product
// prices in Supabase (never trusting client-sent prices), plus the
// shared delivery rule. Returns the PaymentIntent client secret.
//
// Cake customization: a line may carry the wizard's `selections`. Their cost
// is RE-PRICED here from the live accessory config — the client's numbers are
// never trusted — so a tampered basket cannot buy a £6 topper for £0. Product
// prices and accessory extras are kept apart, because the offer engine
// discounts cakes, not candles: offers still see exactly the product subtotal
// they saw before this feature existed, and the extras are added afterwards.
// A basket with no customization prices byte-identically to before.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import {
  matchDeliveryZone,
  normalizePostcode,
  resolveDeliveryFee,
  round2,
  toPence,
} from "@/lib/pricing";
import {
  cleanString,
  cleanText,
  normaliseEmail,
  normaliseName,
  normalisePhone,
  validateEmail,
  validateName,
  validatePhone,
} from "@/lib/input-validation";
import { saveCheckoutDraft } from "@/lib/checkout-draft";
import { priceBasket, type IncomingItem } from "@/lib/basket-pricing";
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

type DeliveryZone = { postcode_prefix?: string; fee?: number };

export async function POST(req: Request) {
  let body: {
    items?: IncomingItem[];
    deliveryDate?: string;
    postcode?: string;
    couponCode?: string;
    email?: string;
    name?: string;
    phone?: string;
    // Delivery address and note. Not used for pricing — pricing keys off
    // `postcode` exactly as before — but carried so the order can be recovered
    // in full if the customer's browser never reaches /api/orders/create.
    address?: { line?: string; city?: string; postcode?: string };
    specialInstructions?: string;
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

  // ── Contact gate, BEFORE any money moves ──────────────────
  // This is the strict pre-payment checkpoint: no PaymentIntent (and therefore
  // no charge) is created for a request whose contact details fail the shared
  // rules. /api/orders/create re-checks the same values afterwards, but doing it
  // here means a bypassed frontend is stopped before the customer is charged
  // rather than after.
  const contact = {
    name: normaliseName(cleanString(body.name, 200)),
    email: normaliseEmail(body.email),
    phone: normalisePhone(cleanString(body.phone, 60)),
  };
  const contactChecks: Array<[field: string, error: string]> = [
    ["name", validateName(contact.name)],
    ["email", validateEmail(contact.email)],
    ["phone", validatePhone(contact.phone)],
  ];
  const badContact = contactChecks.find(([, error]) => error !== "");
  if (badContact) {
    return NextResponse.json(
      { error: badContact[1], field: badContact[0] },
      { status: 400 },
    );
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

  // ---- AUTHORITATIVE BASKET PRICING --------------------------------------
  // All of it — product prices, size-variant prices, accessory extras — now
  // lives in lib/basket-pricing, because /api/orders/create has to run the
  // IDENTICAL computation when it rebuilds the order's line items. The numbers
  // and the error semantics here are unchanged; only their home has moved.
  const priced = await priceBasket(supabase, items);
  if (!priced.ok) {
    return NextResponse.json({ error: priced.error }, { status: priced.status });
  }
  const { lines, productRows: rows, productEffective, wanted, productSubtotal, accessoriesTotal, subtotal } =
    priced.basket;

  // Authoritative, zone-aware delivery fee from the admin-configured zones.
  const zonesRes = await supabase
    .from("site_settings")
    .select("delivery_zones")
    .limit(1)
    .maybeSingle();
  const zones = Array.isArray(zonesRes.data?.delivery_zones)
    ? (zonesRes.data!.delivery_zones as DeliveryZone[])
    : [];

  // ---- DELIVERY AREA GATE (before any money moves) ------------------------
  // The checkout form disables Continue on an out-of-area postcode, but that is
  // a courtesy: THIS is the guard. A direct fetch(), a re-enabled button or a
  // hand-edited request all arrive here, and none of them reaches Stripe.
  //
  // Validity is decided by matchDeliveryZone — the same function the form, the
  // "Invalid postcode" message and resolveDeliveryFee below all use, against the
  // zones just read from the admin's own settings. Nothing is duplicated or
  // re-implemented, so a zone edited in the panel changes what is deliverable
  // here immediately.
  //
  // Only enforced once zones exist, mirroring the form's `zonesLoaded` rule: a
  // bakery that hasn't configured any zones keeps working exactly as before
  // rather than having every order rejected.
  if (zones.length > 0 && !matchDeliveryZone(body.postcode, zones)) {
    return NextResponse.json(
      { error: "Invalid delivery postcode" },
      { status: 400 },
    );
  }

  // ---- OFFER DISCOUNT (inserted between subtotal and delivery fee) --------
  // Computed from the SAME server-verified cart items + DB prices as the
  // subtotal above — never the client's numbers. Any failure here (e.g. the
  // offers tables aren't migrated yet) leaves the discount at 0, so checkout
  // with no active offer stays byte-identical to before this phase.
  const serverCartItems: OfferCartItem[] = rows
    .map((r) => {
      const quantity = wanted.get(r.id) ?? 0;
      const eff = productEffective.get(r.id) ?? 0;
      // Weighted per-unit price so price × quantity equals the size-adjusted
      // subtotal for this product (matters when a product's sizes differ per
      // line). With no sizes this is exactly the base price, as before.
      const price = quantity > 0 ? round2(eff / quantity) : Number(r.price) || 0;
      return { id: r.id, category: r.category ?? null, price, quantity };
    })
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
    const email = contact.email;
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
      // Offers are evaluated against the PRODUCT subtotal only — accessories
      // are not discountable, and a basket without them is unaffected.
      if (!checkCartConditions(offer, productSubtotal, cartQuantity).ok) continue;
      if (!checkAudienceEligibility(offer, audienceCtx).ok) continue;
      const d = computeOfferDiscount(offer, serverCartItems, productSubtotal);
      discountAmount += d.discountAmount;
      if (d.freeDelivery) freeDelivery = true;
      if (offer === primary) appliedOfferId = offer.id;
    }

    // A coupon the customer explicitly entered: if the basket no longer meets
    // its conditions, that's a 409 — not a silent skip.
    if (coupon) {
      const cond = checkCartConditions(coupon, productSubtotal, cartQuantity);
      const aud = checkAudienceEligibility(coupon, audienceCtx);
      if (!cond.ok) couponConflict = cond.reason ?? "This coupon no longer applies to your basket.";
      else if (!aud.ok) couponConflict = aud.reason ?? "This coupon isn't available for your account.";
      else {
        const d = computeOfferDiscount(coupon, serverCartItems, productSubtotal);
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
    // Admin-panel config first, env secret key as the fallback (lib/stripe).
    const { stripe } = await getStripe(supabase);
    const intent = await stripe.paymentIntents.create({
      amount: toPence(total),
      currency: "gbp",
      // Card only. This restricts the Payment Element to Credit/Debit cards
      // (Stripe card wallets like Apple/Google Pay ride along under "card"),
      // and deliberately excludes dashboard-enabled alternatives such as
      // Revolut Pay and Amazon Pay for this checkout — without changing them
      // elsewhere in the Stripe account. Replaces the previous
      // `automatic_payment_methods: { enabled: true }`, which surfaced every
      // method enabled in the dashboard.
      payment_method_types: ["card"],
      metadata: {
        subtotal: subtotal.toFixed(2),
        delivery_fee: deliveryFee.toFixed(2),
        total: total.toFixed(2),
        delivery_date: body.deliveryDate ?? "",
        // The postcode this charge was priced and validated for. Held by Stripe,
        // so /api/orders/create can tell "the zone was edited a moment ago"
        // apart from "the client swapped the postcode after paying".
        delivery_postcode: normalizePostcode(body.postcode),
        discount_amount: discountAmount.toFixed(2),
        coupon_code: appliedCouponCode ?? "",
        offer_id: appliedOfferId ?? "",
        accessories_total: accessoriesTotal.toFixed(2),
        // ---- RECOVERY METADATA ------------------------------------------
        // Written by this server, never by the client, and read back only by
        // /api/stripe/webhook when the browser fails to save the order. These
        // are what let a recovered order name a real customer and a real
        // address even if the checkout_drafts migration has not been run.
        // Kept well inside Stripe's 500-character-per-value limit by the
        // same caps the order route applies.
        customer_name: contact.name.slice(0, 200),
        customer_email: contact.email.slice(0, 200),
        customer_phone: contact.phone.slice(0, 60),
        address_line: cleanString(body.address?.line, 200),
        address_city: cleanString(body.address?.city, 100),
      },
    });

    // Persist the full basket + details against this intent, so the webhook can
    // rebuild the exact order the browser would have written. Best-effort by
    // design (see lib/checkout-draft): a failure here must never stop a payment
    // that is otherwise ready to take.
    await saveCheckoutDraft(supabase, intent.id, {
      customer: { name: contact.name, email: contact.email, phone: contact.phone },
      address: {
        line: cleanString(body.address?.line, 200),
        city: cleanString(body.address?.city, 100),
        // The postcode the charge was priced for, not a second unvalidated one.
        postcode: cleanString(body.postcode, 20),
      },
      deliveryDate: body.deliveryDate ?? "",
      specialInstructions: cleanText(body.specialInstructions, 2000),
      items,
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
      accessoriesTotal,
      // Per-line accessory extras, in the order the client sent its items, so
      // the order snapshot records what was actually charged rather than what
      // the client believed.
      lineAddons: lines.map((line) => line.addons),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not start payment." },
      { status: 500 },
    );
  }
}
