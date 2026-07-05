// ============================================================
// Le Rasa Bakery — product slug helpers
// Products have no slug column, so /menu/[slug] URLs are derived from
// the product name. Deterministic + reversible-by-matching: the detail
// page slugifies each product name and compares.
// ============================================================

/** Turn a product name into a URL-safe slug, e.g. "Rose & Pistachio" -> "rose-and-pistachio". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD") // decompose accents; the alnum filter below drops the marks
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
