// ============================================================
// POST /api/offers/validate-coupon — public coupon-entry validation.
// Body: { code, cartItems: [{ id, category, price, quantity }], postcode?, email? }
//
// Looks the code up via the Phase-1 SECURITY DEFINER `validate_coupon(code)`
// function (anon can't enumerate coupon offers directly), then runs the SAME
// lib/offers.ts checks the checkout uses. Returns either a discount preview or
// a SPECIFIC reason it doesn't apply — never a bare "invalid" when the code is
// real but conditions aren't met.
//
// Note: this preview cannot verify first-order / new-customer / specific-email
// audiences (no session, and offer_emails isn't anon-readable). Those are
// enforced authoritatively at checkout; here we return the preview plus a note.
// ============================================================

import { NextResponse } from "next/server";
import {
  offerFromRow,
  isOfferCurrentlyActive,
  checkCartConditions,
  computeOfferDiscount,
  type OfferCartItem,
} from "@/lib/offers";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function anonHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY as string,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ valid: false, reason: "Coupons are unavailable right now." });
  }

  let body: { code?: string; cartItems?: unknown[]; postcode?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const code = String(body.code ?? "").trim();
  if (!code) {
    return NextResponse.json({ valid: false, reason: "Enter a coupon code." });
  }

  try {
    // 1) Resolve the coupon server-side (bypasses the anon coupon-listing block).
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_coupon`, {
      method: "POST",
      headers: anonHeaders(),
      cache: "no-store",
      body: JSON.stringify({ code }),
    });
    if (!rpc.ok) {
      return NextResponse.json({ valid: false, reason: "That code isn't valid." });
    }
    const rpcRows = await rpc.json();
    const offerRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!offerRow || !offerRow.id) {
      return NextResponse.json({ valid: false, reason: "That code isn't valid." });
    }

    // 2) Fetch its (anon-readable) eligibility rules and build the Offer.
    const rulesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/offer_category_rules?select=category,mode&offer_id=eq.${offerRow.id}`,
      { headers: anonHeaders(), cache: "no-store" },
    );
    const prodRes = await fetch(
      `${SUPABASE_URL}/rest/v1/offer_product_rules?select=product_id,mode&offer_id=eq.${offerRow.id}`,
      { headers: anonHeaders(), cache: "no-store" },
    );
    const categoryRules = rulesRes.ok ? await rulesRes.json() : [];
    const productRules = prodRes.ok ? await prodRes.json() : [];
    const offer = offerFromRow({ ...offerRow, categoryRules, productRules });

    // 3) Is it live right now?
    if (!isOfferCurrentlyActive(offer, new Date())) {
      return NextResponse.json({ valid: false, reason: "This code isn't active right now." });
    }

    // 4) Build the cart and check conditions + eligibility.
    const cartItems: OfferCartItem[] = (Array.isArray(body.cartItems) ? body.cartItems : []).map(
      (raw) => {
        const it = raw as Record<string, unknown>;
        return {
          id: String(it.id ?? ""),
          category: it.category == null ? null : String(it.category),
          price: it.price as number | string | null,
          quantity: it.quantity as number | string | null,
        };
      },
    );
    const cartSubtotal = cartItems.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
    const cartQuantity = cartItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

    const cond = checkCartConditions(offer, cartSubtotal, cartQuantity);
    if (!cond.ok) {
      return NextResponse.json({ valid: false, reason: cond.reason });
    }

    const discount = computeOfferDiscount(offer, cartItems, cartSubtotal);
    if (discount.discountAmount <= 0 && !discount.freeDelivery) {
      return NextResponse.json({
        valid: false,
        reason: "This code doesn't apply to the items in your basket.",
      });
    }

    // Audiences that need a DB/session fact are verified at checkout, not here.
    const note =
      offer.audience === "first_order"
        ? "Valid for first orders only — we'll confirm at checkout."
        : offer.audience === "new_customer"
          ? "Valid for new customers only — we'll confirm at checkout."
          : offer.audience === "specific_emails"
            ? "Limited to eligible accounts — we'll confirm at checkout."
            : undefined;

    return NextResponse.json({
      valid: true,
      code,
      offerId: offer.id,
      offerName: offer.name,
      discountAmount: discount.discountAmount,
      freeDelivery: discount.freeDelivery,
      ...(note ? { note } : {}),
    });
  } catch {
    return NextResponse.json({ valid: false, reason: "Could not validate that code." });
  }
}
