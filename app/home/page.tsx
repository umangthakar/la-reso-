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
  // one round trip, like settings and products already do.
  const [settings, products, policies, googleReviews] = await Promise.all([
    getPublicSettings(),
    fetchHomeProducts(),
    getPolicies(),
    getGoogleReviews(),
  ]);

  const waDigits = settings.contact.whatsapp.replace(/[^0-9]/g, "");
  const waText = settings.whatsapp_bar.text || "For any question";

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

      {/* 4. IMAGE SLIDER */}
      <HomeSlider images={settings.home_slider} />

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
