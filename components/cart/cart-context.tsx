"use client";

// ============================================================
// Le Rasa Bakery — global cart context
// localStorage-persisted basket shared across the whole storefront.
// Also owns the cart drawer's open/close state so the navbar button
// and any "Buy Now" flow can control it.
// ============================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { round2 } from "@/lib/pricing";
import { useActiveOffer } from "@/lib/use-active-offer";
import type { Customization } from "@/lib/customization";
import {
  checkCartConditions,
  computeOfferDiscount,
  type Offer,
  type OfferCartItem,
} from "@/lib/offers";

export type CartItem = {
  /**
   * The cart LINE id. For a plain product this is the product id; for a
   * customized cake it is `<productId>::<signature>` (see lib/customization),
   * so two differently-customized cakes are two lines rather than one line of
   * quantity 2. Legacy baskets stored before customization existed hold a bare
   * product id here and no `productId` — `productIdOf` handles both.
   */
  id: string;
  name: string;
  /** Base product price. Accessory extras live in `addons`, never in here. */
  price: number;
  image: string;
  category: string;
  slug: string;
  quantity: number;
  /** The underlying product. Absent on legacy items, where `id` IS the product. */
  productId?: string;
  /** Per-unit accessory extra from the customization wizard. */
  addons?: number;
  /** What the customer chose in the wizard. */
  customization?: Customization;
  /** Selected size variant, when the product offers sizes. `price` above is
   *  already the chosen size's absolute price; these carry the identity so the
   *  server can re-price it and the basket / checkout / order can show it. */
  sizeId?: string;
  sizeLabel?: string;
};

/** The product a line refers to, tolerating baskets saved before customization. */
export function productIdOf(item: CartItem): string {
  return item.productId ?? item.id;
}

/** What one unit of a line actually costs: base price plus its accessories. */
export function unitPriceOf(item: CartItem): number {
  return round2(item.price + (item.addons ?? 0));
}

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  discount: number;
  freeDelivery: boolean;
  deliveryFee: number;
  total: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (id: string) => void;
  setQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
};

const STORAGE_KEY = "lerasa_cart";

const CartContext = createContext<CartContextValue | null>(null);

function readStored(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    // Basic shape guard so a malformed value can't crash the app.
    return parsed.filter(
      (i): i is CartItem =>
        !!i &&
        typeof i.id === "string" &&
        typeof i.price === "number" &&
        typeof i.quantity === "number",
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Live active offers, so the drawer's subtotal/total match what checkout
  // will actually charge. Display-only — the server always recomputes.
  const { offers: activeOffers } = useActiveOffer();

  // Load once on mount (avoids SSR/client hydration mismatch).
  useEffect(() => {
    setItems(readStored());
    setHydrated(true);
  }, []);

  // Persist on every change, but only after the initial load.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [items, hydrated]);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity">, quantity = 1) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.id === item.id);
        if (existing) {
          return prev.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + quantity } : i,
          );
        }
        return [...prev, { ...item, quantity }];
      });
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.id !== id)
        : prev.map((i) => (i.id === id ? { ...i, quantity } : i)),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const { count, subtotal, discount, freeDelivery, deliveryFee, total } = useMemo(() => {
    const count = items.reduce((n, i) => n + i.quantity, 0);

    // Product prices and accessory extras are kept APART, because the offer
    // engine discounts cakes — not candles. `productSubtotal` is what the
    // offers see (identical to the old `subtotal`, since a basket with no
    // customization has no accessories), and the wizard's extras are added on
    // afterwards. /api/checkout/create-intent splits them the same way, so
    // what the drawer shows is what Stripe charges.
    const productSubtotal = round2(
      items.reduce((s, i) => s + i.price * i.quantity, 0),
    );
    const accessoriesTotal = round2(
      items.reduce((s, i) => s + (i.addons ?? 0) * i.quantity, 0),
    );
    const subtotal = round2(productSubtotal + accessoriesTotal);

    // Apply the live offer(s) exactly as the checkout will: same lib/offers.ts
    // math, over the real cart items. We can only verify the "everyone"
    // audience client-side (first-order / new-customer / specific-email checks
    // need the server), so audience-restricted offers are conservatively left
    // for the server to apply — the drawer never over-promises a discount.
    const offerItems: OfferCartItem[] = items.map((i) => ({
      id: productIdOf(i),
      category: i.category,
      price: i.price,
      quantity: i.quantity,
    }));
    let discount = 0;
    let freeDelivery = false;
    const applicable = [activeOffers.primary, ...activeOffers.stackable].filter(
      (o): o is Offer => !!o && o.audience === "everyone",
    );
    for (const offer of applicable) {
      if (!checkCartConditions(offer, productSubtotal, count).ok) continue;
      const d = computeOfferDiscount(offer, offerItems, productSubtotal);
      discount += d.discountAmount;
      if (d.freeDelivery) freeDelivery = true;
    }
    discount = round2(Math.min(Math.max(discount, 0), subtotal));

    // Delivery is derived from the POSTCODE, which isn't known in the basket —
    // it's only entered at checkout (see resolveDeliveryFee). So the drawer
    // never shows or adds a delivery charge before then: deliveryFee stays 0
    // here and the total is just subtotal minus any discount. The real,
    // postcode-based fee is applied on the checkout page.
    const deliveryFee = 0;
    const total = round2(subtotal - discount);
    return { count, subtotal, discount, freeDelivery, deliveryFee, total };
  }, [items, activeOffers]);

  const value: CartContextValue = {
    items,
    count,
    subtotal,
    discount,
    freeDelivery,
    deliveryFee,
    total,
    isOpen,
    openCart,
    closeCart,
    addItem,
    removeItem,
    setQuantity,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
