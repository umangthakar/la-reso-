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
import { matchDeliveryZone, normalizePostcode, round2 } from "@/lib/pricing";
import { notifyOrder } from "@/lib/notifications";
import { sendOrderNotification } from "@/lib/ntfy";
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

/**
 * True when an insert failed because a CHECK constraint rejected the value
 * (Postgres 23514) — e.g. status='pending' before 27_order_lifecycle.sql has
 * widened the allowed statuses. Lets us fall back to the legacy 'received'
 * status so checkout NEVER breaks before the migration is run.
 */
function isCheckViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23514") return true;
  return /violates check constraint|check constraint/i.test(err.message ?? "");
}

type OrderItemCustomization = {
  lines?: { key: string; label: string; value: string; price: number }[];
  selections?: Record<string, unknown>;
  total?: number;
};

type Body = {
  paymentIntentId?: string;
  customer?: { name?: string; email?: string; phone?: string };
  address?: { line?: string; city?: string; postcode?: string };
  deliveryDate?: string;
  specialInstructions?: string;
  items?: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    /** Per-unit accessory extra from the cake customization wizard. */
    addons?: number;
    customization?: OrderItemCustomization | null;
  }[];
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
  /** The postcode this charge was priced and validated for, per Stripe. */
  let metaPostcode = "";
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
    metaPostcode = normalizePostcode(pi.metadata?.delivery_postcode);
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
  // cleanString/cleanText return "" for any non-string, so a crafted payload
  // like {address:{line:{}}} cannot stringify an object into the database.
  const addressLine = cleanString(addr.line, 200);
  const addressCity = cleanString(addr.city, 100);
  const deliveryAddress = [addressLine, addressCity].filter(Boolean).join(", ");
  const postcode = cleanString(addr.postcode, 20);
  const instructions = cleanText(body.specialInstructions, 2000) || null;

  const customerName = normaliseName(cleanString(body.customer?.name, 200));
  const customerEmail = normaliseEmail(body.customer?.email);
  const customerPhone = normalisePhone(cleanString(body.customer?.phone, 60));

  // Re-validated server-side with the SAME shared rules the checkout form uses.
  // A genuine customer cannot reach here with invalid values (step 1 gates the
  // contact fields and the Back button is hidden on the payment step), so this
  // only ever rejects a request crafted to bypass the UI — before it can write a
  // malformed name/email/phone onto a real order.
  const contactChecks: Array<[field: string, error: string]> = [
    ["name", validateName(customerName)],
    ["email", validateEmail(customerEmail)],
    ["phone", validatePhone(customerPhone)],
  ];
  // ---- DELIVERY AREA GATE (independent re-check, before ANY write) --------
  // /api/checkout/create-intent already refused an out-of-area postcode, but
  // this route is reachable on its own, so it verifies the postcode itself
  // rather than assuming the earlier call happened. Zones are read live from
  // the admin's settings and matched with matchDeliveryZone — the same function
  // the form and the PaymentIntent route use. Same `zones.length > 0` condition,
  // so an unconfigured bakery is unaffected.
  const zonesRes = await supabase
    .from("site_settings")
    .select("delivery_zones")
    .limit(1)
    .maybeSingle();
  const zones = Array.isArray(zonesRes.data?.delivery_zones)
    ? (zonesRes.data!.delivery_zones as { postcode_prefix?: string; fee?: number }[])
    : [];

  if (zones.length > 0 && !matchDeliveryZone(postcode, zones)) {
    // One narrow exception, and it is not a weakening: the postcode is accepted
    // when it is byte-identical to the one Stripe records this charge as having
    // been priced and validated for. Such metadata can only exist on an intent
    // that already passed the gate above, so it cannot be manufactured — it only
    // covers the case where an admin edits a zone in the seconds between paying
    // and saving, which must not cost a customer the order they've been charged
    // for. A client that swaps the postcode after paying does NOT match, and is
    // rejected.
    const chargedForThisPostcode =
      metaPostcode !== "" && metaPostcode === normalizePostcode(postcode);

    if (!chargedForThisPostcode) {
      console.warn("[orders/create] blocked — postcode outside every delivery zone", {
        paymentIntentId,
        postcode,
      });
      return NextResponse.json(
        { error: "Invalid delivery postcode" },
        { status: 400 },
      );
    }
    console.warn("[orders/create] postcode no longer in a zone but was validated at payment", {
      paymentIntentId,
      postcode,
    });
  }

  // Columns present on every version of the orders table.
  const coreOrder = {
    customer_name: customerName,
    email: customerEmail,
    phone: customerPhone,
    message: instructions, // surfaced by the admin Orders drawer
    delivery_date: body.deliveryDate || null,
    subtotal: metaSubtotal,
    delivery_charge: metaDelivery,
    total: paidTotal,
    amount: paidTotal,
    // NEW ORDERS WAIT FOR OWNER APPROVAL. Every order starts Pending; the
    // owner accepts it in the admin panel to move it to Received. (Falls back
    // to 'received' below only if the status-constraint migration isn't run.)
    status: "pending",
    stripe_payment_intent: paymentIntentId,
  };

  // Extra columns added by the latest setup SQL (may not exist yet).
  const fullOrder = {
    ...coreOrder,
    // Payment is captured at checkout, so it is Paid the moment the order
    // exists. (27_order_lifecycle.sql adds this column; dropped by the
    // isMissingColumn fallback if the migration hasn't run.)
    payment_status: "paid",
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

  // Safety net: if this DB's status CHECK constraint predates the 'pending'
  // state (27_order_lifecycle.sql not yet run), inserting 'pending' fails.
  // Retry with the legacy 'received' status so checkout is never blocked —
  // the owner-approval step simply won't apply until the migration is run.
  if (orderErr && isCheckViolation(orderErr)) {
    ({ data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({ ...coreOrder, status: "received" })
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
  //    A customized cake also carries its accessories: `addons_total` is the
  //    per-unit extra and `customization` is the resolved, human-readable
  //    choice list the baker works from. Both are snapshots — editing or
  //    deleting an accessory later must never rewrite a placed order.
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 0) {
    const rows = items.map((i) => {
      const qty = Math.max(1, Math.trunc(Number(i.quantity)) || 1);
      const unit = round2(Number(i.price) || 0);
      const addons = round2(Math.max(0, Number(i.addons) || 0));
      return {
        order_id: order.id,
        product_id: i.id,
        product_name: i.name,
        unit_price: unit,
        quantity: qty,
        line_total: round2((unit + addons) * qty),
        addons_total: addons,
        customization: i.customization ?? null,
      };
    });

    // Don't fail the whole order if items can't be written; the order is saved.
    // If 22_accessories.sql hasn't been run, the two new columns don't exist
    // yet — retry without them rather than losing the line items.
    const { error: itemsErr } = await supabase.from("order_items").insert(rows);
    if (itemsErr && isMissingColumn(itemsErr)) {
      await supabase.from("order_items").insert(
        rows.map(({ addons_total, customization, ...core }) => {
          void addons_total;
          void customization;
          return core;
        }),
      );
    }
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

  // 6) Notify: the customer by email, the owner on WhatsApp. Both carry the
  //    cake, its accessories, every message and note, the quantities and the
  //    total. Same best-effort posture as everything above — the payment has
  //    already succeeded and the order is saved, so an unconfigured provider or
  //    a failed send is a log line, never an error the customer sees.
  //    (notifyOrder resolves with a report and never rejects.)
  // Derived from the ORDER id exactly as the confirmation page derives it
  // (app/checkout#toOrderNumber), so the customer, the owner, the screen and
  // every notification all quote the same number.
  const orderNumber = String(order.id).replace(/-/g, "").slice(0, 8).toUpperCase();

  try {
    const report = await notifyOrder(supabase, {
      orderNumber,
      customerName: coreOrder.customer_name,
      email: coreOrder.email,
      phone: coreOrder.phone,
      address: [deliveryAddress, postcode].filter(Boolean).join(" "),
      deliveryDate: String(body.deliveryDate ?? ""),
      specialInstructions: instructions ?? "",
      items: items.map((i) => ({
        name: i.name,
        quantity: Math.max(1, Math.trunc(Number(i.quantity)) || 1),
        unitPrice: round2(Number(i.price) || 0),
        addons: round2(Math.max(0, Number(i.addons) || 0)),
        lines: i.customization?.lines ?? [],
      })),
      subtotal: metaSubtotal,
      discount: metaDiscount,
      deliveryFee: metaDelivery,
      total: paidTotal,
    });
    if (report.errors.length > 0) {
      console.error("[orders/create] notification issues:", report.errors.join(" | "));
    }
  } catch (e) {
    console.error("[orders/create] notification threw:", e);
  }

  // Instant ntfy push to the owner's phone. Same best-effort posture: the
  // payment has succeeded and the order is saved, so a missing config or a
  // failed/slow push is only a log line and MUST never block checkout.
  try {
    await sendOrderNotification({
      orderNumber,
      customerName: coreOrder.customer_name,
      // This route only runs once Stripe reports the payment succeeded, so
      // the order is always Paid at this point.
      paymentStatus: "Paid",
      orderTotal: paidTotal,
      orderTime: new Date(),
    });
  } catch (e) {
    console.error("[orders/create] ntfy push threw:", e);
  }

  return NextResponse.json({ orderId: order.id });
}
