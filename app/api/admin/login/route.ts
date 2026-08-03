// ============================================================
// Admin API — sign in
// ------------------------------------------------------------
// Validates the submitted email + password against the server-only
// ADMIN_EMAIL allowlist and ADMIN_PASSWORD. On success it sets a signed,
// httpOnly session cookie; the password is never returned, never stored in
// the browser, and never travels on any later request.
//
// Brute-force protection: attempts are rate limited per client IP and only
// FAILURES count, so a working admin is never throttled.
// ============================================================

import { NextResponse } from "next/server";
import {
  getAdminEmails,
  getAdminPassword,
  isAdminEmail,
  safeEqual,
} from "@/lib/admin-auth";
import { createAdminSessionToken, sessionCookieHeader } from "@/lib/admin-session";
import { checkRateLimit, clientKey, recordFailure, recordSuccess } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = getAdminPassword();
  if (!expected) {
    return NextResponse.json(
      { error: "Admin password is not configured on the server." },
      { status: 500 },
    );
  }

  // ── Brute-force gate, BEFORE any credential comparison ────────────────
  const key = clientKey(req);
  const limit = checkRateLimit(key);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let password = "";
  let email = "";
  try {
    const body = (await req.json()) as { password?: unknown; email?: unknown };
    if (typeof body?.password === "string") password = body.password;
    if (typeof body?.email === "string") email = body.email.trim();
  } catch {
    // malformed body → treated as empty credentials below
  }

  // ── The email allowlist is MANDATORY ──────────────────────────────────
  // Previously the gate was skipped whenever the client simply omitted the
  // email, which meant an attacker could ignore it entirely by posting the
  // password alone. Both credentials are now always required. (The dashboard
  // no longer re-posts the password to re-validate a session — it calls
  // GET /api/admin/session, which reads the signed cookie — so nothing
  // legitimately signs in without an email any more.)
  const credentialsOk = isAdminEmail(email) && safeEqual(password, expected);

  if (!credentialsOk) {
    recordFailure(key);
    // One generic message for every failure mode, so this cannot be used to
    // enumerate which admin emails exist.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  recordSuccess(key);

  // Surface a misconfiguration rather than silently running without a gate.
  if (getAdminEmails().length === 0) {
    console.warn(
      "[api/admin/login] ADMIN_EMAIL is unset — any correctly-formatted email is accepted. Set ADMIN_EMAIL to enforce the allowlist.",
    );
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", sessionCookieHeader(createAdminSessionToken(email.toLowerCase())));
  return res;
}
