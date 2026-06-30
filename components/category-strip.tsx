"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

const u = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=300&q=80`;

type StripItem = { name: string; href: string; image: string };

const items: StripItem[] = [
  { name: "Birthday Cakes", href: "/menu?category=birthday-cakes", image: u("photo-1535141192574-5d4897c12636") },
  { name: "Cupcakes", href: "/menu?category=cupcakes", image: u("photo-1486427944299-d1955d23e34d") },
  { name: "Custom Cakes", href: "/menu?category=custom-cakes", image: u("photo-1578985545062-69928b1d9587") },
  { name: "Brownies", href: "/menu?category=brownies", image: u("photo-1607478900766-efe13248b125") },
  { name: "Cookies", href: "/menu?category=cookies", image: u("photo-1499636136210-6f4ee915583e") },
  { name: "Gift Boxes", href: "/menu?category=gift-boxes", image: u("photo-1549007994-cb92caebd54b") },
  { name: "Bento", href: "/menu?category=bento", image: u("photo-1535254973040-607b474cb50d") },
  { name: "Nationwide", href: "/menu", image: u("photo-1607920592519-bab2a80ebf2f") },
];

export function CategoryStrip() {
  return (
    <section id="categories" className="bg-[#F9EEEA] py-10 md:py-12">
      <div className="container">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-darkberry sm:text-3xl">
            Shop by craving
          </h2>
          <Link
            href="/menu"
            className="text-sm font-semibold text-wine-dark transition-colors hover:text-darkberry"
          >
            View all
          </Link>
        </div>

        <div className="-mx-3 flex snap-x gap-5 overflow-x-auto px-3 pb-3 sm:gap-6 md:justify-center [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((cat) => (
            <Link
              key={cat.name}
              href={cat.href}
              className="group flex shrink-0 snap-start flex-col items-center gap-2.5 text-center"
            >
              <div className="relative">
                <div className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-dustyrose-light to-dustyrose/60 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                <motion.div
                  whileHover={{ y: -6, rotate: -3 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="relative h-16 w-16 overflow-hidden rounded-full border-4 border-blush-50 shadow-clay sm:h-24 sm:w-24"
                >
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    sizes="96px"
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-darkberry/20 to-transparent" />
                </motion.div>
              </div>
              <span className="w-16 text-xs font-semibold leading-tight text-darkberry transition-colors group-hover:text-wine-dark sm:w-24 sm:text-sm">
                {cat.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
