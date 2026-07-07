"use client";

// ============================================================
// Le Rasa Bakery — Dashboard overview
// At-a-glance stats from the SHARED /api/admin/stats endpoint — the same
// source the Orders and Analytics pages read, so the counts can never
// disagree. It returns the canonical orders array plus these headline
// numbers, all derived from that one array:
//   - Total orders
//   - Revenue this week
//   - Pending orders (received or preparing)
//   - Top selling product this month
// The period boundaries are computed here (local time) and passed to the
// API so the buckets match the user's timezone.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminGet } from "@/lib/admin-api";
import { useOrdersLive } from "@/lib/supabase/hooks/use-orders-live";

// NOTE: this is a Client Component, so it must NOT export route segment config
// (`dynamic`/`revalidate`) — doing so 500s the route ("Invalid revalidate
// value"). Freshness is guaranteed instead by the force:true fetch below
// (bypasses the in-memory cache) plus cache:"no-store" in adminGet.

const WINE = "#873853";
const BERRY = "#5C2A41";

// Only the `stats` block + schemaReady are needed here; the endpoint also
// returns orders/items/zones for the Orders and Analytics pages.
type Stats = {
  totalOrders: number;
  pendingOrders: number;
  ordersToday: number;
  revenueThisWeek: number;
  topProduct: { name: string; units: number } | null;
};
type Payload = {
  stats: Stats;
  schemaReady: boolean;
};

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Monday 00:00 of the current week.
function startOfWeek(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function startOfMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export default function DashboardHome() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Live "new order" toast. prevTodayRef tracks the last-seen ordersToday count
  // so a realtime refetch can tell when a fresh order lands (null until first load).
  const [toast, setToast] = useState<string | null>(null);
  const prevTodayRef = useRef<number | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        today: String(startOfToday()),
        week: String(startOfWeek()),
        month: String(startOfMonth()),
      });
      // force:true bypasses the in-memory GET cache so the cards always show
      // the latest orders on every visit (not a copy up to 60s old).
      const d = await adminGet<Payload>(`/api/admin/stats?${qs.toString()}`, { force: true });
      // Toast when today's order count rises (skip the very first load).
      if (prevTodayRef.current !== null && d.stats.ordersToday > prevTodayRef.current) {
        const diff = d.stats.ordersToday - prevTodayRef.current;
        showToast(diff === 1 ? "🔔 New order received!" : `🔔 ${diff} new orders received!`);
      }
      prevTodayRef.current = d.stats.ordersToday;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  // Update the summary cards in real time whenever orders change.
  useOrdersLive(load);

  // Clear the toast timer on unmount.
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  const totalOrders = data?.stats.totalOrders ?? 0;
  const revenueThisWeek = data?.stats.revenueThisWeek ?? 0;
  const pendingOrders = data?.stats.pendingOrders ?? 0;
  const topProduct = data?.stats.topProduct ?? null;

  const stats = [
    { label: "Total orders", value: String(totalOrders), href: "/admin/dashboard/orders" },
    { label: "Revenue this week", value: gbp.format(revenueThisWeek), href: "/admin/dashboard/analytics" },
    { label: "Pending orders", value: String(pendingOrders), href: "/admin/dashboard/orders" },
    {
      label: "Top product this month",
      value: topProduct ? topProduct.name : "—",
      sub: topProduct ? `${topProduct.units} sold` : undefined,
      href: "/admin/dashboard/analytics",
    },
  ] as { label: string; value: string; sub?: string; href: string }[];

  return (
    <div>
      {/* Live "new order" toast */}
      <style>{`@keyframes lr-toast-in { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }`}</style>
      {toast && (
        <div role="status" aria-live="polite" style={toastStyle}>{toast}</div>
      )}

      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>Dashboard</h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>An overview of your bakery.</p>

      {error && <p style={{ background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 }}>{error}</p>}

      {data && !data.schemaReady && (
        <p style={{ background: "#fff4e5", color: "#92400e", padding: "10px 14px", borderRadius: 10, marginTop: 16, fontWeight: 600 }}>
          Revenue and top-product stats stay empty until you run <code>supabase/sql/08_analytics_schema.sql</code>.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 24,
        }}
      >
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            style={{
              display: "block",
              background: "white",
              borderRadius: 16,
              padding: "1.25rem",
              textDecoration: "none",
              boxShadow: "0 10px 30px rgba(135,56,83,0.08)",
            }}
          >
            <div
              style={{
                color: WINE,
                fontWeight: 800,
                fontSize: "1.7rem",
                lineHeight: 1.1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {loading ? "…" : s.value}
            </div>
            <div style={{ color: BERRY, opacity: 0.7, marginTop: 8, fontSize: "0.9rem", fontWeight: 600 }}>
              {s.label}
            </div>
            {!loading && s.sub && (
              <div style={{ color: BERRY, opacity: 0.55, marginTop: 4, fontSize: "0.8rem", fontWeight: 600 }}>{s.sub}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

const toastStyle: React.CSSProperties = { position: "fixed", top: 20, right: 20, zIndex: 100, background: WINE, color: "white", padding: "12px 18px", borderRadius: 12, fontWeight: 700, fontSize: "0.95rem", boxShadow: "0 12px 30px rgba(135,56,83,0.35)", animation: "lr-toast-in 0.25s ease-out" };
