"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/data";
import { AnimatedProductCard } from "@/components/animated-product-card";
import { useCart } from "@/components/cart/cart-context";
import { slugify } from "@/lib/slug";

export type HomeProduct = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  badge: string | null;
  description: string | null;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80";

// Map the home fetch shape onto the shared Product type the animated card uses.
function toProduct(p: HomeProduct): Product {
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

export function HomeProducts({ products }: { products: HomeProduct[] }) {
  if (products.length === 0) return null;

  return (
    <section className="container mt-14">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-3xl font-bold text-darkberry md:text-4xl">Products</h2>
        <Link
          href="/menu"
          className="text-sm font-semibold text-wine transition-colors hover:text-wine-dark"
        >
          View All →
        </Link>
      </div>

      {/* DESKTOP (md+) — the exact same animated card from the Menu page,
          in the same grid wrapper (staggered reveal, hover focus, Read More). */}
      <div className="mx-auto hidden w-full max-w-[1200px] grid-cols-1 justify-items-center gap-6 md:grid lg:grid-cols-2">
        {products.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: (i % 2) * 0.08 }}
            className="w-full max-w-[560px]"
          >
            <AnimatedProductCard product={toProduct(p)} />
          </motion.div>
        ))}
      </div>

      {/* MOBILE (below md) — simple static card: image, name, price, Add to Cart. */}
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
        {products.map((p) => (
          <MobileCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}

function MobileCard({ product }: { product: HomeProduct }) {
  const { addItem, openCart } = useCart();
  const slug = slugify(product.name);
  const image = product.image_url || FALLBACK_IMAGE;

  const add = () => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      image,
      category: product.category ?? "",
      slug,
    });
    openCart();
  };

  return (
    <article className="flex w-[78%] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] bg-[#F9EEEA] shadow-clay-sm sm:w-[46%]">
      <Link href={`/menu/${slug}`} className="relative block aspect-[4/3] w-full overflow-hidden">
        <Image
          src={image}
          alt={product.name}
          fill
          sizes="80vw"
          className="object-cover"
        />
        {product.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-[#743249] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            {product.badge}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link href={`/menu/${slug}`}>
          <h3 className="line-clamp-2 font-display text-lg font-bold leading-snug text-[#612437]">
            {product.name}
          </h3>
        </Link>
        <span className="mt-1 font-display text-lg font-bold text-[#743249]">
          £{Number(product.price).toFixed(2)}
        </span>

        <button
          type="button"
          onClick={add}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#873853] px-3 text-xs font-bold uppercase tracking-wide text-white"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Add to Cart
        </button>
      </div>
    </article>
  );
}
