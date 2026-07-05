"use client";

// ============================================================
// Le Rasa Bakery — navbar cart button with live item-count badge.
// ============================================================

import { ShoppingCart } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/components/cart/cart-context";

export function CartButton() {
  const { count, openCart } = useCart();

  return (
    <button
      onClick={openCart}
      aria-label={`Open cart${count ? ` (${count} items)` : ""}`}
      className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blush-50 text-darkberry shadow-clay-sm transition-shadow hover:shadow-clay"
    >
      <ShoppingCart className="h-5 w-5" />
      <AnimatePresence>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-wine px-1 text-[10px] font-bold text-blush-50 shadow-sm"
          >
            {count > 99 ? "99+" : count}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
