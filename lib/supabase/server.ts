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

/**
 * Create a service-role Supabase client. RLS is bypassed, so callers are
 * fully responsible for authorization (verify admin auth BEFORE calling).
 *
 * A fresh instance is returned per call to avoid sharing state/headers
 * across concurrent requests in a serverless environment.
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // supabase-js's bundled realtime-js requires a WebSocket constructor at
    // client construction time. Node < 22 has no global WebSocket, so without
    // this every admin route 500s on construction. We only ever use the REST
    // query API here (never realtime), so the `ws` polyfill is purely to let
    // the client instantiate. Safe to remove once on Node >= 22.
    realtime: { transport: WebSocket as unknown as never },
  });
}
