"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Phone, CalendarHeart, Cake, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { TrustBadges } from "@/components/trust-badges";
import { ProductHighlightCard } from "@/components/ui/product-card";
import { GooeyText } from "@/components/ui/gooey-text-morphing";
import { useSiteSettings } from "@/lib/use-site-settings";

export function OrderCTA() {
  // Contact number comes from the DB (site_settings.contact.phone) — no hardcoding.
  const { settings } = useSiteSettings();
  const phone = settings.contact.phone.trim();
  const phoneDigits = phone.replace(/[^0-9+]/g, "");

  return (
    <section id="custom-order" className="section-padding">
      <div className="container">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-wine via-wine-dark to-darkberry px-6 py-10 shadow-glow sm:px-12 sm:py-14 md:py-20">
            {/* Decorative floats */}
            <motion.div
              animate={{ y: [0, -18, 0], rotate: [0, 8, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 rounded-full bg-dustyrose/30 blur-2xl"
            />
            <motion.div
              animate={{ y: [0, 16, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="pointer-events-none absolute -bottom-10 left-10 h-48 w-48 rounded-full bg-dustyrose/30 blur-2xl"
            />

            <div className="relative grid items-center gap-10 lg:grid-cols-[1.3fr,1fr]">
              <div className="text-center lg:text-left">
                <span className="inline-flex items-center gap-2 rounded-full bg-blush-50/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-blush-50">
                  <CalendarHeart className="h-3.5 w-3.5" />
                  Now taking orders
                </span>
                <div className="mt-5">
                  <GooeyText
                    texts={["Birthday Cake", "Custom Order", "Sweet Moment", "Your Celebration", "Eggless Treat"]}
                    morphTime={1.5}
                    cooldownTime={0.5}
                    className="h-[90px] w-full sm:h-[120px]"
                    textClassName="font-bold text-white text-4xl sm:text-6xl"
                  />
                </div>
                <p className="mx-auto mt-4 max-w-lg text-blush-100/85 text-balance lg:mx-0">
                  Tell us the occasion, flavours and date — we&apos;ll craft a
                  one-of-a-kind eggless centrepiece your guests will remember.
                </p>

                <ol className="mt-7 flex flex-col gap-4 sm:flex-row sm:gap-6">
                  {[
                    "Tell us your dream",
                    "We design & bake",
                    "Delivered to your door",
                  ].map((step, i) => (
                    <li
                      key={step}
                      className="flex items-center gap-2.5 text-left text-sm font-semibold text-blush-50"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blush-50/15 font-display text-sm text-blush-50">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>

                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                  <Button asChild size="lg" variant="secondary">
                    <Link href="/contact">
                      Start your order
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  {phoneDigits && (
                    <a
                      href={`tel:${phoneDigits}`}
                      className="inline-flex items-center gap-2 rounded-full border-2 border-blush-50/30 px-6 py-3 text-sm font-semibold text-blush-50 transition-colors hover:bg-blush-50/10"
                    >
                      <Phone className="h-4 w-4" />
                      {phone}
                    </a>
                  )}
                </div>
                <TrustBadges
                  variant="onDark"
                  className="mt-8 justify-center lg:justify-start"
                />
              </div>

              {/* 3D tilt product highlight cards — stacked vertically on the right,
                  scrollable if they exceed the section height. min-w-0 stops the
                  grid track from blowing out so nothing escapes the section. */}
              <div className="hidden min-w-0 [perspective:1500px] lg:block">
                <div className="flex max-h-[500px] flex-col items-center gap-3 overflow-y-auto px-2 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <ProductHighlightCard
                    className="h-[280px] w-[220px] shrink-0"
                    category="Birthday Cakes"
                    categoryIcon={<Cake className="h-4 w-4" />}
                    title="Rose Pistachio"
                    description="Three layers of rose-scented sponge & pistachio cream"
                    imageSrc="https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80"
                    imageAlt="Rose Pistachio Celebration Cake"
                  />
                  <ProductHighlightCard
                    className="h-[280px] w-[220px] shrink-0"
                    category="Cupcakes"
                    categoryIcon={<Star className="h-4 w-4" />}
                    title="Vanilla Buttercream"
                    description="Madagascar vanilla sponge with silky buttercream swirls"
                    imageSrc="https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80"
                    imageAlt="Vanilla Bean Buttercream Cupcakes"
                  />
                  <ProductHighlightCard
                    className="h-[280px] w-[220px] shrink-0"
                    category="Custom Cakes"
                    categoryIcon={<Sparkles className="h-4 w-4" />}
                    title="Dream Cake"
                    description="Designed around your occasion, flavours & vision"
                    imageSrc="https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=900&q=80"
                    imageAlt="Strawberries & Cream Dream Cake"
                  />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
