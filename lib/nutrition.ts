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

// ------------------------------------------------------------
// Custom nutrition rows — admin-defined extra rows (e.g. Vitamin C,
// Calcium, Iron). Stored SEPARATELY from the fixed default rows above, in
// their own products.nutrition_custom jsonb array, so the default fields
// are never touched. Values are free text (they may carry units, e.g.
// "25mg"), kept in the order the admin added them.
// ------------------------------------------------------------

export type NutritionCustomRow = {
  id: string;
  label: string;
  per_100g: string;
  per_portion: string;
};

let _customRowSeq = 0;
/** A stable-enough client id for a new custom row (React keys / row identity).
 *  Server-persisted rows keep whatever id they already had. */
export function newCustomRowId(): string {
  _customRowSeq += 1;
  return `nc_${Date.now().toString(36)}_${_customRowSeq}`;
}

/**
 * Normalize an incoming custom-rows value (from a form or the DB) into a clean
 * ordered array. Rows without a label are dropped (blank draft rows). Values
 * are trimmed free text so units like "mg" survive. Order is preserved.
 */
export function normalizeCustomNutrition(raw: unknown): NutritionCustomRow[] {
  if (!Array.isArray(raw)) return [];
  const out: NutritionCustomRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = String(r.label ?? "").trim().slice(0, 60);
    if (!label) continue; // a custom row must have a name to be meaningful
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : newCustomRowId(),
      label,
      per_100g: cleanValue(r.per_100g),
      per_portion: cleanValue(r.per_portion),
    });
    if (out.length >= 60) break; // sane upper bound
  }
  return out;
}
