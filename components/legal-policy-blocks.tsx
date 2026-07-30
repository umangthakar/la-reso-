// ============================================================
// Le Rasa — renders one legal section's content blocks.
//
// Used by /privacy-policy. Markdown goes through PolicyContent (the same
// renderer the admin-managed /policies/[slug] pages use, so the two stay
// typographically identical); tables are rendered here because Markdown pipe
// tables need remark-gfm, which this project doesn't have.
//
// The table classes deliberately mirror PolicyContent's own table mapping, so a
// structured table and a Markdown one would look identical.
// ============================================================

import { PolicyContent } from "@/components/policy-content";
import type { LegalBlock } from "@/lib/legal-policy";

export function LegalPolicyBlocks({ blocks }: { blocks: LegalBlock[] }) {
  // A section whose Markdown is all blank hasn't been transcribed yet. Say so
  // rather than rendering an empty heading with nothing under it.
  const hasContent = blocks.some(
    (b) => b.kind === "table" || b.content.trim() !== "",
  );

  if (!hasContent) {
    return (
      <p className="leading-relaxed text-darkberry-light">
        <em>This section is being finalised and will be published shortly.</em>
      </p>
    );
  }

  return (
    <>
      {blocks.map((block, i) =>
        block.kind === "markdown" ? (
          <PolicyContent key={i} content={block.content} />
        ) : (
          <div key={i} className="mb-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-darkberry-light">
              <thead>
                <tr>
                  {block.headers.map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="border-b border-darkberry/15 px-3 py-2 font-semibold text-darkberry"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className="border-b border-darkberry/10 px-3 py-2 align-top"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </>
  );
}
