// ============================================================
// Admin API — Stripe configuration (GET masked + PUT save)
// Service-role, password-gated. Stored on the single site_settings row
// under `stripe_config` as { publishable_key, secret_key_enc, mode }.
// The secret key is encrypted at rest (lib/crypto) and NEVER returned to
// the browser — GET only reports whether one is set, plus its last 4.
//
// Requires the column from supabase/sql/06_payments.sql.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

type StoredConfig = {
  publishable_key?: string;
  secret_key_enc?: string;
  mode?: "test" | "live";
};

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

async function loadConfig(
  supabase: SupabaseClient,
): Promise<{ id: string | null; config: StoredConfig }> {
  // Fetch the whole row rather than selecting `stripe_config` directly:
  // PostgREST's schema cache can lag a freshly-added column and reject a
  // targeted select with "column does not exist". Reading the full row and
  // pulling the field out avoids that, and tolerates the column being absent.
  const { data, error } = await supabase
    .from("site_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id?: string; stripe_config?: StoredConfig } | null;
  return {
    id: row?.id ?? null,
    config: (row?.stripe_config as StoredConfig) ?? {},
  };
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const { config } = await loadConfig(adminDb());
    let last4 = "";
    if (config.secret_key_enc) {
      try {
        const sk = decryptSecret(config.secret_key_enc);
        last4 = sk.slice(-4);
      } catch {
        last4 = "";
      }
    }
    return NextResponse.json({
      config: {
        publishable_key: config.publishable_key ?? "",
        mode: config.mode ?? "test",
        has_secret_key: Boolean(config.secret_key_enc),
        secret_key_last4: last4,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load config" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = await req.json();
  const supabase = adminDb();

  try {
    const { id, config: existing } = await loadConfig(supabase);

    const mode: "test" | "live" = body.mode === "live" ? "live" : "test";
    const publishable_key = String(body.publishable_key ?? "").trim();

    // If the secret field is left blank, keep the previously stored secret.
    const incomingSecret = String(body.secret_key ?? "").trim();
    const secret_key_enc = incomingSecret
      ? encryptSecret(incomingSecret)
      : existing.secret_key_enc;

    const stripe_config: StoredConfig = {
      publishable_key,
      mode,
      ...(secret_key_enc ? { secret_key_enc } : {}),
    };

    const result = id
      ? await supabase
          .from("site_settings")
          .update({ stripe_config })
          .eq("id", id)
          .select("id")
          .single()
      : await supabase
          .from("site_settings")
          .insert({ stripe_config })
          .select("id")
          .single();

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json({
      config: {
        publishable_key,
        mode,
        has_secret_key: Boolean(secret_key_enc),
        secret_key_last4: incomingSecret ? incomingSecret.slice(-4) : "",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save config" },
      { status: 500 },
    );
  }
}
