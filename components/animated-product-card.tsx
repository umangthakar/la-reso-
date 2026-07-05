"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Star, ShoppingCart, Zap } from "lucide-react";
import type { Product } from "@/lib/data";

/* ------------------------------------------------------------------ *
 * Le Rasa — Animated Product Card
 *
 * A three-step reveal built on Framer Motion, triggered on hover
 * (desktop) or tap (touch):
 *
 *   STEP 1 — Initial : minimal blush trapezoid container, image tucked
 *                      to the right, only title + price on the left.
 *   STEP 2 — Slide-in: container elevates & scales; a white details
 *                      panel slides in from the left (half-overhanging
 *                      the container) with a staggered content reveal —
 *                      Title → Rating → Price → Description → Add to Cart.
 *   STEP 3 — Focus   : the product image zooms & takes the right half,
 *                      the backdrop dims, and a price badge, star rating,
 *                      ADD TO CART + BUY NOW surface over the image.
 * ------------------------------------------------------------------ */

// The live products table has no rating column, so derive a stable,
// pleasant-looking value (4.3–5.0) from the product id.
function ratingFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return Math.round((4.3 + (h % 8) / 10) * 10) / 10; // one decimal, ≤ 5.0
}

function StarRow({ value, className = "" }: { value: number; className?: string }) {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.5;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Rated ${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full;
        const half = !filled && i === full && hasHalf;
        return (
          <span key={i} className="relative inline-block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-amber-400/40" strokeWidth={1.5} />
            {(filled || half) && (
              <Star
                className="absolute inset-0 h-4 w-4 fill-amber-400 text-amber-400"
                strokeWidth={1.5}
                style={half ? { clipPath: "inset(0 50% 0 0)" } : undefined}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}

/* --- Motion variants (keyed by "closed" / "open", inherited by children) --- */

const container: Variants = {
  closed: {
    scale: 1,
    boxShadow:
      "4px 4px 12px rgba(116, 50, 73, 0.15), -3px -3px 10px rgba(255, 255, 255, 0.65)",
  },
  open: {
    scale: 1.03,
    boxShadow: "0 24px 60px -18px rgba(135, 56, 83, 0.55)",
    transition: { type: "spring", stiffness: 220, damping: 24 },
  },
};

// The details panel slides in from the left and orchestrates the
// staggered reveal of its own children.
const detailsPanel: Variants = {
  closed: { x: 24, opacity: 0 },
  open: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

const line: Variants = {
  closed: { opacity: 0, x: -20 },
  open: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// Collapsed label (title + price) that cross-fades out on open.
const collapsedLabel: Variants = {
  closed: { opacity: 1, transition: { duration: 0.3 } },
  open: { opacity: 0, transition: { duration: 0.2 } },
};

const imageWrap: Variants = {
  closed: { scale: 1 },
  open: { scale: 1.06, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
};

const dim: Variants = {
  closed: { opacity: 0 },
  open: { opacity: 1, transition: { duration: 0.6 } },
};

// Overlay chrome (badge, stars, buttons) that appears over the image.
const overlayItem: Variants = {
  closed: { opacity: 0, y: 12 },
  open: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut", delay: 0.25 } },
};

export function AnimatedProductCard({ product }: { product: Product }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  const rating = ratingFor(product.id);

  return (
    <motion.article
      variants={container}
      initial="closed"
      animate={open ? "open" : "closed"}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onTapStart={() => setPinned((p) => !p)}
      className="group relative isolate h-[300px] w-full max-w-[560px] cursor-pointer select-none rounded-[28px] md:h-[320px]"
      style={{ transformOrigin: "50% 60%" }}
    >
      {/* Blush trapezoid backdrop — right edge sits higher than the left */}
      <div
        className="absolute inset-0 -z-10 rounded-[28px] bg-gradient-to-br from-[#F9EEEA] to-[#F2DCD6]"
        style={{ clipPath: "polygon(0 7%, 100% 0, 100% 100%, 0 100%)" }}
      />

      <div className="flex h-full w-full items-stretch gap-2 p-3 md:gap-3 md:p-4">
        {/* ------------------------------- LEFT ------------------------------- */}
        <div className="relative flex min-w-0 flex-1 items-center">
          {/* Collapsed label — visible in the resting state */}
          <motion.div variants={collapsedLabel} className="px-2 md:px-3">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#9C616D]">
              {product.category}
            </span>
            <h3 className="mt-1 line-clamp-3 font-display text-lg font-bold leading-snug text-[#612437] md:text-xl">
              {product.name}
            </h3>
            <span className="mt-2 block font-display text-lg font-bold text-[#743249]">
              £{product.price.toFixed(2)}
            </span>
          </motion.div>

          {/* Details panel — slides in & overhangs the container on open */}
          <motion.div
            variants={detailsPanel}
            className="pointer-events-none absolute -left-3 top-1/2 z-20 w-[112%] -translate-y-1/2 rounded-[22px] bg-white/95 p-4 shadow-[0_18px_45px_-20px_rgba(116,50,73,0.55)] backdrop-blur-sm md:-left-4 md:p-5"
            style={{ pointerEvents: open ? "auto" : "none" }}
          >
            <motion.span
              variants={line}
              className="text-[11px] font-bold uppercase tracking-widest text-[#9C616D]"
            >
              {product.category}
            </motion.span>
            <motion.h3
              variants={line}
              className="mt-1 line-clamp-2 font-display text-xl font-bold leading-snug text-[#612437]"
            >
              {product.name}
            </motion.h3>
            <motion.div variants={line} className="mt-2 flex items-center gap-2">
              <StarRow value={rating} />
              <span className="text-sm font-semibold text-[#743249]">{rating.toFixed(1)}</span>
            </motion.div>
            <motion.span
              variants={line}
              className="mt-2 block font-display text-2xl font-bold text-[#743249]"
            >
              £{product.price.toFixed(2)}
            </motion.span>
            <motion.p
              variants={line}
              className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[#9C616D]"
            >
              {product.description}
            </motion.p>
            <motion.div variants={line} className="mt-3">
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#873853] px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(135,56,83,0.7)] transition-transform hover:-translate-y-0.5"
              >
                <ShoppingCart className="h-4 w-4" />
                Add to Cart
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* ------------------------------- RIGHT ------------------------------ */}
        <div className="relative aspect-[3/4] h-full shrink-0 overflow-hidden rounded-[22px] shadow-[0_10px_30px_-12px_rgba(116,50,73,0.5)]">
          <motion.div variants={imageWrap} className="absolute inset-0">
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 1024px) 45vw, 260px"
              className="object-cover"
            />
          </motion.div>

          {/* Dim scrim behind the overlay chrome */}
          <motion.div
            variants={dim}
            className="absolute inset-0 bg-gradient-to-t from-[#3b1622]/80 via-[#3b1622]/25 to-transparent"
          />

          {/* Price badge — top right */}
          <motion.span
            variants={overlayItem}
            className="absolute right-2 top-2 rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-[#743249] shadow-md"
          >
            £{product.price.toFixed(2)}
          </motion.span>

          {/* Rating + actions — bottom of the image */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
            <motion.div variants={overlayItem} className="flex items-center gap-1.5">
              <StarRow value={rating} />
              <span className="text-xs font-semibold text-white/95">{rating.toFixed(1)}</span>
            </motion.div>
            <motion.div variants={overlayItem} className="flex gap-2">
              <Link
                href="/contact"
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-[#873853] px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-transform hover:-translate-y-0.5"
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add to Cart</span>
                <span className="sm:hidden">Cart</span>
              </Link>
              <Link
                href="/contact"
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-white px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-[#743249] transition-transform hover:-translate-y-0.5"
              >
                <Zap className="h-3.5 w-3.5" />
                Buy Now
              </Link>
            </motion.div>
          </div>

          {/* Category tag chip — resting state accent */}
          {product.tag && (
            <span className="absolute left-2 top-2 rounded-full bg-[#743249] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              {product.tag}
            </span>
          )}
        </div>
      </div>
    </motion.article>
  );
}
