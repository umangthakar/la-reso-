// ============================================================
// Le Rasa — Cookie Policy content (/cookie-policy)
//
// Same architecture as lib/privacy-policy.ts — see lib/legal-policy.ts for the
// shared block/section shape. The text lives in code, not in the admin-managed
// `policies` table, because this is a legal document for LE RASA LIMITED that
// should be version-controlled and reviewed like code.
//
// ─── STATUS: AWAITING THE TERMLY EXPORT ─────────────────────────────────────
// Every section below is an EMPTY PLACEHOLDER. The page renders a visible
// "being updated" notice while that is true, so an unfinished legal page cannot
// quietly ship looking complete.
//
// The headings below are Termly's standard Cookie Policy section set and are
// PROVISIONAL: replace them with the exact headings from the Le Rasa export,
// delete any that document does not contain, and add any it does. The page
// derives its anchors, table of contents and ordering from this array, so
// nothing else needs changing.
//
// ─── HOW TO FILL THIS IN ────────────────────────────────────────────────────
// Paste the export text as Markdown into each section's `md(...)` block, the
// same flavour the Privacy Policy uses:
//
//   **bold**   _italic_   [text](https://example.com)   ### Sub-heading
//   - bullet list         1. numbered list
//
// Two rules carried over from the Privacy Policy transcription:
//   * Bare URLs must be written as explicit Markdown links — CommonMark (no
//     remark-gfm here) does not auto-link them, and Termly renders them linked.
//   * Cross-references to other sections use this file's `id`s, e.g.
//     '[How can I control cookies?](#control-cookies)'. Links to the Privacy
//     Policy use /privacy-policy so they stay in-tab.
//
// Cookie Policies from Termly carry per-category cookie TABLES (Name, Purpose,
// Provider, Service, Country, Type, Expires). Markdown tables do NOT work here.
// Add each one as a `{ kind: "table", headers: [...], rows: [[...]] }` block in
// document order, exactly as section 13 of the Privacy Policy does.
//
// Keep `id`s stable once published — they are public #anchors.
// ============================================================

import { type LegalSection } from "@/lib/legal-policy";

// Annotated `: string` on purpose. Left bare, TypeScript would infer the
// literal type "" and treat every `if (INTRO)` as statically dead, which
// changes behaviour the moment real text is pasted in.

/**
 * The company as named in the document. Termly writes it in caps
 * ('LE RASA LIMITED'); this title-case form is used only for this page's own
 * chrome (hero, meta description), never inside the legal text.
 */
export const COOKIE_POLICY_ENTITY: string = "Le Rasa Limited";

/**
 * The "Last updated" line from the top of the Termly document, e.g.
 * "July 29, 2026". Empty string hides the line rather than showing a wrong date.
 */
export const COOKIE_POLICY_LAST_UPDATED: string = "";

/**
 * The introductory paragraphs that precede the first section in the Termly
 * document (Markdown). Empty string hides the intro entirely.
 */
export const COOKIE_POLICY_INTRO: string = "";

/**
 * The notice, in Termly's order. Headings are provisional — see the file header.
 */
export const COOKIE_POLICY_SECTIONS: LegalSection[] = [
  { id: "what-are-cookies", heading: "What are cookies?", blocks: [] },
  { id: "why-we-use-cookies", heading: "Why do we use cookies?", blocks: [] },
  { id: "control-cookies", heading: "How can I control cookies?", blocks: [] },
  {
    id: "browser-controls",
    heading: "How can I control cookies on my browser?",
    blocks: [],
  },
  {
    id: "other-tracking",
    heading: "What about other tracking technologies, like web beacons?",
    blocks: [],
  },
  {
    id: "flash-cookies",
    heading: "Do you use Flash cookies or Local Shared Objects?",
    blocks: [],
  },
  { id: "targeted-advertising", heading: "Do you serve targeted advertising?", blocks: [] },
  {
    id: "updates",
    heading: "How often will you update this Cookie Policy?",
    blocks: [],
  },
  {
    id: "further-information",
    heading: "Where can I get further information?",
    blocks: [],
  },
];
