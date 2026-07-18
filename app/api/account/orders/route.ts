// ============================================================
// GET /api/account/orders
// Returns the signed-in customer's orders WITH their line items, so the
// My Orders list AND the order-details view render from a single fetch
// (no per-order detail calls). Authenticates via the Supabase session
// cookie (trusted, verified email), then reads with the service role —
// this works regardless of whether the orders email RLS policy has been
// applied to the database.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type OrderRecord = Record<string, unknown>;
type ItemRecord = {
  order_id: string;
  product_name?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
  line_total?: number | null;
  addons_total?: number | null;
  product_id?: string | null;
  products?: { image_url?: string | null } | null;
};

/** Read a numeric-ish field defensively (columns may differ across DBs). */
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export async function GET() {
  // 1) Who is calling? Read the verified email from the session.
  let email: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!email) {
    return NextResponse.json({ orders: [] });
  }

  // 2) Read that customer's orders with the service role (bypasses RLS),
  //    scoped strictly to their own verified email. `select("*")` keeps this
  //    resilient to schema drift (discount/coupon columns may or may not
  //    exist) — we pick the fields we expose below rather than 500 on a
  //    missing column.
  let admin: SupabaseClient;
  try {
    admin = createAdminClient() as unknown as SupabaseClient;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Server not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("orders")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orderRows = (data ?? []) as OrderRecord[];
  const ids = orderRows.map((o) => String(o.id)).filter(Boolean);

  // 3) Line items for those orders, with the product image when available.
  //    Falls back to a plain select if the products relation can't be joined
  //    (e.g. an older PostgREST schema cache) so items still load.
  const itemsByOrder = new Map<string, ItemRecord[]>();
  if (ids.length > 0) {
    let itemRows: ItemRecord[] = [];
    const withImg = await admin
      .from("order_items")
      .select("order_id,product_name,unit_price,quantity,line_total,product_id,products(image_url)")
      .in("order_id", ids);
    if (!withImg.error && Array.isArray(withImg.data)) {
      itemRows = withImg.data as unknown as ItemRecord[];
    } else {
      const plain = await admin
        .from("order_items")
        .select("order_id,product_name,unit_price,quantity,line_total,product_id")
        .in("order_id", ids);
      itemRows = (plain.data ?? []) as unknown as ItemRecord[];
    }
    for (const it of itemRows) {
      const key = String(it.order_id);
      if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
      itemsByOrder.get(key)!.push(it);
    }
  }

  // 4) Shape the response: only the fields the account UI needs (never the
  //    tracking token or raw payment-intent id).
  const orders = orderRows.map((o) => {
    const id = String(o.id);
    const items = (itemsByOrder.get(id) ?? []).map((it) => ({
      product_name: str(it.product_name) ?? "Item",
      unit_price: num(it.unit_price) ?? 0,
      quantity: num(it.quantity) ?? 1,
      line_total: num(it.line_total),
      image: str(it.products?.image_url ?? null),
    }));
    return {
      id,
      status: str(o.status) ?? "received",
      created_at: o.created_at ?? null,
      delivery_date: o.delivery_date ?? null,
      subtotal: num(o.subtotal),
      delivery_charge: num(o.delivery_charge),
      discount_amount: num(o.discount_amount) ?? 0,
      coupon_code: str(o.coupon_code),
      total: num(o.total),
      amount: num(o.amount),
      customer_name: str(o.customer_name),
      email: str(o.email),
      phone: str(o.phone),
      delivery_address: str(o.delivery_address),
      postcode: str(o.postcode),
      special_instructions: str(o.special_instructions) ?? str(o.message),
      payment_method: str(o.payment_method),
      items,
    };
  });

  return NextResponse.json({ orders });
}
