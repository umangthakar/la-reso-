// ============================================================
// Supabase session middleware helper (@supabase/ssr)
// ------------------------------------------------------------
// Refreshes the Supabase auth session on each request and keeps
// the auth cookies in sync between the request and response.
//
// To activate it, create a root middleware.ts that calls
// updateSession(request). It is provided as scaffolding for the
// new SSR client setup; the storefront does not use Supabase Auth
// today, so it is not wired into a root middleware yet.
// ============================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Nothing to refresh if the public env is not configured.
  if (!url || !key) return supabaseResponse;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: refresh the session so tokens do not expire mid-flight.
  await supabase.auth.getUser();

  return supabaseResponse;
}
