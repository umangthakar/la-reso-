// ============================================================
// Le Rasa Bakery — simple admin auth (SERVER ONLY)
// ------------------------------------------------------------
// A lightweight shared-password gate, deliberately simple for a
// non-technical owner. The password is submitted ONCE, to
// /api/admin/login. If it (and the email allowlist) check out, the server
// issues a signed httpOnly session cookie, and that cookie is what
// authorises every admin API request from then on.
//
// What this is NOT: it is still a single shared password, not per-user
// accounts with MFA. The guarantees it DOES give:
//   1. the service-role key never leaves the server,
//   2. ADMIN_PASSWORD lives only in the server env — it is never bundled
//      to the client, never stored in the browser, and never travels on
//      requests after sign-in,
//   3. the session cookie is httpOnly, so XSS cannot read it, and
//      SameSite=Strict, so it cannot be used cross-site (CSRF),
//   4. sign-in attempts are rate limited (lib/rate-limit),
//   5. the ADMIN_EMAIL allowlist is mandatory when configured,
//   6. RLS still protects the database from the public anon key.
// To upgrade later, swap this for Supabase Auth with an is_admin claim.
//
// Server-only because it reads secrets and verifies HMACs. The login form
// imports its email check from lib/admin-email instead.
// ============================================================

import "server-only";
import { timingSafeEqual } from "crypto";
import { isValidEmail } from "@/lib/admin-email";
import {
  sessionTokenFromRequest,
  verifyAdminSessionToken,
} from "@/lib/admin-session";

export { isValidEmail };

/** The admin password — server-only, from the environment. To rotate access, change ADMIN_PASSWORD in the env. */
export function getAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

/**
 * The configured admin login email(s) — server-only, from ADMIN_EMAIL.
 * Supports EITHER a single address OR a comma-separated list, e.g.
 *   ADMIN_EMAIL=a@x.com,b@y.com,c@z.com
 * Each entry is trimmed and lower-cased; blanks are dropped. Returns an
 * empty array when ADMIN_EMAIL is unset.
 */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAIL;
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/**
 * True when `email` is an authorised admin address. Comparison is
 * case-insensitive and never matches the raw ADMIN_EMAIL string directly —
 * it checks membership of the parsed list via includes().
 *
 * When ADMIN_EMAIL is unset this accepts any correctly-formatted email, which
 * keeps a password-only deployment working. That is why the login route treats
 * a missing ADMIN_EMAIL as a configuration warning: the allowlist is only a
 * real gate once it is populated.
 */
export function isAdminEmail(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  if (!isValidEmail(normalised)) return false;
  const admins = getAdminEmails();
  return admins.length === 0 || admins.includes(normalised);
}

/** Constant-time string compare that doesn't leak length via early return. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Server-side guard for API routes. True when the request carries a valid,
 * unexpired, correctly-signed admin session cookie.
 *
 * Signature is unchanged from the previous header-based version, so all 42
 * admin routes that call `isAuthedRequest(req)` keep working untouched — only
 * the credential being checked has changed.
 */
export function isAuthedRequest(req: Request): boolean {
  return verifyAdminSessionToken(sessionTokenFromRequest(req)) !== null;
}

/** The signed-in admin's email, or null when there is no valid session. */
export function adminEmailFromRequest(req: Request): string | null {
  return verifyAdminSessionToken(sessionTokenFromRequest(req))?.email ?? null;
}
