// ============================================================
// SERVER-ONLY Stripe helper.
// Loads the encrypted Stripe secret key from the site_settings row,
// decrypts it (lib/crypto) and returns a ready Stripe client. Callers
// must already have verified admin auth. NEVER import from the browser.
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

/**
 * Build a Stripe client from the stored config. Throws a friendly error
 * if no secret key has been configured yet.
 */
export async function getStripe(
  supabase: SupabaseClient,
): Promise<{ stripe: Stripe; mode: "test" | "live" }> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("stripe_config")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const config = (data?.stripe_config as StoredConfig) ?? {};
  if (!config.secret_key_enc) {
    throw new Error(
      "No Stripe secret key configured. Add it in Stripe Settings first.",
    );
  }
  const secret = decryptSecret(config.secret_key_enc);
  return { stripe: new Stripe(secret), mode: config.mode === "live" ? "live" : "test" };
}
