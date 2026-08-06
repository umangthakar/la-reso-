// ============================================================
// PREFLIGHT — is this deployment actually configured for reliability?
//
// Every other spec in this suite tests behaviour. This one tests the WIRING,
// because the failure mode that matters most in production is silent: the app
// keeps taking payments perfectly well while the safety net behind it is not
// installed. A missing webhook secret, or a migration that half-applied, looks
// exactly like a healthy system right up until the first customer closes their
// tab.
//
// It runs first (filename order) so a misconfiguration is reported as itself
// rather than as a pile of confusing failures downstream.
// ============================================================

import { test, expect } from "@playwright/test";
import { admin, env, uniqueIndexEnforced, hasColumn } from "./helpers";

test.describe("Preflight — configuration and migrations", () => {
  test("STRIPE_WEBHOOK_SECRET is configured", async () => {
    const secret = env().STRIPE_WEBHOOK_SECRET ?? "";
    expect(
      secret,
      "without this the webhook rejects every delivery, so a payment whose " +
        "browser never saved the order is NOT recovered",
    ).not.toBe("");
    expect(secret.startsWith("whsec_"), "should be a Stripe signing secret").toBe(true);
  });

  test("ADMIN_ENCRYPTION_KEY is the primary encryption key", async () => {
    const e = env();
    expect(
      e.ADMIN_ENCRYPTION_KEY ?? "",
      "unset means admin secrets are encrypted with the service-role key, so " +
        "rotating that key would strand the stored Stripe secret",
    ).not.toBe("");
    expect(e.ADMIN_ENCRYPTION_KEY).not.toBe(e.SUPABASE_SERVICE_ROLE_KEY);
  });

  test("Stripe is in TEST mode — this suite must never touch live money", async () => {
    const { data } = await admin().from("site_settings").select("*").limit(1).maybeSingle();
    const cfg = (data as { stripe_config?: { mode?: string; publishable_key?: string } } | null)
      ?.stripe_config;
    const publishable = cfg?.publishable_key ?? env().NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
    expect(publishable.startsWith("pk_test_")).toBe(true);
    if (cfg?.mode) expect(cfg.mode).toBe("test");
  });

  test("44_stripe_webhook.sql — checkout_drafts exists", async () => {
    const { error } = await admin().from("checkout_drafts").select("payment_intent_id").limit(1);
    expect(error, error?.message).toBeNull();
  });

  test("44_stripe_webhook.sql — stripe_webhook_events exists", async () => {
    const { error } = await admin().from("stripe_webhook_events").select("event_id").limit(1);
    expect(error, error?.message).toBeNull();
  });

  test("44_stripe_webhook.sql — stripe_webhook_events.handled_at exists", async () => {
    expect(
      await hasColumn("stripe_webhook_events", "handled_at"),
      "without the completion marker, a handler killed mid-flight (serverless " +
        "timeout, deploy, OOM) leaves the event claimed — Stripe's retry is then " +
        "dismissed as a duplicate and that order is lost for good",
    ).toBe(true);
  });

  test("44_stripe_webhook.sql — orders.stripe_payment_intent is UNIQUE", async () => {
    // Probed by actually trying to insert the same intent twice, because the
    // index cannot be read through PostgREST. Both rows are removed either way.
    expect(
      await uniqueIndexEnforced(),
      "the unique index on orders.stripe_payment_intent is MISSING. The app " +
        "still checks for an existing order before inserting, but a check-then-" +
        "insert can be raced: the browser and a webhook delivery landing in the " +
        "same instant can both pass the check and write TWO orders for one " +
        "payment. Run supabase/sql/44_stripe_webhook.sql.",
    ).toBe(true);
  });
});
