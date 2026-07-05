"use client";

// ============================================================
// Le Rasa Bakery — Orders
// Table (Order #, Date, Customer, Delivery Date, Status, Actions),
// coloured status pills, a side drawer with full detail + status
// updater, a filter bar (status / date range / name search),
// per-order PDF invoice (jsPDF, rose branding), and pagination.
//
// Live orders schema: id, customer_name, email, phone, message,
// status, created_at, delivery_date (after 04_orders_delivery_date.sql).
// "Items" and "Total" are intentionally omitted — these are enquiry
// orders with no line items or totals in the database.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminGet, adminSend } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";

const WINE = "#873853";
const BERRY = "#5C2A41";
const PAGE_SIZE = 20;

type Order = {
  id: string;
  customer_name: string;
  email: string;
  phone: string;
  message: string | null;
  status: string;
  created_at: string;
  delivery_date?: string | null;
  total?: number | null;
  amount?: number | null;
};

// Order total (paid orders carry one; older enquiry orders don't).
function fmtMoney(o: Order): string {
  const v = o.total ?? o.amount;
  return v == null ? "—" : `£${Number(v).toFixed(2)}`;
}

const STATUS_ORDER = ["received", "preparing", "out_for_delivery", "delivered", "cancelled"];

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  received: { label: "Received", bg: "#e8e8e8", fg: "#555555" },
  preparing: { label: "Preparing", bg: "#fdebd0", fg: "#92400e" },
  out_for_delivery: { label: "Out for Delivery", bg: "#dbeafe", fg: "#1e40af" },
  delivered: { label: "Delivered", bg: "#dcfce7", fg: "#166534" },
  cancelled: { label: "Cancelled", bg: "#fee2e2", fg: "#991b1b" },
};

function meta(status: string) {
  return STATUS_META[status] ?? { label: status, bg: "#e8e8e8", fg: "#555" };
}

function StatusPill({ status }: { status: string }) {
  const m = meta(status);
  return (
    <span style={{ background: m.bg, color: m.fg, padding: "4px 12px", borderRadius: 999, fontSize: "0.8rem", fontWeight: 700, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

function orderNumber(o: Order) {
  return "#" + o.id.slice(0, 8).toUpperCase();
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function OrdersAdminPage() {
  const isMobile = useIsMobile();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ orders: Order[] }>("/api/admin/orders");
      setOrders(data.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (search.trim() && !o.customer_name?.toLowerCase().includes(search.trim().toLowerCase())) return false;
      const created = o.created_at?.slice(0, 10);
      if (fromDate && created < fromDate) return false;
      if (toDate && created > toDate) return false;
      return true;
    });
  }, [orders, statusFilter, search, fromDate, toDate]);

  // Reset to page 1 whenever filters change the result set size.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function updateStatus(order: Order, status: string) {
    setUpdating(true);
    setError("");
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
    setSelected((s) => (s && s.id === order.id ? { ...s, status } : s));
    try {
      await adminSend(`/api/admin/orders/${order.id}`, "PUT", { status });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
      await load();
    } finally {
      setUpdating(false);
    }
  }

  async function downloadInvoice(o: Order) {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Rose branding header
    doc.setFillColor(135, 56, 83); // wine
    doc.rect(0, 0, pageW, 90, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("Le Rasa Bakery", 40, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Order Confirmation", 40, 70);

    // Body
    doc.setTextColor(92, 42, 65); // berry
    let y = 130;
    const line = (label: string, value: string) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 40, y);
      doc.setFont("helvetica", "normal");
      doc.text(value || "—", 200, y);
      y += 26;
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(`Order ${orderNumber(o)}`, 40, y);
    y += 30;
    doc.setFontSize(11);

    line("Order date:", fmtDateTime(o.created_at));
    line("Delivery date:", fmtDate(o.delivery_date));
    line("Status:", meta(o.status).label);
    y += 10;
    doc.setFillColor(213, 164, 164); // rose divider
    doc.rect(40, y - 14, pageW - 80, 1, "F");

    line("Customer:", o.customer_name);
    line("Email:", o.email);
    line("Phone:", o.phone);

    // Message / special instructions (wrapped)
    doc.setFont("helvetica", "bold");
    doc.text("Special instructions:", 40, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    const wrapped = doc.splitTextToSize(o.message || "—", pageW - 80);
    doc.text(wrapped, 40, y);

    // Footer
    doc.setTextColor(156, 97, 109);
    doc.setFontSize(9);
    doc.text("Thank you for ordering with Le Rasa Bakery 🌹", 40, doc.internal.pageSize.getHeight() - 40);

    doc.save(`invoice-${o.id.slice(0, 8)}.pdf`);
  }

  return (
    <div>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>Orders</h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>
        Click a row to view full details and update the status.
      </p>

      {error && <p style={errorBox}>{error}</p>}

      {/* Filter bar — side by side on desktop, stacked on mobile */}
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          flexWrap: isMobile ? "nowrap" : "wrap",
          gap: 12,
          marginTop: 16,
          alignItems: isMobile ? "stretch" : "flex-end",
        }}
      >
        <div style={{ width: isMobile ? "100%" : undefined }}>
          <label style={filterLabel}>Status</label>
          <select style={{ ...filterInput, ...(isMobile ? mobileField : {}) }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{meta(s).label}</option>
            ))}
          </select>
        </div>
        <div style={{ width: isMobile ? "100%" : undefined }}>
          <label style={filterLabel}>From</label>
          <input type="date" style={{ ...filterInput, ...(isMobile ? mobileField : {}) }} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div style={{ width: isMobile ? "100%" : undefined }}>
          <label style={filterLabel}>To</label>
          <input type="date" style={{ ...filterInput, ...(isMobile ? mobileField : {}) }} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: isMobile ? undefined : 180, width: isMobile ? "100%" : undefined }}>
          <label style={filterLabel}>Search customer</label>
          <input style={{ ...filterInput, width: "100%", ...(isMobile ? mobileField : {}) }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer name…" />
        </div>
        {(statusFilter !== "all" || fromDate || toDate || search) && (
          <button
            onClick={() => { setStatusFilter("all"); setFromDate(""); setToDate(""); setSearch(""); }}
            style={{ ...secondaryBtn, ...(isMobile ? { minHeight: 44, width: "100%" } : {}) }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading orders…</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>
          {orders.length === 0 ? "No orders yet." : "No orders match these filters."}
        </p>
      ) : (
        <>
          {isMobile ? (
            /* Stacked card view — one card per order, label:value pairs */
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              {pageItems.map((o) => (
                <div
                  key={o.id}
                  onClick={() => setSelected(o)}
                  style={{ background: "white", borderRadius: 14, padding: "14px 16px", boxShadow: "0 8px 24px rgba(135,56,83,0.08)", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontFamily: "monospace", color: BERRY }}>{orderNumber(o)}</span>
                    <StatusPill status={o.status} />
                  </div>
                  <CardRow label="Customer" value={o.customer_name} />
                  <CardRow label="Order date" value={fmtDate(o.created_at)} />
                  <CardRow label="Delivery date" value={fmtDate(o.delivery_date)} />
                  <CardRow label="Total" value={fmtMoney(o)} />
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadInvoice(o); }}
                    style={{ ...secondaryBtn, minHeight: 44, width: "100%", marginTop: 12 }}
                  >
                    Download Invoice
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: "white", borderRadius: 16, overflow: "auto", marginTop: 16, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                <thead>
                  <tr style={{ background: "rgba(135,56,83,0.06)", textAlign: "left" }}>
                    <th style={th}>Order #</th>
                    <th style={th}>Date</th>
                    <th style={th}>Customer</th>
                    <th style={th}>Delivery Date</th>
                    <th style={{ ...th, textAlign: "right" }}>Total</th>
                    <th style={th}>Status</th>
                    <th style={{ ...th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => setSelected(o)}
                      style={{ borderTop: "1px solid rgba(135,56,83,0.08)", cursor: "pointer" }}
                    >
                      <td style={{ ...td, fontWeight: 700, fontFamily: "monospace" }}>{orderNumber(o)}</td>
                      <td style={td}>{fmtDate(o.created_at)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{o.customer_name}</td>
                      <td style={td}>{fmtDate(o.delivery_date)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(o)}</td>
                      <td style={td}><StatusPill status={o.status} /></td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button onClick={(e) => { e.stopPropagation(); downloadInvoice(o); }} style={linkBtn}>
                          Download Invoice
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, color: BERRY }}>
            <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ ...secondaryBtn, opacity: page === 1 ? 0.4 : 1 }}>
                Previous
              </button>
              <span style={{ padding: "10px 6px", fontWeight: 600 }}>{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ ...secondaryBtn, opacity: page === totalPages ? 0.4 : 1 }}>
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail drawer */}
      {selected && (
        <div style={drawerOverlay} onClick={() => setSelected(null)}>
          <aside style={{ ...drawer, ...(isMobile ? { maxWidth: "100%", padding: "1.25rem" } : {}) }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ color: WINE, margin: 0, fontSize: "1.3rem", fontFamily: "monospace" }}>{orderNumber(selected)}</h2>
              <button onClick={() => setSelected(null)} style={{ ...linkBtn, marginLeft: 0, fontSize: "1.4rem" }}>×</button>
            </div>
            <div style={{ marginTop: 4 }}><StatusPill status={selected.status} /></div>

            <DetailRow label="Order date" value={fmtDateTime(selected.created_at)} />
            <DetailRow label="Delivery date" value={fmtDate(selected.delivery_date)} />
            <DetailRow label="Total paid" value={fmtMoney(selected)} />
            <div style={divider} />
            <DetailRow label="Customer" value={selected.customer_name} />
            <DetailRow label="Email" value={selected.email} />
            <DetailRow label="Phone" value={selected.phone} />
            <DetailRow label="Special instructions" value={selected.message || "—"} multiline />

            <div style={divider} />
            <label style={{ ...filterLabel, marginBottom: 8 }}>Update status</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {STATUS_ORDER.map((s) => {
                const active = selected.status === s;
                const m = meta(s);
                return (
                  <button
                    key={s}
                    disabled={updating || active}
                    onClick={() => updateStatus(selected, s)}
                    style={{
                      padding: isMobile ? "10px 16px" : "8px 14px",
                      minHeight: isMobile ? 44 : undefined,
                      borderRadius: 999,
                      border: active ? `2px solid ${m.fg}` : "1px solid rgba(135,56,83,0.25)",
                      background: active ? m.bg : "white",
                      color: active ? m.fg : BERRY,
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      cursor: active ? "default" : "pointer",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <button onClick={() => downloadInvoice(selected)} style={{ ...primaryBtn, marginTop: 24, width: "100%", minHeight: isMobile ? 44 : undefined }}>
              Download Invoice (PDF)
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

function CardRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.6 }}>{label}</span>
      <span style={{ color: BERRY, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function DetailRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.6 }}>{label}</div>
      <div style={{ marginTop: 4, color: BERRY, fontWeight: 500, whiteSpace: multiline ? "pre-wrap" : "normal" }}>{value}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "12px 14px", fontSize: "0.8rem", fontWeight: 700, color: BERRY, textTransform: "uppercase", letterSpacing: "0.03em" };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: "0.92rem", color: BERRY, verticalAlign: "middle" };
const filterLabel: React.CSSProperties = { display: "block", fontSize: "0.78rem", fontWeight: 700, color: BERRY, opacity: 0.7, marginBottom: 4 };
const filterInput: React.CSSProperties = { padding: "9px 11px", borderRadius: 10, border: "1px solid rgba(135,56,83,0.25)", color: BERRY, fontSize: "0.9rem", background: "white", outline: "none" };
// Applied to filter fields on mobile: full width + 44px tap target.
const mobileField: React.CSSProperties = { width: "100%", minHeight: 44, boxSizing: "border-box" };
const primaryBtn: React.CSSProperties = { padding: "11px 18px", borderRadius: 10, border: "none", background: WINE, color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "9px 16px", borderRadius: 10, border: `1px solid ${WINE}`, background: "transparent", color: WINE, fontWeight: 700, cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: WINE, fontWeight: 700, cursor: "pointer", marginLeft: 12, fontSize: "0.9rem" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };
const drawerOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(60,20,40,0.45)", zIndex: 50, display: "flex", justifyContent: "flex-end" };
const drawer: React.CSSProperties = { width: "100%", maxWidth: 440, height: "100%", background: "white", padding: "1.75rem", overflowY: "auto", boxShadow: "-10px 0 40px rgba(60,20,40,0.2)" };
const divider: React.CSSProperties = { height: 1, background: "rgba(135,56,83,0.12)", margin: "18px 0 4px" };
