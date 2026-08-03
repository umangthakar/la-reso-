// ============================================================
// Le Rasa Bakery — site-wide structured data (SERVER component)
// ------------------------------------------------------------
// Emits the organisation-level JSON-LD the site had none of: Organization,
// WebSite (with SearchAction) and a Bakery/LocalBusiness node carrying the
// bakery's real contact details and its Google rating.
//
// AVOIDING DUPLICATES — this is the whole reason it lives in one place:
//   • Rendered once, from the root layout, so no page can emit a second copy.
//   • It deliberately does NOT emit Product or BreadcrumbList — those are
//     per-page and already produced by app/menu/[slug]/page.tsx. Two competing
//     Breadcrumb graphs on a product page would be worse than none.
//   • `@id` anchors let the three nodes reference each other instead of
//     repeating the same organisation inline three times.
//
// Every value comes from the admin settings or the live Google rating. Nothing
// is invented: a field the owner hasn't filled in is omitted from the output
// rather than guessed, and the rating node is dropped entirely when there is no
// real rating to report (rating: 0 means "no live rating" — see
// /api/google-rating).
// ============================================================

import { getPublicSettings } from "@/lib/site-settings-server";
import { getGoogleReviews } from "@/lib/google-reviews";
import { absoluteUrl } from "@/lib/site-url";

/** Drop empty/null values so the graph never carries blank fields. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

export default async function SiteStructuredData() {
  const settings = await getPublicSettings();

  // The rating is best-effort: a failure here must never break a page render.
  let rating = 0;
  let reviewCount = 0;
  try {
    const google = await getGoogleReviews();
    rating = Number(google?.rating) || 0;
    reviewCount = Number(google?.total) || 0;
  } catch {
    /* no rating → the aggregateRating field is simply omitted */
  }

  const { branding, contact } = settings;
  const orgId = absoluteUrl("/#organization");
  const siteId = absoluteUrl("/#website");
  const bakeryId = absoluteUrl("/#bakery");

  const socials = [settings.instagram_url, settings.facebook_url, settings.tiktok_url]
    .map((s) => (s ?? "").trim())
    .filter((s) => s !== "" && /^https?:\/\//i.test(s));

  const logoUrl = (settings.logo ?? "").trim();

  const organization = compact({
    "@type": "Organization",
    "@id": orgId,
    name: branding.name,
    url: absoluteUrl("/"),
    description: branding.description,
    logo: logoUrl || undefined,
    email: contact.email || undefined,
    telephone: contact.phone || undefined,
    sameAs: socials,
  });

  const website = compact({
    "@type": "WebSite",
    "@id": siteId,
    url: absoluteUrl("/"),
    name: branding.name,
    description: branding.description,
    publisher: { "@id": orgId },
    inLanguage: "en-GB",
    // The storefront search filters the menu, so point the action there.
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/menu")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  });

  const bakery = compact({
    "@type": "Bakery",
    "@id": bakeryId,
    name: branding.name,
    description: branding.description,
    url: absoluteUrl("/"),
    image: logoUrl || undefined,
    telephone: contact.phone || undefined,
    email: contact.email || undefined,
    priceRange: "££",
    currenciesAccepted: "GBP",
    parentOrganization: { "@id": orgId },
    sameAs: socials,
    // Only the locality the owner has actually entered — no invented street,
    // postcode or coordinates.
    address: contact.address
      ? compact({
          "@type": "PostalAddress",
          addressLocality: contact.address,
          addressCountry: "GB",
        })
      : undefined,
    // Omitted entirely unless there is a real rating with real reviews behind it.
    aggregateRating:
      rating > 0 && reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: rating.toFixed(1),
            reviewCount: String(reviewCount),
            bestRating: "5",
            worstRating: "1",
          }
        : undefined,
  });

  const graph = { "@context": "https://schema.org", "@graph": [organization, website, bakery] };

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output, not user markup. `<` is escaped so an admin-set
      // value containing "</script>" cannot break out of the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }}
    />
  );
}
