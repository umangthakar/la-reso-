// ============================================================
// Admin API — products list (GET) + create (POST)
// Service-role, password-gated. Live products schema (after the
// 03_admin_product_columns.sql migration): id, name, category,
// description, price, image_url, badge, in_stock, visible,
// allergens, sort_order, created_at.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

// Only the columns the admin Products table actually renders.
const PRODUCT_COLS =
  "id,name,category,description,price,badge,image_url,in_stock,visible,allergens,sort_order";

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const supabase = adminDb();

  // Pagination — 20 per page by default so the table never loads the whole
  // catalogue at once. `count: exact` gives the total for the pager.
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Prefer manual sort_order; fall back to created_at if the migration
  // hasn't been run yet, so the panel still works before columns exist.
  let { data, error, count } = await supabase
    .from("products")
    .select(PRODUCT_COLS, { count: "exact" })
    .order("sort_order", { ascending: true })
    .range(from, to);

  if (error) {
    ({ data, error, count } = await supabase
      .from("products")
      .select(PRODUCT_COLS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data, total: count ?? 0 });
}

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = await req.json();
  const supabase = adminDb();

  const { data, error } = await supabase
    .from("products")
    .insert({
      name: body.name,
      category: body.category || null,
      description: body.description || null,
      price: Number(body.price) || 0,
      badge: body.badge || null,
      image_url: body.image_url || null,
      in_stock: body.in_stock ?? true,
      visible: body.visible ?? true,
      allergens: body.allergens || null,
      sort_order: Number(body.sort_order) || 0,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}
