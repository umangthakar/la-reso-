// ============================================================
// /sitemap.xml  (Next.js Metadata Route)
// ------------------------------------------------------------
// Built DYNAMICALLY from the database, so every visible product and every
// admin-managed policy is listed without anyone maintaining a list. There
// was no sitemap at all before, which left ~66 product pages to blind
// discovery.
//
// Only public, indexable URLs appear — the same set robots.ts allows. Admin,
// account, checkout, order-confirmation and /customize are deliberately
// absent.
//
// `policyHref()` is reused for the policy URLs so the sitemap can't disagree
// with the links in the footer (Privacy Policy lives at /privacy-policy, the
// rest under /policies/<slug>).
// ============================================================

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";
import { fetchSeoProducts } from "@/lib/product-seo";
import { getPolicies } from "@/lib/policies-server";
import { policyHref } from "@/lib/policies";

// Re-read hourly. Tagged fetches inside fetchSeoProducts/getPolicies mean an
// admin edit can also refresh this immediately via revalidateTag("products").
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static, hand-maintained pages. `/` and `/home` are the same landing page
  // (/ shows the splash then routes to /home), so only the canonical `/` is
  // listed to avoid offering search engines two URLs for one page.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/menu"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/contact"), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/policies"), lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];

  // Products — the pages that actually earn search traffic.
  let productEntries: MetadataRoute.Sitemap = [];
  try {
    const products = await fetchSeoProducts();
    productEntries = products.map((p) => ({
      url: absoluteUrl(`/menu/${p.slug}`),
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch {
    // A failed product read must not produce a broken sitemap — better to
    // serve the static entries than a 500.
  }

  // Admin-managed policies, plus the two code-owned legal pages.
  let policyEntries: MetadataRoute.Sitemap = [];
  try {
    const policies = await getPolicies();
    policyEntries = (policies ?? []).map((p) => ({
      url: absoluteUrl(policyHref(p.slug)),
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    }));
  } catch {
    /* fall through to the fixed legal pages below */
  }

  const legalEntries: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/privacy-policy"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/policies/cookie-policy"), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  // De-duplicate by URL: policyHref() can legitimately produce
  // /privacy-policy, which the legal list also contains.
  const seen = new Set<string>();
  return [...staticEntries, ...productEntries, ...policyEntries, ...legalEntries].filter((e) => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}
