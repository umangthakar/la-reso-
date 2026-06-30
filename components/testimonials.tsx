"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { CardStack, type CardStackItem } from "@/components/ui/card-stack";

type Review = CardStackItem & {
  quote: string;
  customer: string;
  orderType: string;
};

const reviews: Review[] = [
  {
    id: 1,
    title: "Sarah M.",
    customer: "Sarah M.",
    orderType: "Birthday Cake",
    quote:
      "Honestly the best eggless cake I've ever had — my daughter's birthday was made complete. So moist you'd never guess it was eggless, and it arrived in Leeds perfectly packaged.",
  },
  {
    id: 2,
    title: "Priya & Raj",
    customer: "Priya & Raj",
    orderType: "Anniversary Cake",
    quote:
      "We ordered a custom anniversary cake and it was stunning. The team in Birmingham captured exactly what we wanted, and every guest asked where it was from. Pure indulgence.",
  },
  {
    id: 3,
    title: "Hannah L.",
    customer: "Hannah L.",
    orderType: "Custom Order",
    quote:
      "I have an egg allergy and finding a proper celebration cake has always been a nightmare — until now. The custom design was flawless and tasted incredible. Delivered to London on time.",
  },
  {
    id: 4,
    title: "James T.",
    customer: "James T.",
    orderType: "Gift Box",
    quote:
      "Sent a gift box to my mum in Manchester for Mother's Day and she hasn't stopped talking about it. Beautifully boxed, fresh, and the little handwritten note was such a lovely touch.",
  },
  {
    id: 5,
    title: "Aisha K.",
    customer: "Aisha K.",
    orderType: "Baby Shower Cake",
    quote:
      "Ordered an eggless cake for my baby shower and it exceeded every expectation. Soft, rich and gorgeous to look at. The whole ordering process was effortless. Will be back for sure!",
  },
];

function useCardSize() {
  const [size, setSize] = React.useState({ width: 480, height: 280 });

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () =>
      setSize(mq.matches ? { width: 480, height: 280 } : { width: 300, height: 320 });
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return size;
}

function ReviewCard({ review, active }: { review: Review; active: boolean }) {
  return (
    <div
      className="flex h-full w-full flex-col justify-between rounded-3xl bg-white p-8"
      style={{
        border: active ? "2px solid #873853" : "2px solid rgba(213, 164, 164, 0.3)",
      }}
    >
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
        ))}
      </div>

      <blockquote
        className="mt-5 line-clamp-3 flex-1 text-base italic leading-relaxed"
        style={{ color: "#612437" }}
      >
        “{review.quote}”
      </blockquote>

      <figcaption className="mt-6 text-sm font-bold" style={{ color: "#873853" }}>
        — {review.customer}, {review.orderType}
      </figcaption>
    </div>
  );
}

export function Testimonials() {
  const { width, height } = useCardSize();

  return (
    <section className="section-padding relative overflow-hidden" style={{ backgroundColor: "#F9EEEA" }}>
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-dustyrose/20 blur-3xl" />
      <div className="container relative">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-dustyrose-light/70 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-wine-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-wine" />
            Sweet Words
          </span>
          <h2 className="font-display text-3xl font-semibold leading-tight text-darkberry text-balance sm:text-4xl md:text-5xl">
            Loved by Our Customers
          </h2>
          <p className="mt-4 text-base text-darkberry-light text-balance md:text-lg">
            2,400+ happy boxes delivered across the UK
          </p>
        </motion.div>

        <div className="mt-12 md:mt-16">
          <CardStack<Review>
            items={reviews}
            renderCard={(item, { active }) => (
              <ReviewCard review={item} active={active} />
            )}
            autoAdvance={true}
            intervalMs={3000}
            pauseOnHover={true}
            cardWidth={width}
            cardHeight={height}
            showDots
          />
        </div>
      </div>
    </section>
  );
}
