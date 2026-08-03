// ============================================================
// Size label formatting
// ------------------------------------------------------------
// Size labels are free text typed by an admin in the Products page, so the
// same size has been entered several ways over time. A live audit of
// product_sizes found, alongside the intended 6" / 8" / 10" / 12":
//
//   "12"            — the inch mark was simply missed
//   "6 Piece"       — singular
//   "6 pieces"      — lower case
//   "Box of 6 Pieces." — trailing full stop
//
// This normalises them for DISPLAY only. The stored value is never rewritten:
// the admin still edits exactly what they typed, and `sizeId` (not the label)
// is what identifies a variant in the cart, at checkout and on an order — so
// formatting here cannot affect pricing or order history.
//
// Anything it doesn't recognise is returned trimmed and otherwise untouched,
// which keeps deliberately unusual labels (e.g. `6"/10"`) exactly as written.
// ============================================================

/** Straight-quote every kind of inch mark an admin might paste. */
function straightenQuotes(value: string): string {
  return value.replace(/[″”“’‘´`]/g, '"');
}

/**
 * One consistent rendering of a size label.
 *
 * - `12`, `12in`, `12 inch`, `12 inches`, `12”` → `12"`
 * - `6/10` and `6"/10"` → `6"/10"`
 * - `6 Piece`, `6 pieces`, `6 Pieces.` → `6 Pieces`
 * - `Box of 6 Pieces.` → `Box of 6 Pieces`
 * - anything else → trimmed as-is
 */
export function formatSizeLabel(label: string | null | undefined): string {
  if (!label) return "";

  // Collapse internal runs of whitespace and drop a trailing full stop.
  const cleaned = straightenQuotes(label).trim().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!cleaned) return "";

  // Piece / box wording — normalise the noun's case and number, keep the rest.
  const piece = cleaned.match(/^(.*?)(\d+)\s*(piece|pieces)$/i);
  if (piece) {
    const [, prefix, count] = piece;
    const noun = Number(count) === 1 ? "Piece" : "Pieces";
    // Any wording before the count ("Box of ") is kept exactly as the admin
    // typed it — only the noun's case and number are normalised.
    const lead = prefix.trim();
    return lead ? `${lead} ${count} ${noun}` : `${count} ${noun}`;
  }

  // Dimension wording: one or more numbers, optionally already carrying an
  // inch mark or the word "inch", possibly joined by "/" or "x".
  const dimension = /^\d+(\.\d+)?\s*(?:"|in|inch|inches)?(\s*[\/x×]\s*\d+(\.\d+)?\s*(?:"|in|inch|inches)?)*$/i;
  if (dimension.test(cleaned)) {
    return cleaned
      .split(/\s*([\/x×])\s*/)
      .map((part) => {
        if (/^[\/x×]$/.test(part)) return "/";
        const n = part.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?$/i);
        return n ? `${n[1]}"` : part;
      })
      .join("");
  }

  return cleaned;
}
