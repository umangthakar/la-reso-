// ============================================================
// Le Rasa Bakery — shared email address validation.
// ------------------------------------------------------------
// Isomorphic (client + server) so a form and the API it posts to can never
// disagree about what counts as a valid address. Deliberately stricter than
// the HTML `type="email"` rule, which accepts a bare hostname: we require a
// dotted domain with a real TLD, so "john@domain" and "hello@gmail" are
// rejected the same way on both sides.
// ============================================================

// local@label(.label)*.tld — no spaces or "@" in either part, no empty domain
// label (rejects "hello@.com"), TLD at least two letters.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[a-zA-Z]{2,}$/;

export const EMAIL_REQUIRED_MESSAGE = "Email is required.";
export const EMAIL_INVALID_MESSAGE = "Please enter a valid email address.";

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Returns the message to show for `value`, or "" when it is acceptable.
 * One function for both the inline field error and the API's 400 body.
 */
export function validateEmail(value: string): string {
  const email = value.trim();
  if (!email) return EMAIL_REQUIRED_MESSAGE;
  if (!isValidEmail(email)) return EMAIL_INVALID_MESSAGE;
  return "";
}
