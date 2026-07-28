// ============================================================
// Admin API — the product PICKER's list (GET).
// Service-role, password-gated.
//
// WHY THIS EXISTS BESIDE ../route.ts. The main products GET is the Products
// TABLE's endpoint: it is paginated (20 a page) and returns every column that
// table renders. A picker needs the opposite of both — the whole catalogue at
// once, because searching a page at a time is not searching, and four fields
// per row, because that is all a dropdown shows. Widening the table's endpoint
// to serve both would have made every products page load carry the picker's
// concerns; this is smaller than the pagination code it avoids.
//
// The search itself is CLIENT-SIDE. A bakery's catalogue is tens of products,
// not thousands, so the whole list is a few kB and filtering it in the browser
// is instant with no request per keystroke and no debounce to tune — the same
// call the Products page's own instant search already makes.
//
// HIDDEN PRODUCTS ARE INCLUDED, deliberately. They are exactly the ones an
// admin needs to see in the picker: a seasonal cake hidden today may be the one
// the hero should point at when it comes back. They come back flagged
// (`visible: false`) so the picker can warn that the link will not resolve for
// customers yet, rather than being silently absent and looking like a bug.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function adminDb(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

/** Just enough to recognise a product in a dropdown and save its id. */
const OPTION_COLS = "id,name,category,price,image_url,visible";

export async function GET(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  try {
    const supabase = adminDb();

    // Alphabetical by name — the same order the Products page itself lists in,
    // so a product sits in the same place wherever the admin meets it. A picker
    // is scanned rather than read top to bottom, and A→Z is the only order you
    // can guess a position in without having seen the list before.
    const { data, error } = await supabase
      .from("products")
      .select(OPTION_COLS)
      .order("name", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ products: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load products" },
      { status: 500 },
    );
  }
}
