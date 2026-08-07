// ============================================================
// Le Rasa Bakery — the site's own absolute base URL.
// ------------------------------------------------------------
// Needed by anything that has to emit an ABSOLUTE url rather than a path:
// canonical tags, Open Graph urls/images, sitemap.xml, robots.txt.
//
// Resolution order, first non-empty wins:
//   1. NEXT_PUBLIC_SITE_URL  — an explicit override, for a domain change or a
//                              staging environment that must speak for itself.
//   2. SITE_URL              — server-side alias, same meaning.
//   3. PRODUCTION_SITE_URL   — the canonical domain below, used on ANY Vercel
//                              deployment (production and preview alike).
//   4. http://localhost:3000 — local development.
//
// WHY THE CONSTANT EXISTS, AND WHY IT SITS ABOVE VERCEL'S OWN VARS.
// This used to fall through to VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL,
// which resolve to the project's *.vercel.app host. The two env vars above are
// set in .env — and .env is gitignored, so it is never deployed. Production
// therefore had NOTHING set, fell through to Vercel's host, and published
// sitemap entries, robots host/sitemap lines, canonicals, OG urls and JSON-LD
// all pointing at la-reso.vercel.app. That splits ranking signals across two
// domains and asks Google to index the wrong one.
//
// Recording the real domain HERE fixes that in the repo rather than in a
// dashboard nobody can see from the code, so a fresh clone, a new Vercel
// project or a forgotten env var cannot silently reintroduce it. The env vars
// still win when set, so a future domain change is one variable, not a deploy.
//
// PREVIEWS DELIBERATELY GET THE PRODUCTION DOMAIN TOO. For SEO that is the
// point: a preview must never publish canonicals for itself. The trade-off is
// that absolute links generated on a preview (verification and reset emails)
// point at production. Those tokens live in the shared database, so the links
// still work; set NEXT_PUBLIC_SITE_URL on a preview if you need it to be
// self-contained.
// ============================================================

/**
 * THE canonical production domain — the single place it is written down.
 * Everything absolute (canonical, OG, sitemap, robots, JSON-LD, email links)
 * derives from here via siteUrl()/absoluteUrl(), so there is nothing else to
 * update if it ever changes.
 */
export const PRODUCTION_SITE_URL = "https://www.lerasa.co.uk";

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
    // Anywhere on Vercel — production or preview — use the real domain rather
    // than the *.vercel.app host those deployments would otherwise report.
    // `VERCEL` is set by the platform on every deployment and by nothing else,
    // so local development still falls through to FALLBACK below.
    process.env.VERCEL ? PRODUCTION_SITE_URL : "",
  );
  const base = raw ? withScheme(raw) : FALLBACK;
  return base.replace(/\/+$/, "");
}

/** An absolute URL for a site-relative path. `absoluteUrl("/menu")`. */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${p === "/" ? "" : p}`;
}
