// ============================================================
// Le Rasa Bakery — SERVER-ONLY admin helpers for the offers CRUD routes.
// ------------------------------------------------------------
// Maps an admin form body -> the `offers` row, validates required fields per
// `type`, syncs the normalised child-rule tables, and recognises the Phase-1
// exclusion-constraint violation so routes can turn it into a friendly 409.
// Kept out of lib/offers.ts on purpose: that file is pure/client-safe; this
// one takes a SupabaseClient and does I/O.
// ============================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChildRules = {
  categoryRules: { category: string; mode: "include" | "exclude" }[];
  productRules: { product_id: string; mode: "include" | "exclude" }[];
  emails: string[];
};

/** PostgREST/Postgres error surfaced when the exclusion constraint rejects a
 *  second overlapping non-stackable offer (SQLSTATE 23P01). */
export function isExclusionViolation(
  err: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!err) return false;
  if (err.code === "23P01") return true;
  return /exclusion|one_active_non_stackable_offer/i.test(err.message ?? "");
}

export const EXCLUSION_MESSAGE =
  "Another non-stackable offer is already active in this window.";

/** Empty / null / "" numeric field -> null (means "no restriction"). */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

type Body = Record<string, unknown>;

/** Validate required fields for the given offer `type`. Returns an error
 *  message, or null when the body is valid. */
export function validateOfferBody(body: Body): string | null {
  const name = strOrNull(body.name);
  if (!name) return "Name is required.";

  const type = String(body.type ?? "");
  switch (type) {
    case "percentage":
      if (!(numOrNull(body.percentage_value) ?? 0)) return "A percentage value is required.";
      break;
    case "fixed_amount":
      if (!(numOrNull(body.fixed_amount_value) ?? 0)) return "A fixed amount is required.";
      break;
    case "buy_x_get_y":
      if (!(numOrNull(body.buy_x_quantity) ?? 0) || !(numOrNull(body.get_y_quantity) ?? 0))
        return "Buy X and Get Y quantities are required.";
      break;
    case "coupon": {
      if (!strOrNull(body.coupon_code)) return "A coupon code is required.";
      const cdt = String(body.coupon_discount_type ?? "");
      if (cdt !== "percentage" && cdt !== "fixed_amount")
        return "Choose whether the coupon is a percentage or a fixed amount.";
      const val = cdt === "percentage" ? numOrNull(body.percentage_value) : numOrNull(body.fixed_amount_value);
      if (!(val ?? 0)) return "A coupon discount value is required.";
      break;
    }
    case "free_delivery":
    case "custom":
      break;
    default:
      return "Unknown offer type.";
  }
  return null;
}

/** Map an admin form body to a writable `offers` row (scalar columns only). */
export function buildOfferRow(body: Body): Record<string, unknown> {
  return {
    name: strOrNull(body.name),
    type: String(body.type ?? "custom"),
    enabled: body.enabled === true,
    stackable: body.stackable === true,
    priority: Number(body.priority) || 0,
    percentage_value: numOrNull(body.percentage_value),
    fixed_amount_value: numOrNull(body.fixed_amount_value),
    buy_x_quantity: numOrNull(body.buy_x_quantity),
    get_y_quantity: numOrNull(body.get_y_quantity),
    get_y_discount_percent: numOrNull(body.get_y_discount_percent) ?? 100,
    free_delivery: body.free_delivery === true,
    coupon_code: strOrNull(body.coupon_code),
    coupon_discount_type: strOrNull(body.coupon_discount_type),
    eligibility_scope: String(body.eligibility_scope ?? "all"),
    min_order_amount: numOrNull(body.min_order_amount),
    max_order_amount: numOrNull(body.max_order_amount),
    min_quantity: numOrNull(body.min_quantity),
    max_quantity: numOrNull(body.max_quantity),
    audience: String(body.audience ?? "everyone"),
    usage_limit_total: numOrNull(body.usage_limit_total),
    usage_limit_per_customer: numOrNull(body.usage_limit_per_customer),
    start_at: strOrNull(body.start_at),
    end_at: strOrNull(body.end_at),
    time_start: strOrNull(body.time_start),
    time_end: strOrNull(body.time_end),
    days_of_week: Array.isArray(body.days_of_week)
      ? (body.days_of_week as unknown[]).map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : null,
    announcement_text: strOrNull(body.announcement_text),
    hero_heading: strOrNull(body.hero_heading),
    hero_subtext: strOrNull(body.hero_subtext),
    hero_highlight_text: strOrNull(body.hero_highlight_text),
    cta_text: strOrNull(body.cta_text),
    cta_link: strOrNull(body.cta_link),
    banner_image_url: strOrNull(body.banner_image_url),
  };
}

/** Normalise the child-rule arrays from a form body. */
export function extractChildRules(body: Body): ChildRules {
  const rawCat = Array.isArray(body.categoryRules) ? (body.categoryRules as Record<string, unknown>[]) : [];
  const rawProd = Array.isArray(body.productRules) ? (body.productRules as Record<string, unknown>[]) : [];
  const rawEmails = Array.isArray(body.emails) ? (body.emails as unknown[]) : [];

  return {
    categoryRules: rawCat
      .map((c) => ({
        category: String(c.category ?? "").trim(),
        mode: c.mode === "exclude" ? ("exclude" as const) : ("include" as const),
      }))
      .filter((c) => c.category !== ""),
    productRules: rawProd
      .map((p) => ({
        product_id: String(p.product_id ?? "").trim(),
        mode: p.mode === "exclude" ? ("exclude" as const) : ("include" as const),
      }))
      .filter((p) => p.product_id !== ""),
    emails: rawEmails
      .map((e) => String(e ?? "").trim().toLowerCase())
      .filter((e) => e !== ""),
  };
}

/**
 * Replace an offer's child rows (category rules, product rules, emails) with
 * the supplied set — delete-then-insert so a full update is idempotent. Used
 * by both create (no existing rows) and update.
 */
export async function syncOfferRules(
  supabase: SupabaseClient,
  offerId: string,
  rules: ChildRules,
): Promise<void> {
  await supabase.from("offer_category_rules").delete().eq("offer_id", offerId);
  await supabase.from("offer_product_rules").delete().eq("offer_id", offerId);
  await supabase.from("offer_emails").delete().eq("offer_id", offerId);

  if (rules.categoryRules.length > 0) {
    await supabase
      .from("offer_category_rules")
      .insert(rules.categoryRules.map((r) => ({ offer_id: offerId, category: r.category, mode: r.mode })));
  }
  if (rules.productRules.length > 0) {
    await supabase
      .from("offer_product_rules")
      .insert(rules.productRules.map((r) => ({ offer_id: offerId, product_id: r.product_id, mode: r.mode })));
  }
  if (rules.emails.length > 0) {
    await supabase
      .from("offer_emails")
      .insert(rules.emails.map((email) => ({ offer_id: offerId, email })));
  }
}

/** The embed used to read an offer together with its child rules. */
export const OFFER_WITH_RULES_SELECT =
  "*, offer_category_rules(category,mode), offer_product_rules(product_id,mode), offer_emails(email)";
