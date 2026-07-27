// ============================================================
// Le Rasa Bakery — home hero, WHERE EVERYTHING SITS
// ------------------------------------------------------------
// The hero's stacking order and its placements, extracted from home-slider.tsx
// so the two files that draw into the stage can share one copy instead of
// keeping two in step: the server-rendered layers (home-slider.tsx) and the
// client CTA (hero-cta.tsx), which had to move out of that file once its href
// started following the cake in the centre.
//
// PURE CONSTANTS, NO REACT. That is what lets a client component import them
// without dragging the server hero's imports into the browser bundle with them.
//
// These values are unchanged from where they used to live. This file is one
// place to read the whole geometry of the hero, and still the only block a
// design pass needs to touch to move things around.
// ============================================================

// ---- Stacking order -----------------------------------------
// The cakes sit between the background and the copy — they carry their own
// z-20 in hero-cakes.tsx, since the three cakes are also stacked against each
// other — and the copy, CTA and cards share the top plane because they never
// overlap one another.
export const LAYER_Z = {
  background: "-z-10",
  // cakes: z-20 — owned by hero-cakes.tsx
  content: "z-40",
  cta: "z-40",
  cards: "z-40",
} as const;

// ---- Placement ----------------------------------------------
// Every position in the hero, expressed against the stage.
export const PLACEMENT = {
  /** The fixed-aspect canvas the whole composition lives in.
   *
   *  MOBILE IS TALLER THAN IT IS WIDE, and that is what makes the bottom of the
   *  hero work. A square phone stage cannot hold the sequence the composition
   *  needs — headline, then the whole cake, then Order Now, then the two stat
   *  cards — because the cake is a percentage of the stage (44%) while the
   *  button and the cards are fixed type-sized rows that do not shrink with it.
   *  Measured on a 390px phone the square stage was ~80px short, which is
   *  exactly the amount by which Order Now used to sit ON the cake. 4/5 buys
   *  that back; nothing else about the mobile layout had to move.
   *
   *  THE FLOOR IS FOR NARROW PHONES. Below ~360px the aspect-derived height
   *  shrinks faster than the button and the cards do, and the row would collide
   *  again (it already did at 375px and under, before this). `min-h` yields to
   *  nothing and simply stops the stage getting shorter than the fixed rows in
   *  it need. It is cleared at `sm`, where the wide aspect always exceeds it
   *  anyway — so tablet and desktop are byte-for-byte the geometry they were.
   *
   *  AND A CEILING, for the same reason mirrored. Past ~400px the aspect-derived
   *  height outruns the fixed rows the other way and the gap under the cake
   *  opens to 30px+; the cap holds it at the top of the 16–24px band on the
   *  largest phones. Between the two bounds the aspect is what is actually in
   *  force. Cleared at `sm` — left on, it would clamp the tablet and desktop
   *  stages, which are far taller than this. */
  stage:
    "relative mx-auto aspect-[4/5] min-h-[430px] max-h-[470px] w-full max-w-[1280px] sm:aspect-[16/11] sm:max-h-none sm:min-h-0 lg:aspect-[20/11]",
  /** Top band: brand hard left, Call Us hard right, on one row.
   *  They share a flex row rather than being pinned to opposite corners
   *  independently, so on a narrow stage they can never grow into each other. */
  topBar:
    "absolute inset-x-0 top-[4%] flex items-center justify-between px-[3%] sm:px-[2.5%]",
  /** Heading · subtitle · divider — centred, directly under the top band.
   *  The top offset drops as the stage widens: on mobile the heading has to
   *  clear the bar completely (the two lockups leave no centre gap at that
   *  width), while from `lg` up the centred column passes cleanly between
   *  them and can sit on the same band.
   *
   *  The mobile figure is 17% re-expressed against the taller mobile stage, not
   *  a reposition: 13.5% of 4/5 lands the copy within a pixel or two of where
   *  17% of a square put it, so the headline holds its place under the top bar
   *  and the height the stage gained goes entirely to the cake and the row
   *  under it. Left at 17% the copy would have slid ~16px down the stage and
   *  taken back a fifth of what this change is for. */
  headline:
    "pointer-events-auto absolute inset-x-0 top-[13.5%] px-4 text-center sm:top-[8%] lg:top-[4%]",
  /** THE CAKE STAGE'S OWN LIFT — mobile only, and the reason Order Now no
   *  longer lands on the cake.
   *
   *  One transform on ONE wrapper that holds all three cakes, so the trio moves
   *  as the single piece it is: no cake's own geometry (hero-cake.tsx) is
   *  touched, the slots keep their spacing, and a cake entering or leaving
   *  travels exactly as far as it did. 16% of the stage rather than a pixel
   *  figure, so the lift scales with the composition the way every other
   *  placement here does.
   *
   *  It sits INSIDE the drag track rather than around it (hero-cakes.tsx): the
   *  track has to keep covering the whole stage to catch a swipe that starts
   *  low, and Framer writes its own inline transform there during a drag, which
   *  would overwrite a class-applied translate the moment a finger moved. */
  cakeLift: "absolute inset-0 -translate-y-[16%] sm:translate-y-0",
  /** Order Now, bottom centre — under the cake on mobile, over it above `sm`.
   *  The band is deliberately NOT `pointer-events-auto`: it spans the full
   *  stage width and crosses the cake row at the wider breakpoints, so an
   *  auto band would swallow every swipe started in that strip even though it
   *  is empty either side of the button. Only the button itself takes pointer
   *  events (see HeroCta) — the rest of the row falls through to the
   *  carousel's drag track. */
  cta: "absolute inset-x-0 bottom-[14%] flex justify-center sm:bottom-[3%]",
  /** The two floating cards, bottom corners. */
  cardLeft: "pointer-events-auto absolute bottom-[1.5%] left-[2%]",
  cardRight: "pointer-events-auto absolute bottom-[1.5%] right-[2%]",
} as const;

/** Shared by all five stage layers: same box, same origin, click-through. */
export const LAYER_BASE = "pointer-events-none absolute inset-0";
