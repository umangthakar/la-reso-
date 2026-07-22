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
 * The admin email — server-only, from the environment (ADMIN_EMAIL).
 * OPTIONAL: when unset, the login accepts any correctly-formatted email
 * (paired with the right password) so existing deployments that only
 * configured ADMIN_PASSWORD keep working unchanged. Set ADMIN_EMAIL to
 * additionally require a specific address at sign-in.
 */
export function getAdminEmail(): string | undefined {
  const v = process.env.ADMIN_EMAIL;
  return v && v.trim() ? v.trim() : undefined;
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
