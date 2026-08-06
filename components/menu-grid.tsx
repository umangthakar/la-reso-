"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product } from "@/lib/data";
import { createClient } from "@/utils/supabase/client";
import { AnimatedProductCard } from "@/components/animated-product-card";
import { RotatingBanners } from "@/components/rotating-banners";
import {
  PRODUCT_SIZES_EMBED,
  defaultSizeOf,
  displayPriceOf,
  type SizeLike,
} from "@/lib/product-pricing";
import { useSiteSettings } from "@/lib/use-site-settings";
import { slugify } from "@/lib/slug";
import {
  childrenOf,
  descendantsOf,
  rootOf,
  topLevelOf,
  type ParentMap,
} from "@/lib/category-hierarchy";
import { cn } from "@/lib/utils";

// Shown only when a product row has no image_url, so next/image never gets
// an empty src. Uses the already-whitelisted Unsplash host.
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80";

// The live products table differs from the generated DB types, so read with a
// loosely-typed client (public anon read is allowed by RLS).
type SupaProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
  badge: string | null;
  /** Embedded size variants (RLS allows public read). Absent on a database
   *  where 26_product_variants.sql hasn't been run — see the fallback query. */
  product_sizes?: SizeLike[] | null;
};

function toCard(p: SupaProduct): Product {
  return {
    id: p.id,
    name: p.name,
    category: p.category ?? "",
    // The DEFAULT VARIANT's price when this product has sizes, so the card
    // advertises exactly what /menu/[slug] opens on. Single-price products are
    // unchanged (displayPriceOf falls back to products.price).
    price: displayPriceOf(p.price, p.product_sizes),
    image: p.image_url || FALLBACK_IMAGE,
    tag: p.badge ?? undefined,
    description: p.description ?? "",
    defaultSize: defaultSizeOf(p.product_sizes),
  };
}

export function MenuGrid() {
  const params = useSearchParams();
  const [active, setActive] = useState("All");
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  // child → parent, from the admin-managed hierarchy. Empty on a database
  // without it, which renders exactly the flat tab row this menu had before.
  const [parents, setParents] = useState<ParentMap>({});
  const [loading, setLoading] = useState(true);
  const { settings } = useSiteSettings();

  // Category filter tabs are fetched fresh from the DB (no-store) so admin
  // add / rename / delete reflects on the menu immediately. Re-fetch on
  // focus so editing in one tab updates the storefront in another.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          categories?: string[];
          parents?: ParentMap;
        };
        if (!cancelled && Array.isArray(data.categories)) {
          setCategoryNames(data.categories);
          setParents(data.parents ?? {});
        }
      } catch {
        /* keep whatever we had */
      }
    }
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // ---- Hierarchy-aware tabs ------------------------------------------------
  // The top row shows "All" plus only TOP-LEVEL categories; subcategories are
  // revealed underneath once their parent's branch is selected. Which branch
  // is open is DERIVED from the existing `active` state — there is no second
  // piece of state, so only one parent can ever be expanded, and selecting a
  // child keeps its parent's row open.
  const filters = useMemo(
    () => ["All", ...topLevelOf(categoryNames, parents)],
    [categoryNames, parents],
  );
  const activeRoot = active === "All" ? null : rootOf(parents, active);
  const subFilters = useMemo(
    () => (activeRoot ? childrenOf(categoryNames, parents, activeRoot) : []),
    [activeRoot, categoryNames, parents],
  );

  // Deep-link support: /menu?category=<slug> selects the matching tab. Slugs
  // are derived from the live category names (same slugify as elsewhere).
  useEffect(() => {
    const slug = params.get("category");
    if (!slug) return;
    const match = categoryNames.find((name) => slugify(name) === slug);
    if (match) setActive(match);
  }, [params, categoryNames]);

  // If the active category disappears (renamed/deleted in admin), fall back
  // to "All" so the grid never gets stuck on an empty, non-existent filter.
  useEffect(() => {
    if (active !== "All" && categoryNames.length > 0 && !categoryNames.includes(active)) {
      setActive("All");
    }
  }, [categoryNames, active]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = createClient() as unknown as SupabaseClient;
      // Size variants ride along on the SAME request (one round trip, no
      // waterfall) so each card can price itself from its default variant.
      // If product_sizes isn't migrated the embed errors, and we retry the
      // plain query — the menu then shows base prices exactly as it used to.
      const base = "id,name,description,price,image_url,category,badge,in_stock";
      const read = (cols: string) =>
        db
          .from("products")
          .select(cols)
          .eq("in_stock", true)
          .order("created_at", { ascending: false });
      let res = await read(`${base},${PRODUCT_SIZES_EMBED}`);
      if (res.error) res = await read(base);
      if (cancelled) return;
      const { data, error } = res;
      setProducts(
        !error && Array.isArray(data)
          ? (data as unknown as SupaProduct[]).map(toCard)
          : [],
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Selecting a PARENT shows its own products plus everything filed under any
  // of its subcategories, so a customer never has to click each child. A
  // subcategory (or a category with no children) has no descendants, so this
  // is the exact `p.category === active` match it has always been.
  const filtered = useMemo(() => {
    if (active === "All") return products;
    const scope = new Set([active, ...descendantsOf(categoryNames, parents, active)]);
    return products.filter((p) => scope.has(p.category));
  }, [active, products, categoryNames, parents]);

  // Auto-rotating banners come from site_settings.rotating_banners (admin-
  // editable, fetched no-store). useSiteSettings already applies the default
  // banners when the DB has none.
  const banners = settings.rotating_banners;

  return (
    <div>
      {/* Auto-rotating banner — sits at the top of the product grid */}
      <RotatingBanners banners={banners} count={filtered.length} />

      {/* Thin divider before the cards begin */}
      <div className="mb-2 h-px w-full bg-[#D5A4A4]" />

      <div className="sticky top-[100px] z-30 -mx-3 mb-2 px-3 pt-6">
        <div className="glass flex flex-nowrap items-center justify-start gap-2 overflow-x-auto rounded-full p-2 shadow-clay-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:justify-center md:overflow-visible">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActive(f)}
              className={cn(
                "relative shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:text-sm",
                active === f
                  ? "text-blush-50"
                  : "text-darkberry/80 hover:text-wine-dark"
              )}
            >
              {active === f && (
                <motion.span
                  layoutId="menu-filter-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-wine shadow-clay-sm"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              {f}
            </button>
          ))}
        </div>

        {/* Subcategories of the open branch. Same pill markup, same tokens —
            it reads as a second line of the row that's already there, not a
            new control. Only the selected parent's children ever appear, and
            they collapse when another parent (or All) is chosen. */}
        <AnimatePresence initial={false}>
          {subFilters.length > 0 && (
            <motion.div
              key={activeRoot}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="glass mt-2 flex flex-nowrap items-center justify-start gap-2 overflow-x-auto rounded-full p-1.5 shadow-clay-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:justify-center md:overflow-visible">
                {subFilters.map((f) => (
                  <button
                    key={f}
                    onClick={() => setActive(f)}
                    className={cn(
                      "relative shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4",
                      active === f
                        ? "text-blush-50"
                        : "text-darkberry/80 hover:text-wine-dark"
                    )}
                  >
                    {/* Shares the parent row's layoutId, so the highlight
                        glides between the two rows instead of popping. */}
                    {active === f && (
                      <motion.span
                        layoutId="menu-filter-pill"
                        className="absolute inset-0 -z-10 rounded-full bg-wine shadow-clay-sm"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    {f}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <MenuSkeleton />
      ) : (
        <>
          {/* Re-key on the active filter so newly shown cards replay the reveal */}
          <div
            key={active}
            className="mx-auto grid w-full max-w-[1200px] grid-cols-1 justify-items-center gap-6 pb-[100px] lg:grid-cols-2"
          >
            {filtered.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: (i % 2) * 0.08 }}
                className="w-full max-w-[560px]"
              >
                <AnimatedProductCard product={product} />
              </motion.div>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="py-16 text-center text-darkberry-light">
              No products in this category yet
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Loading placeholder that mirrors the AnimatedProductCard grid + card shape.
function MenuSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 justify-items-center gap-6 pb-[100px] lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex w-full max-w-[560px] animate-pulse flex-col overflow-hidden rounded-[28px] bg-[#F9EEEA] md:h-[320px] md:flex-row"
        >
          <div className="order-2 flex flex-1 flex-col justify-center gap-3 p-5 md:order-1">
            <div className="h-3 w-1/3 rounded bg-white/60" />
            <div className="h-5 w-3/4 rounded bg-white/60" />
            <div className="h-4 w-1/4 rounded bg-white/60" />
          </div>
          <div className="order-1 aspect-[4/3] w-full shrink-0 bg-white/60 md:order-2 md:aspect-auto md:h-full md:w-[44%]" />
        </div>
      ))}
    </div>
  );
}
