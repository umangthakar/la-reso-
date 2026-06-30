// ============================================================
// Admin API — categories derived from the products.category text column.
// GET  → unique category names with product counts.
// POST → rename a category (updates every product using it).
// Service-role, password-gated.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const supabase = adminDb();
  const { data, error } = await supabase.from("products").select("category");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const c = (row as { category: string | null }).category;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const categories = Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  return NextResponse.json({ categories });
}

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { oldName, newName } = await req.json();
  if (!oldName || !newName || !String(newName).trim()) {
    return NextResponse.json({ error: "Both old and new names are required" }, { status: 400 });
  }

  const supabase = adminDb();
  const { error } = await supabase
    .from("products")
    .update({ category: String(newName).trim() })
    .eq("category", oldName);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
