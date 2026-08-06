// ============================================================
// SERVER-ONLY — the single implementation of "a Stripe payment succeeded,
// write the order".
//
// WHY THIS EXISTS. This logic used to live inline in POST /api/orders/create,
// which is called by the BROWSER after Stripe confirms the payment. That makes
// order creation depend on the customer's tab surviving a few hundred
// milliseconds: close it, lose signal or crash, and Stripe has taken real money
// with no order behind it. The Stripe webhook (/api/stripe/webhook) is the
// server-side safety net, and it must produce the SAME order the browser would
// have — same pricing checks, same fallbacks, same notifications — so both
// callers now run this one function.
//
// The behaviour of the browser path is unchanged. `source` only relaxes the two
// gates that exist to stop a CRAFTED BROWSER REQUEST (contact validation and
// the delivery-zone check): on the webhook path the input came from our own
// server-written draft, the payment has already been captured, and refusing to
// record it would lose exactly the order this module exists to save. There the
// gates annotate the order for the owner instead of rejecting it.
//
// NEVER import from the browser.
// ============================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { matchDeliveryZone, normalizePostcode, round2 } from "@/lib/pricing";
import { priceBasket, type IncomingItem } from "@/lib/basket-pricing";
import { deleteCheckoutDraft } from "@/lib/checkout-draft";
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

/**
 * True when an insert lost the race to another writer on the unique index over
 * orders.stripe_payment_intent (44_stripe_webhook.sql). This is the DURABLE
 * idempotency guarantee: the browser call and one or more webhook deliveries
 * can arrive at the same instant, and only one row can ever exist.
 */
function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key value|unique constraint/i.test(err.message ?? "");
}

/** Who is asking for the order to be written. */
export type OrderSource = "checkout" | "webhook";

export type CreateOrderInput = {
  paymentIntentId: string;
  customer?: { name?: string; email?: string; phone?: string };
  address?: { line?: string; city?: string; postcode?: string };
  deliveryDate?: string;
  specialInstructions?: string;
  /**
   * The basket, as IDENTIFIERS ONLY. `name`, `price` and `addons` may still be
   * present (older tabs send them) but are deliberately IGNORED — every money
   * field and every label on the saved order is re-derived from the database by
   * priceBasket() below. See the C3 note in that block.
   */
  items?: IncomingItem[];
  source: OrderSource;
};

export type CreateOrderResult =
  | { ok: true; orderId: string; created: boolean }
  | { ok: false; status: number; error: string };

/**
 * Success — and the point at which the checkout draft has done its job.
 *
 * The draft exists ONLY so the webhook can rebuild an order the browser never
 * saved; once the order row exists it holds the same name, phone and delivery
 * address, so a second copy is personal data kept for no reason. Dropping it
 * here rather than in the webhook covers BOTH callers: the normal browser path
 * is the one that runs on virtually every order, and it would otherwise leave
 * every customer's details sitting in checkout_drafts until the 7-day sweep.
 *
 * Best-effort and awaited only for ordering: deleteCheckoutDraft never throws,
 * and a draft left behind costs nothing but the sweep.
 */
async function succeed(
  supabase: SupabaseClient,
  paymentIntentId: string,
  orderId: string,
  created: boolean,
): Promise<CreateOrderResult> {
  await deleteCheckoutDraft(supabase, paymentIntentId);
  return { ok: true, orderId, created };
}

/**
 * Verify the payment with Stripe and write the order. Idempotent per
 * PaymentIntent: an id that already has an order returns that order and
 * touches nothing (created: false).
 */
export async function createOrderFromPayment(
  supabase: SupabaseClient,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const paymentIntentId = String(input.paymentIntentId ?? "").trim();
  if (!paymentIntentId) {
    return { ok: false, status: 400, error: "Missing payment reference." };
  }
  const fromWebhook = input.source === "webhook";

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
      return { ok: false, status: 402, error: "Payment has not completed." };
    }
    paidTotal = round2((pi.amount_received || pi.amount || 0) / 100);
    metaSubtotal = Number(pi.metadata?.subtotal) || 0;
    metaDelivery = Number(pi.metadata?.delivery_fee) || 0;
    metaDiscount = Number(pi.metadata?.discount_amount) || 0;
    metaCoupon = (pi.metadata?.coupon_code || "").trim() || null;
    metaOffer = (pi.metadata?.offer_id || "").trim() || null;
    metaPostcode = normalizePostcode(pi.metadata?.delivery_postcode);
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : "Could not verify payment.",
    };
  }

  // 2) Idempotency — if this PaymentIntent already produced an order, reuse it.
  const existing = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent", paymentIntentId)
    .maybeSingle();
  if (existing.data?.id) {
    return succeed(supabase, paymentIntentId, String(existing.data.id), false);
  }

  // ---- C3: REBUILD THE BASKET SERVER-SIDE --------------------------------
  // This route used to write order_items straight from the request body, so a
  // crafted call could pay for one cupcake and record ten £109 cakes against
  // the order. The client is now trusted ONLY for identifiers and quantity:
  // priceBasket() re-reads every product, size price, accessory extra and
  // label from the database — the same function /api/checkout/create-intent
  // used to compute the amount Stripe actually charged.
  //
  // The recomputed subtotal is then compared with the subtotal recorded on the
  // PaymentIntent by our own server. Any tampering with productId, sizeId,
  // quantity or the wizard selections changes that number and fails the check.
  const priceResult = await priceBasket(
    supabase,
    Array.isArray(input.items) ? input.items : [],
  );
  const priced = priceResult.ok
    ? priceResult.basket
    : { lines: [] as never[], subtotal: 0 };

  // Tolerance of half a penny absorbs float representation only, not tampering.
  const basketMatchesCharge =
    priceResult.ok && Math.abs(priced.subtotal - metaSubtotal) < 0.005;

  // A mismatch is NOT allowed to write the client's version of the basket.
  // But the payment has already succeeded, so it must not lose a real
  // customer's order either: we save the order (with the authoritative Stripe
  // amounts) and simply omit the line items, flagging it loudly for the owner.
  // An attacker therefore gains nothing — no inflated item ever reaches the
  // baker — while a genuine order that fell foul of, say, an admin editing a
  // price mid-checkout still arrives and can be reconciled by hand.
  const notes: string[] = [];
  if (!basketMatchesCharge) {
    notes.push(
      "⚠️ ITEMS COULD NOT BE VERIFIED — the basket did not re-price to the amount charged. " +
        "Contact the customer to confirm what they ordered before baking.",
    );
    console.error("[order-create] basket did not match the charged amount", {
      paymentIntentId,
      source: input.source,
      chargedSubtotal: metaSubtotal,
      recomputedSubtotal: priceResult.ok ? priced.subtotal : null,
      pricingError: priceResult.ok ? null : priceResult.error,
      itemCount: Array.isArray(input.items) ? input.items.length : 0,
    });
  }

  const addr = input.address ?? {};
  // cleanString/cleanText return "" for any non-string, so a crafted payload
  // like {address:{line:{}}} cannot stringify an object into the database.
  const addressLine = cleanString(addr.line, 200);
  const addressCity = cleanString(addr.city, 100);
  const deliveryAddress = [addressLine, addressCity].filter(Boolean).join(", ");
  const postcode = cleanString(addr.postcode, 20);
  const customerInstructions = cleanText(input.specialInstructions, 2000) || null;

  const customerName = normaliseName(cleanString(input.customer?.name, 200));
  const customerEmail = normaliseEmail(input.customer?.email);
  const customerPhone = normalisePhone(cleanString(input.customer?.phone, 60));

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
  const badContact = contactChecks.find(([, error]) => error !== "");
  if (badContact) {
    // Browser path: reject, exactly as before — nothing has been charged that
    // this call is responsible for losing, and the request is crafted.
    if (!fromWebhook) {
      return { ok: false, status: 400, error: badContact[1] };
    }
    // Webhook path: the money is already taken. Record it and say so.
    notes.push(
      `⚠️ CONTACT DETAILS INCOMPLETE (${badContact[0]}) — recovered from the payment record. ` +
        "Check them with the customer before delivering.",
    );
  }

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
      if (!fromWebhook) {
        console.warn("[order-create] blocked — postcode outside every delivery zone", {
          paymentIntentId,
          postcode,
        });
        return { ok: false, status: 400, error: "Invalid delivery postcode" };
      }
      // Webhook path: never drop a captured payment over a zone edit.
      notes.push(
        "⚠️ DELIVERY POSTCODE OUTSIDE EVERY ZONE — recovered from the payment record. " +
          "Confirm the address is deliverable before baking.",
      );
    } else {
      console.warn("[order-create] postcode no longer in a zone but was validated at payment", {
        paymentIntentId,
        postcode,
      });
    }
  }

  if (fromWebhook) {
    notes.push(
      "ℹ️ RECOVERED AUTOMATICALLY from the Stripe webhook — the customer's browser did not " +
        "finish saving this order (closed tab, lost connection or a crash). The payment " +
        "succeeded and is recorded below.",
    );
  }

  // The verification warnings ride on the same field the baker already reads.
  const instructions =
    [customerInstructions, ...notes].filter(Boolean).join("\n\n") || null;

  // Columns present on every version of the orders table.
  const coreOrder = {
    customer_name: customerName,
    email: customerEmail,
    phone: customerPhone,
    message: instructions, // surfaced by the admin Orders drawer
    delivery_date: input.deliveryDate || null,
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

  // Lost a race to a concurrent writer (the browser and a webhook delivery
  // landing together). The other side has written the very order we were about
  // to write, so adopt it — this is a success, not a duplicate and not an error.
  if (orderErr && isUniqueViolation(orderErr)) {
    const won = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent", paymentIntentId)
      .maybeSingle();
    if (won.data?.id) {
      return succeed(supabase, paymentIntentId, String(won.data.id), false);
    }
  }

  if (orderErr || !order) {
    return {
      ok: false,
      status: 500,
      error: orderErr?.message ?? "Could not save your order.",
    };
  }

  // 4) Insert line items (snapshot for analytics / invoices / the baker).
  //    A customized cake also carries its accessories: `addons_total` is the
  //    per-unit extra and `customization` is the resolved, human-readable
  //    choice list the baker works from. Both are snapshots — editing or
  //    deleting an accessory later must never rewrite a placed order.
  //
  //    These rows are built from `priced` (computed above from the DB), NOT
  //    from the request body, so the names, prices and add-on totals recorded
  //    against the order are the ones that were actually charged.
  if (basketMatchesCharge && priced.lines.length > 0) {
    const rows = priced.lines.map((line) => {
      const unit = round2(line.unitPrice);
      const addons = round2(Math.max(0, line.addons));
      return {
        order_id: order.id,
        product_id: line.productId,
        product_name: line.name,
        unit_price: unit,
        quantity: line.quantity,
        line_total: round2((unit + addons) * line.quantity),
        addons_total: addons,
        customization: line.customization,
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
      deliveryDate: String(input.deliveryDate ?? ""),
      specialInstructions: instructions ?? "",
      // Same server-rebuilt lines that were written to order_items, so the
      // customer's email and the baker's WhatsApp quote what was charged.
      items: priced.lines.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unitPrice: round2(line.unitPrice),
        addons: round2(Math.max(0, line.addons)),
        lines: line.customization?.lines ?? [],
      })),
      subtotal: metaSubtotal,
      discount: metaDiscount,
      deliveryFee: metaDelivery,
      total: paidTotal,
    });
    if (report.errors.length > 0) {
      console.error("[order-create] notification issues:", report.errors.join(" | "));
    }
  } catch (e) {
    console.error("[order-create] notification threw:", e);
  }

  // Instant ntfy push to the owner's phone. Same best-effort posture: the
  // payment has succeeded and the order is saved, so a missing config or a
  // failed/slow push is only a log line and MUST never block checkout.
  try {
    await sendOrderNotification({
      orderNumber,
      customerName: coreOrder.customer_name,
      // This path only runs once Stripe reports the payment succeeded, so
      // the order is always Paid at this point.
      paymentStatus: "Paid",
      orderTotal: paidTotal,
      orderTime: new Date(),
    });
  } catch (e) {
    console.error("[order-create] ntfy push threw:", e);
  }

  return succeed(supabase, paymentIntentId, String(order.id), true);
}
