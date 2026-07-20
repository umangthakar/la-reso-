// ============================================================
// Le Rasa Bakery — rich-text Ingredients description helpers.
// ------------------------------------------------------------
// The Ingredients description supports SAFE rich formatting (the admin
// can bold selected words). Content is authored in the password-gated
// admin panel and rendered to customers via dangerouslySetInnerHTML, so
// it MUST be sanitized down to a tiny whitelist of INERT formatting tags
// with NO attributes. Stripping every attribute removes the XSS vectors
// (event handlers like onerror/onclick, javascript: URLs, style, etc.),
// and the tag whitelist excludes script/style/iframe/img/a and the like.
//
// Pure + isomorphic — safe to import from both server and client code.
// ============================================================

// Inert formatting tags only. No attribute is ever kept, so these can carry
// no behaviour. Bold is the headline feature; the rest are convenience.
const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "br",
  "p",
  "ul",
  "ol",
  "li",
]);

// Hard cap so the field can't grow unbounded.
const MAX_LEN = 6000;

/**
 * Sanitize admin-authored HTML for the Ingredients description.
 * Keeps only whitelisted formatting tags, strips ALL attributes, and removes
 * script/style blocks entirely. Everything else has its tags removed while its
 * text content is preserved. Returns "" for empty / whitespace-only input.
 */
export function sanitizeIngredientsRich(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let html = raw.slice(0, MAX_LEN);

  // 1. Remove <script>/<style> blocks including their inner content, plus any
  //    stray opening/closing script/style tags.
  html = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<\/?(?:script|style)\b[^>]*>/gi, "");

  // 2. Strip HTML comments (which can hide conditional/IE payloads).
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // 3. Walk every remaining tag. Keep only whitelisted tags and rewrite them
  //    with NO attributes; drop all other tags (their text content stays).
  html = html.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>/g, (_m, slash, tag) => {
    const name = String(tag).toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (slash) return `</${name}>`;
    if (name === "br") return "<br>";
    return `<${name}>`;
  });

  html = html.trim();
  // Collapse a value that has no visible text and no <br> to empty.
  if (isIngredientsRichEmpty(html)) return "";
  return html;
}

/** True when the rich value carries no visible content (no text, no <br>). */
export function isIngredientsRichEmpty(html: unknown): boolean {
  if (typeof html !== "string" || !html) return true;
  if (/<br\s*\/?>/i.test(html)) return false;
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0;
}
