// ============================================================
// Le Rasa Bakery — accessories / customization engine
// ------------------------------------------------------------
// Pure, isomorphic logic for the Accessories Management System: which
// accessory categories are visible, what a set of selections costs, whether
// it's valid, and how to describe it on the cart, the order, the admin panel
// and the notifications.
//
// The customization page (client) and /api/checkout/create-intent (server)
// BOTH import this file, so the price the customer is shown and the price
// Stripe charges are computed by the same code over the same DB config. The
// server always re-reads the config and re-prices from scratch — a tampered
// client cannot buy a £6 topper for £0.
//
// Nothing here is hardcoded about candles, cards, balloons or toppers: every
// category, item, price, limit and dependency arrives from the database
// (supabase/sql/22_accessories.sql).
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/pricing";

export type DisplayType =
  | "radio"
  | "dropdown"
  | "checkbox"
  | "toggle"
  | "quantity"
  | "text"
  | "textarea";

export const DISPLAY_TYPES: DisplayType[] = [
  "radio",
  "dropdown",
  "checkbox",
  "toggle",
  "quantity",
  "text",
  "textarea",
];

/** One item inside a category — a Sparkler, a Rose stem, a Custom topper. */
export type Accessory = {
  id: string;
  value: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  minQty: number;
  maxQty: number;
  isDefault: boolean;
  /** Disabled accessories reach the ADMIN only — never the storefront. */
  active: boolean;
};

/** One control on the customization page. */
export type AccessoryCategory = {
  id: string;
  key: string;
  name: string;
  displayType: DisplayType;
  description: string | null;
  placeholder: string | null;
  imageUrl: string | null;
  /** Extra charged when a toggle is on, or a text/textarea is filled in. */
  price: number;
  required: boolean;
  maxChars: number | null;
  minQty: number;
  maxQty: number;
  /** Only shown while category `dependsOnKey` holds `dependsOnValue`. */
  dependsOnKey: string | null;
  dependsOnValue: string | null;
  /** Empty = offered on every customizable product. */
  productCategories: string[];
  /** Disabled categories reach the ADMIN only — never the storefront. */
  active: boolean;
  accessories: Accessory[];
};

/** One category's answer. Which field is used depends on the display type. */
export type Selection = {
  /** radio / dropdown / checkbox */
  values?: string[];
  /** quantity — accessory value → how many */
  quantities?: Record<string, number>;
  /** toggle */
  enabled?: boolean;
  /** text / textarea */
  text?: string;
  /** Number-candle digits, in order (e.g. "21"). ADDITIVE + backward
   *  compatible: only the Number Candle configurator sets this, and it only
   *  ever rides on a single-select (radio/dropdown) choice. When present it
   *  multiplies the chosen accessory's price by the digit count (each digit is
   *  its own candle) — both on the storefront and in the server re-price, which
   *  use the same helpers below. Absent → every existing basket prices exactly
   *  as before. */
  digits?: string;
};

/** The ordered digits of a Number-candle selection, cleaned to 0-9 only. */
export function selectionDigits(sel: Selection | undefined): string {
  return (sel?.digits ?? "").replace(/\D/g, "");
}

/** Keyed by category key. */
export type Selections = Record<string, Selection>;

/** A resolved, human-readable line for the cart / order / email / WhatsApp. */
export type CustomizationLine = {
  key: string;
  /** The category name, e.g. "Candles". */
  label: string;
  /** What was chosen, e.g. "Sparkler" or the typed message. */
  value: string;
  /** How many (quantity categories only). */
  quantity?: number;
  /** The extra charged for THIS line, quantity included. */
  price: number;
};

/** What travels with a cart item and onto the order. */
export type Customization = {
  lines: CustomizationLine[];
  selections: Selections;
  /** Per-unit accessory extra. */
  total: number;
};

const CHOICE_TYPES: DisplayType[] = ["radio", "dropdown", "checkbox"];
const TEXT_TYPES: DisplayType[] = ["text", "textarea"];

// ------------------------------------------------------------
// Loading the config
// ------------------------------------------------------------

type CategoryRow = {
  id: string;
  key: string;
  name: string;
  display_type: string;
  description: string | null;
  placeholder: string | null;
  image_url: string | null;
  price: number | string | null;
  required: boolean | null;
  max_chars: number | null;
  min_qty: number | null;
  max_qty: number | null;
  depends_on_key: string | null;
  depends_on_value: string | null;
  categories: unknown;
  sort_order: number | null;
  active: boolean | null;
  accessories?: AccessoryRow[] | null;
};

type AccessoryRow = {
  id: string;
  value: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number | string | null;
  min_qty: number | null;
  max_qty: number | null;
  is_default: boolean | null;
  sort_order: number | null;
  active: boolean | null;
};

export const CATEGORY_COLS =
  "id,key,name,display_type,description,placeholder,image_url,price,required," +
  "max_chars,min_qty,max_qty,depends_on_key,depends_on_value,categories,sort_order,active";

export const ACCESSORY_COLS =
  "id,value,name,description,image_url,price,min_qty,max_qty,is_default,sort_order,active";

function toAccessory(row: AccessoryRow): Accessory {
  return {
    id: row.id,
    value: row.value,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    price: Number(row.price) || 0,
    minQty: Math.max(0, Number(row.min_qty) || 0),
    maxQty: Math.max(1, Number(row.max_qty) || 1),
    isDefault: row.is_default === true,
    active: row.active !== false,
  };
}

function toCategory(row: CategoryRow, includeInactive: boolean): AccessoryCategory {
  // Inactive accessories are dropped HERE, not just by RLS: the checkout prices
  // the basket with the SERVICE-ROLE client, which bypasses RLS entirely. Were
  // this filter left to the database, a disabled accessory would still be
  // priced and charged for.
  const accessories = (row.accessories ?? [])
    .filter((a) => includeInactive || a.active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(toAccessory);

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    displayType: row.display_type as DisplayType,
    description: row.description,
    placeholder: row.placeholder,
    imageUrl: row.image_url,
    price: Number(row.price) || 0,
    required: row.required === true,
    maxChars: row.max_chars ?? null,
    minQty: Math.max(0, Number(row.min_qty) || 0),
    maxQty: Math.max(1, Number(row.max_qty) || 1),
    dependsOnKey: row.depends_on_key,
    dependsOnValue: row.depends_on_value,
    productCategories: Array.isArray(row.categories)
      ? (row.categories as unknown[]).map(String)
      : [],
    active: row.active !== false,
    accessories,
  };
}

/**
 * Read the live accessories config. Works with the anon client (storefront)
 * and the service-role client (checkout, admin) alike — RLS already limits
 * anon to active rows.
 */
export async function fetchAccessoryCategories(
  supabase: SupabaseClient,
  opts?: { includeInactive?: boolean },
): Promise<AccessoryCategory[]> {
  let query = supabase
    .from("accessory_categories")
    .select(`${CATEGORY_COLS}, accessories(${ACCESSORY_COLS})`)
    .order("sort_order", { ascending: true });

  if (!opts?.includeInactive) query = query.eq("active", true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  // `database.types.ts` predates these tables, so the generated client cannot
  // type the nested select — the shape is guaranteed by the query above.
  return ((data ?? []) as unknown as CategoryRow[]).map((row) =>
    toCategory(row, opts?.includeInactive === true),
  );
}

/** The categories offered for a given product category ([] on one = all). */
export function categoriesForProduct(
  categories: AccessoryCategory[],
  productCategory: string | null,
): AccessoryCategory[] {
  const c = (productCategory ?? "").trim().toLowerCase();
  return categories.filter(
    (cat) =>
      cat.productCategories.length === 0 ||
      cat.productCategories.some((x) => x.trim().toLowerCase() === c),
  );
}

// ------------------------------------------------------------
// Visibility, pricing, validation
// ------------------------------------------------------------

/** Clamp a requested quantity into what the config actually allows. */
function clampQty(cat: AccessoryCategory, acc: Accessory, raw: number): number {
  const qty = Math.trunc(Number(raw) || 0);
  if (qty <= 0) return 0;
  const max = Math.min(acc.maxQty || Infinity, cat.maxQty || Infinity);
  return Math.min(Math.max(qty, 1), max);
}

/** The value a category currently "holds", for dependency checks. */
function heldValues(cat: AccessoryCategory, sel: Selection | undefined): string[] {
  if (!sel) return [];
  if (cat.displayType === "toggle") return sel.enabled ? ["yes"] : ["no"];
  if (cat.displayType === "quantity") {
    return Object.entries(sel.quantities ?? {})
      .filter(([, qty]) => Number(qty) > 0)
      .map(([value]) => value);
  }
  if (TEXT_TYPES.includes(cat.displayType)) {
    return (sel.text ?? "").trim() ? ["filled"] : [];
  }
  return sel.values ?? [];
}

/**
 * A category is visible when its parent (if any) currently holds the required
 * value — and when that parent is itself visible, so a chain of dependencies
 * collapses correctly.
 */
export function isCategoryVisible(
  cat: AccessoryCategory,
  categories: AccessoryCategory[],
  selections: Selections,
): boolean {
  if (!cat.dependsOnKey || !cat.dependsOnValue) return true;
  const parent = categories.find((c) => c.key === cat.dependsOnKey);
  if (!parent) return false; // parent disabled → the child cannot apply
  if (!isCategoryVisible(parent, categories, selections)) return false;
  return heldValues(parent, selections[parent.key]).includes(cat.dependsOnValue);
}

export function visibleCategories(
  categories: AccessoryCategory[],
  selections: Selections,
): AccessoryCategory[] {
  return categories.filter((c) => isCategoryVisible(c, categories, selections));
}

/** Every category's default answer — what the page opens with. */
export function defaultSelections(categories: AccessoryCategory[]): Selections {
  const out: Selections = {};
  for (const cat of categories) {
    if (CHOICE_TYPES.includes(cat.displayType)) {
      const preset = cat.accessories.filter((a) => a.isDefault).map((a) => a.value);
      // A radio/dropdown must always hold exactly one value; fall back to the
      // first item so the control is never rendered blank.
      const single =
        cat.displayType === "checkbox"
          ? preset
          : preset.slice(0, 1).length
            ? preset.slice(0, 1)
            : cat.accessories.slice(0, 1).map((a) => a.value);
      out[cat.key] = { values: single };
    } else if (cat.displayType === "quantity") {
      const quantities: Record<string, number> = {};
      // A category with a minimum starts at that minimum, pre-filled.
      for (const acc of cat.accessories) {
        if (cat.minQty > 0) quantities[acc.value] = Math.max(cat.minQty, acc.minQty);
      }
      out[cat.key] = { quantities };
    } else if (cat.displayType === "toggle") {
      out[cat.key] = { enabled: false };
    } else {
      out[cat.key] = { text: "" };
    }
  }
  return out;
}

/**
 * The per-unit accessory extra. Only VISIBLE categories are priced, so a
 * hidden answer (a card message left behind after the card toggle was switched
 * back off) can never be charged for.
 */
export function priceSelections(
  categories: AccessoryCategory[],
  selections: Selections,
): number {
  let total = 0;
  for (const cat of visibleCategories(categories, selections)) {
    const sel = selections[cat.key];
    if (!sel) continue;

    if (cat.displayType === "toggle") {
      if (sel.enabled) total += cat.price;
    } else if (cat.displayType === "quantity") {
      for (const [value, raw] of Object.entries(sel.quantities ?? {})) {
        const acc = cat.accessories.find((a) => a.value === value);
        if (!acc) continue;
        total += acc.price * clampQty(cat, acc, raw);
      }
    } else if (TEXT_TYPES.includes(cat.displayType)) {
      if ((sel.text ?? "").trim()) total += cat.price;
    } else {
      // Number-candle digits multiply the chosen accessory (each digit is a
      // candle); mult is 1 for every ordinary choice (no digits set).
      const mult = Math.max(1, selectionDigits(sel).length);
      for (const value of sel.values ?? []) {
        const acc = cat.accessories.find((a) => a.value === value);
        if (acc) total += acc.price * mult;
      }
    }
  }
  return round2(total);
}

export type ValidationResult = { ok: boolean; errors: Record<string, string> };

/**
 * Validates against the live config: required answers present, character
 * limits respected, quantities within bounds, and no unknown accessory values.
 * Hidden categories are skipped entirely — an invalid combination is
 * impossible by construction.
 */
export function validateSelections(
  categories: AccessoryCategory[],
  selections: Selections,
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const cat of visibleCategories(categories, selections)) {
    const sel = selections[cat.key] ?? {};

    if (TEXT_TYPES.includes(cat.displayType)) {
      const text = (sel.text ?? "").trim();
      if (cat.required && !text) {
        errors[cat.key] = `${cat.name} is required.`;
      } else if (cat.maxChars && text.length > cat.maxChars) {
        errors[cat.key] = `Please keep this to ${cat.maxChars} characters or fewer.`;
      }
      continue;
    }

    if (cat.displayType === "toggle") {
      if (cat.required && !sel.enabled) errors[cat.key] = `${cat.name} is required.`;
      continue;
    }

    if (cat.displayType === "quantity") {
      const entries = Object.entries(sel.quantities ?? {}).filter(
        ([, qty]) => Number(qty) > 0,
      );
      const unknown = entries.filter(
        ([value]) => !cat.accessories.some((a) => a.value === value),
      );
      if (unknown.length > 0) {
        errors[cat.key] = "That item is no longer available.";
        continue;
      }
      const overMax = entries.find(([value, qty]) => {
        const acc = cat.accessories.find((a) => a.value === value)!;
        return Number(qty) > Math.min(acc.maxQty, cat.maxQty);
      });
      if (overMax) {
        const acc = cat.accessories.find((a) => a.value === overMax[0])!;
        errors[cat.key] = `You can order up to ${Math.min(
          acc.maxQty,
          cat.maxQty,
        )} × ${acc.name}.`;
      } else if (cat.required && entries.length === 0) {
        errors[cat.key] = `Please choose at least one ${cat.name.toLowerCase()}.`;
      }
      continue;
    }

    const values = sel.values ?? [];
    const unknown = values.filter(
      (v) => !cat.accessories.some((a) => a.value === v),
    );
    if (unknown.length > 0) {
      errors[cat.key] = "That option is no longer available.";
    } else if (cat.required && values.length === 0) {
      errors[cat.key] = `Please choose an option for ${cat.name}.`;
    } else if (cat.displayType !== "checkbox" && values.length > 1) {
      errors[cat.key] = `Please choose just one option for ${cat.name}.`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * The resolved customization: what was chosen, in words, with what each
 * addition costs. Only visible categories and non-empty answers appear, so
 * the cart never lists "Knife: no". A free DEFAULT choice ("Candles: None")
 * is skipped as noise, but a free TEXT answer is kept — the baker needs to
 * read the message even though it costs nothing.
 */
export function summarize(
  categories: AccessoryCategory[],
  selections: Selections,
): CustomizationLine[] {
  const lines: CustomizationLine[] = [];

  for (const cat of visibleCategories(categories, selections)) {
    const sel = selections[cat.key];
    if (!sel) continue;

    if (cat.displayType === "toggle") {
      if (sel.enabled) {
        lines.push({ key: cat.key, label: cat.name, value: "Yes", price: cat.price });
      }
      continue;
    }

    if (cat.displayType === "quantity") {
      for (const [value, raw] of Object.entries(sel.quantities ?? {})) {
        const acc = cat.accessories.find((a) => a.value === value);
        if (!acc) continue;
        const qty = clampQty(cat, acc, raw);
        if (qty <= 0) continue;
        lines.push({
          key: cat.key,
          label: cat.name,
          value: acc.name,
          quantity: qty,
          price: round2(acc.price * qty),
        });
      }
      continue;
    }

    if (TEXT_TYPES.includes(cat.displayType)) {
      const text = (sel.text ?? "").trim();
      if (text) {
        lines.push({ key: cat.key, label: cat.name, value: text, price: cat.price });
      }
      continue;
    }

    const digits = selectionDigits(sel);
    for (const value of sel.values ?? []) {
      const acc = cat.accessories.find((a) => a.value === value);
      if (!acc || (acc.price === 0 && acc.isDefault && !digits)) continue;
      if (digits) {
        // "Number candle — 2 1", one line, priced per digit.
        lines.push({
          key: cat.key,
          label: cat.name,
          value: `${acc.name} — ${digits.split("").join(" ")}`,
          quantity: digits.length,
          price: round2(acc.price * digits.length),
        });
      } else {
        lines.push({ key: cat.key, label: cat.name, value: acc.name, price: acc.price });
      }
    }
  }

  return lines;
}

/** Build the full customization payload for a cart line. */
export function buildCustomization(
  categories: AccessoryCategory[],
  selections: Selections,
): Customization {
  // Persist only what is visible, so a stale hidden answer never travels.
  const visible = visibleCategories(categories, selections);
  const kept: Selections = {};
  for (const cat of visible) {
    if (selections[cat.key]) kept[cat.key] = selections[cat.key];
  }
  return {
    lines: summarize(categories, selections),
    selections: kept,
    total: priceSelections(categories, selections),
  };
}

/**
 * A stable fingerprint of a set of selections, used to key the cart line: two
 * identically-customized cakes stack, two differently-customized ones stay
 * separate. Sorted so key order can never split an otherwise identical line.
 */
export function signatureOf(selections: Selections): string {
  const parts: string[] = [];
  for (const key of Object.keys(selections).sort()) {
    const sel = selections[key];
    const bits: string[] = [];
    if (sel.values?.length) bits.push([...sel.values].sort().join("|"));
    if (sel.quantities) {
      const qtys = Object.entries(sel.quantities)
        .filter(([, qty]) => Number(qty) > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, qty]) => `${value}x${qty}`);
      if (qtys.length) bits.push(qtys.join("|"));
    }
    if (sel.enabled) bits.push("yes");
    const text = (sel.text ?? "").trim();
    if (text) bits.push(text);
    const digits = selectionDigits(sel);
    if (digits) bits.push(`#${digits}`);
    if (bits.length) parts.push(`${key}=${bits.join("|")}`);
  }
  return parts.join(";");
}

/** The cart line id for a (possibly customized) product. */
export function cartLineId(productId: string, selections?: Selections): string {
  const sig = selections ? signatureOf(selections) : "";
  return sig ? `${productId}::${sig}` : productId;
}

/** "Sparkler × 3" — one line as a person reads it. Shared by cart, admin,
 *  the customer email and the owner's WhatsApp message. */
export function lineText(line: CustomizationLine): string {
  return line.quantity && line.quantity > 1
    ? `${line.value} × ${line.quantity}`
    : line.value;
}
