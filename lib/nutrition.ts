// ============================================================
// Le Rasa Bakery — Nutrition Information: canonical rows + pure
// helpers shared by the admin form, the storefront product page and
// the server-side product API.
// ------------------------------------------------------------
// PURE + dependency-free (no supabase, no server-only imports) so it is
// safe to import from both "use client" components and server code.
//
// The data is stored on products.nutrition (jsonb, nullable). A product
// with no nutrition data has nutrition = null and renders nothing on the
// storefront — fully backward compatible with existing products.
// ============================================================

/** The fixed set of nutrition rows, in display order. */
export type NutritionKey =
  | "energy_kj"
  | "energy_kcal"
  | "fat"
  | "saturates"
  | "carbohydrate"
  | "sugars"
  | "protein"
  | "salt"
  | "fibre";

/** Two editable values per row: per 100g and per portion. Kept as trimmed
 *  strings so the admin can type "348.1" etc. without number coercion. */
export type NutritionCell = { per_100g: string; per_portion: string };

export type NutritionData = Record<NutritionKey, NutritionCell>;

/** Ordered rows shown identically in the admin editor and on the storefront.
 *  `indent` marks the "of which …" sub-rows (Saturates, Sugars). */
export const NUTRITION_ROWS: {
  key: NutritionKey;
  label: string;
  indent?: boolean;
}[] = [
  { key: "energy_kj", label: "Energy (kJ)" },
  { key: "energy_kcal", label: "Energy (KCal)" },
  { key: "fat", label: "Fat (g)" },
  { key: "saturates", label: "of which Saturates (g)", indent: true },
  { key: "carbohydrate", label: "Carbohydrate (g)" },
  { key: "sugars", label: "of which Sugars (g)", indent: true },
  { key: "protein", label: "Protein (g)" },
  { key: "salt", label: "Salt (g)" },
  { key: "fibre", label: "Fibre (g)" },
];

const KEYS: NutritionKey[] = NUTRITION_ROWS.map((r) => r.key);

/** Trim a single cell value to a short, safe string (max 20 chars). */
function cleanValue(v: unknown): string {
  return String(v ?? "").trim().slice(0, 20);
}

/** An all-blank editable nutrition object (every cell present but empty).
 *  Used to seed the admin form. */
export function emptyNutrition(): NutritionData {
  const out = {} as NutritionData;
  for (const key of KEYS) out[key] = { per_100g: "", per_portion: "" };
  return out;
}

/**
 * Normalize an incoming nutrition value (from a form or the DB) into a clean,
 * fully-keyed object — or `null` when it holds no meaningful values at all.
 *
 * Returning null for the empty case is what makes the feature conditional:
 * the server stores null, and the storefront hides the whole section.
 */
export function normalizeNutrition(raw: unknown): NutritionData | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out = {} as NutritionData;
  let hasAny = false;
  for (const key of KEYS) {
    const cellRaw = src[key];
    let per100 = "";
    let perPortion = "";
    if (cellRaw && typeof cellRaw === "object") {
      const c = cellRaw as Record<string, unknown>;
      per100 = cleanValue(c.per_100g);
      perPortion = cleanValue(c.per_portion);
    }
    if (per100 || perPortion) hasAny = true;
    out[key] = { per_100g: per100, per_portion: perPortion };
  }
  return hasAny ? out : null;
}

/** True when the nutrition object has at least one non-empty value. */
export function hasNutrition(n: NutritionData | null | undefined): boolean {
  if (!n) return false;
  return NUTRITION_ROWS.some((r) => !!(n[r.key]?.per_100g || n[r.key]?.per_portion));
}
