"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DEFAULT_ROTATING_BANNERS,
  type RotatingBanner,
} from "@/lib/site-settings";

// How long each banner stays before rotating to the next.
const ROTATE_MS = 5000;

export function RotatingBanners({
  banners,
  count,
}: {
  banners: RotatingBanner[];
  count: number;
}) {
  // Only enabled banners rotate; if none are enabled fall back to the first
  // default hero banner so the Menu page never looks empty.
  const enabled = banners.filter((b) => b.enabled);
  const slides = enabled.length > 0 ? enabled : [DEFAULT_ROTATING_BANNERS[0]];

  const [index, setIndex] = useState(0);

  // Keep the index valid if the banner list changes (e.g. admin edit).
  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [slides.length, index]);

  // Auto-rotate every 5s. Pauses (single slide) or resets when the list changes.
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  const current = slides[Math.min(index, slides.length - 1)];

  return (
    <section className="relative w-full overflow-hidden bg-[#F9EEEA] px-8 py-16">
      {/* Decorative product-count watermark (unchanged from the hero) */}
      <span className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 select-none font-display text-[200px] font-bold leading-none text-[#D5A4A4]/20 md:block">
        {count}
      </span>

      {/* Rotating content — cross-fades between banners */}
      <div className="relative min-h-[150px] max-w-2xl md:min-h-[190px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {current.type !== "hero" && (
              <span className="mb-3 inline-block rounded-full bg-wine px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blush-50">
                {current.type === "offer" ? "Special Offer" : "Announcement"}
              </span>
            )}
            <h2 className="font-display text-5xl font-bold leading-tight text-[#612437] md:text-7xl">
              {current.heading}
            </h2>
            {current.subtext && (
              <p className="mt-4 text-[#9C616D]">{current.subtext}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators */}
      {slides.length > 1 && (
        <div className="relative mt-6 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Show banner ${i + 1}`}
              aria-current={i === index}
              className={`h-2.5 rounded-full transition-all ${
                i === index ? "w-7 bg-wine" : "w-2.5 bg-[#D5A4A4] hover:bg-[#c58e8e]"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
