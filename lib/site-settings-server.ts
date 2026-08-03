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
  PUBLIC_SETTINGS_VIEW,
  normaliseSettings,
  type PublicSettings,
} from "@/lib/site-settings";
import { offerFromRow, resolveActiveOffers, type Offer } from "@/lib/offers";
import { TAGS } from "@/lib/cache-tags";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// The anon key is now the "publishable" key; fall back to the legacy name.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fetch the singleton row for a given PostgREST `select`, from a given
// resource. Returns the row on success, `null` when there's no row, or
// `undefined` when the request itself failed (e.g. a selected column doesn't
// exist → PostgREST 400).
//
// DEFAULTS TO no-store, and that default is load-bearing: the navbar, footer,
// announcement bar, hero and checkout all read through here, and an admin edit
// must show up on the very next request. `revalidate` is an OPT-IN for the few
// callers where a minute of staleness is harmless (see getPublicSettings).
async function fetchSettingsRow(
  select: string,
  resource: string,
  revalidate?: number,
): Promise<Record<string, unknown> | null | undefined> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${resource}?select=${select}&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY as string,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      ...(typeof revalidate === "number"
        ? { next: { revalidate, tags: [TAGS.siteSettings] } }
        : { cache: "no-store" as const }),
    },
  );
  if (!res.ok) return undefined;
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows?.[0] ?? null;
}

/**
 * The resources to try, in order, for a public settings read.
 *
 * PUBLIC_SETTINGS_VIEW first: site_settings itself is no longer anon-readable,
 * because it holds stripe_config.secret_key_enc and
 * google_reviews_config.api_key_enc (audit finding C4).
 *
 * The base table stays as a second attempt purely so this code is safe to
 * deploy in either order relative to supabase/sql/43_critical_security_fixes.sql
 * — before the migration the view doesn't exist, after it the table read is
 * refused. Whichever half lands first, the storefront keeps rendering real
 * settings instead of collapsing to defaults. Once 43 is applied the fallback
 * is permanently inert and can be dropped.
 */
const SETTINGS_RESOURCES = [PUBLIC_SETTINGS_VIEW, "site_settings"] as const;

/** Try each resource/select combination until one returns a usable row. */
async function readSettingsRow(
  revalidate?: number,
): Promise<Record<string, unknown> | null | undefined> {
  for (const resource of SETTINGS_RESOURCES) {
    // Explicit public-column select first; then `*`, which covers a live DB
    // that is missing a newer column (e.g. hero_banner / home_slider) — see
    // the note on getPublicSettings below.
    for (const select of [PUBLIC_SETTINGS_SELECT, "*"]) {
      const row = await fetchSettingsRow(select, resource, revalidate);
      if (row !== undefined) return row;
    }
  }
  return undefined;
}

/**
 * Read the public site settings. Fresh on every call BY DEFAULT — the navbar,
 * footer, announcement bar, hero and checkout depend on that, so an admin edit
 * appears on the very next request. Returns DEFAULT_SETTINGS on any failure so
 * callers never have to handle nulls.
 *
 * `opts.revalidate` opts a caller into caching for that many seconds, tagged
 * `site-settings`. Use it ONLY where staleness is harmless — currently the two
 * code-owned legal pages, which read this for the brand name in their
 * <title> and nothing else. Do not add it to storefront chrome.
 *
 * Resilient to schema drift: if the explicit public-column select fails
 * because the live DB is missing a newer column (e.g. hero_banner or
 * whatsapp_bar hasn't been migrated yet), it falls back to selecting the
 * whole row so the columns that DO exist still load, instead of every
 * setting silently collapsing to defaults. normaliseSettings only ever
 * returns public fields, so secret columns never leave this function.
 */
export async function getPublicSettings(
  opts: { revalidate?: number } = {},
): Promise<PublicSettings> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return DEFAULT_SETTINGS;
  try {
    const row = await readSettingsRow(opts.revalidate);
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
