"use client";

// ============================================================
// Le Rasa Bakery — order confirmation (/order-confirmation/[orderId])
// Renders from the snapshot the checkout page stored in sessionStorage
// on payment success, so it always shows the order details immediately
// (independent of the background DB write). Falls back gracefully if
// the snapshot isn't available (e.g. opened in a fresh session).
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  MessageCircle,
  ArrowLeft,
  CalendarDays,
} from "lucide-react";
import { money } from "@/lib/pricing";
import { useSiteSettings } from "@/lib/use-site-settings";

type Snapshot = {
  orderId: string;
  orderNumber: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryDate: string;
  customerName: string;
  email: string;
};

function formatDate(d: string): string {
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

function fallbackNumber(orderId: string): string {
  return orderId.replace(/^pi_/, "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

export default function OrderConfirmationPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ?? "";
  const [order, setOrder] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);

  // WhatsApp number comes solely from the DB (contact.whatsapp), fetched
  // no-store via useSiteSettings. Never a hardcoded number.
  const { settings } = useSiteSettings();
  const waDigits = settings.contact.whatsapp.replace(/[^0-9]/g, "");

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("lerasa_last_order");
      if (raw) {
        const parsed = JSON.parse(raw) as Snapshot;
        // Only trust the snapshot if it matches this confirmation URL.
        if (parsed && parsed.orderId === orderId) setOrder(parsed);
      }
    } catch {
      /* ignore malformed / unavailable storage */
    }
    setReady(true);
  }, [orderId]);

  const orderNumber = order?.orderNumber ?? fallbackNumber(orderId);
  const waText = encodeURIComponent(
    `Hi Le Rasa! I've just placed order #${orderNumber}. `,
  );
  const waLink = `https://wa.me/${waDigits}?text=${waText}`;

  return (
    <div className="pb-24 pt-10">
      <div className="container max-w-2xl">
        {/* Success header */}
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 16 }}
            className="grid h-24 w-24 place-items-center rounded-full bg-green-100"
          >
            <CheckCircle2 className="h-14 w-14 text-green-600" strokeWidth={1.75} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="mt-6 font-display text-3xl font-bold text-darkberry md:text-4xl"
          >
            Order Confirmed!
          </motion.h1>

          <p className="mt-2 text-berry">
            Thank you{order?.customerName ? `, ${order.customerName.split(" ")[0]}` : ""} — we&apos;ll start baking!
          </p>

          <p className="mt-4 rounded-full bg-dustyrose-light/50 px-5 py-2 text-sm font-bold uppercase tracking-wide text-wine-dark">
            Order #{orderNumber}
          </p>
        </div>

        {/* Delivery date + total paid */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-clay bg-[#F9EEEA] p-5 shadow-clay-sm">
            <div className="flex items-center gap-2 text-wine-dark">
              <CalendarDays className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wide">
                Delivery date
              </span>
            </div>
            <p className="mt-2 font-display text-lg font-bold text-darkberry">
              {order ? formatDate(order.deliveryDate) : "To be confirmed"}
            </p>
          </div>
          <div className="rounded-clay bg-[#F9EEEA] p-5 shadow-clay-sm">
            <span className="text-xs font-bold uppercase tracking-wide text-wine-dark">
              Total paid
            </span>
            <p className="mt-2 font-display text-2xl font-bold text-wine-dark">
              {order ? money(order.total) : "—"}
            </p>
          </div>
        </div>

        {/* Items */}
        <div className="mt-4 rounded-clay bg-blush-50 p-6 shadow-clay-sm">
          <h2 className="font-display text-lg font-bold text-darkberry">
            Your order
          </h2>

          {!ready ? (
            <p className="mt-3 text-sm text-berry">Loading…</p>
          ) : order && order.items.length > 0 ? (
            <>
              <ul className="mt-4 space-y-3">
                {order.items.map((it, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-3 border-b border-dustyrose/30 pb-3 last:border-0 last:pb-0"
                  >
                    <span className="text-sm text-darkberry">
                      <span className="font-bold">{it.quantity} ×</span> {it.name}
                    </span>
                    <span className="text-sm font-bold text-wine-dark">
                      {money(it.price * it.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <dl className="mt-4 space-y-1.5 border-t border-dustyrose/40 pt-4 text-sm">
                <div className="flex justify-between text-berry">
                  <dt>Subtotal</dt>
                  <dd className="font-semibold text-darkberry">
                    {money(order.subtotal)}
                  </dd>
                </div>
                <div className="flex justify-between text-berry">
                  <dt>Delivery</dt>
                  <dd className="font-semibold text-darkberry">
                    {order.deliveryFee === 0 ? "Free" : money(order.deliveryFee)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-dustyrose/40 pt-2">
                  <dt className="font-bold text-darkberry">Total paid</dt>
                  <dd className="font-display text-lg font-bold text-wine-dark">
                    {money(order.total)}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-3 text-sm text-berry">
              Your payment was successful and your order is confirmed. We&apos;ve
              got the details — message us on WhatsApp if you need anything.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {waDigits && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3.5 text-sm font-bold text-white shadow-clay-sm transition-transform hover:-translate-y-0.5"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp us · +{waDigits}
            </a>
          )}
          <Link
            href="/menu"
            className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-wine/40 px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-wine-dark transition-colors hover:bg-wine/10"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Menu
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-berry">
          A confirmation has been noted for {order?.email || "your email"}. Questions? Just WhatsApp us.
        </p>
      </div>
    </div>
  );
}
