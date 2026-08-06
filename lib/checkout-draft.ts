// ============================================================
// SERVER-ONLY — the checkout draft that makes webhook recovery possible.
//
// WHY THIS EXISTS. /api/stripe/webhook is told a PaymentIntent succeeded and
// nothing else. Stripe carries the money and (in metadata) the contact and
// address, but not the basket, and the basket is what the baker actually
// works from. So /api/checkout/create-intent writes a draft the moment the
// PaymentIntent is created — keyed by the intent id — and the webhook reads it
// back if the customer's browser never completed /api/orders/create.
//
// EVERYTHING HERE IS BEST-EFFORT AND NEVER THROWS. A missing table (the
// migration hasn't been run), an RLS refusal or a network blip must never
// break a checkout that works today: the draft is a safety net, not a
// dependency. Without it the webhook still recovers the order from the
// PaymentIntent alone — with the amounts, contact and address, but no line
// items, flagged for the owner.
//
// The draft holds customer PII, so it is DELETED as soon as an order exists
// (the order row is then the record), and the migration ships a sweep for any
// that are left behind by abandoned payments.
//
// NEVER import from the browser.
// ============================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IncomingItem } from "@/lib/basket-pricing";

const TABLE = "checkout_drafts";

/** Exactly the fields /api/orders/create would have received from the tab. */
export type CheckoutDraft = {
  customer?: { name?: string; email?: string; phone?: string };
  address?: { line?: string; city?: string; postcode?: string };
  deliveryDate?: string;
  specialInstructions?: string;
  items?: IncomingItem[];
};

/**
 * Persist the draft for a PaymentIntent. Overwrites any previous draft for the
 * same intent, so a customer who edits their details and re-enters payment
 * recovers the LATEST version. Resolves either way — callers must not await
 * this for correctness, only for ordering.
 */
export async function saveCheckoutDraft(
  supabase: SupabaseClient,
  paymentIntentId: string,
  draft: CheckoutDraft,
): Promise<void> {
  const id = String(paymentIntentId ?? "").trim();
  if (!id) return;
  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { payment_intent_id: id, payload: draft },
        { onConflict: "payment_intent_id" },
      );
    if (error) {
      console.warn("[checkout-draft] could not save draft:", error.message);
    }
  } catch (e) {
    console.warn("[checkout-draft] could not save draft:", e);
  }
}

/** Read a draft back. Returns null when absent, unreadable or not migrated. */
export async function loadCheckoutDraft(
  supabase: SupabaseClient,
  paymentIntentId: string,
): Promise<CheckoutDraft | null> {
  const id = String(paymentIntentId ?? "").trim();
  if (!id) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("payload")
      .eq("payment_intent_id", id)
      .maybeSingle();
    if (error) {
      console.warn("[checkout-draft] could not read draft:", error.message);
      return null;
    }
    const payload = (data as { payload?: unknown } | null)?.payload;
    return payload && typeof payload === "object" ? (payload as CheckoutDraft) : null;
  } catch (e) {
    console.warn("[checkout-draft] could not read draft:", e);
    return null;
  }
}

/**
 * Drop a draft once its order exists. The order row now holds the same details,
 * so keeping a second copy of the customer's name, phone and address would be
 * retaining personal data for no purpose.
 */
export async function deleteCheckoutDraft(
  supabase: SupabaseClient,
  paymentIntentId: string,
): Promise<void> {
  const id = String(paymentIntentId ?? "").trim();
  if (!id) return;
  try {
    await supabase.from(TABLE).delete().eq("payment_intent_id", id);
  } catch {
    /* best-effort — a leftover draft is swept by the migration's cleanup */
  }
}
