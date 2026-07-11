// ============================================================
// Le Rasa Bakery — home-page policy cards
// ------------------------------------------------------------
// The strip between the reviews and the Instagram carousel: one column per
// enabled policy, separated by hairline rules rather than boxed into cards.
//
// Every card comes from the `policies` table (see supabase/sql/19_policies.sql)
// via getPolicies() — title, blurb, button label, icon, order and visibility are
// ALL admin-owned. There is deliberately no hardcoded fallback list: a policy
// the admin disables disappears from here, a policy they add appears, and the
// order is theirs. The only thing this file decides is which Lucide icon to draw
// when they haven't uploaded one.
//
// A server component: it renders inside the (already dynamic) home page, needs
// no state, and its hover behaviour is pure CSS — so none of this has to ship
// to the browser.
// ============================================================

import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  FileText,
  RotateCcw,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { defaultPolicyIcon, type PolicyIconKey, type PolicySummary } from "@/lib/policies";

/** The keys defaultPolicyIcon() returns -> the outline icons they draw. */
const ICONS: Record<PolicyIconKey, LucideIcon> = {
  shield: ShieldCheck,
  truck: Truck,
  refund: RotateCcw,
  terms: FileText,
};

/**
 * The hairline rules between columns.
 *
 * The grid is 1 / 2 / 4 columns (mobile / tablet / desktop), so which edges a
 * card needs a rule on depends on its index AND the breakpoint: a card that is
 * mid-row on desktop can be the first of its row on tablet, where a left rule
 * would hang off the edge of the section. Hence one rule per breakpoint rather
 * than Tailwind's `divide-x`, which follows DOM order and knows nothing about
 * where rows actually wrap.
 *
 * Stacked (mobile), every card but the first gets a rule ABOVE it; from tablet
 * up that becomes a rule to the LEFT of every card that isn't starting a row.
 * Written as full literal class names because Tailwind scans source text — a
 * constructed string like `lg:border-${x}` would never make it into the CSS.
 */
function ruleClasses(i: number): string {
  return [
    i > 0 ? "border-t" : "", // stacked: separate each card from the one above
    i % 2 === 0 ? "sm:border-l-0" : "sm:border-l", // 2 cols: rule on the right-hand card
    i < 2 ? "sm:border-t-0" : "sm:border-t", //         and above every row after the first
    i % 4 === 0 ? "lg:border-l-0" : "lg:border-l", // 4 cols: rule on every card but the row's first
    i < 4 ? "lg:border-t-0" : "lg:border-t",
  ].join(" ");
}

export function PolicyCards({ policies }: { policies: PolicySummary[] }) {
  // Nothing enabled (or the table is unreachable) — render nothing at all,
  // rather than an empty bordered band.
  if (policies.length === 0) return null;

  return (
    <section className="container mt-16 border-t border-[#F2DCD6] pt-4">
      {/* -mx-6 from sm up cancels each card's px-6 so the outer columns line up
          exactly with the container's content edges. It matches the container's
          own sm gutter (1.5rem), so it can never push the row into overflow. */}
      <div className="grid grid-cols-1 sm:-mx-6 sm:grid-cols-2 lg:grid-cols-4">
        {policies.map((p, i) => {
          const Icon = ICONS[defaultPolicyIcon(p.slug, p.title)];
          const icon = p.icon_url?.trim();

          return (
            <Link
              key={p.id}
              href={`/policies/${p.slug}`}
              className={`group flex flex-col border-[#F2DCD6] px-0 py-8 sm:px-6 lg:py-10 ${ruleClasses(i)}`}
            >
              {icon ? (
                <Image
                  src={icon}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 object-contain"
                />
              ) : (
                <Icon className="h-7 w-7 shrink-0 stroke-[1.5] text-wine" aria-hidden />
              )}

              <h3 className="mt-4 font-display text-lg font-semibold text-darkberry transition-colors group-hover:text-wine">
                {p.title}
              </h3>

              {p.short_description && (
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[#9C616D]">
                  {p.short_description}
                </p>
              )}

              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-wine">
                {p.read_more_text || "Read More"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
