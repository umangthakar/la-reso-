// ============================================================
// Le Rasa Bakery — public hero slider reader (SERVER ONLY)
//
// Reads the VISIBLE rows of hero_slider_images with `cache: "no-store"`, so an
// admin upload, reorder, hide or delete shows on the home page's very next
// request with no redeploy. Same discipline and anon RLS scope as
// lib/policies-server.ts, which this is modelled on.
//
// Reads with the ANON key, so RLS ("Public read visible hero slider images",
// see supabase/sql/36_hero_slider.sql) is what actually hides a hidden image.
// The visible=eq.true filter below is belt-and-braces, not the guarantee —
// and heroSlidesFrom() filters on `visible` a third time, because a hidden
// cake reaching the hero would be the one bug this module must not have.
//
// This reader FETCHES and nothing else. Which rows become which cake, and what
// happens when there are none, is decided by heroSlidesFrom() in
// lib/hero-slider.ts — pure, and testable without a database.
// ============================================================

import "server-only";
import {
  HERO_SLIDER_PUBLIC_SELECT,
  normaliseHeroSliderImage,
  type HeroSliderImage,
} from "@/lib/hero-slider";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The anon key is now the "publishable" key; fall back to the legacy name.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** The columns this table had BEFORE 37_hero_slider_product.sql — the retry
 *  shape for a database that has not been migrated yet. Spelled out rather than
 *  derived from HERO_SLIDER_COLS, because the point of it is to be the OLD
 *  list: it must not follow that constant forward when a column is next added. */
const HERO_SLIDER_PRE_LINK_COLS =
  "id,image_url,display_order,visible,created_at,updated_at";

/**
 * Every visible hero image, in the admin's drag order.
 *
 * Each row carries its LINKED PRODUCT, embedded through the foreign key added
 * in 37_hero_slider_product.sql, so the hero's Order Now can address the cake
 * on screen. The embed costs no extra request and — this is the point of
 * reading it with the anon key — is evaluated under the products table's own
 * RLS: a hero image pointing at a hidden or deleted product comes back with no
 * product rather than with one the storefront should not be showing.
 *
 * Returns [] on ANY failure — no env vars, an unreachable database, a
 * non-2xx response, a body that isn't an array, or a table that doesn't exist
 * yet because 36_hero_slider.sql hasn't been run. All of them are the same
 * thing to the caller ("no images from the table"), and all of them must leave
 * the home page standing: the hero falls back to the images it is given.
 *
 * ONE EXCEPTION IS RETRIED RATHER THAN SWALLOWED: a database where
 * 37_hero_slider_product.sql has not been run has no product_id column and no
 * relationship to embed, so the primary select is rejected wholesale. Losing
 * the hero's images over a link that isn't set up yet would be the migration
 * breaking the page it was meant to improve, so that case falls back to the
 * pre-link columns and the hero renders exactly as it did before — every slide
 * simply has no product behind it.
 *
 * created_at breaks ties on display_order, so rows sharing a position (every
 * row is 0 before the first drag) can't shuffle between requests — the same
 * ordering the admin list and sortHeroSliderImages() use.
 */
export async function getHeroSliderImages(): Promise<HeroSliderImage[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  const rows = await read(HERO_SLIDER_PUBLIC_SELECT);
  // null means the request itself failed. Only then is the older shape worth
  // trying: an empty list is a real answer (nothing uploaded, or everything
  // hidden) and re-asking for it would be a second request for the same [].
  if (rows) return rows;
  return (await read(HERO_SLIDER_PRE_LINK_COLS)) ?? [];
}

/** One read at a given select shape. Rows on success, null when the request
 *  could not be made or was refused — which is what tells the caller whether a
 *  fallback shape is worth trying. */
async function read(select: string): Promise<HeroSliderImage[] | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/hero_slider_images` +
        `?select=${encodeURIComponent(select)}` +
        `&visible=eq.true` +
        `&order=display_order.asc,created_at.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${SUPABASE_ANON_KEY as string}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as unknown;
    if (!Array.isArray(rows)) return null;
    return rows.map(normaliseHeroSliderImage);
  } catch {
    return null;
  }
}
