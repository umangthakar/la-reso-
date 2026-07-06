import { Suspense } from "react";
import type { Metadata } from "next";
import { MenuGrid } from "@/components/menu-grid";
import { Marquee } from "@/components/marquee";
import { TrustBar } from "@/components/trust-bar";
import { Testimonials } from "@/components/testimonials";
import { OrderCTA } from "@/components/order-cta";

// Never statically cache the menu — hero banner + products must reflect admin
// edits on the next request (no redeploy).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Menu — Le Rasa Bakery",
  description:
    "Browse our full menu of 100% eggless cakes, cupcakes, brownies, cookies and gift boxes. Filter by category and order your favourites.",
};

export default function MenuPage() {
  return (
    <>
      {/* Promo banner — scrolls to the custom-order CTA on this page */}
      <a
        href="#custom-order"
        className="block w-full bg-[#873853] text-white transition-colors hover:bg-[#743249]"
      >
        <div className="container flex flex-col items-center justify-center gap-1 py-3 text-center text-sm font-medium sm:flex-row sm:justify-between sm:gap-4 sm:text-left">
          <span>🎂 Custom Cakes — Designed just for you</span>
          <span className="inline-flex animate-pulse items-center gap-1 font-semibold">
            Order Now →
          </span>
        </div>
      </a>

      <section className="pb-24">
        <div className="container">
          <Suspense fallback={<div className="py-20 text-center text-darkberry-light">Loading menu…</div>}>
            <MenuGrid />
          </Suspense>
        </div>
      </section>

      {/* Everything that used to live on the homepage now lives below the grid */}
      <Marquee />
      <TrustBar />
      <Testimonials />
      <OrderCTA />
    </>
  );
}
