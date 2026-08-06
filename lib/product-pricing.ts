// ============================================================
// Le Rasa Bakery — the ONE definition of "what does this product cost"
// (pure, client + server safe: no imports beyond lib/pricing's money maths,
// no React, no Supabase, no side effects — same contract as lib/offers.ts).
// ------------------------------------------------------------
// WHY THIS EXISTS. A product's price lives in TWO places in the schema:
// `products.price` (the base price) and, when the product offers size
// variants, `product_sizes.price` (an ABSOLUTE price per size — it is not a
// surcharge). The product detail page has always charged the SELECTED size's
// price, defaulting to the first size, while every product CARD read
// `products.price` — so a cake whose 6" variant is £1 could advertise £55 on
// the menu and then price at £1 the moment you opened it.
//
// The rule, applied everywhere from now on:
//
//   A product WITH size variants is priced by its DEFAULT VARIANT.
//   A product WITHOUT size variants is priced by products.price.
//
// The default variant is the FIRST one in the admin's own ordering
// (`sort_order` ascending), with a deterministic tiebreak so two sizes sharing
// a sort_order can never resolve differently in two places — which is exactly
// how a card and a detail page drift apart.
//
// Nothing here formats or discounts: money() and the offer engine still own
// those. This module only answers "which number is the price".
// ============================================================

import { round2 } from "./pricing";

/**
 * The size columns every caller must select. Named once so the card queries,
 * the detail page, the SEO reads and the admin endpoints can never fetch a
 * different set and resolve a different default.
 *
 * Used as a PostgREST embed on a products select:
 *   .select(`id,name,price,...,${PRODUCT_SIZES_EMBED}`)
 */
export const PRODUCT_SIZES_EMBED = "product_sizes(id,label,price,sort_order)";

/** Structural shape of a `product_sizes` row. Deliberately loose: a raw DB row
 *  (numerics arrive as strings), an admin form row and a typed model all fit. */
export type SizeLike = {
  id?: string | null;
  label?: string | null;
  price?: number | string | null;
  sort_order?: number | string | null;
};

/** A resolved variant: the identity the cart/server need plus its absolute price. */
export type DefaultSize = { id: string; label: string; price: number };

/**
 * Size variants in the order the storefront shows them: `sort_order` ascending,
 * then id, then original position. The last two are what make this TOTAL — an
 * order the database's own `order("sort_order")` does not guarantee when two
 * rows share a sort_order, and an unstable order there means the "first" size
 * (the default) could differ between the card query and the detail query.
 */
export function orderedSizes<T extends SizeLike>(
  sizes: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(sizes)) return [];
  return sizes
    .filter((size): size is T => !!size)
    .map((size, index) => ({ size, index }))
    .sort((a, b) => {
      const byOrder = (Number(a.size.sort_order) || 0) - (Number(b.size.sort_order) || 0);
      if (byOrder !== 0) return byOrder;
      const byId = String(a.size.id ?? "").localeCompare(String(b.size.id ?? ""));
      if (byId !== 0) return byId;
      return a.index - b.index;
    })
    .map((entry) => entry.size);
}

/**
 * The DEFAULT variant — the one a card advertises and the one the detail page
 * opens on. Null when the product has no size variants, which is the signal to
 * use `products.price`.
 */
export function defaultSizeOf(
  sizes: readonly SizeLike[] | null | undefined,
): DefaultSize | null {
  const first = orderedSizes(sizes)[0];
  if (!first) return null;
  return {
    id: String(first.id ?? ""),
    label: String(first.label ?? ""),
    price: round2(Number(first.price) || 0),
  };
}

/**
 * The size a caller should treat as chosen: the one named by `sizeId` when it
 * belongs to this product, otherwise the DEFAULT. Returns null only when the
 * product has no sizes at all.
 *
 * This is the rule the detail page, the customization wizard and the
 * server-side basket re-pricer all run, so "no size named" resolves to the same
 * variant — and therefore the same price — in the browser and on the server.
 */
export function selectedSizeOf<T extends SizeLike>(
  sizes: readonly T[] | null | undefined,
  sizeId: string | null | undefined,
): T | null {
  const ordered = orderedSizes(sizes);
  if (ordered.length === 0) return null;
  const wanted = String(sizeId ?? "");
  const match = wanted
    ? ordered.find((size) => String(size.id ?? "") === wanted)
    : undefined;
  return match ?? ordered[0];
}

/**
 * THE price to display for a product: its default variant's price when it has
 * variants, its base price when it doesn't. Every card, search hit, related
 * tile and admin row goes through this.
 */
export function displayPriceOf(
  basePrice: number | string | null | undefined,
  sizes: readonly SizeLike[] | null | undefined,
): number {
  const fallback = round2(Number(basePrice) || 0);
  const size = defaultSizeOf(sizes);
  return size ? size.price : fallback;
}

/**
 * The cart LINE id for a product + size. A sized product makes each size its
 * own line (so 6" and 8" don't merge into one line of quantity 2); a product
 * with no sizes keeps using its bare product id, exactly as before.
 *
 * Defined here rather than inline at each call site so a card's "Add to Cart"
 * and the detail page's produce the SAME id for the same product+size and
 * therefore merge into one line instead of two.
 */
export function sizedCartLineId(productId: string, sizeId: string | null | undefined): string {
  const size = String(sizeId ?? "");
  return size ? `${productId}::size:${size}` : productId;
}
