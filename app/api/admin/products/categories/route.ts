// ============================================================
// Admin API — category management.
//
// Categories live in two places, unioned here:
//   • products.category ....... the category each product is filed under
//   • site_settings.categories  an ordered jsonb string[] the admin curates,
//                               so empty categories (0 products) can exist.
//
// GET    → union of both, each with a product count (persisted order first).
// POST   → rename a category (updates every product + the persisted list).
// PUT    → add a new (empty) category to the persisted list.
// DELETE → remove a category from the persisted list — only when 0 products
//          use it (rename first if you want to move the products).
//
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

// --- product counts, keyed by category name --------------------------------
async function productCounts(
  supabase: SupabaseClient,
): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("products").select("category");
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const c = (row as { category: string | null }).category;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return counts;
}

// --- the admin-curated ordered list from site_settings.categories ----------
// Returns { id, list }. `id` is null when no settings row exists yet.
async function persistedCategories(
  supabase: SupabaseClient,
): Promise<{ id: string | null; list: string[] }> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("id,categories")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const list = Array.isArray(data?.categories)
    ? (data!.categories as unknown[]).filter(
        (c): c is string => typeof c === "string" && c.trim() !== "",
      )
    : [];
  return { id: data?.id ?? null, list };
}

async function saveCategories(
  supabase: SupabaseClient,
  id: string | null,
  list: string[],
): Promise<void> {
  // De-dupe case-insensitively while preserving order.
  const seen = new Set<string>();
  const clean = list.filter((c) => {
    const k = c.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const result = id
    ? await supabase.from("site_settings").update({ categories: clean }).eq("id", id)
    : await supabase.from("site_settings").insert({ categories: clean });
  if (result.error) throw new Error(result.error.message);
}

// GET — union of persisted list + product-derived categories, with counts.
export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const supabase = adminDb();
    const counts = await productCounts(supabase);
    const { list } = await persistedCategories(supabase);

    const seen = new Set<string>();
    const ordered: { name: string; count: number }[] = [];
    // Persisted (admin-ordered) first…
    for (const name of list) {
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      ordered.push({ name, count: counts.get(name) ?? 0 });
    }
    // …then any category that exists only because products use it, alpha.
    const extras = Array.from(counts.keys())
      .filter((name) => !seen.has(name.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    for (const name of extras) ordered.push({ name, count: counts.get(name) ?? 0 });

    return NextResponse.json({ categories: ordered });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load categories" },
      { status: 500 },
    );
  }
}

// POST — rename a category across all its products and the persisted list.
export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { oldName, newName } = await req.json();
  const next = String(newName ?? "").trim();
  if (!oldName || !next) {
    return NextResponse.json({ error: "Both old and new names are required" }, { status: 400 });
  }

  try {
    const supabase = adminDb();
    // Move every product filed under the old name.
    const upd = await supabase
      .from("products")
      .update({ category: next })
      .eq("category", oldName);
    if (upd.error) throw new Error(upd.error.message);

    // Reflect the rename in the persisted list (preserve position; drop the
    // old name if the new one is already present so we don't duplicate).
    const { id, list } = await persistedCategories(supabase);
    if (list.some((c) => c === oldName || c === next)) {
      const renamed = list.map((c) => (c === oldName ? next : c));
      await saveCategories(supabase, id, renamed);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Rename failed" },
      { status: 500 },
    );
  }
}

// PUT — add a new empty category to the persisted list.
export async function PUT(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { name } = await req.json();
  const clean = String(name ?? "").trim();
  if (!clean) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  try {
    const supabase = adminDb();
    const counts = await productCounts(supabase);
    const { id, list } = await persistedCategories(supabase);

    const exists =
      list.some((c) => c.toLowerCase() === clean.toLowerCase()) ||
      Array.from(counts.keys()).some((c) => c.toLowerCase() === clean.toLowerCase());
    if (exists) {
      return NextResponse.json({ error: "That category already exists." }, { status: 409 });
    }

    await saveCategories(supabase, id, [...list, clean]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add category" },
      { status: 500 },
    );
  }
}

// DELETE — remove a category, but only when no products use it.
export async function DELETE(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { name } = await req.json();
  const target = String(name ?? "").trim();
  if (!target) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  try {
    const supabase = adminDb();
    const counts = await productCounts(supabase);
    const count = counts.get(target) ?? 0;
    if (count > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete "${target}" — ${count} product${count === 1 ? "" : "s"} still use it. Move or delete them first.`,
        },
        { status: 409 },
      );
    }

    const { id, list } = await persistedCategories(supabase);
    await saveCategories(
      supabase,
      id,
      list.filter((c) => c !== target),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
