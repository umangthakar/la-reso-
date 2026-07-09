// ============================================================
// RLS verification for `offers` — proves anon sees ACTIVE offers only.
// ------------------------------------------------------------
// Run AFTER supabase/sql/15_offers.sql is applied and .env.local has keys:
//
//   node scripts/test-offers-rls.mjs
//
// What it does (creates two throwaway offers, deletes them at the end):
//   1. Uses the SERVICE ROLE to create one ACTIVE and one INACTIVE offer.
//   2. Uses a plain ANON client and asserts:
//        - it CAN read the active offer
//        - it CANNOT read the inactive offer  (RLS gate: active = true)
//   3. Uses the SERVICE ROLE and asserts it sees BOTH (bypasses RLS).
//   4. Cleans up both test offers.
// Exits non-zero if any assertion fails.
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

const baseOffer = (title, active) => ({
  title,
  description: "RLS test offer — safe to delete",
  discount_type: "percentage",
  discount_value: 10,
  min_subtotal: 0,
  active,
});

async function main() {
  // 1. create one active + one inactive offer with the service role
  const { data: live, error: el } = await admin
    .from("offers").insert(baseOffer("rls_test_active", true)).select("id").single();
  const { data: hidden, error: eh } = await admin
    .from("offers").insert(baseOffer("rls_test_inactive", false)).select("id").single();
  if (el || eh) { console.error("Setup failed:", el || eh); process.exit(2); }
  console.log(`Created active=${live.id} and inactive=${hidden.id}\n`);

  // 2. anon sees the active offer, never the inactive one
  const { data: seesLive } = await anon.from("offers").select("id").eq("id", live.id);
  ok(seesLive?.length === 1, "anon CAN read an active offer");

  const { data: seesHidden } = await anon.from("offers").select("id").eq("id", hidden.id);
  ok((seesHidden?.length ?? 0) === 0, "anon CANNOT read an inactive offer (RLS gate)");

  // 3. service role sees both (bypasses RLS)
  const { data: adminSees } = await admin
    .from("offers").select("id").in("id", [live.id, hidden.id]);
  ok((adminSees?.length ?? 0) === 2, "service role sees BOTH offers (RLS bypassed)");

  // 4. cleanup
  await admin.from("offers").delete().in("id", [live.id, hidden.id]);
  console.log("\nCleaned up test offers.");

  console.log(`\n${failures === 0 ? "ALL RLS CHECKS PASSED ✅" : `${failures} CHECK(S) FAILED ❌`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
