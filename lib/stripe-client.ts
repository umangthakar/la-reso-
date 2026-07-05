"use client";

// ============================================================
// Le Rasa Bakery — browser Stripe.js loader (singleton).
// Uses the publishable key from the environment. Safe to expose.
// ============================================================

import { loadStripe, type Stripe } from "@stripe/stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromise: Promise<Stripe | null> | null = null;

/** Lazily load (and memoise) the Stripe.js instance. */
export function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = publishableKey
      ? loadStripe(publishableKey)
      : Promise.resolve(null);
  }
  return stripePromise;
}

/** True when a publishable key is configured (checkout can run). */
export const stripeConfigured = Boolean(publishableKey);
