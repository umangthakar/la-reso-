// ============================================================
// Le Rasa Bakery — shared customer input validation.
// ------------------------------------------------------------
// PURE and isomorphic (no I/O, no server-only imports), so a form and the API
// it posts to import the SAME rules and can never disagree about what counts as
// valid. Every validator returns the message to display, or "" when acceptable —
// one function feeds both the inline field error and the API's 400 body.
//
// Email lives in lib/email-validation.ts (it predates this module and is
// imported in several places already); it is re-exported below so callers have
// a single import surface for all field rules.
//
// A note on NAMES: the brief specified A–Z/a–z, but the character class here is
// Unicode letters + combining marks, so "José", "Siân" and "Łukasz" are
// accepted. Every rejection case in the brief (digits, @, #$%, "John123") still
// fails, and rejecting accented names would lock out real customers. Full stops
// are NOT allowed, per the brief's explicit allow-list.
// ============================================================

import { validateEmail } from "@/lib/email-validation";

export {
  EMAIL_INVALID_MESSAGE,
  EMAIL_REQUIRED_MESSAGE,
  isValidEmail,
  validateEmail,
} from "@/lib/email-validation";

// ── Names ───────────────────────────────────────────────────

export const NAME_MIN = 2;
export const NAME_MAX = 100;
export const NAME_INVALID_MESSAGE = "Please enter a valid name.";

// Latin letters including diacritics (Latin-1 Supplement, Extended-A/B and
// Extended Additional), minus the × and ÷ signs that sit inside those blocks.
// Spelled out as ranges rather than \p{L} because tsconfig sets no `target`, so
// it defaults to ES5 and the regex `u` flag is unavailable.
const LETTER = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF";
/** Combining diacritical marks, for decomposed forms of the above. */
const MARK = "\\u0300-\\u036F";

/**
 * Every token must start with a letter, and separators (space, hyphen, straight
 * or typographic apostrophe) must sit BETWEEN tokens. So "Anne-Marie" and
 * "O'Connor" pass, while "John-", "O'" and "John--Smith" do not.
 */
const NAME_RE = new RegExp(
  `^[${LETTER}][${LETTER}${MARK}]*(?:[ '’-][${LETTER}${MARK}]+)*$`,
);

/** Trim, and collapse any run of whitespace (incl. tabs/newlines) to one space. */
export function normaliseName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * @param required when false, an empty value is accepted (optional fields).
 */
export function validateName(value: string, required = true): string {
  const name = normaliseName(value);
  if (!name) return required ? NAME_INVALID_MESSAGE : "";
  if (name.length < NAME_MIN || name.length > NAME_MAX) return NAME_INVALID_MESSAGE;
  if (!NAME_RE.test(name)) return NAME_INVALID_MESSAGE;
  return "";
}

export function isValidName(value: string): boolean {
  return validateName(value) === "";
}

// ── Phone numbers ───────────────────────────────────────────

// No prior rule existed anywhere in the codebase (the only constraint was the
// 60-char cap on the DB write), so these are the defined bounds: 15 digits is
// the E.164 maximum, and 7 is the shortest plausible real number. A UK mobile
// ("07123456789", 11) and its international form ("+447123456789", 12) both fit.
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 15;
export const PHONE_INVALID_MESSAGE = "Please enter a valid phone number.";

/** Remove ALL whitespace, so "07123 456789" validates as "07123456789". */
export function normalisePhone(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Digits, with at most one leading "+". Anything else (letters, -, (), .) fails. */
const PHONE_RE = /^\+?\d+$/;

export function validatePhone(value: string, required = true): string {
  const phone = normalisePhone(value);
  if (!phone) return required ? PHONE_INVALID_MESSAGE : "";
  if (!PHONE_RE.test(phone)) return PHONE_INVALID_MESSAGE;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
    return PHONE_INVALID_MESSAGE;
  }
  return "";
}

export function isValidPhone(value: string): boolean {
  return validatePhone(value) === "";
}

// ── Free text (special instructions, notes, addresses) ──────

export const TEXT_MAX_DEFAULT = 2000;

// C0/C1 control characters except tab (\x09) and newline (\x0A) — these can
// corrupt logs, emails and CSV exports, and no human types them deliberately.
const CONTROL_CHARS = /[\x00-\x08\x0B-\x1F\x7F-\x9F]/g;

/**
 * Sanitise free-form text WITHOUT rejecting it: strip control characters, drop
 * carriage returns, collapse 3+ blank lines to one, trim, then cap the length.
 * Deliberately permissive — the brief says not to over-restrict these fields.
 */
export function normaliseText(value: string, max = TEXT_MAX_DEFAULT): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** Single-line free text (address, city, flavour…): whitespace fully collapsed. */
export function normaliseLine(value: string, max = 200): string {
  return value.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim().slice(0, max);
}

// ── Server-side coercion ────────────────────────────────────

/**
 * Coerce an UNTRUSTED JSON value to a clean single-line string.
 *
 * Non-strings become "" rather than "[object Object]"/"42"/"null" — a client
 * sending `{name:{}}` or `{phone:[1,2]}` must not have that stringified into the
 * database. Use this at every API boundary before validating.
 */
export function cleanString(value: unknown, max = 200): string {
  if (typeof value !== "string") return "";
  return normaliseLine(value, max);
}

/** As {@link cleanString}, but preserves newlines for multi-line fields. */
export function cleanText(value: unknown, max = TEXT_MAX_DEFAULT): string {
  if (typeof value !== "string") return "";
  return normaliseText(value, max);
}

/** Lowercased, trimmed email for storage/comparison. Does NOT validate. */
export function normaliseEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().slice(0, 254);
}

// ── Multi-field helper ──────────────────────────────────────

/** A field name → message map; empty when everything passed. */
export type FieldErrors = Record<string, string>;

/**
 * Validate the name/email/phone triad every customer form collects, in one call.
 * Returns only the failing fields, so a single submit can surface everything
 * that is wrong at once.
 */
export function validateContact(
  input: { name?: string; email?: string; phone?: string },
  opts: { nameRequired?: boolean; phoneRequired?: boolean } = {},
): FieldErrors {
  const errors: FieldErrors = {};

  const nameErr = validateName(input.name ?? "", opts.nameRequired ?? true);
  if (nameErr) errors.name = nameErr;

  const emailErr = validateEmail(input.email ?? "");
  if (emailErr) errors.email = emailErr;

  const phoneErr = validatePhone(input.phone ?? "", opts.phoneRequired ?? true);
  if (phoneErr) errors.phone = phoneErr;

  return errors;
}
