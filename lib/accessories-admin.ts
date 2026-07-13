// ============================================================
// Le Rasa Bakery — accessories admin (server-side validation + row building)
// ------------------------------------------------------------
// The ONE place that decides what a valid accessory category / accessory is.
// Both the create (POST) and the edit (PATCH) routes go through here, so the
// rules can't drift apart, and the storefront can trust what it reads.
//
// Never import this from a client component — it is server-only by intent
// (the admin page talks to it through /api/admin/accessories).
// ============================================================

import { DISPLAY_TYPES, type DisplayType } from "@/lib/customization";

export const DUPLICATE_KEY_MESSAGE =
  "That key is already taken. Keys must be unique.";

/** Postgres unique-violation, i.e. two categories with the same key. */
export function isDuplicateKey(
  err: { code?: string; message?: string } | null,
): boolean {
  if (!err) return false;
  return err.code === "23505" || /duplicate key|already exists/i.test(err.message ?? "");
}

/**
 * The stable identity of a category or accessory. Derived from the name when
 * the admin doesn't type one, but NEVER auto-updated afterwards: a placed
 * order stores these keys, so renaming "Candles" must not orphan it.
 */
export function toKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const KEY_RE = /^[a-z0-9_]+$/;

type Built<T> = { row: T } | { error: string };

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ------------------------------------------------------------
// Categories
// ------------------------------------------------------------

export type CategoryRowInput = {
  key?: string;
  name?: string;
  display_type?: string;
  description?: string | null;
  placeholder?: string | null;
  image_url?: string | null;
  price?: number;
  required?: boolean;
  max_chars?: number | null;
  min_qty?: number;
  max_qty?: number;
  depends_on_key?: string | null;
  depends_on_value?: string | null;
  categories?: string[];
  sort_order?: number;
  active?: boolean;
};

export function buildCategoryRow(
  body: Record<string, unknown>,
  opts: { creating: boolean },
): Built<CategoryRowInput> {
  const name = String(body.name ?? "").trim();
  if (opts.creating && !name) return { error: "A name is required." };

  const displayType = String(body.display_type ?? "") as DisplayType;
  if (opts.creating || body.display_type !== undefined) {
    if (!DISPLAY_TYPES.includes(displayType)) {
      return { error: `Display type must be one of: ${DISPLAY_TYPES.join(", ")}.` };
    }
  }

  const price = num(body.price, 0);
  if (price < 0) return { error: "Price cannot be negative." };

  const minQty = Math.max(0, Math.trunc(num(body.min_qty, 0)));
  const maxQty = Math.max(1, Math.trunc(num(body.max_qty, 10)));
  if (maxQty < minQty) {
    return { error: "Maximum quantity must be at least the minimum." };
  }

  // A dependency needs BOTH halves, and cannot point at itself — otherwise the
  // category would be permanently invisible, which looks like a bug to the
  // admin rather than a rule they broke.
  const dependsOnKey = String(body.depends_on_key ?? "").trim() || null;
  const dependsOnValue = String(body.depends_on_value ?? "").trim() || null;
  if (Boolean(dependsOnKey) !== Boolean(dependsOnValue)) {
    return {
      error:
        "A dependency needs both a category key and the value it must hold (use 'yes' for a toggle).",
    };
  }

  const key = String(body.key ?? "").trim() || toKey(name);
  if (opts.creating || body.key !== undefined) {
    if (!KEY_RE.test(key)) {
      return {
        error: "Key must contain only lowercase letters, numbers and underscores.",
      };
    }
    if (dependsOnKey && dependsOnKey === key) {
      return { error: "A category cannot depend on itself." };
    }
  }

  const row: CategoryRowInput = {
    name,
    display_type: displayType,
    description: String(body.description ?? "").trim() || null,
    placeholder: String(body.placeholder ?? "").trim() || null,
    image_url: String(body.image_url ?? "").trim() || null,
    price,
    required: body.required === true,
    max_chars: intOrNull(body.max_chars),
    min_qty: minQty,
    max_qty: maxQty,
    depends_on_key: dependsOnKey,
    depends_on_value: dependsOnValue,
    categories: Array.isArray(body.categories) ? body.categories.map(String) : [],
    sort_order: Math.trunc(num(body.sort_order, 0)),
    active: body.active !== false,
  };

  // The key is set once, at creation. Editing it would orphan the selections
  // already stored on placed orders.
  if (opts.creating) row.key = key;

  return { row };
}

// ------------------------------------------------------------
// Accessories
// ------------------------------------------------------------

export type AccessoryRowInput = {
  category_id?: string;
  value?: string;
  name?: string;
  description?: string | null;
  image_url?: string | null;
  price?: number;
  min_qty?: number;
  max_qty?: number;
  is_default?: boolean;
  sort_order?: number;
  active?: boolean;
};

export function buildAccessoryRow(
  body: Record<string, unknown>,
  opts: { creating: boolean },
): Built<AccessoryRowInput> {
  const name = String(body.name ?? "").trim();
  if (opts.creating && !name) return { error: "A name is required." };

  const categoryId = String(body.category_id ?? "").trim();
  if (opts.creating && !categoryId) {
    return { error: "An accessory must belong to a category." };
  }

  const price = num(body.price, 0);
  if (price < 0) return { error: "Price cannot be negative." };

  const minQty = Math.max(0, Math.trunc(num(body.min_qty, 1)));
  const maxQty = Math.max(1, Math.trunc(num(body.max_qty, 10)));
  if (maxQty < minQty) {
    return { error: "Maximum quantity must be at least the minimum." };
  }

  const value = String(body.value ?? "").trim() || toKey(name);
  if (opts.creating && !KEY_RE.test(value)) {
    return {
      error: "Value must contain only lowercase letters, numbers and underscores.",
    };
  }

  const row: AccessoryRowInput = {
    name,
    description: String(body.description ?? "").trim() || null,
    image_url: String(body.image_url ?? "").trim() || null,
    price,
    min_qty: minQty,
    max_qty: maxQty,
    is_default: body.is_default === true,
    sort_order: Math.trunc(num(body.sort_order, 0)),
    active: body.active !== false,
  };

  // Same rule as a category key: `value` identifies the accessory on placed
  // orders, so it is written once and never edited.
  if (opts.creating) {
    row.category_id = categoryId;
    row.value = value;
  }

  return { row };
}
