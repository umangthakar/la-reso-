// ============================================================
// SERVER-COMPONENT Supabase client (@supabase/ssr)
// ------------------------------------------------------------
// Cookie-bound anon/publishable client for use in Server
// Components, Server Actions and Route Handlers that read public,
// RLS-protected data on the server. It reads/writes the auth
// cookies so any Supabase session stays in sync across requests.
//
// This is NOT the admin client. Service-role access (RLS bypass,
// used by the password-gated admin API routes) lives in
// lib/supabase/server.ts via createAdminClient() — keep them
// separate.
// ============================================================

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Read the public Supabase env vars. Prefers the new publishable-key
 * name and falls back to the legacy anon-key name during switch-over.
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

/** Create a cookie-bound server Supabase client (publishable key). */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = publicEnv();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only.
          // Safe to ignore when session refresh runs in middleware instead.
        }
      },
    },
  });
}
