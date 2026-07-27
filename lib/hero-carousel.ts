// ============================================================
// Le Rasa Bakery — hero carousel ENGINE (pure, no React, no DOM)
// ------------------------------------------------------------
// The window that decides which three of the admin's images are on stage.
// Everything here is arithmetic on indices: no arrays are copied, cloned,
// repeated or rebuilt, and nothing in this file knows what an image is.
//
// THE SLIDING WINDOW
//
// The hero has exactly three slots. However many images the admin has
// uploaded, only three are ever rendered — the engine moves the WINDOW over
// the list instead of moving cakes through a queue:
//
//   images   1  2  3  4  5
//   ┌───────────────┐
//   │ L    C    R   │            centre = 1   → 1 · 2 · 3
//      ┌───────────────┐
//      │ L    C    R  │         centre = 2   → 2 · 3 · 4
//         ┌───────────────┐
//         │ L    C    R  │      centre = 3   → 3 · 4 · 5
//                              centre = 4   → 4 · 5 · 1   (wraps)
//                              centre = 0   → 5 · 1 · 2   (wraps)
//
// One number — the centre index — describes the whole state. Left and right
// are derived from it, so they cannot drift out of step with it, and the wrap
// is a modulo rather than a special case at the ends: there is no "last
// image", so the loop has no seam to hide.
//
// WHY A WINDOW AND NOT A RING OF CLONES
//
// The previous engine laid every image on a ring long enough to keep two
// off-stage positions filled, repeating a short list to reach that length.
// That put 5–6 <img> nodes in the DOM to show three cakes, and the count grew
// with the admin's list: 25 uploaded images meant 25 nodes, 22 of them
// invisible, each one a fetch the visitor never sees. The window renders three
// nodes for any list length — see heroWindowAt.
//
// PURE ON PURPOSE. No hooks, no imports, no side effects: the rotation can be
// reasoned about (and tested) as plain arithmetic, and lib/use-hero-carousel.ts
// is left holding nothing but React state.
// ============================================================

/** The three places a cake can be, in DOM order — which is also reading order. */
export type HeroSlot = "left" | "centre" | "right";

/**
 * Which image index occupies each slot, plus the one to fetch ahead.
 *
 * `null` means THE SLOT IS EMPTY and nothing should be rendered for it — not
 * a hidden node, not a placeholder. That is how the one- and two-image heroes
 * stay whole instead of showing the same cake twice (see heroWindowAt).
 */
export type HeroWindow = {
  left: number | null;
  centre: number | null;
  right: number | null;
  /** The image that will enter the right slot on the next step, or null when
   *  there isn't one worth fetching early. See heroPreloadIndex. */
  preload: number | null;
};

/** The empty window — every slot dark. Returned for an empty image list. */
const NO_WINDOW: HeroWindow = { left: null, centre: null, right: null, preload: null };

/**
 * Index arithmetic on a ring of `count`, safe for negatives.
 *
 * JavaScript's `%` keeps the sign of the dividend (`-1 % 5 === -1`), so the
 * left neighbour of image 0 would come out negative and index nothing. The
 * extra `+ count` is what makes the wrap symmetric in both directions.
 */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/**
 * Which image opens in the CENTRE.
 *
 * The second one, so the admin's list reads left-to-right across the stage on
 * first paint: #1 left, #2 centre, #3 right. Opening on #1 would put the last
 * uploaded image — the one the admin dragged to the bottom — in the left slot
 * before anything had moved.
 *
 * A lone image can only be the centre.
 */
export function heroOpeningIndex(count: number): number {
  return count >= 2 ? 1 : 0;
}

/**
 * Whether the window can move at all.
 *
 * Under three images there is no third slot to rotate into, and stepping the
 * window would only put a cake the visitor can already see into a second
 * visible slot — a duplicate reads as a bug, not as a carousel. So one and two
 * image heroes are placed once and held still. (Phase 7 owns what drives the
 * step; this is only whether stepping is meaningful.)
 */
export function heroRotates(count: number): boolean {
  return count >= 3;
}

/**
 * The next POSITION, one place along in `direction`.
 *
 * Deliberately NOT wrapped, and this is the load-bearing detail behind the
 * animation. The position is a monotonic counter — 0, 1, 2, … — and the image
 * it refers to is `wrapIndex(position, count)`, so the ring wraps on READ while
 * the counter itself never does. That is what lets a cake be identified by the
 * position it occupies rather than by the image it happens to show:
 *
 *   position   …  7    8    9    10   11  …
 *   3 images      1    2    3    1    2
 *
 * Keying the rendered cakes by position means a step retires key 7 and
 * introduces key 10 while 8 and 9 survive and slide inward — one cake leaves,
 * one arrives, two move. Keying them by IMAGE index would break at exactly
 * three images, where the cake leaving on the left is the same image arriving
 * on the right: React would match them, and Framer would fly it back across
 * the stage instead of letting it go.
 */
export function heroStep(position: number, direction: 1 | -1): number {
  return position + direction;
}

/**
 * The one image worth fetching before it is needed: the next to enter the
 * RIGHT slot, i.e. two places past the centre.
 *
 * Null below four images, and that is a deliberate saving rather than an
 * omission. On a three-image hero every image is already on stage, so `c + 2`
 * is the cake sitting in the left slot — asking for it again would be a
 * request for something the browser has already painted. Four or more is the
 * first size where the next arrival is genuinely off-stage.
 *
 * Exactly ONE index is returned, never a list: the point is to cover the very
 * next step, not to warm the whole gallery.
 */
export function heroPreloadIndex(centre: number, count: number): number | null {
  if (count < 4) return null;
  return wrapIndex(centre + 2, count);
}

/**
 * THE WINDOW: which images are on stage when `centre` is centred.
 *
 * The short lists are not edge cases bolted on — they are the same rule with
 * fewer slots filled, and each one is what keeps the composition from lying:
 *
 *   0 images  nothing renders (the caller shows its fallback instead)
 *   1 image   centre only; both side slots stay empty
 *   2 images  #1 left, #2 centre; the right slot stays empty, because the
 *             only candidate for it is already on stage
 *   3+        the full window, wrapping in both directions
 *
 * `centre` is wrapped on the way in, so a stale index left over from a longer
 * list (the admin deleting images while the page is open) lands somewhere real
 * instead of blanking the hero.
 */
export function heroWindowAt(centre: number, count: number): HeroWindow {
  if (count <= 0) return NO_WINDOW;
  if (count === 1) return { ...NO_WINDOW, centre: 0 };
  if (count === 2) return { ...NO_WINDOW, left: 0, centre: 1 };

  const c = wrapIndex(centre, count);
  return {
    left: wrapIndex(c - 1, count),
    centre: c,
    right: wrapIndex(c + 1, count),
    preload: heroPreloadIndex(c, count),
  };
}

/** One cake on stage: which image it shows, where it stands, and the identity
 *  it keeps while it crosses. */
export type HeroStageCake = {
  /** React key. The POSITION, not the image — see heroStep for why that
   *  distinction is what makes the crossing animate correctly. */
  key: number;
  /** Index into the caller's image array. */
  index: number;
  slot: HeroSlot;
};

/**
 * The stage: every cake that should exist right now, in DOM order.
 *
 * A VIEW of the window, never a second copy of its rules — it is handed the
 * window rather than the position and count, so which images are on stage is
 * decided in exactly one place (heroWindowAt) and this only decides how to
 * render them. Empty slots are simply absent, so the list IS the mounted set
 * and the caller never has to skip a null: one to three entries, never more,
 * whatever `count` is.
 *
 * The key is the position each slot occupies on the ring, which is what keeps
 * a cake's identity stable while it crosses (see heroStep). The centre sits at
 * `position` by definition, so its neighbours are one step either side —
 * including for the one- and two-image stages, where the position never
 * changes because neither can rotate.
 */
export function heroStageFrom(slots: HeroWindow, position: number): HeroStageCake[] {
  const stage: HeroStageCake[] = [];
  if (slots.left !== null) stage.push({ key: position - 1, index: slots.left, slot: "left" });
  if (slots.centre !== null) stage.push({ key: position, index: slots.centre, slot: "centre" });
  if (slots.right !== null) stage.push({ key: position + 1, index: slots.right, slot: "right" });
  return stage;
}
