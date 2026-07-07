// ============================================================
// SERVER-ONLY Supabase admin client (SERVICE ROLE key)
// ------------------------------------------------------------
// The service role key bypasses Row Level Security entirely, so this
// module must NEVER reach the browser bundle.
//
// The `import "server-only"` line below is a hard guard: if any Client
// Component (or anything in the browser bundle) imports this file even
// transitively, the Next.js build FAILS with a clear error. Only Server
// Components, Route Handlers (app/api/**), and Server Actions may use it.
//
// Usage (inside a server action / route handler that has ALREADY
// verified the caller is an authenticated admin):
//
//   import { createAdminClient } from "@/lib/supabase/server";
//   const supabase = createAdminClient();
//   const { data } = await supabase.from("orders").select("*");
// ============================================================

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { Database } from "./database.types";

/**
 * Create a service-role Supabase client. RLS is bypassed, so callers are
 * fully responsible for authorization (verify admin auth BEFORE calling).
 *
 * A fresh instance is returned per call to avoid sharing state/headers
 * across concurrent requests in a serverless environment.
 *
 * The env-var check lives HERE (not at module top level) on purpose: a
 * top-level throw fires when Next.js imports this module to collect page
 * data at build time, before any env vars are available, failing the whole
 * build. Deferring it to call time means the check only runs on an actual
 * request, where the env vars are present.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // NOTE: no NEXT_PUBLIC_ prefix — this must stay server-side.
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Add them to .env.local (see .env.local.example). " +
        "SUPABASE_SERVICE_ROLE_KEY must be server-only — never prefix it with NEXT_PUBLIC_.",
    );
  }

  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Force every REST request through with `no-store`. Next.js/Vercel caches
    // fetch() GET responses in its Data Cache by default, and supabase-js sets
    // no cache option — so without this an admin read (e.g. the orders list)
    // can be frozen for hours: a server-side insert can't invalidate that
    // cache, so new orders only appear after it evicts/redeploys. no-store
    // guarantees the admin always reads live data. (Belt-and-suspenders with
    // each route's `dynamic = "force-dynamic"`.)
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    // supabase-js's bundled realtime-js requires a WebSocket constructor at
    // client construction time. Node < 22 has no global WebSocket, so without
    // this every admin route 500s on construction. We only ever use the REST
    // query API here (never realtime), so the `ws` polyfill is purely to let
    // the client instantiate. Safe to remove once on Node >= 22.
    realtime: { transport: WebSocket as unknown as never },
  });
}
