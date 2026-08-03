// ============================================================
// Le Rasa Bakery — cache tag names (isomorphic constants)
// ------------------------------------------------------------
// Shared so a cached fetch and the admin route that invalidates it can never
// use two different spellings of the same tag.
//
// Deliberately small. The storefront chrome (navbar, footer, announcement bar,
// delivery zones) still reads site settings with `cache: "no-store"` so an
// admin edit shows up on the very next request — that is a design decision
// worth keeping, not an oversight. Only surfaces where a minute of staleness
// is harmless opt into caching:
//   • product metadata / sitemap (lib/product-seo)
//   • the two code-owned legal pages, which read settings for branding only
// ============================================================

export const TAGS = {
  /** Product catalogue: titles, descriptions, prices, sitemap entries. */
  products: "products",
  /** The site_settings singleton (branding, contact, content). */
  siteSettings: "site-settings",
} as const;

export type CacheTag = (typeof TAGS)[keyof typeof TAGS];
