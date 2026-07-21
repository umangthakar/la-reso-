// ============================================================
// POST /api/auth/reset-password   (BACKEND ONLY — NOT wired to the frontend)
// ------------------------------------------------------------
// Consumes a password_reset_tokens token and sets a new password via the admin
// API, then confirms by email via Resend. Bypasses Supabase SMTP. The existing
// Supabase recovery flow is UNCHANGED — this is groundwork.
//
// Flow:
//   1. Validate token + new password
//   2. Look the token up
//   3. Check expiry / single-use
//   4. Reset the password (admin.updateUserById)
//   5. Delete the token (single-use)
//   6. Send the "password changed" confirmation email
//   7. Return success
//
// Does NOT touch login or Google login.
// Returns structured JSON: { success, message, ... } — never a bare {}.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPasswordChangedEmail } from "@/lib/auth-email";

export const dynamic = "force-dynamic";

type TokenRow = {
  id: string;
  user_id: string | null;
  email: string;
  expires_at: string;
  used_at: string | null;
};

function fail(status: number, message: string, details?: string) {
  return NextResponse.json({ success: false, message, ...(details ? { details } : {}) }, { status });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");

  // 1. Validate.
  if (!token || token.length < 16) return fail(400, "This reset link isn't valid.");
  if (password.length < 6) return fail(400, "Your password must be at least 6 characters.");

  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    console.error("[api/auth/reset-password] admin client unavailable", e);
    return fail(500, "Server is not configured.", e instanceof Error ? e.message : undefined);
  }

  // 2. Look the token up.
  const { data, error } = await admin
    .from("password_reset_tokens")
    .select("id,user_id,email,expires_at,used_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[api/auth/reset-password] token lookup failed", { error: error.message });
    return fail(500, "We couldn't reset your password just now. Please try again.");
  }
  if (!data) {
    console.log("[api/auth/reset-password] token not found");
    return fail(400, "This reset link is invalid or has already been used.");
  }

  const row = data as TokenRow;

  // 3. Expiry / single-use check.
  if (row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    console.log("[api/auth/reset-password] token expired or used", { email: row.email });
    await admin.from("password_reset_tokens").delete().eq("id", row.id);
    return fail(400, "This reset link has expired. Please request a new one.");
  }
  if (!row.user_id) {
    console.error("[api/auth/reset-password] token has no user_id", { id: row.id });
    return fail(500, "We couldn't reset your password. Please request a new link.");
  }

  // 4. Reset the password.
  const { error: updateErr } = await admin.auth.admin.updateUserById(row.user_id, { password });
  if (updateErr) {
    console.error("[api/auth/reset-password] updateUserById failed", { error: updateErr.message });
    // Common case: the new password matches Supabase policy failures.
    return fail(400, updateErr.message || "We couldn't set that password. Please try a different one.");
  }

  // 5. Delete the token so the link can't be reused.
  await admin.from("password_reset_tokens").delete().eq("id", row.id);
  console.log("[api/auth/reset-password] password reset", { userId: row.user_id, email: row.email });

  // 6. Confirmation email — best-effort, never fails the reset.
  try {
    const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/London" });
    await sendPasswordChangedEmail({ to: row.email, when });
  } catch (e) {
    console.error("[api/auth/reset-password] confirmation email threw (best-effort)", e);
  }

  // 7. Success.
  return NextResponse.json({
    success: true,
    message: "Your password has been reset. You can sign in with your new password.",
  });
}
