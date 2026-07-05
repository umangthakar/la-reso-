"use client";

// ============================================================
// Le Rasa Bakery — client providers wrapper.
// Wraps the storefront in the cart context and mounts the cart drawer
// once, globally, so the navbar button and any page can open it.
// ============================================================

import { CartProvider } from "@/components/cart/cart-context";
import { CartDrawer } from "@/components/cart/cart-drawer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
      <CartDrawer />
    </CartProvider>
  );
}
