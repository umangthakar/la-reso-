import type { Metadata } from "next";
import { getPublicSettings } from "@/lib/site-settings-server";
import { HomeSlider } from "@/components/home/home-slider";
import { HomeProducts, type HomeProduct } from "@/components/home/home-products";
import { WhatsappFloat } from "@/components/home/whatsapp-float";
import { OfferPopup } from "@/components/home/offer-popup";
import { PolicyCards } from "@/components/home/policy-cards";
import { Marquee } from "@/components/marquee";
import { Testimonials } from "@/components/testimonials";
import { getPolicies } from "@/lib/policies-server";
import { getGoogleReviews } from "@/lib/google-reviews";
import { getHeroSliderImages } from "@/lib/hero-slider-server";
import { heroSlidesFrom } from "@/lib/hero-slider";

// Fetch settings + products fresh on every request so admin edits show
// immediately with no redeploy.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Le Rasa Bakery — Eggless Cakes & Desserts",
  description:
    "Handcrafted 100% eggless cakes, cupcakes, brownies and gift boxes. Order custom cakes for every occasion.",
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// First 6 visible products, freshest ordering (sort_order), no caching.
async function fetchHomeProducts(): Promise<HomeProduct[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,name,price,image_url,category,badge,description&visible=eq.true&order=sort_order.asc&limit=6`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    return (await res.json()) as HomeProduct[];
  } catch {
    return [];
  }
}

export default async function HomeLandingPage() {
  // Policies are read here (not inside the component) so the three reads share
  // one round trip, like settings and products already do. The hero images join
  // the same batch: the Hero Slider is its own table, so it is its own request,
  // and running it in parallel keeps it off the page's critical path.
  const [settings, products, policies, googleReviews, heroImages] = await Promise.all([
    getPublicSettings(),
    fetchHomeProducts(),
    getPolicies(),
    getGoogleReviews(),
    getHeroSliderImages(),
  ]);

  // THE HERO'S CAKES. The Hero Slider module (/admin/dashboard/hero-slider) is
  // the source of truth; site_settings.home_slider is only the fallback, for a
  // hero with no visible images of its own yet — which is also what keeps the
  // composition whole on a database where 36_hero_slider.sql has not been run.
  // Resolved after the batch rather than inside it because it needs both
  // answers; the function itself is pure and does no I/O.
  //
  // Each slide carries the URL of the product it advertises, resolved from the
  // product joined onto its row — that is what the hero's Order Now opens.
  // Fallback slides have no product, and open the menu.
  const heroSlides = heroSlidesFrom(heroImages, settings.home_slider);

  const waDigits = settings.contact.whatsapp.replace(/[^0-9]/g, "");
  const waText = settings.whatsapp_bar.text || "For any question";
  // Keep the leading "+" so a tel: link still dials internationally.
  const phoneDigits = settings.contact.phone.replace(/[^0-9+]/g, "");

  return (
    <div className="pb-16">
      {/* 3. WHATSAPP BAR */}
      {waDigits && (
        <div className="w-full bg-[#873853] text-white">
          <div className="container flex min-h-[44px] items-center justify-center gap-2 py-2.5 text-center text-sm font-medium">
            <span>
              {waText}{" "}
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline underline-offset-2 hover:opacity-90"
              >
                Click here
              </a>
            </span>
          </div>
        </div>
      )}

      {/* 4. HERO — five layers over a single fixed-aspect stage: background /
          content / cakes / CTA / floating cards (see home-slider.tsx). Only the
          cakes change; every other layer is placed once and never moves.
          Everything in it is admin-driven: the top-left lockup is the uploaded
          logo plus the branding wordmark, the top-right pill dials the contact
          phone, the cakes are the VISIBLE Hero Slider images — all of them,
          three on stage at a time (see heroSlides above) — and the rating card
          shows the live Google rating when Google Reviews are connected. Order
          Now opens the product linked to whichever cake is currently centred. */}
      <HomeSlider
        slides={heroSlides}
        rating={
          googleReviews ? { value: googleReviews.rating, total: googleReviews.total } : null
        }
        logo={settings.logo || null}
        brand={{ name: settings.branding.short_name, tagline: settings.branding.tagline }}
        action={{
          label: "Call Us",
          // Dial straight from the hero when a number is set; otherwise send
          // them to the contact page rather than rendering a dead tel: link.
          href: phoneDigits ? `tel:${phoneDigits}` : "/contact",
        }}
      />

      {/* 5. ABOUT US */}
      <section className="container mt-14 text-center">
        <div className="mx-auto flex max-w-md items-center justify-center gap-4">
          <span className="h-px flex-1 bg-[#D5A4A4]" />
          <h2 className="font-display text-3xl font-bold text-darkberry md:text-4xl">About Us</h2>
          <span className="h-px flex-1 bg-[#D5A4A4]" />
        </div>
        <p className="mx-auto mt-5 max-w-2xl leading-relaxed text-[#9C616D]">
          {settings.about.text}
        </p>
      </section>

      {/* 6. PRODUCTS */}
      <HomeProducts products={products} />

      {/* Moved from the Menu page — scrolling marquee + customer reviews */}
      <Marquee />
      <Testimonials google={googleReviews} />

      {/* 7. WHATSAPP FLOATING BUTTON */}
      <WhatsappFloat number={settings.contact.whatsapp} />

      {/* Active-offer popup — home page only, once per browser session. */}
      <OfferPopup />

      {/* 8. POLICIES — replaces the old "Le Rasa · {address}" strip that used to
          close the page. The address was already in the footer on every page,
          so this slot now carries the policy cards instead. Every card is a row
          from the policies table; the admin's order and enabled flags decide
          what renders. */}
      <PolicyCards policies={policies} />
    </div>
  );
}
