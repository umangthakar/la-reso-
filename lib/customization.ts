// ============================================================
// Le Rasa Bakery — cake customization engine
// ------------------------------------------------------------
// Pure, isomorphic logic for the Cake Customization Wizard: which groups are
// visible, what a set of selections costs, whether it's valid, and how to
// describe it on the cart / order.
//
// The wizard (client) and /api/checkout/create-intent (server) BOTH import
// this file, so the price the customer is shown and the price Stripe charges
// are computed by the same code over the same DB config. The server always
// re-reads the config and re-prices from scratch — a tampered client cannot
// buy a £6 topper for £0.
//
// Nothing here is hardcoded about candles, cards or toppers: the groups, their
// display types, prices and dependencies all arrive from the database.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/pricing";

export type DisplayType =
  | "radio"
  | "dropdown"
  | "checkbox"
  | "toggle"
  | "text"
  | "textarea";

export type AccessoryOption = {
  value: string;
  label: string;
  price: number;
  isDefault: boolean;
};

export type AccessoryGroup = {
  id: string;
  key: string;
  label: string;
  displayType: DisplayType;
  helpText: string | null;
  placeholder: string | null;
  /** Extra charged when a toggle is on, or a text/textarea group is filled. */
  price: number;
  required: boolean;
  maxChars: number | null;
  /** Only shown when group `dependsOnKey` currently holds `dependsOnValue`. */
  dependsOnKey: string | null;
  dependsOnValue: string | null;
  /** Empty = offered on every customizable product. */
  categories: string[];
  options: AccessoryOption[];
};

/** One group's answer. Which field is used depends on the display type. */
export type Selection = {
  /** radio / dropdown / checkbox */
  values?: string[];
  /** toggle */
  enabled?: boolean;
  /** text / textarea */
  text?: string;
};

/** Keyed by group key. */
export type Selections = Record<string, Selection>;

/** A resolved, human-readable line for the cart drawer / order snapshot. */
export type CustomizationLine = {
  key: string;
  label: string;
  value: string;
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

type GroupRow = {
  id: string;
  key: string;
  label: string;
  display_type: string;
  help_text: string | null;
  placeholder: string | null;
  price: number | string | null;
  required: boolean | null;
  max_chars: number | null;
  depends_on_key: string | null;
  depends_on_value: string | null;
  categories: unknown;
  sort_order: number | null;
  cake_accessory_options?: OptionRow[] | null;
};

type OptionRow = {
  value: string;
  label: string;
  price: number | string | null;
  is_default: boolean | null;
  sort_order: number | null;
  active: boolean | null;
};

function toGroup(row: GroupRow): AccessoryGroup {
  const options = (row.cake_accessory_options ?? [])
    .filter((o) => o.active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((o) => ({
      value: o.value,
      label: o.label,
      price: Number(o.price) || 0,
      isDefault: o.is_default === true,
    }));

  return {
    id: row.id,
    key: row.key,
    label: row.label,
    displayType: row.display_type as DisplayType,
    helpText: row.help_text,
    placeholder: row.placeholder,
    price: Number(row.price) || 0,
    required: row.required === true,
    maxChars: row.max_chars ?? null,
    dependsOnKey: row.depends_on_key,
    dependsOnValue: row.depends_on_value,
    categories: Array.isArray(row.categories)
      ? (row.categories as unknown[]).map(String)
      : [],
    options,
  };
}

/**
 * Read the live wizard config. Works with the anon client (storefront) and the
 * service-role client (checkout) alike — RLS already limits anon to active rows.
 */
export async function fetchAccessoryGroups(
  supabase: SupabaseClient,
): Promise<AccessoryGroup[]> {
  const { data, error } = await supabase
    .from("cake_accessory_groups")
    .select(
      "id,key,label,display_type,help_text,placeholder,price,required,max_chars," +
        "depends_on_key,depends_on_value,categories,sort_order," +
        "cake_accessory_options(value,label,price,is_default,sort_order,active)",
    )
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(error.message);
  // `database.types.ts` predates these tables, so the generated client can't
  // type the nested select — the shape is guaranteed by the query above.
  return (((data ?? []) as unknown) as GroupRow[]).map(toGroup);
}

/** The groups offered for a given product category ([] on a group = all). */
export function groupsForCategory(
  groups: AccessoryGroup[],
  category: string | null,
): AccessoryGroup[] {
  const c = (category ?? "").trim().toLowerCase();
  return groups.filter(
    (g) =>
      g.categories.length === 0 ||
      g.categories.some((x) => x.trim().toLowerCase() === c),
  );
}

// ------------------------------------------------------------
// Visibility, pricing, validation
// ------------------------------------------------------------

/** The value a group currently "holds", for dependency checks. */
function heldValues(group: AccessoryGroup, sel: Selection | undefined): string[] {
  if (!sel) return [];
  if (group.displayType === "toggle") return sel.enabled ? ["yes"] : ["no"];
  if (TEXT_TYPES.includes(group.displayType)) {
    return (sel.text ?? "").trim() ? ["filled"] : [];
  }
  return sel.values ?? [];
}

/**
 * A group is visible when its parent (if any) currently holds the required
 * value — and when that parent is itself visible, so a chain of dependencies
 * collapses correctly.
 */
export function isGroupVisible(
  group: AccessoryGroup,
  groups: AccessoryGroup[],
  selections: Selections,
): boolean {
  if (!group.dependsOnKey || !group.dependsOnValue) return true;
  const parent = groups.find((g) => g.key === group.dependsOnKey);
  if (!parent) return false; // parent deactivated → the child cannot apply
  if (!isGroupVisible(parent, groups, selections)) return false;
  return heldValues(parent, selections[parent.key]).includes(group.dependsOnValue);
}

export function visibleGroups(
  groups: AccessoryGroup[],
  selections: Selections,
): AccessoryGroup[] {
  return groups.filter((g) => isGroupVisible(g, groups, selections));
}

/** Every group's default answer — what the wizard opens with. */
export function defaultSelections(groups: AccessoryGroup[]): Selections {
  const out: Selections = {};
  for (const g of groups) {
    if (CHOICE_TYPES.includes(g.displayType)) {
      const preset = g.options.filter((o) => o.isDefault).map((o) => o.value);
      // A radio/dropdown must always hold exactly one value; fall back to the
      // first option so the control is never rendered blank.
      const single =
        g.displayType === "checkbox"
          ? preset
          : preset.slice(0, 1).length
            ? preset.slice(0, 1)
            : g.options.slice(0, 1).map((o) => o.value);
      out[g.key] = { values: single };
    } else if (g.displayType === "toggle") {
      out[g.key] = { enabled: false };
    } else {
      out[g.key] = { text: "" };
    }
  }
  return out;
}

/**
 * The per-unit accessory extra. Only VISIBLE groups are priced, so a hidden
 * answer (e.g. a card message left behind after the card toggle was switched
 * back off) can never be charged for.
 */
export function priceSelections(
  groups: AccessoryGroup[],
  selections: Selections,
): number {
  let total = 0;
  for (const g of visibleGroups(groups, selections)) {
    const sel = selections[g.key];
    if (!sel) continue;

    if (g.displayType === "toggle") {
      if (sel.enabled) total += g.price;
    } else if (TEXT_TYPES.includes(g.displayType)) {
      if ((sel.text ?? "").trim()) total += g.price;
    } else {
      for (const value of sel.values ?? []) {
        const opt = g.options.find((o) => o.value === value);
        if (opt) total += opt.price;
      }
    }
  }
  return round2(total);
}

export type ValidationResult = { ok: boolean; errors: Record<string, string> };

/**
 * Validates against the live config: required answers present, character
 * limits respected, and no unknown option values. Hidden groups are skipped
 * entirely — an invalid combination is impossible by construction.
 */
export function validateSelections(
  groups: AccessoryGroup[],
  selections: Selections,
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const g of visibleGroups(groups, selections)) {
    const sel = selections[g.key] ?? {};

    if (TEXT_TYPES.includes(g.displayType)) {
      const text = (sel.text ?? "").trim();
      if (g.required && !text) {
        errors[g.key] = `${g.label} is required.`;
      } else if (g.maxChars && text.length > g.maxChars) {
        errors[g.key] = `Please keep this to ${g.maxChars} characters or fewer.`;
      }
      continue;
    }

    if (g.displayType === "toggle") {
      if (g.required && !sel.enabled) errors[g.key] = `${g.label} is required.`;
      continue;
    }

    const values = sel.values ?? [];
    const unknown = values.filter((v) => !g.options.some((o) => o.value === v));
    if (unknown.length > 0) {
      errors[g.key] = `That option is no longer available.`;
    } else if (g.required && values.length === 0) {
      errors[g.key] = `Please choose an option for ${g.label}.`;
    } else if (g.displayType !== "checkbox" && values.length > 1) {
      errors[g.key] = `Please choose just one option for ${g.label}.`;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * The resolved customization to hang on a cart line: what was chosen, in
 * words, with what each addition costs. Only visible groups and non-empty
 * answers appear, so the cart never lists "Knife: no".
 */
export function summarize(
  groups: AccessoryGroup[],
  selections: Selections,
): CustomizationLine[] {
  const lines: CustomizationLine[] = [];

  for (const g of visibleGroups(groups, selections)) {
    const sel = selections[g.key];
    if (!sel) continue;

    if (g.displayType === "toggle") {
      if (sel.enabled) {
        lines.push({ key: g.key, label: g.label, value: "Yes", price: g.price });
      }
      continue;
    }

    if (TEXT_TYPES.includes(g.displayType)) {
      const text = (sel.text ?? "").trim();
      if (text) {
        lines.push({ key: g.key, label: g.label, value: text, price: g.price });
      }
      continue;
    }

    for (const value of sel.values ?? []) {
      const opt = g.options.find((o) => o.value === value);
      // A £0 "None" choice is noise in the cart — skip it.
      if (!opt || (opt.price === 0 && opt.isDefault)) continue;
      lines.push({ key: g.key, label: g.label, value: opt.label, price: opt.price });
    }
  }

  return lines;
}

/** Build the full customization payload for a cart line. */
export function buildCustomization(
  groups: AccessoryGroup[],
  selections: Selections,
): Customization {
  // Persist only what is visible, so a stale hidden answer never travels.
  const visible = visibleGroups(groups, selections);
  const kept: Selections = {};
  for (const g of visible) {
    if (selections[g.key]) kept[g.key] = selections[g.key];
  }
  return {
    lines: summarize(groups, selections),
    selections: kept,
    total: priceSelections(groups, selections),
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
    if (sel.enabled) bits.push("yes");
    const text = (sel.text ?? "").trim();
    if (text) bits.push(text);
    if (bits.length) parts.push(`${key}=${bits.join("|")}`);
  }
  return parts.join(";");
}

/** The cart line id for a (possibly customized) product. */
export function cartLineId(productId: string, selections?: Selections): string {
  const sig = selections ? signatureOf(selections) : "";
  return sig ? `${productId}::${sig}` : productId;
}
