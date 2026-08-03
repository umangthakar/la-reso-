// ============================================================
// Le Rasa Bakery — product detail route (/menu/[slug])
// ------------------------------------------------------------
// A thin SERVER wrapper around the existing client page, which now lives in
// ./product-detail.tsx and is UNCHANGED — same markup, same styling, same
// behaviour. The split exists for one reason: a Client Component cannot
// export `generateMetadata`, so every product page was serving the site's
// generic title and description, with no canonical, no OG image and no
// structured data. These are the pages that earn search traffic.
//
// What this file adds, and nothing else:
//   • a per-product <title> and meta description
//   • a canonical URL
//   • Open Graph + Twitter tags, including the product image
//   • Product JSON-LD (with an offer, or an offer RANGE when the product has
//     size variants) and BreadcrumbList JSON-LD
//
// The product is resolved by the SAME derived slug the client page uses
// (lib/slug#slugify), so the metadata and the rendered product can never
// describe different items.
// ============================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { absoluteUrl } from "@/lib/site-url";
import { fetchSeoProducts, fetchSeoSizes, findSeoProductBySlug } from "@/lib/product-seo";
import { getPublicSettings } from "@/lib/site-settings-server";
import ProductDetailPage from "./product-detail";

type Params = { params: { slug: string } };

/** Trim a description to a sensible meta length on a word boundary. */
function metaDescription(text: string, fallback: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  if (clean.length <= 160) return clean;
  const cut = clean.slice(0, 157);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const [product, { branding }] = await Promise.all([
    findSeoProductBySlug(params.slug),
    getPublicSettings(),
  ]);

  // Unknown slug → the page calls notFound() and Next serves app/not-found.tsx
  // with a real HTTP 404. Metadata still has to return something for the render
  // that produces that response, and it must not be indexable.
  if (!product) {
    return {
      title: `Page not found — ${branding.name}`,
      robots: { index: false, follow: false },
    };
  }

  const title = `${product.name} — ${branding.name}`;
  const description = metaDescription(
    product.description,
    `${product.name}, freshly baked and 100% eggless by ${branding.name}.`,
  );
  const canonical = `/menu/${product.slug}`;
  const images = product.image ? [{ url: product.image, alt: product.name }] : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: branding.name,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: product.image ? [product.image] : undefined,
    },
  };
}

export default async function Page({ params }: Params) {
  const product = await findSeoProductBySlug(params.slug);

  // A slug that matches no VISIBLE product is a 404, not a 200 with a friendly
  // panel. The soft-404 it replaced let search engines index every mistyped or
  // retired product URL as a real page.
  //
  // Safe against a just-added product: findSeoProductBySlug reads a fetch cache
  // tagged "products", and every admin product write calls
  // revalidateTag("products"), so a new product is resolvable immediately rather
  // than 404ing until the 1h window expires.
  if (!product) notFound();

  const sizes = await fetchSeoSizes(product.id);
  const { branding } = await getPublicSettings();

  // Structured data is emitted only for a product that exists. Prices come
  // from the size variants when there are any, so the offer range matches what
  // the page actually charges.
  const prices = sizes.length > 0 ? sizes.map((s) => s.price).filter((p) => p > 0) : [];
  const low = prices.length ? Math.min(...prices) : product?.price ?? 0;
  const high = prices.length ? Math.max(...prices) : product?.price ?? 0;

  const productLd = product && {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || undefined,
    image: product.image ? [product.image] : undefined,
    category: product.category || undefined,
    brand: { "@type": "Brand", name: branding.name },
    url: absoluteUrl(`/menu/${product.slug}`),
    ...(product.allergens ? { hasAllergen: product.allergens } : {}),
    offers:
      prices.length > 1 && low !== high
        ? {
            "@type": "AggregateOffer",
            priceCurrency: "GBP",
            lowPrice: low.toFixed(2),
            highPrice: high.toFixed(2),
            offerCount: prices.length,
            availability: product.inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            url: absoluteUrl(`/menu/${product.slug}`),
          }
        : {
            "@type": "Offer",
            priceCurrency: "GBP",
            price: (low || product.price).toFixed(2),
            availability: product.inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            url: absoluteUrl(`/menu/${product.slug}`),
          },
  };

  const breadcrumbLd = product && {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Menu", item: absoluteUrl("/menu") },
      ...(product.category
        ? [{ "@type": "ListItem", position: 3, name: product.category, item: absoluteUrl("/menu") }]
        : []),
      {
        "@type": "ListItem",
        position: product.category ? 4 : 3,
        name: product.name,
        item: absoluteUrl(`/menu/${product.slug}`),
      },
    ],
  };

  return (
    <>
      {productLd && (
        <script
          type="application/ld+json"
          // JSON.stringify output, not user markup. `<` is escaped so a product
          // name containing "</script>" cannot break out of the tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(productLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      {breadcrumbLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbLd).replace(/</g, "\\u003c"),
          }}
        />
      )}
      {/* The existing client page, untouched. It reads the slug from
          useParams(), so it needs no props. */}
      <ProductDetailPage />
    </>
  );
}

/**
 * Pre-generate the known product URLs at build time. Any slug not in this list
 * is still rendered on demand (Next's default), so a product added in the admin
 * panel works immediately without a redeploy.
 */
export async function generateStaticParams() {
  try {
    const products = await fetchSeoProducts();
    return products.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}
