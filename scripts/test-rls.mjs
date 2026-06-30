// ============================================================
// RLS verification — proves a tracking_token returns ONLY its own order.
// ------------------------------------------------------------
// Run AFTER both SQL files are applied and .env.local has keys:
//
//   node scripts/test-rls.mjs
//
// What it does (no schema mutation beyond two throwaway test orders,
// which it deletes at the end):
//   1. Uses the SERVICE ROLE to create two orders A and B.
//   2. Uses an ANON client carrying A's x-tracking-token header and asserts:
//        - it CAN read order A
//        - it CANNOT read order B  (RLS isolation)
//        - it CAN read A's order_status_history, NOT B's
//        - listing orders with no token returns nothing
//   3. Cleans up both test orders.
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
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✅ PASS" : "❌ FAIL"}  ${msg}`);
  if (!cond) failures++;
};

const baseOrder = (name) => ({
  customer_name: name,
  customer_email: `${name}@example.test`,
  customer_phone: "+44 7000 000000",
  delivery_address: { line1: "1 Test St", city: "London", postcode: "SW1A 1AA" },
  subtotal: 10,
  total: 10,
  delivery_date: "2099-01-01",
});

async function main() {
  // 1. create two orders with the service role (RLS bypassed)
  const { data: a, error: ea } = await admin
    .from("orders").insert(baseOrder("rls_test_a")).select("id, tracking_token").single();
  const { data: b, error: eb } = await admin
    .from("orders").insert(baseOrder("rls_test_b")).select("id, tracking_token").single();
  if (ea || eb) { console.error("Setup failed:", ea || eb); process.exit(2); }
  console.log(`Created order A=${a.id} and B=${b.id}\n`);

  // 2. anon client carrying A's tracking token
  const asA = createClient(URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { "x-tracking-token": a.tracking_token } },
  });

  const { data: seesA } = await asA.from("orders").select("id").eq("id", a.id);
  ok(seesA?.length === 1, "token A can read its OWN order (A)");

  const { data: seesB } = await asA.from("orders").select("id").eq("id", b.id);
  ok((seesB?.length ?? 0) === 0, "token A CANNOT read someone else's order (B)");

  const { data: allOrders } = await asA.from("orders").select("id");
  ok((allOrders?.length ?? 0) === 1, "token A only sees exactly 1 order total (no leakage)");

  // status history isolation (trigger auto-creates a 'received' row per order)
  const { data: histA } = await asA.from("order_status_history").select("id").eq("order_id", a.id);
  ok((histA?.length ?? 0) >= 1, "token A can read its OWN status history");

  const { data: histB } = await asA.from("order_status_history").select("id").eq("order_id", b.id);
  ok((histB?.length ?? 0) === 0, "token A CANNOT read order B's status history");

  // anon with NO token sees nothing
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: noneSeen } = await anon.from("orders").select("id");
  ok((noneSeen?.length ?? 0) === 0, "anon with NO tracking token sees no orders");

  // 3. cleanup
  await admin.from("orders").delete().in("id", [a.id, b.id]);
  console.log("\nCleaned up test orders.");

  console.log(`\n${failures === 0 ? "ALL RLS CHECKS PASSED ✅" : `${failures} CHECK(S) FAILED ❌`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
