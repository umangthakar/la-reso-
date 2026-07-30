// ============================================================
// Le Rasa — shared shape for the hand-written legal pages.
//
// Used by /privacy-policy (lib/privacy-policy.ts) and /cookie-policy
// (lib/cookie-policy.ts). Both are verbatim Termly exports kept in code rather
// than in the admin-managed `policies` table, because they are legal documents
// that should be version-controlled and reviewed like code.
//
// A section's content is an ORDERED list of blocks rather than one Markdown
// string, for one concrete reason: Termly's exports embed tables mid-section,
// and this project has no remark-gfm, so Markdown pipe tables do not parse.
// Tables therefore travel as structured data and are rendered by
// components/legal-policy-blocks.tsx.
// ============================================================

/** One piece of a section's content, in document order. */
export type LegalBlock =
  | { kind: "markdown"; content: string }
  | { kind: "table"; headers: string[]; rows: string[][] };

/** A top-level section of a legal notice, rendered with an <h2> and an #anchor. */
export type LegalSection = {
  /** URL anchor / table-of-contents target. Stable — do not rename casually:
   *  these are the public #anchors people bookmark, and the targets of the
   *  documents' own cross-reference links. */
  id: string;
  /** Section heading, verbatim from Termly (including its numbering, if any). */
  heading: string;
  /** Section content, in document order. */
  blocks: LegalBlock[];
};

/** Terse helper so the section arrays in the content modules stay readable. */
export const md = (content: string): LegalBlock => ({ kind: "markdown", content });

/**
 * Sections still awaiting their text from a Termly export — i.e. every block is
 * empty Markdown (a section with no blocks at all counts too). Lets a page warn
 * visibly instead of quietly rendering a legal document full of gaps.
 */
export function unfilledSections(sections: LegalSection[]): LegalSection[] {
  return sections.filter((s) =>
    s.blocks.every((b) => b.kind === "markdown" && b.content.trim() === ""),
  );
}
