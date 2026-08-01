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
// PATCH  → set / clear a category's PARENT (hierarchy only — never products).
// DELETE → remove a category AND the products filed directly under it; its
//          subcategories survive and become top-level categories.
//
// HIERARCHY (added on top of the above, nothing replaced):
//   • site_settings.category_parents — { "<child>": "<parent>" }, see
//     supabase/sql/40_category_hierarchy.sql. No entry = top level.
//   • Parents are recorded BY NAME because that is how this whole system
//     references categories (products.category is the name; there are no
//     category ids). Renaming therefore remaps the map too.
//   • GET still returns { name, count } on every row — `parent` and `depth`
//     are ADDITIONS, so existing callers that only read name/count are
//     unaffected. Rows now come back in tree order (each parent immediately
//     followed by its children) so a list can indent without re-sorting.
//   • Everything degrades gracefully when 40_category_hierarchy.sql has not
//     been run: the column is treated as empty and add/rename/delete behave
//     exactly as before. Only PATCH requires the migration.
//
// Service-role, password-gated.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import {
  canonical,
  createsCycle,
  inTreeOrder,
  renameInParents,
  sanitiseParents,
  type ParentMap,
} from "@/lib/category-hierarchy";
import { removeProductImages } from "@/lib/product-storage";

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

/**
 * True when a query failed because site_settings.category_parents doesn't
 * exist yet (40_category_hierarchy.sql not run). Mirrors the tolerance the
 * orders route already applies to newer columns.
 */
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST204" || err.code === "42703") return true;
  return /column .* does not exist|could not find the .* column/i.test(err.message ?? "");
}

const MIGRATION_HINT =
  "Category hierarchy isn't set up on this database yet. Run supabase/sql/40_category_hierarchy.sql, then try again.";

/**
 * True when an RPC failed because delete_category_cascade isn't installed
 * (41_category_delete.sql not run). Same test lib/order-lifecycle.ts applies to
 * its own transactional functions.
 */
function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  // PGRST202 = no matching function in the schema cache; 42883 = undefined_function.
  if (err.code === "PGRST202" || err.code === "42883") return true;
  return /could not find the function|function .* does not exist/i.test(err.message ?? "");
}

const DELETE_MIGRATION_HINT =
  "Category deletion isn't set up on this database yet. Run supabase/sql/41_category_delete.sql, then try again. Nothing was deleted.";

// --- the admin-curated ordered list from site_settings.categories ----------
// Returns { id, list, parents, hasParents }. `id` is null when no settings row
// exists yet; `hasParents` is false when the hierarchy column isn't migrated,
// in which case every category simply reads as top level.
async function persistedCategories(supabase: SupabaseClient): Promise<{
  id: string | null;
  list: string[];
  parents: ParentMap;
  hasParents: boolean;
}> {
  // Try the hierarchy column first, then fall back to the original select so
  // an un-migrated database keeps working exactly as it did before.
  let hasParents = true;
  let { data, error } = await supabase
    .from("site_settings")
    .select("id,categories,category_parents")
    .limit(1)
    .maybeSingle();

  if (error && isMissingColumn(error)) {
    hasParents = false;
    ({ data, error } = await supabase
      .from("site_settings")
      .select("id,categories")
      .limit(1)
      .maybeSingle());
  }
  if (error) throw new Error(error.message);

  const list = Array.isArray(data?.categories)
    ? (data!.categories as unknown[]).filter(
        (c): c is string => typeof c === "string" && c.trim() !== "",
      )
    : [];
  const parents = hasParents
    ? sanitiseParents(list, (data as { category_parents?: unknown } | null)?.category_parents)
    : {};

  return { id: data?.id ?? null, list, parents, hasParents };
}

/** Persist the parent map. Only ever called once the column is known to exist. */
async function saveParents(
  supabase: SupabaseClient,
  id: string | null,
  parents: ParentMap,
): Promise<void> {
  const result = id
    ? await supabase.from("site_settings").update({ category_parents: parents }).eq("id", id)
    : await supabase.from("site_settings").insert({ category_parents: parents });
  if (result.error) throw new Error(result.error.message);
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

// GET — the admin-curated site_settings.categories list (source of truth),
// in TREE order, each annotated with how many products use it plus its parent
// and depth. `name` and `count` are unchanged, so callers that read only those
// (the offer editor, the product form dropdown) are unaffected.
export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  try {
    const supabase = adminDb();
    const counts = await productCounts(supabase);
    const { list, parents } = await persistedCategories(supabase);

    const seen = new Set<string>();
    const unique: string[] = [];
    for (const name of list) {
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      unique.push(name);
    }

    const ordered = inTreeOrder(unique, parents).map(({ name, depth }) => ({
      name,
      count: counts.get(name) ?? 0,
      parent: parents[name] ?? null,
      depth,
    }));

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
    const { id, list, parents, hasParents } = await persistedCategories(supabase);
    if (list.some((c) => c === oldName || c === next)) {
      const renamed = list.map((c) => (c === oldName ? next : c));
      await saveCategories(supabase, id, renamed);
    }

    // The hierarchy is keyed by name, so a rename has to follow: the category
    // keeps its own parent, and anything filed under it keeps its parent too.
    // Renaming therefore changes the label only — never the tree, and never a
    // product's category (that was updated above).
    if (hasParents) {
      await saveParents(supabase, id, renameInParents(parents, oldName, next));
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
  const { name, parent } = await req.json();
  const clean = String(name ?? "").trim();
  // Optional — omitted / "" / null all mean "top level", exactly as before.
  const wantedParent = String(parent ?? "").trim();
  if (!clean) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  try {
    const supabase = adminDb();
    const counts = await productCounts(supabase);
    const { id, list, parents, hasParents } = await persistedCategories(supabase);

    const exists =
      list.some((c) => c.toLowerCase() === clean.toLowerCase()) ||
      Array.from(counts.keys()).some((c) => c.toLowerCase() === clean.toLowerCase());
    if (exists) {
      return NextResponse.json({ error: "That category already exists." }, { status: 409 });
    }

    // Resolve the parent BEFORE writing anything, so a bad parent never leaves
    // a half-created category behind. A brand-new category has no children, so
    // no cycle is possible here — only "does the parent exist".
    let resolvedParent: string | null = null;
    if (wantedParent) {
      if (!hasParents) {
        return NextResponse.json({ error: MIGRATION_HINT }, { status: 409 });
      }
      resolvedParent = canonical(list, wantedParent);
      if (!resolvedParent) {
        return NextResponse.json(
          { error: `"${wantedParent}" isn't a category, so it can't be a parent.` },
          { status: 400 },
        );
      }
    }

    await saveCategories(supabase, id, [...list, clean]);
    if (resolvedParent) {
      await saveParents(supabase, id, { ...parents, [clean]: resolvedParent });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add category" },
      { status: 500 },
    );
  }
}

// PATCH — set or clear a category's parent. HIERARCHY ONLY: it never touches
// products.category, so a category that becomes a subcategory keeps every
// product already filed under it, and one promoted back to top level keeps
// them too. Send parent: null / "" to make it top level again.
export async function PATCH(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const { name, parent } = await req.json();
  const target = String(name ?? "").trim();
  const wantedParent = String(parent ?? "").trim();
  if (!target) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  try {
    const supabase = adminDb();
    const { id, list, parents, hasParents } = await persistedCategories(supabase);
    if (!hasParents) {
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 409 });
    }

    const child = canonical(list, target);
    if (!child) {
      return NextResponse.json({ error: `"${target}" isn't a category.` }, { status: 404 });
    }

    // Clear → back to a normal top-level category.
    if (!wantedParent) {
      const next = { ...parents };
      delete next[child];
      await saveParents(supabase, id, next);
      return NextResponse.json({ ok: true, name: child, parent: null });
    }

    const parentName = canonical(list, wantedParent);
    if (!parentName) {
      return NextResponse.json(
        { error: `"${wantedParent}" isn't a category, so it can't be a parent.` },
        { status: 400 },
      );
    }
    if (parentName === child) {
      return NextResponse.json(
        { error: "A category can't be its own parent." },
        { status: 400 },
      );
    }
    // A → B → C → A must never happen: walking up from the proposed parent
    // must not lead back to the category being moved.
    if (createsCycle(parents, child, parentName)) {
      return NextResponse.json(
        {
          error: `"${parentName}" is already under "${child}", so this would create a circular hierarchy.`,
        },
        { status: 400 },
      );
    }

    await saveParents(supabase, id, { ...parents, [child]: parentName });
    return NextResponse.json({ ok: true, name: child, parent: parentName });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update parent" },
      { status: 500 },
    );
  }
}

// DELETE — remove a category, the products filed DIRECTLY under it, and their
// image files. Its direct SUBCATEGORIES SURVIVE: they lose their parent and
// become top-level categories, and the products filed under them are never
// touched.
//
//   Cakes                    <- deleted, along with its own products
//   ├── Custom Cakes         <- kept, promoted to top level, products intact
//   └── Wedding Cake         <- kept, promoted to top level, products intact
//
// The database half runs as ONE transaction inside delete_category_cascade
// (41_category_delete.sql), so the children, the products, the category list
// and the parent map all move together or not at all. Storage is cleaned
// afterwards — see removeProductImages for why that order is the safe one.
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
    const { data, error } = await supabase.rpc("delete_category_cascade", {
      p_name: target,
    });

    if (error) {
      // Always logged: the admin sees a sentence, the server keeps the detail.
      console.error("[categories] delete_category_cascade failed:", error);

      // Without the function there is no way to do this atomically, and a
      // half-finished cascade is far worse than a refusal — so say what to run
      // rather than falling back to a stepwise delete.
      if (isMissingFunction(error)) {
        return NextResponse.json({ error: DELETE_MIGRATION_HINT }, { status: 409 });
      }
      // P0002 is the "no such category" the function raises.
      if (error.code === "P0002") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      // 23503 = foreign_key_violation: something still points at one of these
      // products with a constraint that blocks the delete. The transaction has
      // already rolled back, so nothing was removed — say so, because the raw
      // Postgres sentence reads like a partial failure.
      if (error.code === "23503") {
        return NextResponse.json(
          {
            error:
              `Some products in "${target}" are still referenced by another table, which blocked the delete: ` +
              `${error.details || error.message}. Nothing was deleted.`,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (data ?? {}) as {
      category?: string;
      deleted_products?: number;
      promoted_children?: unknown;
      image_urls?: unknown;
    };
    const promotedChildren = Array.isArray(result.promoted_children)
      ? result.promoted_children.map((c) => String(c))
      : [];
    const imageUrls = Array.isArray(result.image_urls)
      ? result.image_urls.map((u) => String(u))
      : [];

    // The rows are already gone; files are the tidy-up. A Storage failure is
    // reported, never thrown — the delete DID happen, and telling the admin it
    // failed would be a lie that costs them a second attempt.
    const files = await removeProductImages(supabase, imageUrls);

    return NextResponse.json({
      ok: true,
      category: result.category ?? target,
      deletedProducts: Number(result.deleted_products) || 0,
      promotedChildren,
      removedFiles: files.removed.length,
      orphanedFiles: files.failed.map((f) => f.path),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
