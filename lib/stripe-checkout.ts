// ============================================================
// Le Rasa Bakery — server-side Stripe client for the customer
// checkout, keyed off the STRIPE_SECRET_KEY env var (separate from
// the admin panel's encrypted per-tenant config in lib/stripe.ts).
// Server-only — never import from a Client Component.
// ============================================================

import "server-only";
import Stripe from "stripe";

let cached: Stripe | null = null;

/** Build (and memoise) the Stripe client from the env secret key. */
export function getCheckoutStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY. Add it to .env.local (and Vercel) to take payments.",
    );
  }
  if (!cached) cached = new Stripe(key);
  return cached;
}
