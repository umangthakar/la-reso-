// ============================================================
// GET /auth/verify?token=...   (email verification landing page)
// ------------------------------------------------------------
// Server Component that runs the verification server-side on load and renders
// a professional success / error page. Paired with POST /api/auth/signup,
// which issues the token and links here. NOT wired into the live Supabase
// signup flow — this is the future Resend-owned path.
//
// Flow:
//   1. Read token from the query string
//   2. Validate it exists
//   3. Check it hasn't expired
//   4. Mark the user's email as verified (admin.updateUserById)
//   5. Delete the one-time token (so it can't be reused)
//   6. Send the Welcome email (best-effort)
//   7. Render the result
//
// Uses only existing brand utility classes — no UI redesign.
// ============================================================

import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, XCircle, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/auth-email";

export const dynamic = "force-dynamic";

type Outcome = "success" | "invalid" | "expired" | "error";

type TokenRow = {
  id: string;
  user_id: string | null;
  email: string;
  token: string;
  expires_at: string;
  verified_at: string | null;
  used_at: string | null;
};

/** Run the full verification and report a single outcome. */
async function verifyToken(token: string): Promise<Outcome> {
  if (!token || token.length < 16) return "invalid";

  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    console.error("[auth/verify] admin client unavailable", e);
    return "error";
  }

  // 2. Look the token up.
  const { data, error } = await admin
    .from("email_verification_tokens")
    .select("id,user_id,email,token,expires_at,verified_at,used_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[auth/verify] token lookup failed", { error: error.message });
    return "error";
  }
  if (!data) {
    // Not found = never issued, or already consumed (we delete on use).
    console.log("[auth/verify] token not found");
    return "invalid";
  }

  const row = data as TokenRow;

  // 3. Expiry check.
  if (new Date(row.expires_at).getTime() < Date.now()) {
    console.log("[auth/verify] token expired", { email: row.email });
    // Tidy the dead token away.
    await admin.from("email_verification_tokens").delete().eq("id", row.id);
    return "expired";
  }

  // 4. Mark the user's email verified.
  if (!row.user_id) {
    console.error("[auth/verify] token has no user_id", { id: row.id });
    return "error";
  }
  const { error: confirmErr } = await admin.auth.admin.updateUserById(row.user_id, {
    email_confirm: true,
  });
  if (confirmErr) {
    console.error("[auth/verify] updateUserById failed", { error: confirmErr.message });
    return "error";
  }

  // 5. Delete the one-time token so the link can't be replayed.
  await admin.from("email_verification_tokens").delete().eq("id", row.id);
  console.log("[auth/verify] verified", { userId: row.user_id, email: row.email });

  // 6. Welcome email — best-effort, never changes the outcome.
  try {
    await sendWelcomeEmail({ to: row.email });
  } catch (e) {
    console.error("[auth/verify] welcome email threw (best-effort)", e);
  }

  return "success";
}

const COPY: Record<Outcome, { icon: "ok" | "warn" | "err"; title: string; body: string }> = {
  success: {
    icon: "ok",
    title: "Email verified",
    body: "Your email is confirmed and your account is ready. You can sign in now.",
  },
  expired: {
    icon: "warn",
    title: "This link has expired",
    body: "Verification links are valid for 24 hours. Please sign up again or request a new link.",
  },
  invalid: {
    icon: "err",
    title: "This link isn't valid",
    body: "It may already have been used or was mistyped. Please request a new verification email.",
  },
  error: {
    icon: "err",
    title: "Something went wrong",
    body: "We couldn't verify your email just now. Please try the link again in a moment.",
  },
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = (searchParams?.token ?? "").trim();
  const outcome = await verifyToken(token);
  const { icon, title, body } = COPY[outcome];

  const badge =
    icon === "ok"
      ? { bg: "bg-wine", Icon: CheckCircle2 }
      : icon === "warn"
        ? { bg: "bg-dustyrose", Icon: MailWarning }
        : { bg: "bg-wine", Icon: XCircle };
  const { Icon } = badge;

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <div className="pointer-events-none absolute -left-20 top-28 h-64 w-64 rounded-full bg-dustyrose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-dustyrose/25 blur-3xl" />

      <div className="container relative flex justify-center">
        <div className="w-full max-w-md rounded-clay bg-blush-50 p-7 shadow-clay sm:p-9">
          <div className="flex flex-col items-center text-center">
            <span className={`grid h-14 w-14 place-items-center rounded-2xl ${badge.bg} text-blush-50 shadow-clay-sm`}>
              <Icon className="h-7 w-7" />
            </span>
            <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-darkberry-light">{body}</p>

            {outcome === "success" ? (
              <Button asChild className="mt-6 w-full" size="lg">
                <Link href="/account/login">Continue to sign in</Link>
              </Button>
            ) : (
              <>
                <Button asChild className="mt-6 w-full" size="lg">
                  <Link href="/account/signup">Back to sign up</Link>
                </Button>
                <p className="mt-4 text-xs text-darkberry-light">
                  Need help? Head to sign in and use “Forgot password”, or contact the bakery.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
