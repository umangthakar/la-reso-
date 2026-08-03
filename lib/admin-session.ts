// ============================================================
// Le Rasa Bakery — admin session tokens (SERVER ONLY)
// ------------------------------------------------------------
// Replaces the old scheme where the admin password itself was kept in
// sessionStorage and sent as the `x-admin-auth` header on every request.
// The password now never leaves the sign-in POST body: on success the
// server issues a SIGNED, httpOnly cookie and that cookie is what
// authorises every later admin API call.
//
// Token format:  base64url(payload) "." base64url(HMAC-SHA256(payload))
// Payload:       { email, iat, exp, pwv }
//
//   • Signed with a server-only secret (ADMIN_ENCRYPTION_KEY, falling back
//     to SUPABASE_SERVICE_ROLE_KEY — the same precedence lib/crypto.ts
//     already uses), so the browser cannot mint or edit a token.
//   • `exp` bounds the session (8h) so a stolen cookie is not forever.
//   • `pwv` is a short digest of the CURRENT admin password, re-checked on
//     every verify — so changing ADMIN_PASSWORD immediately invalidates
//     every outstanding session. That is the rotation story the old scheme
//     had for free (the header WAS the password) and we must not lose.
//
// The cookie is httpOnly (JavaScript, and therefore XSS, cannot read it),
// SameSite=Strict (which is what keeps a cookie-authorised admin API safe
// from CSRF — the old header scheme was CSRF-immune by construction, so
// switching to cookies must not open that door) and Secure in production.
//
// NEVER import this from a Client Component.
// ============================================================

import "server-only";
import { createHmac, timingSafeEqual, createHash } from "crypto";

/** Name of the httpOnly cookie carrying the admin session. */
export const ADMIN_SESSION_COOKIE = "admin_session";

/** How long a signed-in admin stays signed in. */
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

type SessionPayload = {
  /** The admin email that signed in (audit / display only). */
  email: string;
  /** Issued-at, epoch seconds. */
  iat: number;
  /** Expiry, epoch seconds. */
  exp: number;
  /** Digest of the admin password this session was minted against. */
  pwv: string;
};

function signingSecret(): string {
  const s = process.env.ADMIN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "Missing ADMIN_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) for admin session signing.",
    );
  }
  return s;
}

/** Short digest binding a session to the password that created it. */
function passwordVersion(): string {
  const pw = process.env.ADMIN_PASSWORD ?? "";
  return createHash("sha256").update(pw).digest("hex").slice(0, 16);
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", signingSecret()).update(payloadB64).digest());
}

/** Mint a signed session token for an authenticated admin email. */
export function createAdminSessionToken(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    email,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    pwv: passwordVersion(),
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verify a session token. Returns the payload when the signature, expiry AND
 * password version all check out, otherwise null. Constant-time signature
 * comparison; every failure mode returns null rather than throwing so callers
 * can treat "no session" and "bad session" identically.
 */
export function verifyAdminSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const payloadB64 = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  let expectedSig: string;
  try {
    expectedSig = sign(payloadB64);
  } catch {
    return null; // signing secret not configured
  }

  const a = Buffer.from(providedSig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload?.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  // Password rotated since this token was issued → session is dead.
  if (payload.pwv !== passwordVersion()) return null;

  return payload;
}

/** Read the session cookie straight off a Request (no next/headers needed). */
export function sessionTokenFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === ADMIN_SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** `Set-Cookie` value that installs the session. */
export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

/** `Set-Cookie` value that clears the session (logout). */
export function clearSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
