"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Product } from "@/lib/data";

export function ProductCard({ product }: { product: Product }) {
  return (
    <motion.div
      whileHover={{ y: -10 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-clay bg-blush-50 shadow-clay-sm transition-shadow duration-300 hover:shadow-glow"
      style={{ transformStyle: "preserve-3d" }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-darkberry/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {product.tag && (
          <Badge variant="butter" className="absolute left-3 top-3 shadow-clay-sm">
            {product.tag}
          </Badge>
        )}

        <button
          aria-label="Save to favourites"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-blush-50/80 text-wine-dark backdrop-blur transition-colors hover:bg-wine hover:text-blush-50"
        >
          <Heart className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <span className="text-xs font-bold uppercase tracking-wider text-wine-dark">
          {product.category}
        </span>
        <h3 className="mt-1 font-display text-lg font-semibold leading-snug text-darkberry">
          {product.name}
        </h3>
        <p className="mt-1.5 flex-1 text-sm text-darkberry-light">
          {product.description}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <span className="font-display text-xl font-semibold text-darkberry">
            £{product.price.toFixed(2)}
          </span>
          <Link
            href="/contact"
            className="inline-flex items-center gap-1.5 rounded-full bg-wine px-4 py-2 text-sm font-semibold text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Order
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
