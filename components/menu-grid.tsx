"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categories } from "@/lib/data";
import type { Product } from "@/lib/data";
import { createClient } from "@/utils/supabase/client";
import { AnimatedProductCard } from "@/components/animated-product-card";
import { cn } from "@/lib/utils";

const slugToName: Record<string, string> = Object.fromEntries(
  categories.map((c) => [c.slug, c.name])
);

const filters = ["All", ...categories.map((c) => c.name)];

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
};

function toCard(p: SupaProduct): Product {
  return {
    id: p.id,
    name: p.name,
    category: p.category ?? "",
    price: Number(p.price) || 0,
    image: p.image_url || FALLBACK_IMAGE,
    tag: p.badge ?? undefined,
    description: p.description ?? "",
  };
}

export function MenuGrid() {
  const params = useSearchParams();
  const [active, setActive] = useState("All");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const slug = params.get("category");
    if (slug && slugToName[slug]) setActive(slugToName[slug]);
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = createClient() as unknown as SupabaseClient;
      const { data } = await db
        .from("products")
        .select("id,name,description,price,image_url,category,badge,in_stock")
        .eq("in_stock", true)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setProducts((data ?? []).map(toCard));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered =
    active === "All"
      ? products
      : products.filter((p) => p.category === active);

  return (
    <div>
      {/* Premium hero banner — sits at the top of the product grid */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative w-full overflow-hidden bg-[#F9EEEA] px-8 py-16"
      >
        {/* Decorative product-count watermark */}
        <span className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 select-none font-display text-[200px] font-bold leading-none text-[#D5A4A4]/20 md:block">
          {filtered.length}
        </span>

        <div className="relative max-w-2xl">
          <h2 className="font-display text-5xl font-bold leading-tight text-[#612437] md:text-7xl">
            Every Bite, Eggless &amp; Divine
          </h2>
          <p className="mt-4 text-[#9C616D]">
            Handcrafted fresh daily — pick your craving
          </p>
        </div>
      </motion.section>

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
