// ============================================================
// Le Rasa Bakery — the site's own absolute base URL.
// ------------------------------------------------------------
// Needed by anything that has to emit an ABSOLUTE url rather than a path:
// canonical tags, Open Graph urls/images, sitemap.xml, robots.txt.
//
// Resolution order, first non-empty wins:
//   1. NEXT_PUBLIC_SITE_URL  — set this in production; it is the only one
//                              that survives a custom domain.
//   2. SITE_URL              — server-side alias, same meaning.
//   3. VERCEL_PROJECT_PRODUCTION_URL — the project's stable production host,
//                              so previews still emit production canonicals
//                              instead of pointing at a deployment URL.
//   4. VERCEL_URL            — the current deployment (preview) host.
//   5. http://localhost:3000 — local development.
//
// Both env names are currently EMPTY in .env, which is why this falls through
// to the Vercel-provided host in production. Set NEXT_PUBLIC_SITE_URL to the
// real domain (e.g. https://lerasa.co.uk) and every canonical, OG url and
// sitemap entry follows automatically — no code change.
// ============================================================

const FALLBACK = "http://localhost:3000";

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const v of values) {
    const trimmed = (v ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Add a scheme when the source gave us a bare host (Vercel's vars do). */
function withScheme(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

/** The site's base URL, absolute and WITHOUT a trailing slash. */
export function siteUrl(): string {
  const raw = firstNonEmpty(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  );
  const base = raw ? withScheme(raw) : FALLBACK;
  return base.replace(/\/+$/, "");
}

/** An absolute URL for a site-relative path. `absoluteUrl("/menu")`. */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${p === "/" ? "" : p}`;
}
