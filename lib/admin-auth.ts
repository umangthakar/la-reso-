// ============================================================
// Le Rasa Bakery — simple admin auth
// ------------------------------------------------------------
// A lightweight shared-password gate, deliberately simple for a
// non-technical owner. The password is checked on the client (to show
// the dashboard) AND sent on every admin API request as the
// `x-admin-auth` header so the server-side routes (which hold the
// service-role key) only act for an authenticated admin.
//
// This is NOT bank-grade security — it's a single shared password.
// The important guarantees are: (1) the service-role key never leaves
// the server, (2) the admin password lives ONLY in the server env
// (ADMIN_PASSWORD) and is never bundled to the client or committed to
// source, and (3) RLS still protects the database from the public anon
// key. The client validates by POSTing to /api/admin/login. To upgrade
// later, swap this for Supabase Auth.
// ============================================================

/** sessionStorage key the dashboard checks to stay logged in. */
export const ADMIN_AUTH_KEY = "admin_auth";

/** Header name carrying the password on admin API requests. */
export const ADMIN_AUTH_HEADER = "x-admin-auth";

/** The admin password — server-only, from the environment. To rotate access, change ADMIN_PASSWORD in the env. */
export function getAdminPassword(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

/**
 * The configured admin login email(s) — server-only, from ADMIN_EMAIL.
 * Supports EITHER a single address OR a comma-separated list, e.g.
 *   ADMIN_EMAIL=a@x.com,b@y.com,c@z.com
 * Each entry is trimmed and lower-cased; blanks are dropped. Returns an
 * empty array when ADMIN_EMAIL is unset — meaning any correctly-formatted
 * email is accepted (backward compatible with password-only deployments).
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
 * True when `email` is an authorised admin address. When no ADMIN_EMAIL is
 * configured, any correctly-formatted email is accepted. Comparison is
 * case-insensitive and never matches the raw ADMIN_EMAIL string directly —
 * it checks membership of the parsed list via includes().
 */
export function isAdminEmail(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  if (!isValidEmail(normalised)) return false;
  const admins = getAdminEmails();
  return admins.length === 0 || admins.includes(normalised);
}

/** Shared, simple email-format check used by the admin login (client + server). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Server-side guard for API routes. Returns true if the request carries the correct admin password. */
export function isAuthedRequest(req: Request): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  return req.headers.get(ADMIN_AUTH_HEADER) === expected;
}
