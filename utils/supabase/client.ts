// ============================================================
// PUBLIC / BROWSER Supabase client (@supabase/ssr)
// ------------------------------------------------------------
// Safe to import from Client Components. Uses the public
// publishable key, so every query is subject to Row Level
// Security. Build one of these with createClient() wherever a
// client component needs to read public storefront data.
//
// There is NO service-role key here. Admin/service-role access
// lives in lib/supabase/server.ts (createAdminClient) and must
// never be imported into the browser bundle.
// ============================================================

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Read the public Supabase env vars. Prefers the new publishable-key
 * name and falls back to the legacy anon-key name so a stale local env
 * still resolves during the switch-over.
 */
function publicEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Add them to .env.local (see .env.local.example).",
    );
  }
  return { url, key };
}

/** Create a browser Supabase client bound to the publishable key. */
export function createClient() {
  const { url, key } = publicEnv();
  return createBrowserClient<Database>(url, key);
}
