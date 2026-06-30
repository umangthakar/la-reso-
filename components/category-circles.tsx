"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { categories } from "@/lib/data";
import { SectionHeading } from "@/components/section-heading";
import { stagger, fadeUp } from "@/components/motion";

export function CategoryCircles() {
  return (
    <section id="categories" className="section-padding">
      <div className="container">
        <SectionHeading
          eyebrow="Shop by Craving"
          title="Find your next favourite"
          description="From show-stopping tiers to a quiet afternoon cookie — pick a category and let the sweetness begin."
        />

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="mt-14 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6"
        >
          {categories.map((cat) => (
            <motion.div key={cat.slug} variants={fadeUp}>
              <Link
                href={`/menu?category=${cat.slug}`}
                className="group flex flex-col items-center gap-3 text-center"
              >
                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-dustyrose-light to-dustyrose/60 opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-100" />
                  <motion.div
                    whileHover={{ y: -8, rotate: -3 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    className="relative aspect-square w-full overflow-hidden rounded-full border-4 border-blush-50 shadow-clay"
                  >
                    <Image
                      src={cat.image}
                      alt={cat.name}
                      fill
                      sizes="(max-width: 640px) 40vw, 160px"
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-darkberry/20 to-transparent" />
                  </motion.div>
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold text-darkberry transition-colors group-hover:text-wine-dark">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-darkberry-light">{cat.blurb}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
