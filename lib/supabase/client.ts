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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Add them to .env.local (see .env.local.example).",
  );
}

/** Header name the RLS policies read for token-based order access. */
export const TRACKING_TOKEN_HEADER = "x-tracking-token";

/**
 * Shared anonymous client for public, non-personalised reads
 * (products, categories, delivery settings, etc.).
 */
export const supabaseBrowser: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
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
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
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
