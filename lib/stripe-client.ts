"use client";

// ============================================================
// Le Rasa Bakery — browser Stripe.js loader (memoised per key).
//
// The key is passed in by the caller — normally settings.stripe_publishable_key
// from useSiteSettings(), which prefers the admin-panel config and falls back
// to the env var. It defaults to the env var so callers that don't pass one
// keep their previous behaviour. Publishable keys are safe to expose.
// ============================================================

import { loadStripe, type Stripe } from "@stripe/stripe-js";

// One promise per distinct key, so Stripe.js loads once and the <Elements>
// `stripe` prop keeps a stable identity across re-renders.
const promises = new Map<string, Promise<Stripe | null>>();
const NONE: Promise<Stripe | null> = Promise.resolve(null);

/** Lazily load (and memoise) Stripe.js for the given publishable key. */
export function getStripePromise(
  key: string = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
): Promise<Stripe | null> {
  const k = (key ?? "").trim();
  if (!k) return NONE;

  let p = promises.get(k);
  if (!p) {
    p = loadStripe(k);
    promises.set(k, p);
  }
  return p;
}
