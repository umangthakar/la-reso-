// ============================================================
// Le Rasa Bakery — admin email format check (isomorphic)
// ------------------------------------------------------------
// Split out of lib/admin-auth.ts so the login form (a Client Component)
// can share the SAME rule the server enforces, without pulling the
// server-only session/crypto code into the browser bundle.
//
// Safe to import from both client and server.
// ============================================================

/** Shared, simple email-format check used by the admin login (client + server). */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
