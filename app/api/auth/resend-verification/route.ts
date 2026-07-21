// ============================================================
// POST /api/auth/resend-verification   (BACKEND ONLY — no frontend change)
// ------------------------------------------------------------
// Re-issues a verification email for an account that hasn't confirmed yet,
// via Resend (not Supabase SMTP). Rotates the token so any previous link is
// invalidated. Groundwork — not wired into the live Supabase flow.
//
// Guards:
//   • 60s cooldown per email      (durable, from the last token's created_at)
//   • Per-IP rate limit           (best-effort, in-memory sliding window)
//   • Token rotation              (new secure token each time)
//   • Old token invalidation      (previous tokens for the user are deleted)
//
// Flow:
//   1. Validate email + rate limit
//   2. Resolve the user id (get_user_id_by_email RPC)
//   3. If already verified or unknown → generic success (no enumeration)
//   4. Enforce the 60s cooldown
//   5. Invalidate old tokens, insert a rotated one
//   6. Send the Resend verification email
//   7. Professional success response
// ============================================================

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { sendVerificationEmail } from "@/lib/auth-email";

export const dynamic = "force-dynamic";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const COOLDOWN_MS = 60 * 1000; // 60s per email

// Best-effort per-IP rate limit. Module-level, so it holds per serverless
// instance (not global) — the DB-backed cooldown is the durable guard; this
// just blunts rapid abuse from one client.
const RL_MAX = 5;
const RL_WINDOW_MS = 10 * 60 * 1000; // 5 requests / 10 min / IP
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > RL_MAX;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || req.headers.get("x-real-ip") || "unknown";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Identical response for "sent", "already verified", and "unknown email".
const GENERIC_OK = {
  success: true,
  message: "If your account still needs verifying, a new link is on its way.",
};

function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, message, ...extra }, { status });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();

  // 1. Validate + rate limit.
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(GENERIC_OK); // no info leak
  }
  const ip = clientIp(req);
  if (isRateLimited(ip)) {
    console.warn("[api/auth/resend-verification] IP rate limited", { ip });
    return fail(429, "Too many requests. Please wait a few minutes and try again.", {
      retryAfterSeconds: Math.ceil(RL_WINDOW_MS / 1000),
    });
  }

  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    console.error("[api/auth/resend-verification] admin client unavailable", e);
    return NextResponse.json(GENERIC_OK);
  }

  try {
    // 2. Resolve the user id.
    const { data: userId, error: rpcErr } = await admin.rpc("get_user_id_by_email", {
      p_email: email,
    });
    if (rpcErr) {
      console.error("[api/auth/resend-verification] lookup RPC failed", { error: rpcErr.message });
      return NextResponse.json(GENERIC_OK);
    }
    if (!userId) {
      console.log("[api/auth/resend-verification] unknown email — generic response");
      return NextResponse.json(GENERIC_OK);
    }

    // 3. Skip if the email is already confirmed — nothing to resend.
    const { data: userRes } = await admin.auth.admin.getUserById(userId as string);
    if (userRes?.user?.email_confirmed_at) {
      console.log("[api/auth/resend-verification] already verified — generic response");
      return NextResponse.json(GENERIC_OK);
    }

    // 4. 60s cooldown, measured from the most recent token for this email.
    const { data: last } = await admin
      .from("email_verification_tokens")
      .select("created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last?.created_at) {
      const elapsed = Date.now() - new Date(last.created_at as string).getTime();
      if (elapsed < COOLDOWN_MS) {
        const retryAfter = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        console.log("[api/auth/resend-verification] cooldown active", { email, retryAfter });
        return fail(429, `Please wait ${retryAfter} seconds before requesting another email.`, {
          retryAfterSeconds: retryAfter,
        });
      }
    }

    // 5. Rotate: invalidate every old token for this user, then issue a new one.
    await admin.from("email_verification_tokens").delete().eq("user_id", userId as string);

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    const { error: insertErr } = await admin.from("email_verification_tokens").insert({
      user_id: userId as string,
      email,
      token,
      expires_at: expiresAt,
    });
    if (insertErr) {
      console.error("[api/auth/resend-verification] token insert failed", { error: insertErr.message });
      return NextResponse.json(GENERIC_OK);
    }

    // 6. Send the Resend verification email.
    const origin = new URL(req.url).origin;
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? origin).replace(/\/$/, "");
    const verifyUrl = `${base}/auth/verify?token=${token}`;
    const name = (userRes?.user?.user_metadata?.full_name as string) || undefined;
    const result = await sendVerificationEmail({ to: email, name, verifyUrl });
    if (!result.ok) {
      console.error("[api/auth/resend-verification] email failed", { error: result.error });
    } else {
      console.log("[api/auth/resend-verification] verification email sent (rotated)", { userId });
    }
  } catch (e) {
    console.error("[api/auth/resend-verification] unexpected exception", e);
  }

  // 7. Professional, generic success.
  return NextResponse.json(GENERIC_OK);
}
