"use client";

// ============================================================
// Le Rasa Bakery — product trust badges ("Suitable for Vegetarian" +
// "100% Eggless").
// ------------------------------------------------------------
// A small, reusable row of pills shown under the product title on the detail
// page. Presentation only — it holds no product state and reads nothing from
// the catalogue, so it can be dropped anywhere the pair is wanted.
//
// Both pills share BADGE_BASE so their height, radius, padding, type and
// weight can never drift apart; only the colour trio differs. Each pill sets
// one text colour, which the Lucide glyph inherits via currentColor — so icon
// and label can never fall out of sync.
//
// The two shadows below are deliberately the SAME geometry as the shared
// clay-sm token (4px 4px 12px + a -3px -3px 10px white lift) at the same
// intensity; only the tint differs, soft rose for the green pill and warm
// gold for the eggless one, so the pair still reads as one material.
// ============================================================

import { motion } from "framer-motion";
import { Leaf, EggOff } from "lucide-react";

// Geometry + typography shared by every badge in the row. Colours are the
// only thing a badge is allowed to vary.
const BADGE_BASE =
  "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-xs font-semibold uppercase tracking-wide transition-colors duration-200";

// Soft pastel green. Hover darkens the background only — border, text and
// border width are untouched.
const BADGE_VEGETARIAN =
  "border-[#BEE8CB] bg-[#EEF9F2] text-[#2E7D4F] hover:bg-[#E3F4EA] shadow-[4px_4px_12px_rgba(116,50,73,0.15),-3px_-3px_10px_rgba(255,255,255,0.65)]";

// Warm golden cream. Hover darkens the background while staying in the same
// warm tone — no orange, no brown, no gradient.
const BADGE_EGGLESS =
  "border-[#F3D27A] bg-[#FFF8E8] text-[#A86B00] hover:bg-[#FBF0D8] shadow-[4px_4px_12px_rgba(243,210,122,0.18),-3px_-3px_10px_rgba(255,255,255,0.65)]";

type Props = {
  /** Extra positioning classes from the parent (margins only — no restyling). */
  className?: string;
};

export default function ProductTrustBadges({ className = "" }: Props) {
  return (
    // One wrapper so both pills fade in together on load, once. Wraps to a
    // second line only when the column is too narrow to hold both.
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={`flex flex-wrap items-center gap-2.5 ${className}`}
    >
      <span className={`${BADGE_BASE} ${BADGE_VEGETARIAN}`}>
        <Leaf className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        Suitable for Vegetarian
      </span>

      <span className={`${BADGE_BASE} ${BADGE_EGGLESS}`}>
        <EggOff className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        100% Eggless
      </span>
    </motion.div>
  );
}
