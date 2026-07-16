// ============================================================
// SERVER-ONLY Google Reviews helper — the single source of truth for
// fetching, caching and syncing Google Places reviews.
//
// Architecture (the API key NEVER reaches the browser):
//
//   Storefront (server component)
//     ↓  getGoogleReviews()            ← cache-aware read
//   Next.js server (this module, service role)
//     ↓  callPlaces()                  ← only on cache miss / refresh
//   Google Places API
//     ↓
//   site_settings.google_reviews_cache (DB cache, persists on serverless)
//     ↓
//   Frontend carousel (data only — UI unchanged)
//
// Config + cache live on the site_settings singleton (see
// supabase/sql/24_google_reviews.sql). The API key is stored encrypted
// (lib/crypto) and decrypted only here. NEVER import from a Client
// Component.
// ============================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// ---- Types -------------------------------------------------

export type GoogleReview = {
  author_name: string;
  profile_photo_url: string;
  rating: number;
  text: string;
  relative_time: string;
};

export type SyncStatus =
  | "connected"
  | "failed"
  | "invalid_key"
  | "invalid_place"
  | "not_configured"
  | "disabled";

export type ReviewsConfig = {
  enabled: boolean;
  api_key_enc?: string;
  place_id: string;
  cache_hours: number;
};

export type ReviewsCache = {
  rating: number;
  total: number;
  reviews: GoogleReview[];
  synced_at: string; // last SUCCESSFUL sync (ISO)
  place_id: string;
  status: SyncStatus;
  status_message: string;
  checked_at: string; // last attempt of any outcome (ISO)
};

/** The public-safe payload handed to the storefront carousel. */
export type StorefrontReviews = {
  enabled: boolean;
  rating: number;
  total: number;
  reviews: GoogleReview[];
  placeUrl: string; // "leave a review" deep link
};

export const CACHE_HOUR_OPTIONS = [1, 3, 6, 12, 24] as const;
export const DEFAULT_CACHE_HOURS = 6;

// ---- Small utilities ---------------------------------------

function adminDb(): SupabaseClient {
  // Cast to the untyped client: the generated Database types predate the
  // google_reviews_* columns, and (like lib/stripe.ts) we read the whole row
  // to tolerate a lagging PostgREST schema cache.
  return createAdminClient() as unknown as SupabaseClient;
}

function coerceCacheHours(v: unknown): number {
  const n = Number(v);
  return (CACHE_HOUR_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_CACHE_HOURS;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Official "write a Google review" deep link for a Place ID. */
export function writeReviewUrl(placeId: string): string {
  return placeId
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
    : "";
}

// ---- Config / cache persistence ----------------------------

type SettingsRow = {
  id?: string;
  google_reviews_config?: Partial<ReviewsConfig> | null;
  google_reviews_cache?: Partial<ReviewsCache> | null;
};

async function loadRow(supabase: SupabaseClient): Promise<{
  id: string | null;
  config: ReviewsConfig;
  cache: ReviewsCache | null;
}> {
  // Read the whole row rather than the columns directly: a freshly-added
  // column can lag PostgREST's schema cache and 400 a targeted select.
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as SettingsRow;
  const rawCfg = (row.google_reviews_config ?? {}) as Partial<ReviewsConfig>;
  const rawCache = (row.google_reviews_cache ?? null) as Partial<ReviewsCache> | null;

  const config: ReviewsConfig = {
    enabled: Boolean(rawCfg.enabled),
    api_key_enc: str(rawCfg.api_key_enc) || undefined,
    place_id: str(rawCfg.place_id),
    cache_hours: coerceCacheHours(rawCfg.cache_hours),
  };

  const cache: ReviewsCache | null = rawCache
    ? {
        rating: Number(rawCache.rating) || 0,
        total: Number(rawCache.total) || 0,
        reviews: Array.isArray(rawCache.reviews)
          ? (rawCache.reviews as GoogleReview[])
          : [],
        synced_at: str(rawCache.synced_at),
        place_id: str(rawCache.place_id),
        status: (rawCache.status as SyncStatus) || "failed",
        status_message: str(rawCache.status_message),
        checked_at: str(rawCache.checked_at),
      }
    : null;

  return { id: row.id ?? null, config, cache };
}

async function saveConfig(
  supabase: SupabaseClient,
  id: string | null,
  config: ReviewsConfig,
): Promise<void> {
  const payload = { google_reviews_config: config };
  const res = id
    ? await supabase.from("site_settings").update(payload).eq("id", id)
    : await supabase.from("site_settings").insert(payload);
  if (res.error) throw new Error(res.error.message);
}

async function saveCache(
  supabase: SupabaseClient,
  id: string | null,
  cache: ReviewsCache,
): Promise<void> {
  const payload = { google_reviews_cache: cache };
  const res = id
    ? await supabase.from("site_settings").update(payload).eq("id", id)
    : await supabase.from("site_settings").insert(payload);
  // A cache-write failure must never break a page render; log and move on.
  if (res.error) console.error("[google-reviews] cache write failed:", res.error.message);
  else console.log("[google-reviews] cache written:", cache.status, `${cache.reviews.length} reviews`);
}

// ---- Google Places API -------------------------------------

class GoogleError extends Error {
  status: SyncStatus;
  constructor(status: SyncStatus, message: string) {
    super(message);
    this.status = status;
  }
}

type PlacesResult = { rating: number; total: number; reviews: GoogleReview[] };

/**
 * Call the Google Places "Place Details" endpoint. Returns the business
 * rating, total review count and up to 5 published reviews. Throws a
 * GoogleError with a typed `status` on any API-level failure.
 */
async function callPlaces(apiKey: string, placeId: string): Promise<PlacesResult> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "rating,user_ratings_total,reviews");
  url.searchParams.set("reviews_sort", "newest");
  url.searchParams.set("key", apiKey);

  let json: {
    status?: string;
    error_message?: string;
    result?: {
      rating?: number;
      user_ratings_total?: number;
      reviews?: Array<{
        author_name?: string;
        profile_photo_url?: string;
        rating?: number;
        text?: string;
        relative_time_description?: string;
      }>;
    };
  };
  try {
    console.log("[google-reviews] calling Places API for place_id:", placeId);
    const res = await fetch(url.toString(), { cache: "no-store" });
    json = await res.json();
    console.log("[google-reviews] Places API responded:", json.status);
  } catch (e) {
    throw new GoogleError(
      "failed",
      e instanceof Error ? e.message : "Network error contacting Google.",
    );
  }

  const status = json.status ?? "UNKNOWN_ERROR";
  if (status !== "OK") {
    // Map Google's status codes to our typed admin-facing statuses.
    if (status === "REQUEST_DENIED") {
      throw new GoogleError(
        "invalid_key",
        json.error_message || "Google rejected the API key (REQUEST_DENIED).",
      );
    }
    if (status === "NOT_FOUND" || status === "INVALID_REQUEST") {
      throw new GoogleError(
        "invalid_place",
        json.error_message || "Google could not find that Place ID.",
      );
    }
    throw new GoogleError(
      "failed",
      json.error_message || `Google Places error: ${status}.`,
    );
  }

  const result = json.result ?? {};
  const reviews: GoogleReview[] = (result.reviews ?? [])
    .filter((r) => str(r.text).trim() !== "")
    .map((r) => ({
      author_name: str(r.author_name) || "Google user",
      profile_photo_url: str(r.profile_photo_url),
      rating: Number(r.rating) || 5,
      text: str(r.text),
      relative_time: str(r.relative_time_description),
    }));

  return {
    rating: Number(result.rating) || 0,
    total: Number(result.user_ratings_total) || 0,
    reviews,
  };
}

// ---- Public admin operations -------------------------------

/** Masked config + status for the admin page. Never returns the API key. */
export async function getAdminReviewsState(): Promise<{
  enabled: boolean;
  place_id: string;
  cache_hours: number;
  has_api_key: boolean;
  api_key_last4: string;
  status: SyncStatus;
  status_message: string;
  last_synced_at: string;
  rating: number;
  total: number;
  review_count: number;
}> {
  const { config, cache } = await loadRow(adminDb());
  let last4 = "";
  if (config.api_key_enc) {
    try {
      last4 = decryptSecret(config.api_key_enc).slice(-4);
    } catch {
      last4 = "";
    }
  }
  return {
    enabled: config.enabled,
    place_id: config.place_id,
    cache_hours: config.cache_hours,
    has_api_key: Boolean(config.api_key_enc),
    api_key_last4: last4,
    status: cache?.status ?? "not_configured",
    status_message: cache?.status_message ?? "",
    last_synced_at: cache?.synced_at ?? "",
    rating: cache?.rating ?? 0,
    total: cache?.total ?? 0,
    review_count: cache?.reviews.length ?? 0,
  };
}

/**
 * Persist config from the admin page. A blank `api_key` keeps the existing
 * stored key (mirrors the Stripe secret-key behaviour). Encrypts the key
 * before saving.
 */
export async function saveAdminReviewsConfig(input: {
  enabled: boolean;
  place_id: string;
  cache_hours: number;
  api_key?: string; // blank = keep existing
}): Promise<void> {
  const supabase = adminDb();
  const { id, config: existing } = await loadRow(supabase);

  const incomingKey = str(input.api_key).trim();
  const api_key_enc = incomingKey
    ? encryptSecret(incomingKey)
    : existing.api_key_enc;

  const config: ReviewsConfig = {
    enabled: Boolean(input.enabled),
    place_id: str(input.place_id).trim(),
    cache_hours: coerceCacheHours(input.cache_hours),
    ...(api_key_enc ? { api_key_enc } : {}),
  };
  await saveConfig(supabase, id, config);
}

/**
 * Test the connection with either supplied credentials (a freshly typed but
 * unsaved key) or the stored ones. Does NOT write the cache.
 */
export async function testConnection(input?: {
  api_key?: string;
  place_id?: string;
}): Promise<{ ok: boolean; status: SyncStatus; message: string; rating?: number; total?: number; count?: number }> {
  const { config } = await loadRow(adminDb());

  const apiKey =
    str(input?.api_key).trim() ||
    (config.api_key_enc ? safeDecrypt(config.api_key_enc) : "");
  const placeId = str(input?.place_id).trim() || config.place_id;

  if (!apiKey) return { ok: false, status: "not_configured", message: "No API key set." };
  if (!placeId) return { ok: false, status: "not_configured", message: "No Place ID set." };

  try {
    const data = await callPlaces(apiKey, placeId);
    return {
      ok: true,
      status: "connected",
      message: "Connected — Google API access confirmed.",
      rating: data.rating,
      total: data.total,
      count: data.reviews.length,
    };
  } catch (e) {
    if (e instanceof GoogleError) return { ok: false, status: e.status, message: e.message };
    const message = e instanceof Error ? e.message : "Connection failed.";
    return { ok: false, status: "failed", message };
  }
}

/**
 * Fetch fresh reviews from Google and write the cache. Used by the admin
 * "Refresh Reviews" button and by the cache-miss path in getGoogleReviews.
 * On failure the previous good cache (reviews/rating/total) is preserved and
 * only the status fields are updated.
 */
export async function syncGoogleReviews(): Promise<{
  status: SyncStatus;
  message: string;
  synced_at: string;
}> {
  const supabase = adminDb();
  const { id, config, cache } = await loadRow(supabase);
  const now = new Date().toISOString();

  if (!config.enabled) {
    return { status: "disabled", message: "Google Reviews are turned off.", synced_at: cache?.synced_at ?? "" };
  }
  const apiKey = config.api_key_enc ? safeDecrypt(config.api_key_enc) : "";
  if (!apiKey || !config.place_id) {
    return {
      status: "not_configured",
      message: "Add an API key and Place ID first.",
      synced_at: cache?.synced_at ?? "",
    };
  }

  try {
    const data = await callPlaces(apiKey, config.place_id);
    const fresh: ReviewsCache = {
      rating: data.rating,
      total: data.total,
      reviews: data.reviews,
      synced_at: now,
      place_id: config.place_id,
      status: "connected",
      status_message: "Last sync successful.",
      checked_at: now,
    };
    await saveCache(supabase, id, fresh);
    return { status: "connected", message: "Reviews refreshed.", synced_at: now };
  } catch (e) {
    const status: SyncStatus = e instanceof GoogleError ? e.status : "failed";
    const message = e instanceof Error ? e.message : "Sync failed.";
    console.error("[google-reviews] sync failed:", status, message);
    // Preserve the last good data; only update the status/attempt fields.
    const preserved: ReviewsCache = {
      rating: cache?.rating ?? 0,
      total: cache?.total ?? 0,
      reviews: cache?.reviews ?? [],
      synced_at: cache?.synced_at ?? "",
      place_id: cache?.place_id ?? config.place_id,
      status,
      status_message: message,
      checked_at: now,
    };
    await saveCache(supabase, id, preserved);
    return { status, message, synced_at: preserved.synced_at };
  }
}

// ---- Public storefront read (cache-aware) ------------------

function isFresh(cache: ReviewsCache, config: ReviewsConfig): boolean {
  if (!cache.synced_at || cache.reviews.length === 0) return false;
  if (cache.place_id !== config.place_id) return false; // Place ID changed
  const ageMs = Date.now() - new Date(cache.synced_at).getTime();
  return ageMs < config.cache_hours * 60 * 60 * 1000;
}

/**
 * Cache-aware reviews for the storefront. Returns null when the feature is
 * off or there is nothing usable to show (so the carousel falls back to its
 * built-in local reviews and never renders empty).
 *
 * On a cache miss it fetches fresh from Google (best-effort) and persists the
 * result; on a Google failure it serves the most recent cached reviews.
 */
export async function getGoogleReviews(): Promise<StorefrontReviews | null> {
  let config: ReviewsConfig;
  let cache: ReviewsCache | null;
  try {
    ({ config, cache } = await loadRow(adminDb()));
  } catch (e) {
    console.error("[google-reviews] read failed:", e instanceof Error ? e.message : e);
    return null;
  }

  if (!config.enabled) return null;

  // Serve fresh cache immediately.
  if (cache && isFresh(cache, config)) {
    return toStorefront(cache, config.place_id);
  }

  // Stale or missing → try a live refresh (best-effort).
  const notConfigured = !config.api_key_enc || !config.place_id;
  if (!notConfigured) {
    try {
      await syncGoogleReviews();
      const { cache: refreshed } = await loadRow(adminDb());
      if (refreshed && refreshed.reviews.length > 0) {
        return toStorefront(refreshed, config.place_id);
      }
    } catch (e) {
      console.error("[google-reviews] refresh-on-read failed:", e instanceof Error ? e.message : e);
    }
  }

  // Fallback: serve stale cache if we have any reviews at all.
  if (cache && cache.reviews.length > 0) {
    return toStorefront(cache, config.place_id);
  }
  return null;
}

function toStorefront(cache: ReviewsCache, placeId: string): StorefrontReviews {
  return {
    enabled: true,
    rating: cache.rating,
    total: cache.total,
    reviews: cache.reviews,
    placeUrl: writeReviewUrl(placeId),
  };
}

function safeDecrypt(token: string): string {
  try {
    return decryptSecret(token);
  } catch {
    return "";
  }
}
