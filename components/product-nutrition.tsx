"use client";

// ============================================================
// Le Rasa Bakery — product Nutrition Information card.
// ------------------------------------------------------------
// The single source of truth for this card's markup. The product detail page
// mounts it twice with complementary visibility classes — under the gallery
// from `md` up, under the Ingredients accordion below `md` — so the card can
// sit in a different column per breakpoint without the markup existing twice.
// Only one mount is ever displayed; the hidden one is `display:none`, so it
// occupies no space and is excluded from the accessibility tree.
//
// Presentation only: rows come from the page, which reads them from Supabase.
// ============================================================

import { NUTRITION_ROWS, type NutritionData, type NutritionCustomRow } from "@/lib/nutrition";

type Props = {
  /** Default nutrition rows, blanks already filled by the caller. */
  rows: NutritionData;
  /** Admin-defined extra rows, in the order they were added. */
  custom: NutritionCustomRow[];
  /** Positioning + visibility classes from the parent — no restyling. */
  className?: string;
};

export default function ProductNutrition({ rows, custom, className = "" }: Props) {
  return (
    <div className={`rounded-2xl bg-[#F9EEEA] p-4 ${className}`}>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-wine-dark">
        Nutrition Information
      </p>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-berry">
            <th className="w-1/2 pb-2 text-left font-semibold"></th>
            <th className="pb-2 text-right font-semibold">Per 100g</th>
            <th className="pb-2 text-right font-semibold">Per Portion</th>
          </tr>
        </thead>
        <tbody>
          {NUTRITION_ROWS.map((row) => {
            const cell = rows[row.key];
            return (
              <tr key={row.key} className="border-t border-dustyrose/40">
                <td
                  className={`py-2 ${
                    row.indent
                      ? "pl-4 font-normal text-darkberry-light"
                      : "font-semibold text-darkberry"
                  }`}
                >
                  {row.label}
                </td>
                <td className="py-2 text-right tabular-nums text-darkberry">
                  {cell?.per_100g || "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-darkberry">
                  {cell?.per_portion || "—"}
                </td>
              </tr>
            );
          })}
          {/* Custom rows, in the order the admin added them. */}
          {custom.map((row) => (
            <tr key={row.id} className="border-t border-dustyrose/40">
              <td className="py-2 font-semibold text-darkberry">{row.label}</td>
              <td className="py-2 text-right tabular-nums text-darkberry">
                {row.per_100g || "—"}
              </td>
              <td className="py-2 text-right tabular-nums text-darkberry">
                {row.per_portion || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
