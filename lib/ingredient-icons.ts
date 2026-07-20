// ============================================================
// Le Rasa Bakery — Ingredient icon registry.
// ------------------------------------------------------------
// A single, isomorphic (server + client) source of truth for the
// selectable INGREDIENT icons (NOT allergen icons). Each product
// stores a list of icon KEYS (e.g. ["milk","wheat"]); the admin
// panel renders a checkbox per entry here and the storefront maps
// the saved keys back to { emoji, label } for display.
//
// EXTENSIBILITY: to add a new ingredient icon, append ONE entry to
// INGREDIENT_ICONS below. Nothing else needs to change — the admin
// checkboxes and the storefront chips both iterate this list, and
// unknown/old keys are simply ignored. Keys are stable identifiers;
// never rename an existing key (it would orphan saved products).
//
// This bakery is 100% EGGLESS — there is deliberately no egg icon.
// ============================================================

export type IngredientIcon = {
  /** Stable identifier stored on the product. Lowercase, never renamed. */
  key: string;
  /** Human label shown next to the emoji. */
  label: string;
  /** The emoji rendered as the icon. */
  emoji: string;
};

// The default palette of ingredient icons. Order here is the order shown in
// the admin picker and (for the selected ones) on the storefront.
export const INGREDIENT_ICONS: IngredientIcon[] = [
  { key: "milk", label: "Milk", emoji: "🥛" },
  { key: "wheat", label: "Wheat", emoji: "🌾" },
  { key: "soya", label: "Soya", emoji: "🌱" },
  { key: "chocolate", label: "Chocolate", emoji: "🍫" },
  { key: "butter", label: "Butter", emoji: "🧈" },
  { key: "cream", label: "Cream", emoji: "🍨" },
  { key: "vanilla", label: "Vanilla", emoji: "🍦" },
  { key: "coffee", label: "Coffee", emoji: "☕" },
  { key: "coconut", label: "Coconut", emoji: "🥥" },
  { key: "strawberry", label: "Strawberry", emoji: "🍓" },
  { key: "cherry", label: "Cherry", emoji: "🍒" },
  { key: "mango", label: "Mango", emoji: "🥭" },
  { key: "banana", label: "Banana", emoji: "🍌" },
  { key: "lemon", label: "Lemon", emoji: "🍋" },
  { key: "orange", label: "Orange", emoji: "🍊" },
  { key: "blueberry", label: "Blueberry", emoji: "🫐" },
  { key: "pistachio", label: "Pistachio", emoji: "🌰" },
  { key: "almond", label: "Almond", emoji: "🥜" },
  { key: "hazelnut", label: "Hazelnut", emoji: "🌰" },
  { key: "cashew", label: "Cashew", emoji: "🥜" },
  { key: "honey", label: "Honey", emoji: "🍯" },
  { key: "caramel", label: "Caramel", emoji: "🍮" },
  { key: "cinnamon", label: "Cinnamon", emoji: "🌿" },
  { key: "mint", label: "Mint", emoji: "🌿" },
  { key: "rose", label: "Rose", emoji: "🌹" },
  { key: "saffron", label: "Saffron", emoji: "🌼" },
  { key: "cardamom", label: "Cardamom", emoji: "🫚" },
  { key: "sugar", label: "Sugar", emoji: "🧂" },
];

// Fast key → icon lookup (built once).
export const INGREDIENT_ICON_MAP: Record<string, IngredientIcon> =
  INGREDIENT_ICONS.reduce<Record<string, IngredientIcon>>((acc, ic) => {
    acc[ic.key] = ic;
    return acc;
  }, {});

/** Clean an incoming icon-keys value into an ordered list of unique, known
 *  keys. Unknown keys (e.g. removed from the registry) are dropped so old
 *  products degrade gracefully. Capped so the field can't grow unbounded. */
export function normalizeIngredientIcons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = String(item ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    if (!INGREDIENT_ICON_MAP[key]) continue; // ignore unknown keys
    seen.add(key);
    out.push(key);
    if (out.length >= INGREDIENT_ICONS.length) break;
  }
  return out;
}

/** Resolve saved keys to their icon definitions (skipping unknown keys),
 *  preserving the saved order. Used by the storefront to render chips. */
export function resolveIngredientIcons(keys: unknown): IngredientIcon[] {
  return normalizeIngredientIcons(keys).map((k) => INGREDIENT_ICON_MAP[k]);
}
