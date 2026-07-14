"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Auto-advance interval.
const SLIDE_MS = 3000;

export function HomeSlider({ images }: { images: string[] }) {
  const slides = images.filter(Boolean);
  const [index, setIndex] = useState(0);

  const go = useCallback(
    (dir: number) => {
      setIndex((i) => (i + dir + slides.length) % slides.length);
    },
    [slides.length],
  );

  // Auto-slide every 3s (paused when there's a single image).
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <section className="container mt-4">
      {/* Height is driven purely by the aspect ratio. Mobile keeps 16/9 and
          tablets keep 21/9; lg trims a little and xl (desktop) widens to 14/5,
          which is ~17% shorter than 21/9 at the same width. */}
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[24px] shadow-clay-sm sm:aspect-[21/9] lg:aspect-[5/2] xl:aspect-[14/5]">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <Image
              src={slides[index]}
              alt={`Slide ${index + 1}`}
              fill
              priority={index === 0}
              sizes="(max-width: 768px) 100vw, 1200px"
              className="object-cover"
            />
            {/* Soft rose wash for consistent contrast with the design system */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#3b1622]/25 to-transparent" />
          </motion.div>
        </AnimatePresence>

        {slides.length > 1 && (
          <>
            {/* Arrows — 44px touch targets */}
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous slide"
              className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-wine-dark shadow-clay-sm backdrop-blur transition hover:scale-105"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next slide"
              className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-wine-dark shadow-clay-sm backdrop-blur transition hover:scale-105"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Dots */}
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index}
                  className={`h-2.5 rounded-full transition-all ${
                    i === index ? "w-7 bg-white" : "w-2.5 bg-white/60 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
