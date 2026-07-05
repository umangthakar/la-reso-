// ============================================================
// PUBLIC / CUSTOMER-FACING Supabase client (anon key)
// ------------------------------------------------------------
// Safe to import from client components. Uses the public anon key,
// so every query is subject to Row Level Security.
//
// Two things live here:
//   1. supabaseBrowser  — a shared singleton for anonymous reads
//      (storefront products, public catalogue, etc.)
//   2. createTrackingClient(token) — a per-order client that sends
//      the `x-tracking-token` header so RLS can match the order's
//      tracking_token. Used by the customer order-tracking page.
//
// There is NO service role key in this file. Admin/service-role
// access lives in ./server.ts and must never be imported here.
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** Header name the RLS policies read for token-based order access. */
export const TRACKING_TOKEN_HEADER = "x-tracking-token";

/**
 * Read + validate the public Supabase env vars. Called lazily (on first
 * client use), NOT at module load: a top-level throw here fires when
 * Next.js imports this module to collect page data at build time — before
 * NEXT_PUBLIC_* vars are available — and fails the whole build.
 */
function publicEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The anon key is now the "publishable" key (new Supabase key format).
  // Fall back to the legacy name so a stale local env still resolves.
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Add them to .env.local (see .env.local.example).",
    );
  }
  return { url, anonKey };
}

let cachedBrowserClient: SupabaseClient<Database> | null = null;

/** Lazily build (and memoise) the shared anon client. */
function getBrowserClient(): SupabaseClient<Database> {
  if (!cachedBrowserClient) {
    const { url, anonKey } = publicEnv();
    cachedBrowserClient = createClient<Database>(url, anonKey);
  }
  return cachedBrowserClient;
}

/**
 * Shared anonymous client for public, non-personalised reads
 * (products, categories, delivery settings, etc.).
 *
 * A Proxy so the underlying client is constructed on first property
 * access rather than at import time — this keeps `import { supabaseBrowser }`
 * cheap and, crucially, non-throwing during the build's page-data collection.
 */
export const supabaseBrowser: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop, receiver) {
      const client = getBrowserClient();
      const value = Reflect.get(client, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
);

/**
 * Build a client scoped to a single order's tracking token.
 *
 * The token is sent as the `x-tracking-token` request header, which the
 * RLS policies on `orders` / `order_status_history` / `order_items` /
 * `invoices` compare against each row's `tracking_token`.
 *
 * IMPORTANT: the header is applied to REST (PostgREST) requests only.
 * Supabase Realtime does NOT carry custom headers over its WebSocket, so
 * this client's realtime subscriptions are NOT authorized by the header.
 * See lib/supabase/hooks/use-order-tracking-realtime.ts and
 * supabase/README.md for how the tracking page handles realtime.
 */
export function createTrackingClient(
  trackingToken: string,
): SupabaseClient<Database> {
  const { url, anonKey } = publicEnv();
  return createClient<Database>(url, anonKey, {
    global: {
      headers: { [TRACKING_TOKEN_HEADER]: trackingToken },
    },
    auth: {
      // Tracking is anonymous — never persist or auto-refresh a session.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
