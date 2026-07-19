"use client";

// ============================================================
// Le Rasa Bakery — My Orders (/account/orders)
// Lists the signed-in customer's orders, matched by their verified
// email. A single fetch of /api/account/orders returns each order WITH
// its line items, so the list AND the details modal render from the same
// data (no per-order detail calls). Each card opens a details modal with
// the full breakdown and — while the order is still early — a Cancel
// Order action.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  ChevronLeft,
  Loader2,
  X,
  CalendarDays,
  User,
  Truck,
  CreditCard,
  Receipt,
  AlertTriangle,
  Check,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { money } from "@/lib/pricing";

// A line item on an order (image comes from the product when it still exists).
type OrderItem = {
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number | null;
  image: string | null;
};

// One order, with everything the list card AND the details modal need — all
// delivered by the single /api/account/orders fetch.
type OrderRow = {
  id: string;
  status: string | null;
  created_at: string | null;
  delivery_date: string | null;
  subtotal: number | null;
  delivery_charge: number | null;
  discount_amount: number;
  coupon_code: string | null;
  total: number | null;
  amount: number | null;
  payment_status: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  delivery_address: string | null;
  postcode: string | null;
  special_instructions: string | null;
  payment_method: string | null;
  items: OrderItem[];
};

// Status badges — existing styling kept, extended to the full set of statuses.
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-dustyrose-light/70 text-wine-dark" },
  received: { label: "Received", className: "bg-dustyrose-light/70 text-wine-dark" },
  preparing: { label: "Preparing", className: "bg-amber-100 text-amber-800" },
  processing: { label: "Processing", className: "bg-amber-100 text-amber-800" },
  ready: { label: "Ready", className: "bg-blue-100 text-blue-800" },
  out_for_delivery: { label: "Out for delivery", className: "bg-blue-100 text-blue-800" },
  delivered: { label: "Delivered", className: "bg-green-100 text-green-700" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", className: "bg-gray-200 text-gray-700" },
};

// A customer may cancel ONLY while the order is Pending (before the owner
// accepts it). Once accepted (Received onward) the cancel action disappears.
const CANCELLABLE = new Set(["pending"]);

function statusMeta(status: string | null) {
  return STATUS_LABELS[(status ?? "received").toLowerCase()] ?? STATUS_LABELS.received;
}

// The customer-facing order journey, in order. Cancelled/refunded orders
// step out of this flow and show a refund summary instead.
const TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "received", label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];

/** Human label for the payment side of an order. */
function paymentLabel(order: OrderRow): string {
  const ps = (order.payment_status ?? "").toLowerCase();
  if (ps === "refunded") return "Refunded";
  if (ps === "refund_pending") return "Refund Pending";
  // Fallback for pre-27 orders that only carry an order status.
  if ((order.status ?? "").toLowerCase() === "refunded") return "Refunded";
  return "Paid";
}

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

// Card title: the first cake name, plus "+N more" when there are more lines.
function orderTitle(o: OrderRow): string {
  if (o.items.length === 0) return `Order #${o.id.slice(0, 8).toUpperCase()}`;
  const first = o.items[0].product_name;
  const more = o.items.length - 1;
  return more > 0 ? `${first} +${more} more` : first;
}

function unitLineTotal(it: OrderItem): number {
  return it.line_total != null ? it.line_total : it.unit_price * it.quantity;
}

export default function OrdersPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Details modal + cancel flow.
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/account/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    (async () => {
      try {
        // Server route authenticates via the session and reads with the
        // service role, returning orders + their items in one call.
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

  // Close the modal on Escape + lock body scroll while it's open.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeModal();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function openModal(o: OrderRow) {
    setSelected(o);
    setConfirmOpen(false);
    setCancelError(null);
  }
  function closeModal() {
    setSelected(null);
    setConfirmOpen(false);
    setCancelError(null);
  }

  async function cancelOrder(o: OrderRow) {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/account/orders/${o.id}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not cancel this order.");
      // Optimistic, no refresh: update the list and the open modal together, so
      // the customer account reflects the cancellation + refund immediately.
      // The admin panel + analytics read the same columns on their next load.
      const payment_status = String(data.payment_status ?? "refunded");
      setOrders((prev) =>
        prev.map((x) => (x.id === o.id ? { ...x, status: "cancelled", payment_status } : x)),
      );
      setSelected((s) =>
        s && s.id === o.id ? { ...s, status: "cancelled", payment_status } : s,
      );
      setConfirmOpen(false);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Could not cancel this order.");
    } finally {
      setCancelling(false);
    }
  }

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
              const s = statusMeta(o.status);
              const paid = o.total ?? o.amount ?? 0;
              return (
                <motion.li
                  key={o.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.3) }}
                >
                  {/* The whole card is clickable → opens the details modal. */}
                  <button
                    type="button"
                    onClick={() => openModal(o)}
                    aria-label={`View order ${orderTitle(o)}`}
                    className="w-full rounded-clay bg-blush-50 p-5 text-left shadow-clay-sm transition-all hover:-translate-y-0.5 hover:shadow-clay"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-bold text-darkberry">
                          {orderTitle(o)}
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
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ---- Order details modal ---- */}
      <AnimatePresence>
        {selected && (
          <OrderDetailsModal
            order={selected}
            onClose={closeModal}
            confirmOpen={confirmOpen}
            setConfirmOpen={setConfirmOpen}
            cancelling={cancelling}
            cancelError={cancelError}
            onCancel={() => cancelOrder(selected)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// ------------------------------------------------------------
// Details modal — centered panel, same design language as the rest of the
// account area (rounded-clay, blush surfaces, wine accents).
// ------------------------------------------------------------
function OrderDetailsModal({
  order,
  onClose,
  confirmOpen,
  setConfirmOpen,
  cancelling,
  cancelError,
  onCancel,
}: {
  order: OrderRow;
  onClose: () => void;
  confirmOpen: boolean;
  setConfirmOpen: (v: boolean) => void;
  cancelling: boolean;
  cancelError: string | null;
  onCancel: () => void;
}) {
  const s = statusMeta(order.status);
  const statusKey = (order.status ?? "").toLowerCase();
  const canCancel = CANCELLABLE.has(statusKey);
  const isCancelled = statusKey === "cancelled" || statusKey === "refunded";
  const subtotal = order.subtotal;
  const delivery = order.delivery_charge;
  const grand = order.total ?? order.amount ?? 0;
  const paymentStatus = paymentLabel(order);
  const paymentMethod = order.payment_method
    ? order.payment_method.charAt(0).toUpperCase() + order.payment_method.slice(1)
    : "Card";

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        className="absolute inset-0 bg-darkberry/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${orderTitle(order)}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F9EEEA] shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-clay"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-dustyrose/40 bg-blush-50 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-bold text-darkberry">
              {orderTitle(order)}
            </h2>
            <p className="text-xs text-darkberry-light">
              Placed {formatDate(order.created_at)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${s.className}`}>
              {s.label}
            </span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-[#F9EEEA] text-darkberry shadow-clay-sm transition-shadow hover:shadow-clay"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Progress — timeline for active orders, refund summary once cancelled */}
          {isCancelled ? (
            <CancelledSummary order={order} />
          ) : (
            <OrderTimeline status={statusKey} />
          )}

          {/* Order information / items */}
          <Section icon={<Receipt className="h-4 w-4" />} title="Order information">
            <ul className="space-y-3">
              {order.items.length === 0 ? (
                <li className="text-sm text-darkberry-light">
                  Item details aren&apos;t available for this order.
                </li>
              ) : (
                order.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-dustyrose-light/40">
                      {it.image ? (
                        <Image
                          src={it.image}
                          alt={it.product_name}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-wine-dark">
                          <Package className="h-5 w-5" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-darkberry">
                        {it.product_name}
                      </p>
                      <p className="text-xs text-darkberry-light">
                        Qty {it.quantity} · {money(it.unit_price)} each
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-wine-dark">
                      {money(unitLineTotal(it))}
                    </span>
                  </li>
                ))
              )}
            </ul>

            <dl className="mt-4 space-y-1.5 border-t border-dustyrose/40 pt-4 text-sm">
              {subtotal != null && (
                <Row label="Subtotal" value={money(subtotal)} />
              )}
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-green-700">
                  <dt>
                    Discount
                    {order.coupon_code ? ` (${order.coupon_code.toUpperCase()})` : ""}
                  </dt>
                  <dd className="font-semibold">−{money(order.discount_amount)}</dd>
                </div>
              )}
              {delivery != null && (
                <Row
                  label="Delivery"
                  value={delivery === 0 ? "Free" : money(delivery)}
                />
              )}
              <div className="flex justify-between border-t border-dustyrose/40 pt-2">
                <dt className="font-bold text-darkberry">Grand total</dt>
                <dd className="font-display text-lg font-bold text-wine-dark">
                  {money(grand)}
                </dd>
              </div>
            </dl>
          </Section>

          {/* Customer */}
          <Section icon={<User className="h-4 w-4" />} title="Customer">
            <Line label="Name" value={order.customer_name} />
            <Line label="Phone" value={order.phone} />
            <Line label="Email" value={order.email} />
          </Section>

          {/* Delivery */}
          <Section icon={<Truck className="h-4 w-4" />} title="Delivery">
            <Line label="Address" value={order.delivery_address} />
            <Line label="Postcode" value={order.postcode} />
            <Line label="Delivery date" value={formatDate(order.delivery_date)} />
            <Line label="Instructions" value={order.special_instructions} />
          </Section>

          {/* Payment */}
          <Section icon={<CreditCard className="h-4 w-4" />} title="Payment">
            <Line label="Method" value={paymentMethod} />
            <Line label="Status" value={paymentStatus} />
          </Section>

          {/* Order meta */}
          <Section icon={<CalendarDays className="h-4 w-4" />} title="Order">
            <Line label="Order ID" value={`#${order.id.slice(0, 8).toUpperCase()}`} />
            <Line label="Placed" value={formatDate(order.created_at)} />
            <Line label="Status" value={s.label} />
            <Line label="Estimated delivery" value={formatDate(order.delivery_date)} />
          </Section>
        </div>

        {/* Footer — cancel action only while Pending. Once the owner has
            accepted the order it can no longer be cancelled here. */}
        {!canCancel && !isCancelled && (
          <div className="border-t border-dustyrose/40 bg-blush-50 px-5 py-4">
            <p className="rounded-2xl bg-[#F9EEEA] px-4 py-3 text-center text-sm font-semibold text-darkberry shadow-clay-sm">
              This order has already been accepted and can no longer be cancelled.
            </p>
          </div>
        )}
        {canCancel && (
          <div className="border-t border-dustyrose/40 bg-blush-50 px-5 py-4">
            {cancelError && (
              <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {cancelError}
              </p>
            )}
            {!confirmOpen ? (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="w-full rounded-full border-2 border-red-300 bg-transparent px-6 py-3 text-sm font-bold uppercase tracking-wide text-red-600 transition-colors hover:bg-red-50"
              >
                Cancel Order
              </button>
            ) : (
              <div className="rounded-2xl bg-[#F9EEEA] p-4 shadow-clay-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-bold text-darkberry">Cancel this order?</p>
                    <p className="text-xs text-darkberry-light">
                      This action cannot be undone.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    disabled={cancelling}
                    className="flex-1 rounded-full border-2 border-wine/40 px-4 py-2.5 text-sm font-bold text-wine-dark transition-colors hover:bg-wine/10 disabled:opacity-50"
                  >
                    Keep Order
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={cancelling}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                    Cancel Order
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// Order timeline — the customer's journey with the current step
// highlighted. Steps up to and including the current one are marked done;
// later steps are shown as upcoming. Matches the account colour language.
// ------------------------------------------------------------
function OrderTimeline({ status }: { status: string }) {
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.key === status);
  // Unknown/legacy status → treat as at least "received".
  const activeIndex = currentIndex >= 0 ? currentIndex : 1;

  return (
    <div className="rounded-clay bg-blush-50 p-4 shadow-clay-sm">
      <div className="mb-3 flex items-center gap-2 text-wine-dark">
        <Truck className="h-4 w-4" />
        <h3 className="text-xs font-bold uppercase tracking-wide">Order status</h3>
      </div>
      <ol className="space-y-0">
        {TIMELINE_STEPS.map((step, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          const last = i === TIMELINE_STEPS.length - 1;
          return (
            <li key={step.key} className="flex gap-3">
              {/* Node + connector */}
              <div className="flex flex-col items-center">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    done
                      ? "bg-wine text-white"
                      : current
                        ? "bg-wine text-white ring-4 ring-dustyrose/40"
                        : "bg-dustyrose-light/60 text-wine-dark/50"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {!last && (
                  <span
                    className={`w-0.5 flex-1 ${done ? "bg-wine" : "bg-dustyrose/40"}`}
                    style={{ minHeight: 18 }}
                  />
                )}
              </div>
              {/* Label */}
              <div className={last ? "pb-0" : "pb-4"}>
                <p
                  className={`text-sm font-bold ${
                    current
                      ? "text-wine-dark"
                      : done
                        ? "text-darkberry"
                        : "text-darkberry-light/60"
                  }`}
                >
                  {step.label}
                </p>
                {current && (
                  <p className="text-xs text-darkberry-light">Current step</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// A cancelled order steps out of the timeline; show the refund state instead.
function CancelledSummary({ order }: { order: OrderRow }) {
  const refunded = paymentLabel(order) === "Refunded";
  const grand = order.total ?? order.amount ?? 0;
  return (
    <div className="rounded-clay bg-blush-50 p-4 shadow-clay-sm">
      <div className="mb-3 flex items-center gap-2 text-red-600">
        <XCircle className="h-4 w-4" />
        <h3 className="text-xs font-bold uppercase tracking-wide">Order cancelled</h3>
      </div>
      <div
        className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
          refunded ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
        }`}
      >
        {refunded ? (
          <>Your payment of {money(grand)} has been refunded.</>
        ) : (
          <>
            Your refund of {money(grand)} is being processed and will be back on
            your card shortly.
          </>
        )}
      </div>
    </div>
  );
}

// Small presentational helpers, styled to match the account area.
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-clay bg-blush-50 p-4 shadow-clay-sm">
      <div className="mb-3 flex items-center gap-2 text-wine-dark">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-darkberry-light">{label}</span>
      <span className="min-w-0 text-right font-semibold text-darkberry">{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-berry">
      <dt>{label}</dt>
      <dd className="font-semibold text-darkberry">{value}</dd>
    </div>
  );
}
