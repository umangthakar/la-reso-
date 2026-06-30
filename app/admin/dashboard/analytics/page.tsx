"use client";

// ============================================================
// Le Rasa Bakery — Analytics
// Revenue line chart (daily/weekly/monthly bucketing), summary
// cards (orders / revenue / AOV), top products table, delivery
// zone breakdown bar chart, and a client-side CSV export — all
// for a selectable period. Data comes from /api/admin/analytics.
//
// Money / line-item / zone data depends on migration 08 having
// run. Until then the API returns schemaReady:false and we show a
// notice; the volume metrics still work from the base columns.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { adminGet } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";
const CARD = { background: "white", borderRadius: 16, padding: "1.25rem", boxShadow: "0 10px 30px rgba(135,56,83,0.08)" } as const;

type Order = {
  id: string;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  subtotal: number;
  delivery_charge: number;
  total: number;
  zone_id: string | null;
};
type Item = {
  product_name: string;
  quantity: number;
  line_total: number;
  order: { created_at: string } | null;
};
type Zone = { id: string; zone_name: string };
type Payload = { orders: Order[]; items: Item[]; zones: Zone[]; schemaReady: boolean };

type Granularity = "daily" | "weekly" | "monthly";
type RangeKey = "7" | "30" | "90" | "all";

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: null },
];

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

// Start-of-day cutoff for a "last N days" window (inclusive of today).
function rangeStart(days: number | null): number {
  if (days == null) return 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}

// Monday of the ISO week containing `d`, as YYYY-MM-DD.
function weekKey(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function bucketKey(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (g === "daily") return iso.slice(0, 10);
  if (g === "monthly") return iso.slice(0, 7); // YYYY-MM
  return weekKey(d);
}

function bucketLabel(key: string, g: Granularity): string {
  if (g === "monthly") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }
  const d = new Date(key);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<RangeKey>("30");
  const [granularity, setGranularity] = useState<Granularity>("daily");

  useEffect(() => {
    (async () => {
      try {
        const d = await adminGet<Payload>("/api/admin/analytics");
        setData(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const days = RANGES.find((r) => r.key === range)?.days ?? null;
  const start = useMemo(() => rangeStart(days), [days]);

  // Orders within the selected period.
  const orders = useMemo(
    () => (data?.orders || []).filter((o) => new Date(o.created_at).getTime() >= start),
    [data, start],
  );

  // Line items within the selected period (by their parent order's date).
  const items = useMemo(
    () => (data?.items || []).filter((it) => it.order && new Date(it.order.created_at).getTime() >= start),
    [data, start],
  );

  const zoneName = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of data?.zones || []) m.set(z.id, z.zone_name);
    return m;
  }, [data]);

  // --- Summary ------------------------------------------------
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const aov = totalOrders ? totalRevenue / totalOrders : 0;

  // --- Revenue chart ------------------------------------------
  const revenueSeries = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const o of orders) {
      const k = bucketKey(o.created_at, granularity);
      buckets.set(k, (buckets.get(k) || 0) + (Number(o.total) || 0));
    }
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => ({ key: k, label: bucketLabel(k, granularity), revenue: Number(v.toFixed(2)) }));
  }, [orders, granularity]);

  // --- Top products -------------------------------------------
  const topProducts = useMemo(() => {
    const map = new Map<string, { units: number; revenue: number }>();
    for (const it of items) {
      const cur = map.get(it.product_name) || { units: 0, revenue: 0 };
      cur.units += Number(it.quantity) || 0;
      cur.revenue += Number(it.line_total) || 0;
      map.set(it.product_name, cur);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [items]);

  // --- Zone breakdown -----------------------------------------
  const zoneSeries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      const name = o.zone_id ? zoneName.get(o.zone_id) || "Unknown zone" : "Unassigned";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders, zoneName]);

  function exportCsv() {
    const cols = ["Order ID", "Date", "Customer", "Email", "Phone", "Status", "Zone", "Subtotal", "Delivery", "Total"];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = orders.map((o) => [
      o.id,
      new Date(o.created_at).toISOString(),
      o.customer_name,
      o.email,
      o.phone,
      o.status,
      o.zone_id ? zoneName.get(o.zone_id) || o.zone_id : "Unassigned",
      Number(o.subtotal || 0).toFixed(2),
      Number(o.delivery_charge || 0).toFixed(2),
      Number(o.total || 0).toFixed(2),
    ]);
    const csv = [cols, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_${range === "all" ? "all" : "last-" + range + "d"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>Analytics</h1>
          <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>Sales trends, popular products and delivery insights.</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || orders.length === 0}
          style={{
            background: orders.length === 0 ? "#cbb3bd" : WINE,
            color: "white",
            border: "none",
            borderRadius: 10,
            padding: "10px 18px",
            fontWeight: 700,
            cursor: orders.length === 0 ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Export CSV
        </button>
      </div>

      {error && <p style={{ background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10 }}>{error}</p>}

      {data && !data.schemaReady && (
        <p style={{ background: "#fff4e5", color: "#92400e", padding: "10px 14px", borderRadius: 10, fontWeight: 600 }}>
          Revenue, product and zone data is empty until you run{" "}
          <code>supabase/sql/08_analytics_schema.sql</code> in the Supabase SQL editor. Order volume still works.
        </p>
      )}

      {/* Period selector */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            style={pill(range === r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginTop: 20 }}>
        <SummaryCard label="Total Orders" value={loading ? "…" : String(totalOrders)} />
        <SummaryCard label="Total Revenue" value={loading ? "…" : gbp.format(totalRevenue)} />
        <SummaryCard label="Average Order Value" value={loading ? "…" : gbp.format(aov)} />
      </div>

      {/* Revenue chart */}
      <div style={{ ...CARD, marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ color: WINE, fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>Revenue</h2>
          <div style={{ display: "flex", gap: 6 }}>
            {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
              <button key={g} onClick={() => setGranularity(g)} style={pill(granularity === g)}>
                {g[0].toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 300, marginTop: 16 }}>
          {revenueSeries.length === 0 ? (
            <Empty label={loading ? "Loading…" : "No revenue in this period."} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: BERRY }} />
                <YAxis tick={{ fontSize: 12, fill: BERRY }} width={70} tickFormatter={(v) => gbp.format(Number(v))} />
                <Tooltip formatter={(v) => gbp.format(Number(v))} />
                <Line type="monotone" dataKey="revenue" stroke={WINE} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 20 }}>
        {/* Top products */}
        <div style={CARD}>
          <h2 style={{ color: WINE, fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>Top Products</h2>
          {topProducts.length === 0 ? (
            <div style={{ height: 220 }}><Empty label={loading ? "Loading…" : "No product sales in this period."} /></div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: BERRY, opacity: 0.7, fontSize: "0.8rem" }}>
                  <th style={th}>Product</th>
                  <th style={{ ...th, textAlign: "right" }}>Units</th>
                  <th style={{ ...th, textAlign: "right" }}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.name} style={{ borderTop: "1px solid #f0e6ea" }}>
                    <td style={{ ...td, color: BERRY, fontWeight: 600 }}>{p.name}</td>
                    <td style={{ ...td, textAlign: "right" }}>{p.units}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 700, color: WINE }}>{gbp.format(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Zone breakdown */}
        <div style={CARD}>
          <h2 style={{ color: WINE, fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>Delivery Zone Breakdown</h2>
          <div style={{ height: 260, marginTop: 12 }}>
            {zoneSeries.length === 0 ? (
              <Empty label={loading ? "Loading…" : "No orders in this period."} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zoneSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: BERRY }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: BERRY }} width={32} />
                  <Tooltip formatter={(v) => [`${v} orders`, "Orders"]} />
                  <Bar dataKey="count" fill={WINE} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={CARD}>
      <div style={{ color: WINE, fontWeight: 800, fontSize: "1.9rem", lineHeight: 1 }}>{value}</div>
      <div style={{ color: BERRY, opacity: 0.7, marginTop: 8, fontSize: "0.9rem", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: BERRY, opacity: 0.6, fontWeight: 600 }}>
      {label}
    </div>
  );
}

function pill(active: boolean): React.CSSProperties {
  return {
    background: active ? WINE : "white",
    color: active ? "white" : BERRY,
    border: `1px solid ${active ? WINE : "#e7d6dd"}`,
    borderRadius: 999,
    padding: "7px 14px",
    fontWeight: 700,
    fontSize: "0.85rem",
    cursor: "pointer",
  };
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 700 };
const td: React.CSSProperties = { padding: "10px 8px", fontSize: "0.9rem" };
