// ============================================================
// Admin API — delivery settings (GET + PUT)
// Service-role, password-gated. Reads/writes the delivery columns on
// the single site_settings row:
//   delivery_zones (jsonb), lead_time_days (int), blocked_dates (jsonb),
//   delivery_days (jsonb), daily_order_cap (int | null).
//
// These columns are added by supabase/sql/05_delivery_settings.sql —
// run that ONCE in the Supabase SQL Editor or these calls will error.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const ALL_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const DELIVERY_COLS =
  "delivery_zones, lead_time_days, blocked_dates, delivery_days, daily_order_cap";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

type Zone = { id: string; name: string; postcode_prefix: string; fee: number };

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const supabase = adminDb();
  const { data, error } = await supabase
    .from("site_settings")
    .select(DELIVERY_COLS)
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = (data ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    settings: {
      delivery_zones: Array.isArray(row.delivery_zones) ? row.delivery_zones : [],
      lead_time_days:
        typeof row.lead_time_days === "number" ? row.lead_time_days : 3,
      blocked_dates: Array.isArray(row.blocked_dates) ? row.blocked_dates : [],
      delivery_days: Array.isArray(row.delivery_days)
        ? row.delivery_days
        : ALL_DAYS,
      daily_order_cap:
        typeof row.daily_order_cap === "number" ? row.daily_order_cap : null,
    },
  });
}

export async function PUT(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = await req.json();

  // Sanitise / normalise the incoming payload before persisting.
  const fields = sanitise(body);

  const supabase = adminDb();

  // Find the existing singleton row, if any.
  const existing = await supabase
    .from("site_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  const result = existing.data?.id
    ? await supabase
        .from("site_settings")
        .update(fields)
        .eq("id", existing.data.id)
        .select(DELIVERY_COLS)
        .single()
    : await supabase
        .from("site_settings")
        .insert(fields)
        .select(DELIVERY_COLS)
        .single();

  if (result.error)
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ settings: result.data });
}

function sanitise(body: Record<string, unknown>) {
  const zones: Zone[] = Array.isArray(body.delivery_zones)
    ? (body.delivery_zones as unknown[])
        .map((z) => {
          const o = (z ?? {}) as Record<string, unknown>;
          return {
            id: String(o.id ?? crypto.randomUUID()),
            name: String(o.name ?? "").trim(),
            postcode_prefix: String(o.postcode_prefix ?? "")
              .trim()
              .toUpperCase(),
            fee: Number.isFinite(Number(o.fee)) ? Number(o.fee) : 0,
          };
        })
        .filter((z) => z.name !== "")
    : [];

  const blocked: string[] = Array.isArray(body.blocked_dates)
    ? Array.from(
        new Set(
          (body.blocked_dates as unknown[])
            .map((d) => String(d))
            .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
        ),
      ).sort()
    : [];

  const days: string[] = Array.isArray(body.delivery_days)
    ? ALL_DAYS.filter((d) => (body.delivery_days as unknown[]).includes(d))
    : ALL_DAYS;

  const lead = Math.max(0, Math.trunc(Number(body.lead_time_days)) || 0);

  let cap: number | null = null;
  if (body.daily_order_cap !== null && body.daily_order_cap !== undefined && body.daily_order_cap !== "") {
    const n = Math.trunc(Number(body.daily_order_cap));
    cap = Number.isFinite(n) && n > 0 ? n : null;
  }

  return {
    delivery_zones: zones,
    lead_time_days: lead,
    blocked_dates: blocked,
    delivery_days: days,
    daily_order_cap: cap,
  };
}
