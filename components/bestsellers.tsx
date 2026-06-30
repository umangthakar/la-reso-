"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { products } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { stagger, fadeUp } from "@/components/motion";

// Bestsellers first, then a few more crowd-pleasers.
const bestsellers = [
  ...products.filter((p) => p.tag === "Bestseller"),
  ...products.filter((p) => p.tag !== "Bestseller"),
].slice(0, 8);

export function Bestsellers() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = (280 + 16) * 2; // (card width + gap) × 2
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="section-padding bg-[#F9EEEA]">
      <div className="container">
        <div className="flex items-end justify-between gap-6">
          <div>
            <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-dustyrose-light/70 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-wine-dark">
              <span className="h-1.5 w-1.5 rounded-full bg-wine" />
              Crowd Favourites
            </span>
            <h2 className="font-display text-3xl font-semibold leading-tight text-darkberry sm:text-4xl md:text-5xl">
              Bestsellers
            </h2>
            <p className="mt-3 text-base text-darkberry-light md:text-lg">
              The bakes everyone keeps reordering.
            </p>
          </div>

          <Link
            href="/menu"
            className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-wine-dark transition-colors hover:text-darkberry sm:inline-flex"
          >
            View All
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="relative mt-10">
          <motion.div
            ref={scrollerRef}
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {bestsellers.map((product) => (
              <motion.div
                key={product.id}
                variants={fadeUp}
                className="w-[85vw] shrink-0 snap-start sm:w-[280px]"
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </motion.div>

          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollBy("left")}
            className="absolute -left-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#873853] text-white shadow-clay transition-transform hover:scale-105 active:scale-95 md:flex"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollBy("right")}
            className="absolute -right-4 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-[#873853] text-white shadow-clay transition-transform hover:scale-105 active:scale-95 md:flex"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      </div>
    </section>
  );
}
