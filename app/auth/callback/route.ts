// ============================================================
// GET /auth/callback
// The single return target for every auth flow:
//   - Google OAuth            → ?code=
//   - Email verification      → ?code= (or ?token_hash=&type=signup)
//   - Password reset          → ?code=&flow=recovery
// Establishes the session (setting the auth cookies), then routes the
// user by profile completeness:
//   - no/incomplete profile → /account/complete-profile
//   - complete profile      → the `next` param (default /account)
// Recovery links skip that check — the customer has one job (set a new
// password) and the profile prompt would get in the way.
// ============================================================

import { NextResponse } from "next/server";
import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // Supabase email templates can be switched to `{{ .TokenHash }}` links, which
  // verify in any browser rather than only the one that started the flow.
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type") as EmailOtpType | null;
  const rawNext = url.searchParams.get("next");
  // Only same-origin paths, so `next` can never be used as an open redirect.
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/account";
  const origin = url.origin;

  // A password-reset link must land on the new-password screen, whichever way
  // the session got established.
  const recovery =
    url.searchParams.get("flow") === "recovery" || otpType === "recovery";

  if (!code && !(tokenHash && otpType)) {
    return NextResponse.redirect(`${origin}/account/login?error=missing_code`);
  }

  const supabase = (await createClient()) as unknown as SupabaseClient;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash as string,
        type: otpType as EmailOtpType,
      });
  if (error) {
    return NextResponse.redirect(`${origin}/account/login?error=auth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/account/login?error=auth`);
  }

  if (recovery) {
    return NextResponse.redirect(`${origin}/account/reset-password`);
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

  // An incomplete profile still has to end up where the customer was headed
  // (e.g. the product they were buying), so `next` is carried through.
  const dest = complete
    ? next
    : `/account/complete-profile?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(`${origin}${dest}`);
}
