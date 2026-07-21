// ============================================================
// POST /api/auth/forgot-password   (BACKEND ONLY — NOT wired to the frontend)
// ------------------------------------------------------------
// Issues a token-based password-reset email via Resend, bypassing Supabase
// SMTP. The existing Supabase recovery flow is UNCHANGED — this is groundwork.
//
// Flow:
//   1. Validate email
//   2. Resolve the auth user id (get_user_id_by_email RPC)
//   3. Generate a secure token
//   4. Store it in password_reset_tokens (1h expiry)
//   5. Send the Resend reset email
//   6. Always return the SAME generic success (no account enumeration)
//
// Does NOT touch login or Google login.
// ============================================================

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { sendForgotPasswordEmail } from "@/lib/auth-email";

export const dynamic = "force-dynamic";

/** Reset tokens are short-lived: 1 hour. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The same response whether or not the address exists — prevents enumeration.
const GENERIC_OK = {
  success: true,
  message: "If an account exists for that email, a reset link is on its way.",
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();

  // 1. Validate. A bad format still returns generic success (no info leak),
  //    but we skip the work.
  if (!EMAIL_RE.test(email)) {
    console.log("[api/auth/forgot-password] invalid email format — generic response");
    return NextResponse.json(GENERIC_OK);
  }

  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    console.error("[api/auth/forgot-password] admin client unavailable", e);
    // Still generic — never reveal server state to the client here.
    return NextResponse.json(GENERIC_OK);
  }

  try {
    // 2. Resolve the user id.
    const { data: userId, error: rpcErr } = await admin.rpc("get_user_id_by_email", {
      p_email: email,
    });
    if (rpcErr) {
      console.error("[api/auth/forgot-password] lookup RPC failed", { error: rpcErr.message });
      return NextResponse.json(GENERIC_OK);
    }
    if (!userId) {
      console.log("[api/auth/forgot-password] no account for email — generic response");
      return NextResponse.json(GENERIC_OK);
    }

    // 3. Generate a secure token.
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    // 4. Store it.
    const { error: insertErr } = await admin.from("password_reset_tokens").insert({
      user_id: userId as string,
      email,
      token,
      expires_at: expiresAt,
    });
    if (insertErr) {
      console.error("[api/auth/forgot-password] token insert failed", { error: insertErr.message });
      return NextResponse.json(GENERIC_OK);
    }

    // 5. Send the Resend reset email.
    const origin = new URL(req.url).origin;
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? origin).replace(/\/$/, "");
    const resetUrl = `${base}/auth/reset-password?token=${token}`;
    const result = await sendForgotPasswordEmail({ to: email, resetUrl });
    if (!result.ok) {
      console.error("[api/auth/forgot-password] reset email failed", { error: result.error });
    } else {
      console.log("[api/auth/forgot-password] reset email sent", { userId });
    }
  } catch (e) {
    console.error("[api/auth/forgot-password] unexpected exception", e);
  }

  // 6. Always the same response.
  return NextResponse.json(GENERIC_OK);
}
