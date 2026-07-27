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

/**
 * The detail-page URL for a product, given its name.
 *
 * The route itself — /menu/[slug] — is written ONCE, here, so anything that
 * links to a product (the hero's Order Now, the search box, a card) asks for
 * the href rather than building the path from a string of its own. Moving the
 * detail page later is then one edit instead of a grep.
 *
 * Returns null for a nameless product, because a link to /menu/ is a link to
 * the wrong page: callers must decide what to do instead (the hero falls back
 * to the menu), and a silent bad URL would take that decision away from them.
 */
export function productHref(name: string | null | undefined): string | null {
  const slug = slugify((name ?? "").trim());
  return slug ? `/menu/${slug}` : null;
}
