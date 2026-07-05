// ============================================================
// Le Rasa Bakery — order confirmation (/order-confirmation/[orderId])
// Server component. Reads the order by id via the service role (the
// id is an unguessable UUID acting as the access token), plus its line
// items and the bakery WhatsApp number.
// ============================================================

import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, MessageCircle, ArrowLeft, CalendarDays } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { money } from "@/lib/pricing";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  customer_name: string | null;
  email: string | null;
  delivery_date: string | null;
  total: number | null;
  amount: number | null;
  created_at: string;
};

type ItemRow = {
  product_name: string;
  quantity: number;
  line_total: number | null;
  unit_price: number | null;
};

const FALLBACK_WHATSAPP = "+441234567890";

async function loadOrder(orderId: string) {
  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient() as unknown as SupabaseClient;
  } catch {
    return null;
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id,customer_name,email,delivery_date,total,amount,created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const { data: items } = await supabase
    .from("order_items")
    .select("product_name,quantity,line_total,unit_price")
    .eq("order_id", orderId);

  const { data: settings } = await supabase
    .from("site_settings")
    .select("whatsapp")
    .limit(1)
    .maybeSingle();

  return {
    order: order as OrderRow,
    items: (items ?? []) as ItemRow[],
    whatsapp: (settings as { whatsapp?: string } | null)?.whatsapp || FALLBACK_WHATSAPP,
  };
}

function formatDate(d: string | null): string {
  if (!d) return "To be confirmed";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: { orderId: string };
}) {
  const result = await loadOrder(params.orderId);

  if (!result) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-darkberry">
          Order not found
        </h1>
        <p className="text-berry">
          We couldn&apos;t find that order. Please check your confirmation link.
        </p>
        <Link
          href="/menu"
          className="rounded-full bg-wine px-6 py-3 text-sm font-semibold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
        >
          Back to menu
        </Link>
      </div>
    );
  }

  const { order, items, whatsapp } = result;
  const orderNumber = order.id.slice(0, 8).toUpperCase();
  const paid = order.amount ?? order.total ?? 0;

  const waDigits = whatsapp.replace(/[^\d]/g, "");
  const waText = encodeURIComponent(
    `Hi Le Rasa! I've just placed order #${orderNumber}. `,
  );
  const waLink = `https://wa.me/${waDigits}?text=${waText}`;

  return (
    <div className="pb-24 pt-10">
      <div className="container max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-green-100">
            <CheckCircle2 className="h-11 w-11 text-green-600" />
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold text-darkberry md:text-4xl">
            Thank you{order.customer_name ? `, ${order.customer_name.split(" ")[0]}` : ""}!
          </h1>
          <p className="mt-2 text-berry">
            Your order is confirmed and we&apos;re getting the oven warm.
          </p>
          <p className="mt-4 rounded-full bg-dustyrose-light/50 px-5 py-2 text-sm font-bold uppercase tracking-wide text-wine-dark">
            Order #{orderNumber}
          </p>
        </div>

        {/* Delivery + total */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-clay bg-[#F9EEEA] p-5 shadow-clay-sm">
            <div className="flex items-center gap-2 text-wine-dark">
              <CalendarDays className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wide">
                Delivery date
              </span>
            </div>
            <p className="mt-2 font-display text-lg font-bold text-darkberry">
              {formatDate(order.delivery_date)}
            </p>
          </div>
          <div className="rounded-clay bg-[#F9EEEA] p-5 shadow-clay-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-wine-dark">
              Total paid
            </span>
            <p className="mt-2 font-display text-2xl font-bold text-wine-dark">
              {money(paid)}
            </p>
          </div>
        </div>

        {/* Items */}
        <div className="mt-4 rounded-clay bg-blush-50 p-6 shadow-clay-sm">
          <h2 className="font-display text-lg font-bold text-darkberry">
            Your order
          </h2>
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-berry">Order details are being prepared.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-dustyrose/30 pb-3 last:border-0 last:pb-0"
                >
                  <span className="text-sm text-darkberry">
                    <span className="font-bold">{it.quantity} ×</span> {it.product_name}
                  </span>
                  <span className="text-sm font-bold text-wine-dark">
                    {money((it.line_total ?? (it.unit_price ?? 0) * it.quantity) || 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white shadow-clay-sm transition-transform hover:-translate-y-0.5"
          >
            <MessageCircle className="h-4 w-4" />
            Message us on WhatsApp
          </a>
          <Link
            href="/menu"
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-wine/40 px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-wine-dark transition-colors hover:bg-wine/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to menu
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-berry">
          A confirmation has been noted for {order.email || "your email"}. Questions? Just WhatsApp us.
        </p>
      </div>
    </div>
  );
}
