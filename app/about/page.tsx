import type { Metadata } from "next";
import Image from "next/image";
import { Heart, Sparkles, Leaf, Award } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { SectionHeading } from "@/components/section-heading";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { OrderCTA } from "@/components/order-cta";
import { getGoogleReviews } from "@/lib/google-reviews";
import { getPublicSettings } from "@/lib/site-settings-server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About — Le Rasa",
  description:
    "Our story: how Le Rasa became the house of eggless desserts, baking inclusive, premium treats everyone can share.",
};

/**
 * Stat cards. The "Average rating" figure is NOT hardcoded — it comes from the
 * live Google Business rating and is omitted entirely when there is no live
 * figure, so the page can never drift out of step with Google.
 */
function buildStats(googleRating: number) {
  return [
    { value: "100%", label: "Eggless recipes", icon: Leaf },
    ...(googleRating > 0
      ? [{ value: `${googleRating.toFixed(1)}★`, label: "Average rating", icon: Award }]
      : []),
  ];
}

const values = [
  {
    icon: Leaf,
    title: "Eggless, never less",
    body: "Every recipe is built egg-free from day one — so taste, texture and beauty are never an afterthought.",
  },
  {
    icon: Heart,
    title: "A seat for everyone",
    body: "Vegetarian families, allergy-conscious guests and curious foodies all share the same cake. That's the point.",
  },
  {
    icon: Sparkles,
    title: "Crafted, not churned",
    body: "We bake in small batches and hand-finish each order. No factory lines, just real pastry chefs.",
  },
];

// The rating below is live, so this page must not be cached at build time —
// a Google sync has to reflect on the next request, like the menu. The CMS
// content read below rides on the same discipline: an admin save shows up on
// the very next request, with nothing to purge.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AboutPage() {
  // Two live reads, in parallel — neither depends on the other.
  //   • the Google rating (null when the integration is off)
  //   • the About Us CMS content (site_settings.about_page)
  // getPublicSettings never throws and never returns null: any failure — an
  // unreachable database, a column that hasn't been migrated yet, a row that
  // was never written — resolves to the defaults, which ARE the copy this page
  // used to hardcode. So the page renders identically whether or not the CMS
  // has ever been touched.
  const [google, settings] = await Promise.all([getGoogleReviews(), getPublicSettings()]);
  const stats = buildStats(google?.rating ?? 0);
  const about = settings.about_page;

  return (
    <>
      <PageHero
        eyebrow={about.hero_eyebrow}
        title={about.hero_heading}
        description={about.hero_description}
      />

      {/* Story */}
      <section className="section-padding pt-6">
        <div className="container grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="relative aspect-[4/5] w-full max-w-md overflow-hidden rounded-clay shadow-clay">
              {/* `src` is guaranteed renderable by normaliseAboutContent — an
                  admin-set URL next/image can't resolve is swapped for the
                  built-in photo there, so this can never throw. */}
              {/* UNOPTIMIZED ON PURPOSE, and only here.

                  Routed through the optimizer this became
                  /_next/image?url=…, which the host answered with HTTP 402
                  once the plan's image-transformation allowance was used up.
                  A 402 is not a broken URL or a broken upload — the object in
                  the bucket is fine and the admin preview, which does not go
                  through the optimizer, kept rendering it. It is the
                  optimizer itself refusing to do any more work, so the one
                  visible photo on this page silently disappeared.

                  `unoptimized` makes the browser fetch the Supabase public URL
                  directly, so the page no longer depends on that allowance.
                  Layout is untouched: `fill` positions off the wrapper's
                  aspect-[4/5] box via CSS, not via the optimizer, so the space
                  is still reserved before the image lands and there is no CLS.

                  Deliberately scoped to this ONE image. Hero slider, product,
                  offer and every other image stay optimized. */}
              <Image
                src={about.image_url}
                alt={about.image_alt}
                fill
                unoptimized
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover"
              />
            </div>
          </Reveal>
          <div>
            <SectionHeading
              align="left"
              eyebrow={about.badge}
              title={about.heading}
            />
            <div className="mt-6 space-y-4 text-darkberry-light">
              {about.paragraphs.map((paragraph, i) => (
                // whitespace-pre-line so a deliberate line break typed in the
                // admin survives, without any other markup being interpreted.
                <p key={i} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="pb-4">
        <div className="container">
          {/* Columns track the live card count so a row is never left with a
              hole: 3 cards → 2-up on mobile with the last spanning the full
              width, 3-up from sm. 2 cards → 2-up throughout. 1 card (no live
              rating) → a single full-width card, no empty cell. */}
          <StaggerGroup
            className={cn(
              "grid gap-4",
              stats.length <= 1 && "grid-cols-1",
              stats.length === 2 && "grid-cols-2",
              stats.length >= 3 && "grid-cols-2 sm:grid-cols-3",
            )}
          >
            {stats.map((s, i) => (
              <StaggerItem
                key={s.label}
                // 3 cards: the last one fills the leftover mobile cell.
                className={cn(
                  stats.length === 3 &&
                    i === stats.length - 1 &&
                    "col-span-2 sm:col-span-1",
                )}
              >
                <div className="rounded-clay bg-blush-50 p-6 text-center shadow-clay-sm">
                  <s.icon className="mx-auto h-7 w-7 text-wine" />
                  <p className="mt-3 font-display text-3xl font-semibold text-darkberry">
                    {s.value}
                  </p>
                  <p className="text-sm text-darkberry-light">{s.label}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding">
        <div className="container">
          <SectionHeading
            eyebrow="What we believe"
            title="The values baked into every box"
          />
          <StaggerGroup className="mt-12 grid gap-6 md:grid-cols-3">
            {values.map((v) => (
              <StaggerItem key={v.title}>
                <div className="h-full rounded-clay bg-blush-50 p-7 shadow-clay-sm transition-shadow hover:shadow-clay">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-dustyrose-light text-wine-dark">
                    <v.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-semibold text-darkberry">
                    {v.title}
                  </h3>
                  <p className="mt-2 text-sm text-darkberry-light">{v.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      <OrderCTA />
    </>
  );
}
