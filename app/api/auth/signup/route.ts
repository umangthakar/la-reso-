// ============================================================
// POST /api/auth/signup   ← LIVE. This is the customer signup path.
// ------------------------------------------------------------
// DO NOT DELETE. The header here used to read "BACKEND ONLY — NOT wired to the
// frontend … groundwork for the future migration", which is stale: that
// migration happened. lib/use-auth.ts#signUpWithEmail POSTs to this route (see
// the `fetch("/api/auth/signup")` call there), and /account/signup is the only
// way a customer creates an account — which, because checkout is gated behind
// sign-in, means this endpoint is on the critical path to placing an order.
//
// The stale comment mattered: an audit reading it concluded the route was dead
// code and a candidate for removal. Deleting it would have broken signup, and
// with it checkout for every new customer.
//
// Standalone signup endpoint that owns the verification email itself via
// Resend, bypassing Supabase's built-in SMTP.
//
// Flow:
//   1. Validate input
//   2. Check for a duplicate email
//   3. Create the Supabase Auth user with email_confirm:false
//      (admin.createUser sends NO email → no Supabase SMTP; the account
//       stays unconfirmed, so it is NOT auto-verified)
//   4. Generate a secure token
//   5. Insert it into email_verification_tokens (24h expiry)
//   6. Send the Resend verification email (lib/auth-email.ts)
//   7. Return success
//
// Returns structured JSON: { success, message, ... } — never a bare {}.
// ============================================================

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { sendVerificationEmail } from "@/lib/auth-email";
import {
  cleanString,
  normaliseEmail,
  normaliseName,
  validateEmail,
  validateName,
} from "@/lib/input-validation";

export const dynamic = "force-dynamic";

/** Token lifetime: 24 hours. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function str(v: unknown, max = 200): string {
  return cleanString(v, max);
}

function fail(status: number, message: string, details?: string) {
  return NextResponse.json({ success: false, message, ...(details ? { details } : {}) }, { status });
}

export async function POST(req: Request) {
  // ── 1. Validate ───────────────────────────────────────────
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = normaliseEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  const name = normaliseName(str(body.name, 200));

  // Shared rules, identical to the signup form's. The email check is now the
  // stricter shared one — the local regex it replaces accepted "abc@gmail".
  const emailError = validateEmail(email);
  if (emailError) return fail(400, emailError);
  const nameError = validateName(name);
  if (nameError) return fail(400, nameError);
  if (password.length < 6) return fail(400, "Your password must be at least 6 characters.");

  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    console.error("[api/auth/signup] admin client unavailable", e);
    return fail(500, "Server is not configured.", e instanceof Error ? e.message : undefined);
  }

  // ── 2. Check duplicate email ──────────────────────────────
  // supabase-js has no email filter on listUsers, and the auth schema isn't
  // exposed to PostgREST, so the authoritative duplicate check is createUser's
  // own `email_exists` error (handled below). We ALSO do a cheap pre-check
  // against public.profiles to short-circuit obvious duplicates early.
  try {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) {
      return fail(409, "An account with this email already exists. Try signing in instead.");
    }
  } catch {
    /* profiles table/column optional — fall through to the authoritative check */
  }

  // ── 3. Create the Supabase Auth user (no email sent) ──────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // stays unconfirmed → NOT auto-verified, no SMTP send
    user_metadata: { full_name: name },
  });

  if (createErr) {
    const msg = createErr.message ?? "";
    const isDuplicate =
      createErr.status === 422 ||
      createErr.code === "email_exists" ||
      /already.*(registered|exists)|email_exists/i.test(msg);
    console.error("[api/auth/signup] createUser failed", {
      status: createErr.status,
      code: createErr.code,
      message: msg,
    });
    if (isDuplicate) {
      return fail(409, "An account with this email already exists. Try signing in instead.");
    }
    return fail(500, "We couldn't create your account. Please try again.", msg);
  }

  const userId = created.user?.id ?? null;
  if (!userId) {
    return fail(500, "We couldn't create your account. Please try again.");
  }

  // ── 4. Generate a secure token ────────────────────────────
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // ── 5. Insert the token ───────────────────────────────────
  const { error: tokenErr } = await admin.from("email_verification_tokens").insert({
    user_id: userId,
    email,
    token,
    expires_at: expiresAt,
  });

  if (tokenErr) {
    // Can't verify without a token — roll the orphan user back so a retry is clean.
    console.error("[api/auth/signup] token insert failed — rolling back user", {
      userId,
      error: tokenErr.message,
    });
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return fail(500, "We couldn't start email verification. Please try again.", tokenErr.message);
  }

  // ── 6. Send the Resend verification email ─────────────────
  const origin = new URL(req.url).origin;
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? origin).replace(/\/$/, "");
  const verifyUrl = `${base}/auth/verify?token=${token}`;

  const emailResult = await sendVerificationEmail({ to: email, name, verifyUrl });

  if (!emailResult.ok) {
    // User + token persist so a future "resend" can retry — but tell the caller
    // the email didn't go out rather than falsely reporting success.
    console.error("[api/auth/signup] verification email failed", { email, error: emailResult.error });
    return fail(
      502,
      "Your account was created, but we couldn't send the verification email. Please request a new link.",
      emailResult.error,
    );
  }

  // ── 7. Return success ─────────────────────────────────────
  return NextResponse.json({
    success: true,
    message: "Account created. Check your inbox to verify your email.",
    userId,
  });
}
