import Link from "next/link";
import { Heart, Phone, Star, Users } from "lucide-react";
import { HeroCakes } from "@/components/home/hero-cakes";
import { LAYER_BASE, LAYER_Z, PLACEMENT } from "@/components/home/hero-placement";
import type { HeroSlide } from "@/lib/hero-slider";

// ============================================================
// Le Rasa Bakery — home hero
// ------------------------------------------------------------
// ARCHITECTURE
//
//   <section> HERO WRAPPER          — isolate + overflow, owns nothing visual
//     └ HeroBackground              — the hero's only background image
//     └ STAGE                       — one fixed-aspect canvas (the design grid)
//         └ HeroTopBar              — logo lockup LEFT · Call Us RIGHT
//         └ HeroHeadline            — heading · subtitle · divider, centred
//         └ HeroCakes               — THE CAROUSEL (hero-cakes.tsx)
//         └ HeroCta                 — Order Now
//         └ HeroFloatingCards       — rating card + happy-customers card
//
// ONLY THE CAKES MOVE. The background, the top bar, the heading, the subtitle,
// the divider, Order Now and the two stat cards are all fixed: they are placed
// once, against the stage, and nothing in this file animates them. The rotation
// lives entirely in hero-cakes.tsx, which is the hero's only client component —
// so "nothing else moves" is structural, not a convention someone has to
// remember. Every layer below this comment is server-rendered and ships no JS.
//
// Every layer is `absolute inset-0` over the stage, so all five share one
// coordinate space and are stacked purely by z-index (see LAYER_Z). Layers do
// not nest inside one another and none of them affects the others' layout:
// a layer can be repositioned, restyled or replaced on its own.
//
// The stage is a FIXED-ASPECT box. Every element inside is placed as a
// percentage of it (see PLACEMENT), so the whole composition scales as one
// piece at every breakpoint instead of reflowing. Desktop, tablet and mobile
// are the same drawing at three sizes — the only per-breakpoint overrides are
// the stage's aspect ratio, the cake diameter, and the top offset of the
// headline (mobile has to clear the top bar; wider stages do not).
//
// A layer plane itself is pointer-transparent, so a full-stage layer can never
// swallow a click meant for the layer beneath it. The positioned blocks inside
// re-enable pointer events over their own box only, which keeps the heading
// selectable and the CTA clickable.
// ============================================================

// Hero copy. Line 2's last word takes the italic rose treatment.
const HEADING_LINE_1 = "Baked with heart,";
const HEADING_LINE_2 = "crafted with";
const HEADING_ACCENT = "care";
const SUBTITLE = "100% Eggless • Premium Ingredients • Made Fresh Daily";

// ---- Stacking order and placement ---------------------------
// Both now live in components/home/hero-placement.ts — one place to read the
// whole depth and geometry of the hero, shared with the CTA, which had to move
// into a client component once its href started following the centre cake.
// The values are unchanged.

export type HomeHeroRating = { value: number; total: number };

/** Wordmark + tagline shown beside the logo mark in the top-left lockup. */
export type HomeHeroBrand = { name: string; tagline: string };

/** The top-right utility action (the "Call us" pill). */
export type HomeHeroAction = { label: string; href: string };

// ============================================================
// HERO WRAPPER
// ============================================================

export function HomeSlider({
  slides,
  rating = null,
  logo = null,
  brand = null,
  action = null,
}: {
  /** EVERY visible Hero Slider image (hero_slider_images), in the admin's
   *  display order — however many that is — each with the product it
   *  advertises already resolved to a URL. Three of them are on stage at any
   *  moment and the carousel window rotates through the rest; the opening
   *  frame reads left to right, #1 left, #2 centre, #3 right. One and two
   *  image heroes are supported states, not edge cases (lib/hero-carousel.ts). */
  slides: HeroSlide[];
  /** Live Google rating, when the admin has Google Reviews connected. */
  rating?: HomeHeroRating | null;
  /** Uploaded brand logo (site_settings.logo), shown in the top-left lockup. */
  logo?: string | null;
  /** Wordmark + tagline (site_settings.branding) beside the logo mark. */
  brand?: HomeHeroBrand | null;
  /** Top-right utility action — the "Call us" pill. */
  action?: HomeHeroAction | null;
}) {
  const ratingValue = rating && rating.value > 0 ? rating.value : 5;
  const ratingLabel = `${Number.isInteger(ratingValue) ? ratingValue : ratingValue.toFixed(1)}/5`;

  return (
    // The hero is a rounded card: `overflow-hidden` is what clips the three
    // background circles to the rounded corners, and the shadow lifts the whole
    // band off the page. Both belong to the wrapper — never to a layer inside.
    <section className="relative isolate mx-3 mt-3 overflow-hidden rounded-[24px] shadow-[0_30px_70px_-34px_rgba(116,50,73,0.5)] sm:mx-4 sm:mt-4 sm:rounded-[32px] lg:mx-6 lg:mt-6 lg:rounded-[40px]">
      <HeroBackground />

      {/* HeroCakes mounts the CTA as its own next sibling — same place, same
          layer, same markup as when this file rendered it. See LAYER 4. */}
      <div className={PLACEMENT.stage}>
        <HeroContent logo={logo} brand={brand} action={action} />
        <HeroCakes slides={slides} />
        <HeroFloatingCards ratingLabel={ratingLabel} />
      </div>
    </section>
  );
}

// ============================================================
// LAYER 1 — BACKGROUND
// ------------------------------------------------------------
// The hero's ONLY background, drawn in CSS from the reference plate: a warm
// pastel base with three large soft-pink circles — one centred, one bleeding off
// the left edge, one off the right.
//
// It belongs to the root <section> and to nothing else. The cake layer, the
// cake wrappers and each photo are all transparent; no descendant of this hero
// owns a background of its own, so the plate can never be double-drawn or clip
// against a photo.
//
// GEOMETRY — fitted to the reference (1774×887, i.e. 2:1) rather than eyeballed:
// each circle's centre, diameter and alpha were solved against the actual
// pixels, which lands the whole plate within ~1/255 mean per-channel error.
//
//                      Ø 128% ‧ (51%, 50%)
//   ┌───────────────────────────────────────────────────┐
//   │            ╭─────────────────────────╮            │
//   │   ╭────────┼─────────────────────────┼────────╮   │
//   │   │        ╰─────────────────────────╯        │   │
//   └───┴───────────────────────────────────────────┴───┘
//    Ø 74% ‧ (9.3%, 70.4%)          Ø 74% ‧ (92.2%, 70.4%)
//
// Every diameter is a percentage of the layer's HEIGHT (`h-[…] aspect-square`),
// not its width. At the reference's 2:1 that reproduces the plate exactly
// (128% of height = 64% of width; 74% = 37%), and at any other aspect ratio the
// circles keep their proportion to the band instead of inflating with the
// viewport — so the same three shapes read correctly on mobile, tablet and
// desktop with no per-breakpoint overrides.
//
// COLOUR — sampled from the plate. The side circles are opaque pink on the
// base; the centre circle is a WHITE WASH at 32%, which is what makes the
// overlaps land on the reference's exact blend (#FCE7E7 where centre meets a
// side circle, #FCEDEE where it meets the base). Each circle carries a radial
// gradient that holds solid to ~96% of its radius and feathers out from there,
// so no edge is ever a hard line.
//
// Pure CSS, so there is no 1.5 MB PNG to fetch, nothing to preload, no decode
// before first paint and no resampling at any viewport width.
// ============================================================

/** Sampled from the reference plate. RGB triplets so each one can be faded. */
const BG = {
  /** Warm pastel base — #FDE7E8. */
  base: "253, 231, 232",
  /** The left / right circles — #FDDEE0, opaque on the base. */
  side: "253, 222, 224",
  /** The centre circle — a white wash, not a solid fill (see above). */
  centre: "255, 255, 255",
} as const;

/** A circle that holds a flat fill to `solid`% of its radius, then feathers out
 *  to nothing at the rim.
 *
 *  The plate's circles are flat fills with crisp edges — measured across an
 *  edge, the reference steps from base to circle within a few pixels, and the
 *  interior never varies by more than a level or two. So the feather is kept
 *  narrow: just enough to keep the rim from aliasing into a drawn line. The
 *  softness in this background comes from the colours themselves — the circles
 *  are only 6–9 levels away from the base — not from blurred edges. Widen the
 *  feather here and the whole plate turns to mush. */
function softCircle(rgb: string, solid: number, alpha = 1) {
  return (
    `radial-gradient(circle at 50% 50%, ` +
    `rgba(${rgb}, ${alpha}) 0%, rgba(${rgb}, ${alpha}) ${solid}%, rgba(${rgb}, 0) 100%)`
  );
}

function HeroBackground() {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${LAYER_Z.background}`}
      style={{ backgroundColor: `rgb(${BG.base})` }}
    >
      {/* LEFT — bleeds off the left edge and the bottom. */}
      <span
        className="absolute left-[9.3%] top-[70.4%] aspect-square h-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ backgroundImage: softCircle(BG.side, 96) }}
      />
      {/* RIGHT — the same circle, but NOT a mirror: the plate sits it ~1.5%
          further out than its twin, and matching that is the difference
          between the composition reading as the reference or as a redraw. */}
      <span
        className="absolute left-[92.2%] top-[70.4%] aspect-square h-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ backgroundImage: softCircle(BG.side, 96) }}
      />
      {/* CENTRE — the light wash the cakes sit against, overlapping both.
          Nudged 1% right of true centre, as the plate has it. */}
      <span
        className="absolute left-[51%] top-1/2 aspect-square h-[128%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ backgroundImage: softCircle(BG.centre, 97, 0.32) }}
      />
    </div>
  );
}

// ============================================================
// LAYER 2 — CONTENT (top bar + headline)
// ------------------------------------------------------------
//   [ logo · wordmark ]                            [ Call us ]
//                        Baked with heart,
//                        crafted with care
//              100% Eggless • Premium • Fresh Daily
//                          ──── ♥ ────
// ============================================================

function HeroContent({
  logo,
  brand,
  action,
}: {
  logo?: string | null;
  brand?: HomeHeroBrand | null;
  action?: HomeHeroAction | null;
}) {
  return (
    <div className={`${LAYER_BASE} ${LAYER_Z.content}`}>
      <HeroTopBar logo={logo} brand={brand} action={action} />
      <HeroHeadline />
    </div>
  );
}

/** The top band: brand lockup left, utility action right.
 *
 *  Both ends are optional and each renders an empty placeholder when it has no
 *  content, so the one that IS present stays pinned to its own edge instead of
 *  drifting to the middle of the flex row. */
function HeroTopBar({
  logo,
  brand,
  action,
}: {
  logo?: string | null;
  brand?: HomeHeroBrand | null;
  action?: HomeHeroAction | null;
}) {
  return (
    <div className={PLACEMENT.topBar}>
      <HeroBrand logo={logo} brand={brand} />
      <HeroUtility action={action} />
    </div>
  );
}

/** Top-LEFT lockup: logo mark + wordmark + tagline. */
function HeroBrand({ logo, brand }: { logo?: string | null; brand?: HomeHeroBrand | null }) {
  if (!logo && !brand) return <span />;
  return (
    <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
      {logo ? (
        // Admin-uploaded, arbitrary remote host — same plain <img> the navbar
        // and splash screen use for this asset.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-9 w-auto object-contain sm:h-11 lg:h-12" />
      ) : null}
      {brand ? (
        <span className="text-left">
          <span className="block font-display text-base font-bold leading-none text-darkberry sm:text-lg lg:text-xl">
            {brand.name}
          </span>
          {/* The tagline is the widest thing in the lockup, and below `lg` the
              stage is narrow enough that it reaches the centred heading. It is
              already under the wordmark in the navbar directly above the hero,
              so it is dropped here rather than allowed to collide. */}
          <span className="mt-1 hidden text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-berry lg:block">
            {brand.tagline}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** Top-RIGHT utility action — the "Call us" pill. */
function HeroUtility({ action }: { action?: HomeHeroAction | null }) {
  if (!action) return <span />;
  return (
    <Link
      href={action.href}
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-blush-50/90 px-3.5 py-2 text-xs font-semibold text-darkberry shadow-[0_10px_24px_-14px_rgba(116,50,73,0.6)] hover:bg-blush-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine focus-visible:ring-offset-2 sm:px-4 sm:py-2.5 sm:text-sm"
    >
      <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      {action.label}
    </Link>
  );
}

/** Centre column: heading, subtitle, then the divider that closes the block
 *  off from the cakes below it. */
function HeroHeadline() {
  return (
    <div className={PLACEMENT.headline}>
      <h1 className="font-display text-[26px] font-bold leading-[1.12] text-darkberry sm:text-[34px] lg:text-[44px] xl:text-[52px]">
        {HEADING_LINE_1}
        <br />
        {HEADING_LINE_2}{" "}
        <em className="font-normal italic text-dustyrose-dark">{HEADING_ACCENT}</em>
      </h1>

      <p className="mt-2 text-[12px] font-medium text-darkberry sm:mt-3 sm:text-sm lg:text-[17px]">
        {SUBTITLE}
      </p>

      <HeroDivider />
    </div>
  );
}

/** The centred rule under the subtitle: a hairline either side of the heart
 *  mark. The rules fade out towards their far ends so the divider reads as a
 *  flourish rather than a boxed-in border. */
function HeroDivider() {
  const rule = "h-px w-10 sm:w-14 lg:w-16";
  return (
    <div aria-hidden className="mt-2.5 flex items-center justify-center gap-2.5 sm:mt-3.5 sm:gap-3">
      <span className={`${rule} bg-gradient-to-r from-transparent to-dustyrose`} />
      <Heart className="h-3 w-3 shrink-0 fill-dustyrose text-dustyrose sm:h-3.5 sm:w-3.5" />
      <span className={`${rule} bg-gradient-to-l from-transparent to-dustyrose`} />
    </div>
  );
}

// ============================================================
// LAYER 3 — CAKES · see components/home/hero-cakes.tsx
// ------------------------------------------------------------
// The one changing layer, and the one client component. It owns the three
// slots and the window that decides which images are in them; the geometry of
// a single cake lives one level down in hero-cake.tsx. All it needs from here
// is the photo list — however long that is, only three cakes are ever mounted.
// It renders no visible controls of its own: the rotation is automatic, and
// drag / swipe / arrow keys act on the track itself.
//
// It is also the hero's only interactive surface below the content plane: its
// drag track covers the whole stage at z-20 to catch mouse drags and touch
// swipes. Everything in this file that a visitor can click or select — the
// heading, Order Now, the two stat cards — sits at z-40 and therefore still
// takes its own events first. Nothing above needs to know the track is there.
// ============================================================

// ============================================================
// LAYER 4 — CTA · see components/home/hero-cta.tsx
// ------------------------------------------------------------
// Order Now, unchanged in markup, position and layer — but no longer mounted
// from this file. Its destination is the product linked to the cake currently
// in the CENTRE of the carousel, which is client state, so it is rendered by
// hero-cakes.tsx as the drag track's sibling: the same node, in the same place
// in the stage, one file along. This file keeps every layer that genuinely
// never changes.
// ============================================================

// ============================================================
// LAYER 5 — FLOATING CARDS
// ============================================================

function HeroFloatingCards({ ratingLabel }: { ratingLabel: string }) {
  return (
    <div className={`${LAYER_BASE} ${LAYER_Z.cards}`}>
      <div className={PLACEMENT.cardLeft}>
        <RatingCard label={ratingLabel} />
      </div>
      <div className={PLACEMENT.cardRight}>
        <CustomersCard />
      </div>
    </div>
  );
}

// ---- Floating card internals ---------------------------------

function StatCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[18px] bg-[#F8E7E7]/90 px-2.5 py-2 backdrop-blur-sm sm:gap-3.5 sm:rounded-[22px] sm:px-4 sm:py-2.5 lg:px-5 lg:py-3">
      {children}
    </div>
  );
}

function StatIcon({ children, tone }: { children: React.ReactNode; tone: "solid" | "soft" }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9 lg:h-11 lg:w-11 ${
        tone === "solid" ? "bg-darkberry" : "bg-[#EED2D2]"
      }`}
    >
      {children}
    </span>
  );
}

function RatingCard({ label }: { label: string }) {
  return (
    <StatCard>
      <StatIcon tone="solid">
        <Star className="h-3.5 w-3.5 fill-blush-50 text-blush-50 sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
      </StatIcon>
      <span className="text-left">
        <span className="block text-xs font-bold leading-none text-darkberry sm:text-sm lg:text-base">
          {label}
        </span>
        <span className="mt-1 flex items-center gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((s) => (
            <Star
              key={s}
              className="h-2.5 w-2.5 fill-[#F0A500] text-[#F0A500] sm:h-3 sm:w-3 lg:h-3.5 lg:w-3.5"
            />
          ))}
        </span>
      </span>
    </StatCard>
  );
}

function CustomersCard() {
  return (
    <StatCard>
      <StatIcon tone="soft">
        <Users className="h-3.5 w-3.5 text-darkberry sm:h-4 sm:w-4 lg:h-5 lg:w-5" />
      </StatIcon>
      <span className="text-left">
        <span className="block text-xs font-bold leading-none text-darkberry sm:text-sm lg:text-base">
          100+
        </span>
        <span className="mt-1 block text-[10px] font-medium leading-none text-berry sm:text-xs lg:text-sm">
          Happy Customers
        </span>
      </span>
    </StatCard>
  );
}
