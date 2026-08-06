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
import { revalidateTag } from "next/cache";
import { TAGS } from "@/lib/cache-tags";
import { persistExtras } from "@/lib/product-variants";
import { PRODUCT_SIZES_EMBED } from "@/lib/product-pricing";
import { PRODUCT_SORTS, parseProductSort } from "@/lib/product-sort";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

// Only the columns the admin Products table actually renders. The size
// variants ride along so the table can show the price CUSTOMERS see (the
// default variant's, see lib/product-pricing) rather than the raw base price a
// sized product never charges. `product_sizes` is dropped from the select if
// the table isn't migrated — see the retry in GET.
const PRODUCT_COLS =
  "id,name,category,description,price,badge,image_url,in_stock,visible,allergens,sort_order";
const PRODUCT_COLS_WITH_SIZES = `${PRODUCT_COLS},${PRODUCT_SIZES_EMBED}`;

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  // Pagination — 20 per page by default so the table never loads the whole
  // catalogue at once. `count: exact` gives the total for the pager.
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Optional category filter for the Products page's dropdown. Applied in the
  // DB rather than in the browser so it narrows the WHOLE catalogue, not just
  // the 20 rows this page happens to hold — and so `count` (the pager) reports
  // the filtered total. Absent/blank = every category, exactly as before.
  const category = (url.searchParams.get("category") ?? "").trim();

  // Which order to return them in — see lib/product-sort for the options and
  // why the database rather than the browser does this. Unrecognised or absent
  // (every caller that predates the Sort dropdown) falls back to A→Z.
  const sort = PRODUCT_SORTS[parseProductSort(url.searchParams.get("sort"))];

  // Wrap the whole DB interaction so a client-level throw (e.g. the Supabase
  // host being unreachable — `TypeError: fetch failed`) returns a clean JSON
  // 500 instead of an unhandled raw stack trace.
  try {
    const supabase = adminDb();

    const run = (cols: string) => {
      let query = supabase
        .from("products")
        .select(cols, { count: "exact" })
        .order(sort.column, { ascending: sort.ascending });

      // Break ties by name so the order is TOTAL. Without this, two products at
      // £24.00 could swap places between requests, and since the table is
      // paginated a row that swapped across the boundary would appear on both
      // page 1 and page 2 — or on neither. Name is unique enough in a bakery
      // catalogue and exists on every deployment of this table.
      if (sort.column !== "name") query = query.order("name", { ascending: true });

      if (category) query = query.eq("category", category);

      return query.range(from, to);
    };

    // With sizes when the table exists; without it on a database where
    // 26_product_variants.sql hasn't been run (the list then shows base prices,
    // exactly as it did before).
    let res = await run(PRODUCT_COLS_WITH_SIZES);
    if (res.error) res = await run(PRODUCT_COLS);
    const { data, error, count } = res;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ products: data, total: count ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load products" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
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

    // Best-effort extras (ingredients, gallery images, size variants). Each is
    // tolerant of the 26_product_variants.sql migration not being run yet, so a
    // product still saves even when the new tables/column are absent.
    if (data?.id) {
      await persistExtras(supabase, data.id, body);
    }

    // Product catalogue changed: refresh the cached SEO reads (titles,
    // descriptions, sitemap entries) immediately rather than waiting out the
    // 1h window. See lib/cache-tags.
    revalidateTag(TAGS.products);
    return NextResponse.json({ product: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create product" },
      { status: 500 },
    );
  }
}
