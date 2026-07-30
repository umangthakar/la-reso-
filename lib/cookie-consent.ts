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
//
// ─── FORMAT ─────────────────────────────────────────────────────────────────
// The cookie holds a URI-encoded JSON record:
//
//   { essential: true, analytics: false, marketing: false,
//     timestamp: "2026-07-30T…Z", version: 1 }
//
// Earlier releases stored the bare strings "accepted" / "rejected". Those are
// still accepted on read and migrated to the record above, so nobody is re-asked
// just because the format changed — see parseConsent + isLegacyRawValue.
// ============================================================

/** Cookie name. Changing this re-asks every visitor, so treat it as stable. */
export const CONSENT_COOKIE_NAME = "lerasa_cookie_consent";

/**
 * Bump when the CATEGORIES change (e.g. a new "personalisation" category), so
 * an old record can be detected and the visitor asked about the new choice.
 * Do NOT bump for cosmetic changes — it costs everyone a re-consent.
 */
export const CONSENT_VERSION = 1;

/**
 * 180 days. Consent is not "forever": ICO guidance is to re-ask periodically
 * rather than treat a single click as permanent, and a returning visitor after
 * six months is a reasonable point to check again.
 */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/** The categories a visitor can be asked about. */
export type ConsentCategory = "essential" | "analytics" | "marketing";

/** Optional categories only — `essential` is never a choice. */
export type ConsentChoices = {
  analytics: boolean;
  marketing: boolean;
};

/**
 * A stored decision. `essential` is the literal `true`: strictly-necessary
 * cookies keep the site working and cannot be switched off, and typing it this
 * way stops anyone writing a record that claims otherwise.
 */
export type ConsentRecord = ConsentChoices & {
  essential: true;
  timestamp: string;
  version: number;
};

/** Fired on `window` whenever a decision is saved, so future integrations can
 *  react without polling. Detail is the new {@link ConsentRecord}. */
export const CONSENT_CHANGE_EVENT = "lerasa:consent-change";

/** Build a record from the optional-category choices. */
export function makeConsent(choices: ConsentChoices): ConsentRecord {
  return {
    essential: true,
    analytics: choices.analytics,
    marketing: choices.marketing,
    timestamp: new Date().toISOString(),
    version: CONSENT_VERSION,
  };
}

export const acceptAllChoices: ConsentChoices = { analytics: true, marketing: true };
export const rejectAllChoices: ConsentChoices = { analytics: false, marketing: false };

/** True when `raw` is one of the pre-v1 bare strings. */
export function isLegacyRawValue(raw: string | null | undefined): boolean {
  const value = safeDecode(raw);
  return value === "accepted" || value === "rejected";
}

function safeDecode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    // A hand-edited cookie can contain a stray "%", which throws.
    return raw;
  }
}

/**
 * Coerce an untrusted cookie value into a known decision.
 *
 * Returns null for anything unrecognised — a corrupted or hand-edited cookie
 * re-shows the banner rather than silently implying consent. Legacy
 * "accepted"/"rejected" values are migrated rather than rejected, so existing
 * visitors keep their choice.
 */
export function parseConsent(raw: string | null | undefined): ConsentRecord | null {
  const value = safeDecode(raw);
  if (!value) return null;

  // ── pre-v1 values ────────────────────────────────────────
  if (value === "accepted") return migratedFromLegacy(acceptAllChoices);
  if (value === "rejected") return migratedFromLegacy(rejectAllChoices);

  // ── v1 record ────────────────────────────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const rec = parsed as Record<string, unknown>;
  // Both optional categories must be present and boolean. Anything else means
  // the cookie wasn't written by us, so treat it as no decision.
  if (typeof rec.analytics !== "boolean" || typeof rec.marketing !== "boolean") {
    return null;
  }

  return {
    // Forced, never read from the cookie: essential cookies are always on.
    essential: true,
    analytics: rec.analytics,
    marketing: rec.marketing,
    timestamp: typeof rec.timestamp === "string" ? rec.timestamp : new Date().toISOString(),
    version: typeof rec.version === "number" ? rec.version : CONSENT_VERSION,
  };
}

/** A legacy value carries no timestamp, so migration stamps it as of now. */
function migratedFromLegacy(choices: ConsentChoices): ConsentRecord {
  return makeConsent(choices);
}

/** Whether a category is allowed. `essential` is always true, even with no record. */
export function hasConsent(
  record: ConsentRecord | null,
  category: ConsentCategory,
): boolean {
  if (category === "essential") return true;
  return record ? record[category] : false;
}

/**
 * The `document.cookie` string that records a decision.
 *
 * SameSite=Lax keeps it off cross-site requests; Secure is added only on HTTPS
 * so the banner still works on http://localhost during development.
 */
export function serialiseConsentCookie(
  record: ConsentRecord,
  { secure }: { secure: boolean },
): string {
  return [
    `${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(record))}`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** The cookie's raw value as the browser holds it, before parsing. */
export function readRawConsentCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE_NAME}=([^;]*)`),
  );
  return match ? match[1] : null;
}

/** Read the current decision from `document.cookie`. Browser only. */
export function readConsent(): ConsentRecord | null {
  return parseConsent(readRawConsentCookie());
}

/**
 * Record a decision in the browser and notify listeners.
 *
 * The CONSENT_CHANGE_EVENT is the hook for future integrations: when analytics
 * or marketing tags are eventually added, they should load on this event (and
 * on first read) rather than unconditionally — see hasConsent().
 */
export function writeConsent(record: ConsentRecord): ConsentRecord {
  if (typeof document !== "undefined") {
    document.cookie = serialiseConsentCookie(record, {
      secure: window.location.protocol === "https:",
    });
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: record }));
  }
  return record;
}
