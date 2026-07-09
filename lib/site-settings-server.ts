// ============================================================
// Le Rasa Bakery — public site settings reader (SERVER ONLY)
//
// Reads the site_settings singleton with `cache: "no-store"` so admin
// edits show up on the very next request. Server components import this
// directly; client components go through /api/site-settings.
// ============================================================

import "server-only";
import {
  DEFAULT_SETTINGS,
  PUBLIC_SETTINGS_SELECT,
  normaliseSettings,
  type PublicSettings,
} from "@/lib/site-settings";
import { offerFromRow, resolveActiveOffers, type Offer } from "@/lib/offers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The anon key is now the "publishable" key; fall back to the legacy name.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fetch the singleton row for a given PostgREST `select`. Returns the row on
// success, `null` when there's no row, or `undefined` when the request itself
// failed (e.g. a selected column doesn't exist → PostgREST 400). Always
// no-store so admin edits reflect on the very next request.
async function fetchSettingsRow(
  select: string,
): Promise<Record<string, unknown> | null | undefined> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/site_settings?select=${select}&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      cache: "no-store",
    },
  );
  if (!res.ok) return undefined;
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows?.[0] ?? null;
}

/**
 * Read the public site settings, always fresh (never cached). Returns
 * DEFAULT_SETTINGS on any failure so callers never have to handle nulls.
 *
 * Resilient to schema drift: if the explicit public-column select fails
 * because the live DB is missing a newer column (e.g. hero_banner or
 * whatsapp_bar hasn't been migrated yet), it falls back to selecting the
 * whole row so the columns that DO exist still load, instead of every
 * setting silently collapsing to defaults. normaliseSettings only ever
 * returns public fields, so secret columns never leave this function.
 */
export async function getPublicSettings(): Promise<PublicSettings> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return DEFAULT_SETTINGS;
  try {
    let row = await fetchSettingsRow(PUBLIC_SETTINGS_SELECT);
    if (row === undefined) {
      row = await fetchSettingsRow("*");
    }
    return normaliseSettings(row ?? null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Read the live, resolved active offer(s) server-side (for server components
 * like the announcement bar). Same no-store discipline and anon RLS scope as
 * getPublicSettings and /api/offers/active — coupon offers are excluded, and
 * any failure returns the safe empty result so the storefront never throws.
 */
export async function getActiveOfferServer(): Promise<{ primary: Offer | null; stackable: Offer[] }> {
  const EMPTY = { primary: null as Offer | null, stackable: [] as Offer[] };
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return EMPTY;
  try {
    const select = "*,offer_category_rules(category,mode),offer_product_rules(product_id,mode)";
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/offers?select=${select}&type=neq.coupon&enabled=eq.true`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY as string,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return EMPTY;
    const rows = (await res.json()) as Record<string, unknown>[];
    const offers = Array.isArray(rows) ? rows.map(offerFromRow) : [];
    return resolveActiveOffers(offers, new Date());
  } catch {
    return EMPTY;
  }
}
