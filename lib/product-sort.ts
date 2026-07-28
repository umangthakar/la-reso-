// ============================================================
// Le Rasa Bakery — how the admin's product lists are ordered.
//
// ONE definition of the sort options, shared by the Products page's Sort
// dropdown and the query that answers it (/api/admin/products). The dropdown
// offers exactly what the query can honour, and a key can never mean one thing
// in the browser and another in the database — which is the failure a second
// copy of this list would eventually produce.
//
// Sorting is done by the DATABASE, not the browser: the table is paginated, so
// sorting the 20 rows already loaded would only shuffle a page rather than
// reorder the catalogue — "cheapest first" has to be able to reach page 4.
//
// Safe to import from both client components and route handlers: plain data,
// no React, no server-only modules.
// ============================================================

/** The order a product list is in. `manual` is the admin's own drag-to-reorder
 *  arrangement (products.sort_order) — the order the homepage reads to pick its
 *  featured products, and the only one dragging a row can meaningfully edit. */
export type ProductSortKey =
  | "name_asc"
  | "name_desc"
  | "created_desc"
  | "created_asc"
  | "price_asc"
  | "price_desc"
  | "manual";

export const DEFAULT_PRODUCT_SORT: ProductSortKey = "name_asc";

type SortSpec = {
  /** What the dropdown calls it. */
  label: string;
  /** The products column to order by. */
  column: string;
  ascending: boolean;
};

/** Declaration order IS the order of the dropdown. */
export const PRODUCT_SORTS: Record<ProductSortKey, SortSpec> = {
  name_asc: { label: "A → Z", column: "name", ascending: true },
  name_desc: { label: "Z → A", column: "name", ascending: false },
  created_desc: { label: "Newest First", column: "created_at", ascending: false },
  created_asc: { label: "Oldest First", column: "created_at", ascending: true },
  price_asc: { label: "Price Low → High", column: "price", ascending: true },
  price_desc: { label: "Price High → Low", column: "price", ascending: false },
  manual: { label: "Manual order", column: "sort_order", ascending: true },
};

/** The dropdown's options, in order. */
export const PRODUCT_SORT_OPTIONS = (
  Object.keys(PRODUCT_SORTS) as ProductSortKey[]
).map((key) => ({ key, label: PRODUCT_SORTS[key].label }));

/**
 * Read a sort key off a query string, falling back to the default.
 *
 * Anything unrecognised — a stale bookmark, a hand-edited URL, or no `sort`
 * param at all, which is every caller that predates this dropdown — is A→Z
 * rather than an error, because an admin list has to render.
 */
export function parseProductSort(value: string | null | undefined): ProductSortKey {
  return value && value in PRODUCT_SORTS
    ? (value as ProductSortKey)
    : DEFAULT_PRODUCT_SORT;
}
