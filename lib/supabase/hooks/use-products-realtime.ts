"use client";

// ============================================================
// STOREFRONT product grid — realtime stock/hidden updates
// ------------------------------------------------------------
// Subscribes to the `products` table and keeps a local list in sync as
// the admin toggles in_stock / hidden or edits products.
//
// RLS: the public SELECT policy on `products` is `using (hidden = false)`,
// which the anon role satisfies — so realtime postgres_changes works here
// over the anon key with no extra auth. (When a product is flipped to
// hidden = true, an UPDATE event still arrives; we drop it from the list.)
//
// Designed as a drop-in: pass the products you already fetched/rendered as
// `initialProducts`; the hook returns a live array you can swap in.
// ============================================================

import { useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Product } from "@/lib/supabase/database.types";

type Options = {
  /** Keep products that are hidden=true in the returned list. Default false. */
  includeHidden?: boolean;
  /** Optional raw event callback if you'd rather manage state yourself. */
  onChange?: (payload: RealtimePostgresChangesPayload<Product>) => void;
};

export function useProductsRealtime(
  initialProducts: Product[],
  options: Options = {},
): Product[] {
  const { includeHidden = false, onChange } = options;
  const [products, setProducts] = useState<Product[]>(initialProducts);

  // Keep the latest callback without resubscribing.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const channel = supabaseBrowser
      .channel("storefront:products")
      .on<Product>(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        (payload) => {
          onChangeRef.current?.(payload);

          setProducts((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as Partial<Product>)?.id;
              return oldId ? prev.filter((p) => p.id !== oldId) : prev;
            }

            const row = payload.new as Product;
            if (!includeHidden && row.hidden) {
              // Newly hidden -> remove from the public grid.
              return prev.filter((p) => p.id !== row.id);
            }

            const idx = prev.findIndex((p) => p.id === row.id);
            if (idx === -1) {
              return [...prev, row].sort(
                (a, b) => a.display_order - b.display_order,
              );
            }
            const next = [...prev];
            next[idx] = row;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [includeHidden]);

  return products;
}
