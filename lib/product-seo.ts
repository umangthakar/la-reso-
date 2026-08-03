// ============================================================
// Le Rasa Bakery — SERVER-side product lookup for SEO.
// ------------------------------------------------------------
// The product detail page is a Client Component (it owns the size picker,
// the cart and the customization wizard), so it cannot produce metadata.
// This module gives the new server wrapper around it the few product
// fields that metadata and JSON-LD need, resolved BY SLUG.
//
// There is no `slug` column: the slug is derived from the product name (see
// lib/slug#slugify), exactly as the storefront has always done. So the
// lookup reads the visible catalogue and matches on the derived slug —
// which also guarantees the page and its metadata agree on which product a
// URL refers to.
//
// Reads with the ANON key through the same public product policy the
// storefront uses, so nothing invisible can leak into a sitemap or a title.
// ============================================================

import "server-only";
import { slugify } from "@/lib/slug";

/** Size-variant table (26_product_variants.sql). */
const PRODUCT_SIZES_TABLE = "product_sizes";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type SeoProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string | null;
  price: number;
  image: string | null;
  inStock: boolean;
  allergens: string | null;
  updatedAt: string | null;
};

type Row = {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  image_url: string | null;
  category: string | null;
  in_stock: boolean | null;
  allergens: string | null;
  created_at?: string | null;
};

function toSeoProduct(r: Row): SeoProduct {
  return {
    id: r.id,
    name: r.name,
    slug: slugify(r.name),
    description: (r.description ?? "").trim(),
    category: r.category ?? null,
    price: Number(r.price) || 0,
    image: r.image_url ?? null,
    inStock: r.in_stock !== false,
    allergens: r.allergens ?? null,
    updatedAt: r.created_at ?? null,
  };
}

/**
 * Every product the public may see. `visible=eq.true` mirrors the RLS policy
 * so a hidden product can never reach a sitemap or a page title.
 *
 * Cached for an hour and tagged `products`, so an admin edit that calls
 * revalidateTag("products") refreshes titles and the sitemap immediately
 * while ordinary traffic doesn't re-query per request.
 */
export async function fetchSeoProducts(): Promise<SeoProduct[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products` +
        `?select=id,name,description,price,image_url,category,in_stock,allergens,created_at` +
        `&visible=eq.true&order=name.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        next: { revalidate: 3600, tags: ["products"] },
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Row[];
    return Array.isArray(rows) ? rows.map(toSeoProduct) : [];
  } catch {
    return [];
  }
}

/** One product by its derived slug, or null when nothing matches. */
export async function findSeoProductBySlug(slug: string): Promise<SeoProduct | null> {
  const wanted = slugify(String(slug ?? ""));
  if (!wanted) return null;
  const all = await fetchSeoProducts();
  return all.find((p) => p.slug === wanted) ?? null;
}

/**
 * The size variants for a product, cheapest first — used for the JSON-LD
 * `offers` range so search engines can show "from £55". Returns [] when the
 * table isn't present, so a database without size variants is unaffected.
 */
export async function fetchSeoSizes(productId: string): Promise<{ label: string; price: number }[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${PRODUCT_SIZES_TABLE}` +
        `?select=label,price&product_id=eq.${encodeURIComponent(productId)}&order=price.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        next: { revalidate: 3600, tags: ["products"] },
      },
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { label: string | null; price: number | string | null }[];
    return (rows ?? []).map((r) => ({
      label: String(r.label ?? "").trim(),
      price: Number(r.price) || 0,
    }));
  } catch {
    return [];
  }
}
