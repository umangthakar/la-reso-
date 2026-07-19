// ============================================================
// Admin API — retry a failed refund on a cancelled order (POST)
// Service-role, password-gated.
//
// Used when a cancellation's Stripe refund failed and the order is sitting
// in payment_status 'refund_pending'. Re-issues the refund via the shared
// integration; on success flips payment_status → 'refunded' and emails the
// customer that their refund is complete. On failure the order stays in
// 'refund_pending' with the latest error, ready to retry again.
//
// This is separate from /api/admin/payments/refund (the general refunds
// tool, which sets order status='refunded'); here the order stays
// 'cancelled' and only the PAYMENT side changes.
// ============================================================

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { isAuthedRequest } from "@/lib/admin-auth";
import { refundOrder, orderNumberOf } from "@/lib/order-lifecycle";
import { notifyLifecycle } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isAuthedRequest(req)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  const supabase = createAdminClient() as unknown as SupabaseClient;

  const { data: order, error: loadErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  if (String(order.payment_status ?? "") === "refunded") {
    return NextResponse.json({ payment_status: "refunded" }); // already done, idempotent
  }

  const refund = await refundOrder(supabase, order);
  if ("error" in refund) {
    // Still pending — record the latest error for the next retry.
    await supabase
      .from("orders")
      .update({ payment_status: "refund_pending", refund_error: refund.error })
      .eq("id", params.id);
    return NextResponse.json({ error: refund.error, payment_status: "refund_pending" }, { status: 502 });
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("orders")
    .update({
      payment_status: "refunded",
      refund_id: refund.refundId,
      refund_error: null,
      refunded_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", params.id);
  if (updErr) {
    return NextResponse.json(
      { error: `Refund issued in Stripe (${refund.refundId}) but saving it failed: ${updErr.message}` },
      { status: 500 },
    );
  }

  // Let the customer know the refund is now complete (best-effort).
  try {
    await notifyLifecycle(supabase, "refund_completed", {
      orderNumber: orderNumberOf(params.id),
      customerName: String(order.customer_name ?? ""),
      email: String(order.email ?? ""),
      total: Number(order.total ?? order.amount ?? 0),
      refundState: "refunded",
    });
  } catch (e) {
    console.error("[admin/orders/refund] notify failed:", e);
  }

  return NextResponse.json({ payment_status: "refunded", refund_id: refund.refundId });
}
