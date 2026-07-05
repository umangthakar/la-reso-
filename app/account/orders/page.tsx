"use client";

// ============================================================
// Le Rasa Bakery — My Orders (/account/orders)
// Lists the signed-in customer's orders, matched by their verified
// email (RLS: "Users read own orders by email"). Read with the
// authenticated browser client.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Package, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { money } from "@/lib/pricing";

type OrderRow = {
  id: string;
  status: string | null;
  created_at: string;
  delivery_date: string | null;
  total: number | null;
  amount: number | null;
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  received: { label: "Received", className: "bg-dustyrose-light/70 text-wine-dark" },
  preparing: { label: "Preparing", className: "bg-amber-100 text-amber-800" },
  out_for_delivery: { label: "Out for delivery", className: "bg-blue-100 text-blue-800" },
  delivered: { label: "Delivered", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", className: "bg-gray-200 text-gray-700" },
};

function formatDate(d: string | null): string {
  if (!d) return "TBC";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function OrdersPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ready && !user) router.replace("/account/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    (async () => {
      try {
        // Server route authenticates via the session and reads with the
        // service role, so it works even without the email RLS policy.
        const res = await fetch("/api/account/orders");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setOrders(Array.isArray(data.orders) ? (data.orders as OrderRow[]) : []);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  if (!ready || !user) {
    return (
      <section className="pt-28 sm:pt-36">
        <div className="container flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-wine" />
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <div className="pointer-events-none absolute -left-20 top-28 h-64 w-64 rounded-full bg-dustyrose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-dustyrose/25 blur-3xl" />

      <div className="container relative mx-auto max-w-xl">
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-sm font-semibold text-wine-dark transition-colors hover:text-plum"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to account
        </Link>

        <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
          My Orders
        </h1>

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-wine" />
          </div>
        ) : orders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 flex flex-col items-center rounded-clay bg-blush-50 px-6 py-14 text-center shadow-clay"
          >
            <span className="grid h-20 w-20 place-items-center rounded-full bg-dustyrose-light text-wine-dark">
              <Package className="h-9 w-9" />
            </span>
            <h2 className="mt-5 font-display text-xl font-semibold text-darkberry">
              No orders yet
            </h2>
            <p className="mt-2 max-w-xs text-sm text-darkberry-light">
              When you place an order, it&apos;ll show up here so you can track it.
            </p>
            <Button asChild className="mt-6">
              <Link href="/menu">Browse the menu</Link>
            </Button>
          </motion.div>
        ) : (
          <ul className="mt-5 space-y-3">
            {orders.map((o, i) => {
              const s = STATUS_LABELS[o.status ?? "received"] ?? STATUS_LABELS.received;
              const paid = o.amount ?? o.total ?? 0;
              return (
                <motion.li
                  key={o.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.3) }}
                  className="rounded-clay bg-blush-50 p-5 shadow-clay-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-bold text-darkberry">
                        Order #{o.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-darkberry-light">
                        Placed {formatDate(o.created_at)} · Delivery {formatDate(o.delivery_date)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${s.className}`}>
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-dustyrose/30 pt-3">
                    <span className="text-sm text-darkberry-light">Total</span>
                    <span className="font-display text-lg font-bold text-wine-dark">
                      {money(paid)}
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
