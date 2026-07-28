"use client";

// ============================================================
// Le Rasa Bakery — "Suitable for Vegetarian" badge.
// ------------------------------------------------------------
// A small, reusable pill shown under the product title on the detail page.
// Presentation only — it holds no product state and reads nothing from the
// catalogue, so it can be dropped anywhere a vegetarian mark is wanted.
//
// Colours reuse the muted green already used elsewhere in the storefront
// (order status chips, checkout savings, order confirmation) rather than
// introducing a new palette; the shadow is the shared clay-sm token so the
// pill sits in the same material language as the rest of the page.
// ============================================================

import { motion } from "framer-motion";
import { Leaf } from "lucide-react";

type Props = {
  /** Extra positioning classes from the parent (margins only — no restyling). */
  className?: string;
};

export default function VegetarianBadge({ className = "" }: Props) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`inline-flex h-9 w-fit items-center gap-2 whitespace-nowrap rounded-full border border-green-700/15 bg-green-50 px-4 text-xs font-semibold uppercase tracking-wide text-green-800 shadow-clay-sm ${className}`}
    >
      <Leaf className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      Suitable for Vegetarian
    </motion.span>
  );
}
