"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShoppingCart, Zap } from "lucide-react";
import { useCart } from "@/components/cart/cart-context";
import { slugify } from "@/lib/slug";

export type HomeProduct = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  category: string | null;
  badge: string | null;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80";

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

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </section>
  );
}

function ProductCard({ product, index }: { product: HomeProduct; index: number }) {
  const router = useRouter();
  const { addItem, openCart } = useCart();
  const slug = slugify(product.name);
  const image = product.image_url || FALLBACK_IMAGE;

  const line = {
    id: product.id,
    name: product.name,
    price: product.price,
    image,
    category: product.category ?? "",
    slug,
  };

  const add = () => {
    addItem(line);
    openCart();
  };
  const buyNow = () => {
    addItem(line);
    router.push("/checkout");
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: "easeOut", delay: (index % 3) * 0.08 }}
      className="flex w-[78%] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] bg-[#F9EEEA] shadow-clay-sm sm:w-[46%] md:w-full"
    >
      <Link href={`/menu/${slug}`} className="relative block aspect-[4/3] w-full overflow-hidden">
        <Image
          src={image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 80vw, 380px"
          className="object-cover transition-transform duration-300 hover:scale-105"
        />
        {product.badge && (
          <span className="absolute left-2 top-2 rounded-full bg-[#743249] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            {product.badge}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {product.category && (
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#9C616D]">
            {product.category}
          </span>
        )}
        <Link href={`/menu/${slug}`}>
          <h3 className="mt-1 line-clamp-2 font-display text-lg font-bold leading-snug text-[#612437]">
            {product.name}
          </h3>
        </Link>
        <span className="mt-1 font-display text-lg font-bold text-[#743249]">
          £{Number(product.price).toFixed(2)}
        </span>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={add}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#873853] px-3 text-xs font-bold uppercase tracking-wide text-white transition-transform hover:-translate-y-0.5"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Add to Cart
          </button>
          <button
            type="button"
            onClick={buyNow}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border-2 border-[#873853] px-3 text-xs font-bold uppercase tracking-wide text-[#743249] transition-transform hover:-translate-y-0.5"
          >
            <Zap className="h-3.5 w-3.5" />
            Buy Now
          </button>
        </div>
      </div>
    </motion.article>
  );
}
