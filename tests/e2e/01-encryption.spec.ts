// ============================================================
// TASK 1 — ADMIN_ENCRYPTION_KEY.
//
// The Stripe SECRET key is stored encrypted on the site_settings row, so the
// master key that opens it is the most sensitive value in the deployment. Two
// things have to be true at once:
//
//   • ADMIN_ENCRYPTION_KEY must be the key NEW secrets are written with, so
//     rotating the Supabase service-role key cannot strand them; and
//   • secrets written BEFORE it existed — which is every secret on a
//     deployment that has been live — must keep opening, or introducing the
//     variable takes payments down.
//
// These tests drive lib/crypto.ts directly, swapping process.env between calls
// to reproduce each deployment state exactly.
// ============================================================

import { test, expect } from "@playwright/test";
// MUST come before lib/crypto — see the file for why.
import "./allow-server-only";
import { encryptSecret, decryptSecret } from "../../lib/crypto";
import { admin, env } from "./helpers";

/** Run a block with a specific env, restoring whatever was there before. */
function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const PRIMARY = "e2e-primary-admin-encryption-key-0123456789";
const LEGACY = "e2e-legacy-service-role-key-9876543210";
const SECRET = "sk_test_the_stripe_secret_key_under_test";

test.describe("Secret encryption", () => {
  test("ADMIN_ENCRYPTION_KEY is the key new secrets are written with", async () => {
    const token = withEnv(
      { ADMIN_ENCRYPTION_KEY: PRIMARY, SUPABASE_SERVICE_ROLE_KEY: LEGACY },
      () => encryptSecret(SECRET),
    );

    // Prove it by taking the legacy key away entirely: if the ciphertext had
    // been produced with the service-role key it could not open now.
    const opened = withEnv(
      { ADMIN_ENCRYPTION_KEY: PRIMARY, SUPABASE_SERVICE_ROLE_KEY: undefined },
      () => decryptSecret(token),
    );
    expect(opened).toBe(SECRET);
  });

  test("a secret written BEFORE ADMIN_ENCRYPTION_KEY existed still opens after it is set", async () => {
    // The state every live deployment is in: encrypted with the service-role
    // key, because that was the only master secret at the time.
    const legacyToken = withEnv(
      { ADMIN_ENCRYPTION_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: LEGACY },
      () => encryptSecret(SECRET),
    );

    // Now the operator introduces ADMIN_ENCRYPTION_KEY. This is the moment
    // that would break payments if decryption did not fall back.
    const opened = withEnv(
      { ADMIN_ENCRYPTION_KEY: PRIMARY, SUPABASE_SERVICE_ROLE_KEY: LEGACY },
      () => decryptSecret(legacyToken),
    );
    expect(opened).toBe(SECRET);
  });

  test("re-saving a secret migrates it onto the primary key", async () => {
    const legacyToken = withEnv(
      { ADMIN_ENCRYPTION_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: LEGACY },
      () => encryptSecret(SECRET),
    );

    const rewritten = withEnv(
      { ADMIN_ENCRYPTION_KEY: PRIMARY, SUPABASE_SERVICE_ROLE_KEY: LEGACY },
      () => encryptSecret(decryptSecret(legacyToken)),
    );

    // After a re-save the service-role key is no longer needed at all, which
    // is what makes rotating it safe.
    const opened = withEnv(
      { ADMIN_ENCRYPTION_KEY: PRIMARY, SUPABASE_SERVICE_ROLE_KEY: undefined },
      () => decryptSecret(rewritten),
    );
    expect(opened).toBe(SECRET);
  });

  test("a wrong key fails closed and never leaks key material", async () => {
    const token = withEnv(
      { ADMIN_ENCRYPTION_KEY: PRIMARY, SUPABASE_SERVICE_ROLE_KEY: undefined },
      () => encryptSecret(SECRET),
    );

    let message = "";
    try {
      withEnv(
        { ADMIN_ENCRYPTION_KEY: "a-completely-different-key", SUPABASE_SERVICE_ROLE_KEY: undefined },
        () => decryptSecret(token),
      );
      throw new Error("decryption should have failed");
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }

    // GCM authenticates, so a wrong key throws rather than returning garbage.
    expect(message).toContain("Could not decrypt");
    expect(message).not.toContain(PRIMARY);
    expect(message).not.toContain(SECRET);
    expect(message).not.toContain(token);
  });

  test("tampered ciphertext is rejected", async () => {
    const token = withEnv(
      { ADMIN_ENCRYPTION_KEY: PRIMARY, SUPABASE_SERVICE_ROLE_KEY: LEGACY },
      () => encryptSecret(SECRET),
    );
    // Flip the last byte of the payload.
    const [tag, payload] = token.split(":");
    const raw = Buffer.from(payload, "base64");
    raw[raw.length - 1] ^= 0xff;
    const tampered = `${tag}:${raw.toString("base64")}`;

    expect(() =>
      withEnv(
        { ADMIN_ENCRYPTION_KEY: PRIMARY, SUPABASE_SERVICE_ROLE_KEY: LEGACY },
        () => decryptSecret(tampered),
      ),
    ).toThrow();
  });

  test("THIS deployment's stored Stripe key opens under the current env", async () => {
    // The one that matters: not a synthetic round-trip but the real ciphertext
    // sitting on site_settings right now, opened with the real environment.
    const { data } = await admin().from("site_settings").select("*").limit(1).maybeSingle();
    const stored = (data as { stripe_config?: { secret_key_enc?: string } } | null)
      ?.stripe_config?.secret_key_enc;
    test.skip(!stored, "no Stripe key stored in the admin panel on this deployment");

    const e = env();
    const opened = withEnv(
      {
        ADMIN_ENCRYPTION_KEY: e.ADMIN_ENCRYPTION_KEY,
        SUPABASE_SERVICE_ROLE_KEY: e.SUPABASE_SERVICE_ROLE_KEY,
      },
      () => decryptSecret(stored!),
    );
    expect(opened.startsWith("sk_test_") || opened.startsWith("rk_test_")).toBe(true);
  });
});
