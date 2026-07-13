"use client";

// ============================================================
// Le Rasa Bakery — cart drawer
// Slides in from the right. Rendered once, globally, by Providers so
// any page/button can open it via the cart context.
// ============================================================

import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Minus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/cart/cart-context";
import { usePurchaseGate } from "@/lib/use-purchase-gate";
import { money, FREE_DELIVERY_THRESHOLD } from "@/lib/pricing";

export function CartDrawer() {
  const router = useRouter();
  const { requireAuth } = usePurchaseGate();
  const {
    items,
    count,
    subtotal,
    deliveryFee,
    total,
    isOpen,
    closeCart,
    setQuantity,
    removeItem,
  } = useCart();

  // Guest checkout is disabled: send signed-out customers to Google login and
  // bring them straight back to checkout (the basket is persisted already).
  const goToCheckout = async () => {
    const allowed = await requireAuth({ action: "checkout", href: "/checkout" });
    closeCart();
    if (!allowed) return;
    router.push("/checkout");
  };

  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={closeCart}
            className="fixed inset-0 z-[70] bg-darkberry/40 backdrop-blur-sm"
            aria-hidden
          />

          {/* Panel */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed right-0 top-0 z-[80] flex h-[100dvh] w-full max-w-md flex-col bg-[#F9EEEA] shadow-2xl"
            role="dialog"
            aria-label="Shopping cart"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-dustyrose/40 px-5 py-4">
              <h2 className="flex items-center gap-2 font-display text-xl font-bold text-darkberry">
                <ShoppingBag className="h-5 w-5 text-wine" />
                Your Basket
                {count > 0 && (
                  <span className="rounded-full bg-wine px-2 py-0.5 text-xs font-bold text-blush-50">
                    {count}
                  </span>
                )}
              </h2>
              <button
                onClick={closeCart}
                aria-label="Close cart"
                className="grid h-9 w-9 place-items-center rounded-full bg-blush-50 text-darkberry shadow-clay-sm transition-shadow hover:shadow-clay"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-dustyrose-light/60">
                  <ShoppingBag className="h-7 w-7 text-wine-dark" />
                </div>
                <p className="font-display text-lg font-semibold text-darkberry">
                  Your basket is empty
                </p>
                <p className="text-sm text-berry">
                  Add something sweet from our menu.
                </p>
                <button
                  onClick={() => {
                    closeCart();
                    router.push("/menu");
                  }}
                  className="mt-2 rounded-full bg-wine px-6 py-2.5 text-sm font-semibold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
                >
                  Browse the menu
                </button>
              </div>
            ) : (
              <>
                {/* Free-delivery nudge */}
                {deliveryFee > 0 && remaining > 0 && (
                  <p className="bg-dustyrose-light/50 px-5 py-2 text-center text-xs font-semibold text-wine-dark">
                    Add {money(remaining)} more for free delivery 🚚
                  </p>
                )}

                {/* Items */}
                <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex gap-3 rounded-2xl bg-blush-50 p-3 shadow-clay-sm"
                    >
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-darkberry">
                              {item.name}
                            </p>
                            <p className="text-xs text-berry">{item.category}</p>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            aria-label={`Remove ${item.name}`}
                            className="shrink-0 text-berry transition-colors hover:text-wine"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-auto flex items-center justify-between pt-2">
                          {/* Quantity stepper */}
                          <div className="flex items-center gap-2 rounded-full bg-[#F9EEEA] p-1">
                            <button
                              onClick={() =>
                                setQuantity(item.id, item.quantity - 1)
                              }
                              aria-label="Decrease quantity"
                              className="grid h-7 w-7 place-items-center rounded-full bg-blush-50 text-wine-dark shadow-clay-sm transition-transform active:scale-90"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="w-5 text-center text-sm font-bold text-darkberry">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                setQuantity(item.id, item.quantity + 1)
                              }
                              aria-label="Increase quantity"
                              className="grid h-7 w-7 place-items-center rounded-full bg-blush-50 text-wine-dark shadow-clay-sm transition-transform active:scale-90"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="font-display text-sm font-bold text-wine-dark">
                            {money(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Summary */}
                <div className="border-t border-dustyrose/40 bg-[#F9EEEA] px-5 py-4">
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-berry">
                      <dt>Subtotal</dt>
                      <dd className="font-semibold text-darkberry">
                        {money(subtotal)}
                      </dd>
                    </div>
                    <div className="flex justify-between text-berry">
                      <dt>Delivery</dt>
                      <dd className="font-semibold text-darkberry">
                        {deliveryFee === 0 ? "Free" : money(deliveryFee)}
                      </dd>
                    </div>
                    <div className="flex justify-between border-t border-dustyrose/40 pt-2 text-base">
                      <dt className="font-bold text-darkberry">Total</dt>
                      <dd className="font-display text-lg font-bold text-wine-dark">
                        {money(total)}
                      </dd>
                    </div>
                  </dl>

                  <button
                    onClick={goToCheckout}
                    className="mt-4 w-full rounded-full bg-wine py-3.5 text-center text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5"
                  >
                    Checkout · {money(total)}
                  </button>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
