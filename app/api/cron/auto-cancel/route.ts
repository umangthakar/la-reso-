// ============================================================
// Cron — auto-cancel Pending orders older than 24 hours (GET/POST)
// ------------------------------------------------------------
// A Pending order is one the owner hasn't accepted yet. If it sits
// unaccepted for 24h, the customer shouldn't be left waiting: this sweep
// cancels it AND refunds the customer (shared cancelAndRefund), then
// notifies both parties — exactly like a customer cancellation.
//
// Runs on a schedule (Vercel Cron — see vercel.json — every few minutes)
// and is safe to run as often as you like: it only ever touches orders
// that are BOTH status='pending' AND older than 24h, and cancelAndRefund
// is idempotent per order (a refunded order won't be double-refunded).
//
// AUTH — accepts any of:
//   • Vercel Cron's `Authorization: Bearer <CRON_SECRET>` (set CRON_SECRET
//     in the project env; Vercel sends it automatically), OR
//   • `?secret=<CRON_SECRET>` for manual/external triggering, OR
//   • the admin password header (lets the owner run it by hand).
// If CRON_SECRET is unset, only the admin header is accepted.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { cancelAndRefund } from "@/lib/order-lifecycle";

export const dynamic = "force-dynamic";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function isAuthorised(req: Request): boolean {
  if (isAuthedRequest(req)) return true; // admin running it by hand
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

async function runSweep(req: Request) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

  // Only pending orders older than the cutoff. select("*") so cancelAndRefund
  // has the fields it needs (email, name, payment intent, total).
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (error) {
    // A pre-27 database has no 'pending' orders at all — nothing to do.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = data ?? [];
  const results: { id: string; payment_status: string }[] = [];
  for (const order of orders) {
    const res = await cancelAndRefund(supabase, order, "auto");
    results.push({ id: String(order.id), payment_status: res.paymentStatus });
  }

  return NextResponse.json({ swept: results.length, cutoff, results });
}

export async function GET(req: Request) {
  return runSweep(req);
}

export async function POST(req: Request) {
  return runSweep(req);
}
