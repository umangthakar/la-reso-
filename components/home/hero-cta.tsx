"use client";

// ============================================================
// Le Rasa Bakery — home hero, LAYER 4: ORDER NOW
// ------------------------------------------------------------
// One button, whose destination follows the cake in the centre of the
// carousel. Every Hero Slider image is linked to a product
// (37_hero_slider_product.sql), so the visitor who clicks Order Now lands on
// the cake they were looking at rather than on the whole menu — which was the
// old behaviour and is now only the fallback.
//
// WHY THIS IS A CLIENT COMPONENT WHEN NOTHING ABOUT IT MOVES. It used to live
// in home-slider.tsx with the other server-rendered layers, and its markup is
// unchanged from there. What changed is that its href is now carousel state:
// it has to re-render when the centre cake changes, which a server component
// cannot do. Nothing else came with it — the copy, the top bar, the background
// and the two stat cards are all still server-rendered and ship no JS.
//
// THE URL IS NEVER BUILT HERE. `href` arrives resolved (lib/hero-slider.ts →
// lib/slug.ts), so the route to a product is written in exactly one place and
// this component only has to decide between the product and the fallback.
// ============================================================

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LAYER_BASE, LAYER_Z, PLACEMENT } from "@/components/home/hero-placement";

/** Where Order Now goes when the cake on stage has no product behind it — an
 *  image the admin hasn't linked, one whose product was deleted or hidden, or
 *  a hero running on the fallback images from site_settings. The full menu is
 *  the honest answer: it is what the button meant before it could be specific,
 *  and it never leaves the visitor on a page that doesn't exist. */
export const HERO_CTA_FALLBACK_HREF = "/menu";

export function HeroCta({ href }: { href: string | null }) {
  return (
    <div className={`${LAYER_BASE} ${LAYER_Z.cta}`}>
      <div className={PLACEMENT.cta}>
        <Link
          href={href ?? HERO_CTA_FALLBACK_HREF}
          className="pointer-events-auto inline-flex items-center gap-2.5 rounded-full bg-berry px-6 py-2.5 text-sm font-semibold text-blush-50 shadow-[0_14px_30px_-12px_rgba(116,50,73,0.6)] hover:bg-plum focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine focus-visible:ring-offset-2 sm:gap-3 sm:px-9 sm:py-3 sm:text-base lg:px-11 lg:py-3.5 lg:text-lg"
        >
          Order Now
          <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
      </div>
    </div>
  );
}
