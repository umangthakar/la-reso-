"use client";

// ============================================================
// Le Rasa Bakery — header product search
// Filters the live catalogue as you type, by product name, category and
// description keywords, and links each hit to its existing product page
// (/menu/<slug>). Two presentations, same logic:
//
//   variant="desktop" — an inline input that sits between the nav links and
//                       the cart/profile group (lg and up).
//   variant="mobile"  — a search icon that expands into a full-width input
//                       panel below the header (below lg).
//
// The inline input appears at lg rather than md on purpose: at md the logo,
// four nav links and the cart/profile group already fill the container, so an
// inline input there would squash the header. Tablets get the icon instead.
//
// Reads the same products query the menu grid uses (public anon read, in-stock
// only), so search and menu can never disagree. The catalogue is fetched once
// per page load and cached at module scope, so opening search on a later page
// costs nothing.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { slugify } from "@/lib/slug";
import { money } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Matches the menu grid's fallback so a product with no image never renders a
// broken thumbnail.
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80";

/** How many hits the dropdown shows. Purely a UI cap on the list length. */
const MAX_RESULTS = 6;

type SearchProduct = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  image: string;
};

type SupaProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
};

// Module-scope cache: the catalogue is small and rarely changes within a
// session, and this keeps re-opening search instant across navigations.
let cache: SearchProduct[] | null = null;
let inflight: Promise<SearchProduct[]> | null = null;

async function loadProducts(): Promise<SearchProduct[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const db = createClient() as unknown as SupabaseClient;
    const { data } = await db
      .from("products")
      .select("id,name,description,price,image_url,category,in_stock")
      .eq("in_stock", true)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as SupaProduct[];
    cache = rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category ?? "",
      description: p.description ?? "",
      price: Number(p.price) || 0,
      image: p.image_url || FALLBACK_IMAGE,
    }));
    inflight = null;
    return cache;
  })();
  return inflight;
}

/**
 * Score a product against the query. Every whitespace-separated term must
 * appear somewhere (name, category or description) for the product to match —
 * so "chocolate brownie" narrows rather than widens. A higher score sorts
 * first: a name hit beats a category hit, which beats a description keyword.
 */
function score(p: SearchProduct, terms: string[]): number {
  const name = p.name.toLowerCase();
  const category = p.category.toLowerCase();
  const description = p.description.toLowerCase();

  let total = 0;
  for (const t of terms) {
    if (name.startsWith(t)) total += 100;
    else if (name.includes(t)) total += 60;
    else if (category.includes(t)) total += 30;
    else if (description.includes(t)) total += 10;
    else return -1; // this term matches nothing → not a hit at all
  }
  return total;
}

function useProductSearch(enabled: boolean) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<SearchProduct[]>(cache ?? []);

  // Only pay for the catalogue once the control is actually usable.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadProducts()
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch(() => {
        /* leave whatever we have; search just won't match */
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const results = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return products
      .map((p) => ({ p, s: score(p, terms) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, MAX_RESULTS)
      .map((x) => x.p);
  }, [query, products]);

  return { query, setQuery, results };
}

/** One row in the results dropdown. */
function ResultRow({
  product,
  onPick,
}: {
  product: SearchProduct;
  onPick: (p: SearchProduct) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(product)}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-dustyrose-light/60"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.image}
        alt=""
        loading="lazy"
        className="h-10 w-10 shrink-0 rounded-xl object-cover"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-darkberry">
          {product.name}
        </span>
        {product.category && (
          <span className="block truncate text-xs text-darkberry/60">
            {product.category}
          </span>
        )}
      </span>
      <span className="shrink-0 text-sm font-bold text-wine-dark">
        {money(product.price)}
      </span>
    </button>
  );
}

function ResultsPanel({
  query,
  results,
  onPick,
  className,
}: {
  query: string;
  results: SearchProduct[];
  onPick: (p: SearchProduct) => void;
  className?: string;
}) {
  if (!query.trim()) return null;
  return (
    <div
      className={cn(
        "glass max-h-[60vh] overflow-y-auto rounded-3xl p-2 shadow-clay",
        className,
      )}
    >
      {results.length === 0 ? (
        <p className="px-3 py-4 text-center text-sm text-darkberry/60">
          No matches for “{query.trim()}”
        </p>
      ) : (
        results.map((p) => <ResultRow key={p.id} product={p} onPick={onPick} />)
      )}
    </div>
  );
}

export function HeaderSearch({ variant }: { variant: "desktop" | "mobile" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Desktop is always live; mobile only once expanded.
  const { query, setQuery, results } = useProductSearch(
    variant === "desktop" || open,
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, [setQuery]);

  // Click-away and Escape both dismiss the results.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const pick = useCallback(
    (p: SearchProduct) => {
      close();
      // The existing product page keys off the name-derived slug.
      router.push(`/menu/${slugify(p.name)}`);
    },
    [close, router],
  );

  if (variant === "desktop") {
    return (
      <div ref={rootRef} className="relative hidden lg:block lg:w-56 xl:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-darkberry/50" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search cakes…"
          aria-label="Search products"
          className="h-10 w-full rounded-full bg-blush-50 pl-9 pr-4 text-sm text-darkberry shadow-clay-sm outline-none transition-shadow placeholder:text-darkberry/50 focus:shadow-clay"
        />
        {query.trim() && (
          <ResultsPanel
            query={query}
            results={results}
            onPick={pick}
            className="absolute left-0 right-0 top-12 z-50"
          />
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="lg:hidden">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? "Close search" : "Search products"}
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-full bg-blush-50 text-darkberry shadow-clay-sm transition-shadow hover:shadow-clay"
      >
        {open ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 top-full z-50 px-4 pt-2"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-darkberry/50" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cakes…"
                aria-label="Search products"
                className="h-12 w-full rounded-full bg-blush-50 pl-10 pr-4 text-base text-darkberry shadow-clay outline-none placeholder:text-darkberry/50"
              />
            </div>
            <ResultsPanel
              query={query}
              results={results}
              onPick={pick}
              className="mt-2"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
