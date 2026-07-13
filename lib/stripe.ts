// ============================================================
// SERVER-ONLY Stripe helper — the single source of truth for every
// server-side Stripe client (checkout, orders, refunds).
//
// Precedence: the admin-panel config on the site_settings row
// (stripe_config.secret_key_enc, decrypted via lib/crypto) wins; the
// STRIPE_SECRET_KEY env var is the fallback for deployments that have
// never used the admin panel. NEVER import from the browser.
// ============================================================

import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto";

type StoredConfig = {
  publishable_key?: string;
  secret_key_enc?: string;
  mode?: "test" | "live";
};

// Memoise per secret key, so repeated requests reuse one Stripe client but a
// key changed in the admin panel takes effect on the next request.
let cached: { secret: string; stripe: Stripe } | null = null;

function clientFor(secret: string): Stripe {
  if (!cached || cached.secret !== secret) {
    cached = { secret, stripe: new Stripe(secret) };
  }
  return cached.stripe;
}

/** Live vs test inferred from the key itself (sk_live_… / rk_live_…). */
function inferMode(secret: string): "test" | "live" {
  return /_live_/.test(secret) ? "live" : "test";
}

/**
 * Build a Stripe client from the admin-panel config, falling back to the
 * env secret key. Throws a friendly error only when NEITHER is present.
 */
export async function getStripe(
  supabase: SupabaseClient,
): Promise<{ stripe: Stripe; mode: "test" | "live" }> {
  // Fetch the whole row instead of the `stripe_config` column directly —
  // PostgREST's schema cache can lag a freshly-added column and reject a
  // targeted select with "column does not exist". A read failure is not fatal
  // here: an env-only deployment must keep working with no DB row at all, so
  // we remember the error and only surface it if no key turns up anywhere.
  let config: StoredConfig = {};
  let readError: string | null = null;
  try {
    const { data, error } = await supabase
      .from("site_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) {
      readError = error.message;
    } else {
      const row = data as { stripe_config?: StoredConfig } | null;
      config = (row?.stripe_config as StoredConfig) ?? {};
    }
  } catch (e) {
    readError = e instanceof Error ? e.message : "Could not read site settings.";
  }

  // DB first, env second.
  const secret = config.secret_key_enc
    ? decryptSecret(config.secret_key_enc)
    : (process.env.STRIPE_SECRET_KEY ?? "").trim();

  if (!secret) {
    throw new Error(
      "No Stripe secret key configured. Add it in Stripe Settings first." +
        (readError ? ` (site settings unreadable: ${readError})` : ""),
    );
  }

  const mode: "test" | "live" =
    config.mode === "live" || config.mode === "test"
      ? config.mode
      : inferMode(secret);

  return { stripe: clientFor(secret), mode };
}
