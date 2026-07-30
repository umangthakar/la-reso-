// ============================================================
// Le Rasa — cookie consent storage.
// ------------------------------------------------------------
// PURE and isomorphic: no React, no DOM access at module scope, no server-only
// imports. The root layout reads the cookie on the SERVER and hands the result
// to the banner as a prop, so the first paint already knows whether to show it —
// that is what prevents both the flash of a banner on a returning visitor and
// any hydration mismatch.
//
// Consent lives in a COOKIE, not localStorage, for two reasons: the server can
// read it (see above), and it is the storage mechanism the Cookie Policy itself
// describes. It is deliberately NOT HttpOnly — the banner has to be able to
// read and rewrite it from the browser.
// ============================================================

/** Cookie name. Changing this re-asks every visitor, so treat it as stable. */
export const CONSENT_COOKIE_NAME = "lerasa_cookie_consent";

/** The only two values ever stored. Anything else is treated as "no decision". */
export type CookieConsent = "accepted" | "rejected";

/**
 * 180 days. Consent is not "forever": ICO guidance is to re-ask periodically
 * rather than treat a single click as permanent, and a returning visitor after
 * six months is a reasonable point to check again.
 */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/**
 * Coerce an untrusted cookie value (which a visitor can hand-edit) to a known
 * consent state. Anything unrecognised means "not decided yet", so a corrupted
 * cookie re-shows the banner rather than silently implying consent.
 */
export function parseConsent(raw: string | null | undefined): CookieConsent | null {
  return raw === "accepted" || raw === "rejected" ? raw : null;
}

/**
 * The `document.cookie` string that records a decision.
 *
 * SameSite=Lax keeps it off cross-site requests; Secure is added only on HTTPS
 * so the banner still works on http://localhost during development.
 */
export function serialiseConsentCookie(
  value: CookieConsent,
  { secure }: { secure: boolean },
): string {
  return [
    `${CONSENT_COOKIE_NAME}=${value}`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** Read the current decision from `document.cookie`. Browser only. */
export function readConsentFromDocument(): CookieConsent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE_NAME}=([^;]*)`),
  );
  return parseConsent(match ? decodeURIComponent(match[1]) : null);
}

/** Record a decision in the browser. Returns the value written. */
export function writeConsent(value: CookieConsent): CookieConsent {
  if (typeof document !== "undefined") {
    document.cookie = serialiseConsentCookie(value, {
      secure: window.location.protocol === "https:",
    });
  }
  return value;
}
