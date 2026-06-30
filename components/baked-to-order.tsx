"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { stagger, fadeUp } from "@/components/motion";

type ShowcaseCategory = {
  name: string;
  slug: string;
  image: string;
};

const u = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`;

const showcase: ShowcaseCategory[] = [
  { name: "Cakes", slug: "birthday-cakes", image: u("photo-1535141192574-5d4897c12636") },
  { name: "Cupcakes", slug: "cupcakes", image: u("photo-1486427944299-d1955d23e34d") },
  { name: "Brownies", slug: "brownies", image: u("photo-1607478900766-efe13248b125") },
  { name: "Cookies", slug: "cookies", image: u("photo-1499636136210-6f4ee915583e") },
  { name: "Gift Boxes", slug: "gift-boxes", image: u("photo-1549007994-cb92caebd54b") },
  { name: "Custom Cakes", slug: "custom-cakes", image: u("photo-1578985545062-69928b1d9587") },
];

export function BakedToOrder() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = (220 + 16) * 2; // (card width + gap) × 2
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section className="section-padding bg-[#F9EEEA]">
      <div className="container">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="font-display text-3xl font-semibold leading-tight text-[#612437] sm:text-4xl md:text-5xl">
              Baked to Order
            </h2>
            <p className="mt-3 text-base text-[#873853] md:text-lg">
              Everything, freshly made for you.
            </p>
          </div>

          <Link
            href="/menu"
            className="group hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-[#873853] transition-colors hover:text-[#612437] sm:inline-flex"
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
            {showcase.map((cat) => (
              <motion.div
                key={cat.slug}
                variants={fadeUp}
                className="shrink-0 snap-start"
              >
                <Link href={`/menu?category=${cat.slug}`} className="group block">
                  <motion.div
                    whileHover={{ y: -8, scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    className="relative h-[300px] w-[80vw] max-w-[260px] overflow-hidden rounded-3xl shadow-clay sm:w-[220px] sm:max-w-none"
                  >
                    <Image
                      src={cat.image}
                      alt={cat.name}
                      fill
                      sizes="220px"
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#612437]/80 to-transparent" />
                    <h3 className="absolute inset-x-0 bottom-0 p-5 font-display text-xl font-bold text-white">
                      {cat.name}
                    </h3>
                  </motion.div>
                </Link>
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
