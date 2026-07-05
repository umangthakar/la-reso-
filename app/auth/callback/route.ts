// ============================================================
// GET /auth/callback
// OAuth redirect target. Exchanges the ?code for a session (setting
// the auth cookies), then routes the user by profile completeness:
//   - no/incomplete profile → /account/complete-profile
//   - complete profile      → the `next` param (default /account)
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/account";
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/account/login?error=missing_code`);
  }

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/account/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/account/login?error=auth`);
  }

  // Profile is "complete" once the essentials are filled in.
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name,last_name,phone")
    .eq("id", user.id)
    .maybeSingle();

  const complete =
    !!profile &&
    !!profile.first_name &&
    !!profile.last_name &&
    !!profile.phone;

  const dest = complete ? next : "/account/complete-profile";
  return NextResponse.redirect(`${origin}${dest}`);
}
