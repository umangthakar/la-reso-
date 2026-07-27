"use client";

// ============================================================
// Le Rasa Bakery — fetch the NEXT hero image, once, ahead of time
// ------------------------------------------------------------
// Only three cakes exist in the DOM, so the image that will enter the right
// slot on the next step has never been requested when the step happens. Left
// alone, the visitor would watch that slot resolve from nothing every time the
// window moves. This asks for exactly one image early — the next arrival, and
// nothing beyond it — so the swap lands on a warm cache.
//
// WHY IT CANNOT JUST FETCH THE URL
//
// next/image never requests the original URL: it requests its own optimiser
// (/_next/image?url=…&w=…&q=…), one entry per candidate width. Fetching the
// raw Supabase URL here would warm a cache entry the <img> is never going to
// ask for — a whole extra download for no benefit. getImageProps() returns the
// exact src/srcSet/sizes the component will render, so the browser picks the
// same candidate now that it will pick later, and the second request is a
// cache hit.
//
// Nothing is rendered and nothing is returned: the fetch lives entirely in the
// browser cache, which is the only place the next <Image> will look for it.
// ============================================================

import { useEffect } from "react";
import { getImageProps } from "next/image";

/**
 * @param src   The image to fetch ahead, or null when there is nothing worth
 *              fetching (a hero whose images are all already on stage).
 * @param sizes The same `sizes` the cake renders with — see HERO_CAKE_SIZES.
 *              A different value here would select a different candidate and
 *              defeat the whole exercise.
 */
export function useHeroImagePreload(src: string | null, sizes: string): void {
  useEffect(() => {
    if (!src) return;

    // `fill` matches how the cake is rendered, so the generated candidate
    // widths line up with the ones the component will offer the browser.
    const { props } = getImageProps({ src, alt: "", fill: true, sizes });

    const img = new window.Image();
    img.decoding = "async";
    // srcSet and sizes BEFORE src: the browser resolves the candidate list at
    // the moment src is assigned, so setting it first would fetch the
    // fallback URL and ignore both.
    if (props.sizes) img.sizes = props.sizes;
    // `srcset`, lowercase: the DOM property is spelled the way the attribute
    // is, unlike React's camelCased `srcSet` prop.
    if (props.srcSet) img.srcset = props.srcSet;
    img.src = props.src;

    // No cleanup, and no abort on unmount: an in-flight image request is a few
    // KB in the worst case and cancelling it would throw away the very thing
    // this hook exists to have ready. The element itself is unreferenced the
    // moment the effect returns and is collected normally.
  }, [src, sizes]);
}
