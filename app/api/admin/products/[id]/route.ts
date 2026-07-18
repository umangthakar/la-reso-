// ============================================================
// Admin API — single product: full update (PUT), partial update for
// toggles (PATCH), and delete (DELETE). Service-role, password-gated.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { persistExtras } from "@/lib/product-variants";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = await req.json();
  const supabase = adminDb();

  const { data, error } = await supabase
    .from("products")
    .update({
      name: body.name,
      category: body.category || null,
      description: body.description || null,
      price: Number(body.price) || 0,
      badge: body.badge || null,
      image_url: body.image_url || null,
      in_stock: body.in_stock ?? true,
      visible: body.visible ?? true,
      allergens: body.allergens || null,
    })
    .eq("id", params.id)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort extras — ingredients, gallery images, size variants. Only the
  // keys the form sends are touched; migration-tolerant so an un-migrated DB
  // still saves the core product fields.
  await persistExtras(supabase, params.id, body);

  return NextResponse.json({ product: data });
}

// Partial update — used by the Visible / In Stock toggles. Only the
// fields present in the body are written.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = await req.json();
  const allowed = ["visible", "in_stock", "sort_order", "badge"] as const;
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = adminDb();
  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", params.id)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const supabase = adminDb();
  const { error } = await supabase.from("products").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
