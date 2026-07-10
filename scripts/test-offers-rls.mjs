// ============================================================
// RLS + constraint verification for the offer schema.
// ------------------------------------------------------------
// Run AFTER supabase/sql/15_offers.sql is applied and .env.local has keys:
//
//   node scripts/test-offers-rls.mjs
//
// Asserts the invariants the app code depends on:
//   1. anon CAN read an enabled, non-coupon offer.
//   2. anon CANNOT read a disabled offer.
//   3. anon CANNOT read a coupon offer (they must not be enumerable) …
//   4. … but validate_coupon() resolves it by code for anon.
//   5. anon CAN read offer_category_rules (the coupon preview needs them).
//   6. anon CANNOT read offer_emails (the allowlist is private).
//   7. the service role sees every offer (RLS bypassed).
//   8. a second overlapping enabled non-stackable offer is rejected with
//      SQLSTATE 23P01 — the exclusion constraint …
//   9. … while an overlapping *coupon* is allowed (coupons are exempt).
//
// Test offers live in a far-future window (year 2999) so they can never
// collide with a real active offer on a live database. Everything is deleted
// at the end. Exits non-zero if any assertion fails.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// --- tiny .env.local loader (no dotenv dependency) ---
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* rely on real env vars if no .env.local */
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✅ PASS" : "❌ FAIL"}  ${msg}`);
  if (!cond) failures++;
};

// A window far enough out that it never overlaps a real offer.
const START = "2999-01-01T00:00:00Z";
const END = "2999-12-31T23:59:59Z";

const SUFFIX = Math.random().toString(36).slice(2, 8).toUpperCase();
const COUPON_CODE = `RLSTEST${SUFFIX}`;

const percentage = (name, overrides = {}) => ({
  name,
  type: "percentage",
  percentage_value: 10,
  eligibility_scope: "all",
  audience: "everyone",
  stackable: false,
  start_at: START,
  end_at: END,
  ...overrides,
});

async function main() {
  const created = [];
  const track = (row) => {
    if (row?.id) created.push(row.id);
    return row;
  };

  const cleanup = async () => {
    if (created.length) await admin.from("offers").delete().in("id", created);
  };

  try {
    // --- setup -------------------------------------------------------
    const { data: live, error: eLive } = await admin
      .from("offers").insert(percentage("rls_test_enabled", { enabled: true })).select("id").single();
    const { data: hidden, error: eHidden } = await admin
      .from("offers").insert(percentage("rls_test_disabled", { enabled: false })).select("id").single();
    const { data: coupon, error: eCoupon } = await admin
      .from("offers").insert({
        name: "rls_test_coupon",
        type: "coupon",
        enabled: true,
        stackable: false,
        coupon_code: COUPON_CODE,
        coupon_discount_type: "percentage",
        percentage_value: 10,
        eligibility_scope: "all",
        audience: "everyone",
        start_at: START,
        end_at: END,
      }).select("id").single();

    if (eLive || eHidden) {
      console.error("Setup failed:", eLive || eHidden);
      await cleanup();
      process.exit(2);
    }
    track(live); track(hidden); track(coupon);

    // 9. an overlapping COUPON must be allowed alongside the enabled
    //    non-stackable percentage offer (the constraint exempts coupons).
    ok(!eCoupon, "an overlapping enabled coupon coexists with a non-stackable offer");
    if (eCoupon) console.error("   →", eCoupon.message);

    console.log("");

    // --- 1/2/3. anon visibility of offers -----------------------------
    const { data: seesLive } = await anon.from("offers").select("id").eq("id", live.id);
    ok(seesLive?.length === 1, "anon CAN read an enabled non-coupon offer");

    const { data: seesHidden } = await anon.from("offers").select("id").eq("id", hidden.id);
    ok((seesHidden?.length ?? 0) === 0, "anon CANNOT read a disabled offer");

    if (coupon) {
      const { data: seesCoupon } = await anon.from("offers").select("id").eq("id", coupon.id);
      ok((seesCoupon?.length ?? 0) === 0, "anon CANNOT enumerate a coupon offer");

      // --- 4. …but validate_coupon() resolves it by code --------------
      const { data: rpc, error: eRpc } = await anon.rpc("validate_coupon", { code: COUPON_CODE });
      const row = Array.isArray(rpc) ? rpc[0] : rpc;
      ok(!eRpc && row?.id === coupon.id, "anon validate_coupon() resolves the coupon by code");
      if (eRpc) console.error("   →", eRpc.message);

      const { data: rpcBad } = await anon.rpc("validate_coupon", { code: `${COUPON_CODE}_NOPE` });
      ok((Array.isArray(rpcBad) ? rpcBad.length : rpcBad ? 1 : 0) === 0, "anon validate_coupon() returns nothing for a wrong code");

      // --- 5/6. child-table visibility --------------------------------
      await admin.from("offer_category_rules").insert({ offer_id: coupon.id, category: "Cakes", mode: "include" });
      const { data: seesRules } = await anon
        .from("offer_category_rules").select("category").eq("offer_id", coupon.id);
      ok((seesRules?.length ?? 0) === 1, "anon CAN read offer_category_rules");

      await admin.from("offer_emails").insert({ offer_id: coupon.id, email: "rls@example.com" });
      const { data: seesEmails } = await anon
        .from("offer_emails").select("email").eq("offer_id", coupon.id);
      ok((seesEmails?.length ?? 0) === 0, "anon CANNOT read offer_emails (private allowlist)");
    }

    // --- 7. service role bypasses RLS ---------------------------------
    const { data: adminSees } = await admin.from("offers").select("id").in("id", created);
    ok((adminSees?.length ?? 0) === created.length, "service role sees every offer (RLS bypassed)");

    // --- 8. exclusion constraint ---------------------------------------
    const { data: clash, error: eClash } = await admin
      .from("offers").insert(percentage("rls_test_clash", { enabled: true })).select("id").single();
    track(clash);
    ok(
      !!eClash && (eClash.code === "23P01" || /exclusion|one_active_non_stackable_offer/i.test(eClash.message ?? "")),
      "a second overlapping enabled non-stackable offer is rejected (23P01)",
    );
    if (!eClash) console.error("   → expected a conflict, but the insert succeeded");

    await cleanup();
    console.log("\nCleaned up test offers.");
  } catch (e) {
    await cleanup();
    throw e;
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED ✅" : `${failures} CHECK(S) FAILED ❌`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
