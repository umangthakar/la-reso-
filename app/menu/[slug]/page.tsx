"use client";

// ============================================================
// Le Rasa Bakery — product detail page (/menu/[slug])
// Slug is derived from the product name (see lib/slug). Fetches the
// public catalogue with the anon client, resolves the product, and
// shows related items from the same category.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import {
  Star,
  Plus,
  Minus,
  ShoppingCart,
  Zap,
  ChevronLeft,
  Leaf,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useCart } from "@/components/cart/cart-context";
import { slugify } from "@/lib/slug";
import { money } from "@/lib/pricing";

type DetailProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  description: string;
  allergens: string | null;
  badge: string | null;
  in_stock: boolean;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80";

type SupaRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
  badge: string | null;
  allergens: string | null;
  in_stock: boolean | null;
};

function toDetail(r: SupaRow): DetailProduct {
  return {
    id: r.id,
    name: r.name,
    category: r.category ?? "",
    price: Number(r.price) || 0,
    image: r.image_url || FALLBACK_IMAGE,
    description: r.description ?? "",
    allergens: r.allergens,
    badge: r.badge,
    in_stock: r.in_stock ?? true,
  };
}

// Deterministic rating so the stars match the menu card.
function ratingFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return Math.round((4.3 + (h % 8) / 10) * 10) / 10;
}

function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full;
        const isHalf = !filled && i === full && half;
        return (
          <span key={i} className="relative inline-block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-amber-400/40" strokeWidth={1.5} />
            {(filled || isHalf) && (
              <Star
                className="absolute inset-0 h-4 w-4 fill-amber-400 text-amber-400"
                strokeWidth={1.5}
                style={isHalf ? { clipPath: "inset(0 50% 0 0)" } : undefined}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const router = useRouter();
  const { addItem, openCart } = useCart();

  const [products, setProducts] = useState<DetailProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = createClient() as unknown as SupabaseClient;
      const { data } = await db
        .from("products")
        .select("id,name,description,price,image_url,category,badge,allergens,in_stock")
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      setProducts((data ?? []).map(toDetail));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const product = useMemo(
    () => products.find((p) => slugify(p.name) === slug) ?? null,
    [products, slug],
  );

  const related = useMemo(() => {
    if (!product) return [];
    return products
      .filter((p) => p.category === product.category && p.id !== product.id)
      .slice(0, 3);
  }, [products, product]);

  if (loading) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-dustyrose border-t-wine" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-darkberry">
          We couldn&apos;t find that treat
        </h1>
        <p className="text-berry">It may have sold out or been renamed.</p>
        <Link
          href="/menu"
          className="rounded-full bg-wine px-6 py-3 text-sm font-semibold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
        >
          Back to menu
        </Link>
      </div>
    );
  }

  const rating = ratingFor(product.id);
  const cartLine = {
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.image,
    category: product.category,
    slug: slugify(product.name),
  };

  const addToCart = () => {
    addItem(cartLine, qty);
    openCart();
  };
  const buyNow = () => {
    addItem(cartLine, qty);
    router.push("/checkout");
  };

  return (
    <div className="pb-24 pt-6">
      <div className="container">
        <Link
          href="/menu"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-wine-dark transition-colors hover:text-wine"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to menu
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative aspect-square w-full overflow-hidden rounded-clay bg-[#F9EEEA] shadow-clay"
          >
            <Image
              src={product.image}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 1024px) 90vw, 45vw"
              className="object-cover"
            />
            {product.badge && (
              <span className="absolute left-4 top-4 rounded-full bg-[#743249] px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
                {product.badge}
              </span>
            )}
          </motion.div>

          {/* Details */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
            className="flex flex-col"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-berry">
              {product.category}
            </span>
            <h1 className="mt-1.5 font-display text-3xl font-bold leading-tight text-darkberry md:text-4xl">
              {product.name}
            </h1>

            <div className="mt-3 flex items-center gap-2">
              <Stars value={rating} />
              <span className="text-sm font-semibold text-wine-dark">
                {rating.toFixed(1)}
              </span>
              <span className="text-sm text-berry">· 100% eggless</span>
            </div>

            <p className="mt-4 font-display text-3xl font-bold text-wine-dark">
              {money(product.price)}
            </p>

            <p className="mt-4 leading-relaxed text-darkberry-light">
              {product.description || "A handcrafted Le Rasa treat, baked fresh."}
            </p>

            {product.allergens && (
              <div className="mt-5 flex items-start gap-2 rounded-2xl bg-dustyrose-light/40 p-4">
                <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-wine-dark" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-wine-dark">
                    Allergens
                  </p>
                  <p className="text-sm text-darkberry">{product.allergens}</p>
                </div>
              </div>
            )}

            {/* Quantity + actions */}
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 rounded-full bg-[#F9EEEA] p-1.5 shadow-clay-sm">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="grid h-10 w-10 place-items-center rounded-full bg-blush-50 text-wine-dark shadow-clay-sm transition-transform active:scale-90"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-display text-lg font-bold text-darkberry">
                  {qty}
                </span>
                <button
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  aria-label="Increase quantity"
                  className="grid h-10 w-10 place-items-center rounded-full bg-blush-50 text-wine-dark shadow-clay-sm transition-transform active:scale-90"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {product.in_stock ? (
                <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                  <button
                    onClick={addToCart}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-wine px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Add to Cart
                  </button>
                  <button
                    onClick={buyNow}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-wine/40 bg-transparent px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-wine-dark transition-all hover:bg-wine/10"
                  >
                    <Zap className="h-4 w-4" />
                    Buy Now
                  </button>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-full bg-dustyrose-light/50 px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-wine-dark">
                  Currently unavailable
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Related products */}
        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-2xl font-bold text-darkberry">
              You might also love
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/menu/${slugify(r.name)}`}
                  className="group flex flex-col overflow-hidden rounded-clay bg-blush-50 shadow-clay-sm transition-shadow hover:shadow-glow"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={r.image}
                      alt={r.name}
                      fill
                      sizes="(max-width: 640px) 45vw, 30vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 font-display text-sm font-bold text-darkberry">
                      {r.name}
                    </h3>
                    <span className="mt-2 font-display text-base font-bold text-wine-dark">
                      {money(r.price)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
