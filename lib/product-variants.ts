// ============================================================
// Le Rasa Bakery — product extras (ingredients, gallery images,
// size variants) shared server helpers.
// ------------------------------------------------------------
// Used by the admin product API routes. Every write is BEST-EFFORT and
// tolerant of the 26_product_variants.sql migration not having been run:
// a missing column / table simply skips that extra rather than failing
// the whole product save. Old single-image, no-size products are
// completely unaffected.
//
// Server-only (uses the service-role client). Never import from a
// "use client" module.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeNutrition,
  normalizeCustomNutrition,
  type NutritionData,
  type NutritionCustomRow,
} from "@/lib/nutrition";

export type ProductImageInput = {
  url: string;
  sort_order?: number;
  is_primary?: boolean;
};

export type ProductSizeInput = {
  id?: string;
  label: string;
  serves?: number | string | null;
  price?: number | string | null;
  sort_order?: number;
};

/** True when an error is "table/column/relation does not exist" — i.e. the
 *  migration hasn't been run yet. We swallow these so the core product save
 *  still succeeds. */
function isMissingObject(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // 42P01 = undefined_table, 42703 = undefined_column, PGRST205 = table not
  // in schema cache, PGRST204 = column not in schema cache.
  if (["42P01", "42703", "PGRST205", "PGRST204"].includes(err.code ?? "")) return true;
  return /relation .* does not exist|column .* does not exist|could not find the/i.test(
    err.message ?? "",
  );
}

/** Clean an incoming ingredients value into an ordered list of unique,
 *  trimmed, non-empty strings (max 40 entries, 120 chars each). */
export function normalizeIngredients(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = String(item ?? "").trim().slice(0, 120);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 40) break;
  }
  return out;
}

/** Persist the ingredients list onto products.ingredients (jsonb). No-op if
 *  the column doesn't exist yet. */
export async function saveIngredients(
  supabase: SupabaseClient,
  productId: string,
  ingredients: string[],
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ ingredients })
    .eq("id", productId);
  if (error && !isMissingObject(error)) {
    // A genuine error (not a missing column) — surface via console so it's
    // visible in logs, but never throw: the product itself is already saved.
    console.error("[product-variants] saveIngredients:", error.message);
  }
}

/** Persist the nutrition object onto products.nutrition (jsonb). `null` clears
 *  it (product has no nutrition → nothing shown on the storefront). No-op if
 *  the column doesn't exist yet (26/28 migration not run). */
export async function saveNutrition(
  supabase: SupabaseClient,
  productId: string,
  nutrition: NutritionData | null,
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ nutrition })
    .eq("id", productId);
  if (error && !isMissingObject(error)) {
    // A genuine error (not a missing column) — log but never throw: the
    // product itself is already saved.
    console.error("[product-variants] saveNutrition:", error.message);
  }
}

/** Persist the custom nutrition rows onto products.nutrition_custom (jsonb).
 *  An empty list clears it (stored as null → no custom section shown). No-op if
 *  the column doesn't exist yet (29_nutrition_custom.sql not run). */
export async function saveCustomNutrition(
  supabase: SupabaseClient,
  productId: string,
  rows: NutritionCustomRow[],
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ nutrition_custom: rows.length > 0 ? rows : null })
    .eq("id", productId);
  if (error && !isMissingObject(error)) {
    // A genuine error (not a missing column) — log but never throw: the
    // product itself is already saved.
    console.error("[product-variants] saveCustomNutrition:", error.message);
  }
}

/** Replace a product's gallery images. Returns the resolved PRIMARY image url
 *  (or null) so the caller can keep products.image_url in sync. No-op (returns
 *  null) if the table doesn't exist yet. */
export async function saveImages(
  supabase: SupabaseClient,
  productId: string,
  images: ProductImageInput[],
): Promise<string | null> {
  const clean = (Array.isArray(images) ? images : [])
    .map((im, i) => ({
      url: String(im?.url ?? "").trim(),
      sort_order: Number.isFinite(Number(im?.sort_order)) ? Number(im.sort_order) : i,
      is_primary: !!im?.is_primary,
    }))
    .filter((im) => im.url);

  // Resolve a single primary: the flagged one, else the first.
  let primaryUrl: string | null = null;
  if (clean.length > 0) {
    const flagged = clean.find((im) => im.is_primary);
    primaryUrl = (flagged ?? clean[0]).url;
    for (const im of clean) im.is_primary = im.url === primaryUrl;
  }

  // Wipe and re-insert so ordering / primary / deletions all take effect.
  const del = await supabase.from("product_images").delete().eq("product_id", productId);
  if (del.error) {
    if (isMissingObject(del.error)) return null; // table not migrated → skip
    console.error("[product-variants] saveImages delete:", del.error.message);
    return primaryUrl;
  }

  if (clean.length > 0) {
    const rows = clean.map((im, i) => ({
      product_id: productId,
      url: im.url,
      sort_order: im.sort_order ?? i,
      is_primary: im.is_primary,
    }));
    const ins = await supabase.from("product_images").insert(rows);
    if (ins.error && !isMissingObject(ins.error)) {
      console.error("[product-variants] saveImages insert:", ins.error.message);
    }
  }
  return primaryUrl;
}

/** Replace a product's size variants. No-op if the table doesn't exist yet. */
export async function saveSizes(
  supabase: SupabaseClient,
  productId: string,
  sizes: ProductSizeInput[],
): Promise<void> {
  const clean = (Array.isArray(sizes) ? sizes : [])
    .map((s, i) => {
      const serves = s?.serves === null || s?.serves === undefined || s?.serves === ""
        ? null
        : Math.max(0, Math.trunc(Number(s.serves)) || 0);
      return {
        label: String(s?.label ?? "").trim().slice(0, 60),
        serves,
        price: Math.max(0, Number(s?.price) || 0),
        sort_order: Number.isFinite(Number(s?.sort_order)) ? Number(s.sort_order) : i,
      };
    })
    .filter((s) => s.label);

  const del = await supabase.from("product_sizes").delete().eq("product_id", productId);
  if (del.error) {
    if (isMissingObject(del.error)) return; // table not migrated → skip
    console.error("[product-variants] saveSizes delete:", del.error.message);
    return;
  }

  if (clean.length > 0) {
    const rows = clean.map((s, i) => ({
      product_id: productId,
      label: s.label,
      serves: s.serves,
      price: s.price,
      sort_order: s.sort_order ?? i,
    }));
    const ins = await supabase.from("product_sizes").insert(rows);
    if (ins.error && !isMissingObject(ins.error)) {
      console.error("[product-variants] saveSizes insert:", ins.error.message);
    }
  }
}

/**
 * Persist all three product extras in one call, after the product row itself
 * has been created/updated. Every part is best-effort and migration-tolerant.
 * Only keys present on the body are touched, so a caller that omits (say)
 * `sizes` leaves existing size variants alone.
 *
 * When `images` is provided and yields a primary url, products.image_url is
 * kept in sync so every existing card query (which reads image_url) shows the
 * chosen primary image.
 */
export async function persistExtras(
  supabase: SupabaseClient,
  productId: string,
  body: {
    ingredients?: unknown;
    images?: ProductImageInput[];
    sizes?: ProductSizeInput[];
    nutrition?: unknown;
    nutrition_custom?: unknown;
  },
): Promise<void> {
  if (body.ingredients !== undefined) {
    await saveIngredients(supabase, productId, normalizeIngredients(body.ingredients));
  }
  if (body.nutrition !== undefined) {
    await saveNutrition(supabase, productId, normalizeNutrition(body.nutrition));
  }
  if (body.nutrition_custom !== undefined) {
    await saveCustomNutrition(supabase, productId, normalizeCustomNutrition(body.nutrition_custom));
  }
  if (body.images !== undefined) {
    const primaryUrl = await saveImages(supabase, productId, body.images ?? []);
    if (primaryUrl) {
      const { error } = await supabase
        .from("products")
        .update({ image_url: primaryUrl })
        .eq("id", productId);
      if (error) console.error("[product-variants] sync image_url:", error.message);
    }
  }
  if (body.sizes !== undefined) {
    await saveSizes(supabase, productId, body.sizes ?? []);
  }
}

/** Read a product's ingredients / images / sizes for the admin edit form.
 *  Each part degrades to an empty list if its column/table is absent. */
export async function readProductExtras(
  supabase: SupabaseClient,
  productId: string,
): Promise<{
  ingredients: string[];
  nutrition: NutritionData | null;
  nutritionCustom: NutritionCustomRow[];
  images: { id: string; url: string; sort_order: number; is_primary: boolean }[];
  sizes: { id: string; label: string; serves: number | null; price: number; sort_order: number }[];
}> {
  let ingredients: string[] = [];
  try {
    const { data } = await supabase
      .from("products")
      .select("ingredients")
      .eq("id", productId)
      .maybeSingle();
    ingredients = normalizeIngredients(
      (data as { ingredients?: unknown } | null)?.ingredients,
    );
  } catch {
    ingredients = [];
  }

  // Nutrition is read in its own try/catch so a missing `nutrition` column
  // (28_nutrition.sql not run) leaves it null without affecting ingredients.
  let nutrition: NutritionData | null = null;
  try {
    const { data, error } = await supabase
      .from("products")
      .select("nutrition")
      .eq("id", productId)
      .maybeSingle();
    if (!error) {
      nutrition = normalizeNutrition((data as { nutrition?: unknown } | null)?.nutrition);
    }
  } catch {
    nutrition = null;
  }

  // Custom nutrition rows — own try/catch so a missing `nutrition_custom`
  // column (29_nutrition_custom.sql not run) leaves it empty without affecting
  // the default nutrition read above.
  let nutritionCustom: NutritionCustomRow[] = [];
  try {
    const { data, error } = await supabase
      .from("products")
      .select("nutrition_custom")
      .eq("id", productId)
      .maybeSingle();
    if (!error) {
      nutritionCustom = normalizeCustomNutrition(
        (data as { nutrition_custom?: unknown } | null)?.nutrition_custom,
      );
    }
  } catch {
    nutritionCustom = [];
  }

  let images: { id: string; url: string; sort_order: number; is_primary: boolean }[] = [];
  try {
    const { data, error } = await supabase
      .from("product_images")
      .select("id,url,sort_order,is_primary")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });
    if (!error && Array.isArray(data)) {
      images = data.map((r) => ({
        id: String(r.id),
        url: String(r.url),
        sort_order: Number(r.sort_order) || 0,
        is_primary: !!r.is_primary,
      }));
    }
  } catch {
    images = [];
  }

  let sizes: { id: string; label: string; serves: number | null; price: number; sort_order: number }[] = [];
  try {
    const { data, error } = await supabase
      .from("product_sizes")
      .select("id,label,serves,price,sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });
    if (!error && Array.isArray(data)) {
      sizes = data.map((r) => ({
        id: String(r.id),
        label: String(r.label),
        serves: r.serves === null || r.serves === undefined ? null : Number(r.serves),
        price: Number(r.price) || 0,
        sort_order: Number(r.sort_order) || 0,
      }));
    }
  } catch {
    sizes = [];
  }

  return { ingredients, nutrition, nutritionCustom, images, sizes };
}
