// ============================================================
// Admin API — persist drag-to-reorder. Body: { order: [{id, display_order}] }
// Service-role, password-gated. Same shape as products/reorder.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const body = await req.json();
  const order: { id: string; display_order: number }[] = body.order ?? [];
  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: "Nothing to reorder" }, { status: 400 });
  }

  const supabase = createAdminClient() as unknown as SupabaseClient;

  // Update each row's display_order. Run in parallel; fail on first error.
  const results = await Promise.all(
    order.map((row) =>
      supabase.from("policies").update({ display_order: row.display_order }).eq("id", row.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
