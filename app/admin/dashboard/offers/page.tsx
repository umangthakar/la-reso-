"use client";

// ============================================================
// Le Rasa Bakery — Offer Management (dashboard + list view)
// A summary strip of Active / Scheduled / Expired / Disabled buckets (each one
// a filter) plus quick statistics, over a table of offers. Every Status pill is
// computed client-side from isOfferCurrentlyActive() in lib/offers.ts — never a
// stored status column — and re-derived every minute so a schedule boundary
// shows up without a reload.
//
// The whole offer set is loaded up front (paging the API 100 at a time) so the
// bucket counts and the bucket filter are exact across all offers rather than
// only the visible page; pagination below is then client-side. Offers are
// inherently few, so this stays cheap.
//
// Row actions: Edit, Duplicate, enabled Toggle, Delete. All DB work via the
// password-gated /api/admin/offers routes. Styled to match the Products page.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminGet, adminSend } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";
import { offerFromRow, isOfferCurrentlyActive, type Offer } from "@/lib/offers";

const WINE = "#873853";
const BERRY = "#5C2A41";
const PAGE_SIZE = 20;
const FETCH_SIZE = 100; // the API's max pageSize
const STATUS_REFRESH_MS = 60_000;

const TYPE_LABELS: Record<string, string> = {
  percentage: "Percentage off",
  fixed_amount: "Fixed amount off",
  buy_x_get_y: "Buy X get Y",
  free_delivery: "Free delivery",
  coupon: "Coupon code",
  custom: "Custom",
};

type Status = "Active now" | "Scheduled" | "Expired" | "Off";
type Filter = "All" | Status;

const FILTERS: Filter[] = ["All", "Active now", "Scheduled", "Expired", "Off"];

// The bucket cards use friendlier headings than the pill text.
const FILTER_LABELS: Record<Filter, string> = {
  All: "All offers",
  "Active now": "Active",
  Scheduled: "Scheduled",
  Expired: "Expired",
  Off: "Disabled",
};

// Derived, never stored: enabled + schedule decide the live status.
function offerStatus(offer: Offer, now: Date): Status {
  if (!offer.enabled) return "Off";
  if (isOfferCurrentlyActive(offer, now)) return "Active now";
  // Enabled but not active right now: expired if its window has closed,
  // otherwise it's waiting for its start / time-of-day / weekday to come round.
  if (offer.end_at && !Number.isNaN(Date.parse(offer.end_at)) && now.getTime() > Date.parse(offer.end_at)) {
    return "Expired";
  }
  return "Scheduled";
}

const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  "Active now": { bg: "#e4f4ea", fg: "#1f7a44" },
  Scheduled: { bg: "#fbeede", fg: "#9a6212" },
  Expired: { bg: "rgba(135,56,83,0.08)", fg: "rgba(92,42,65,0.65)" },
  Off: { bg: "rgba(135,56,83,0.08)", fg: "rgba(92,42,65,0.65)" },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function OffersAdminPage() {
  const isMobile = useIsMobile();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Statuses are time-dependent, so keep a ticking clock rather than reading
  // new Date() during render (which would never re-run on a schedule boundary).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), STATUS_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Load every offer, paging the API until we've collected `total`.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const collected: Offer[] = [];
      let pageNo = 1;
      let total = 0;
      // Bounded by `total`; the guard on an empty page stops a bad response
      // from looping forever.
      for (;;) {
        const data = await adminGet<{ offers: Record<string, unknown>[]; total: number }>(
          `/api/admin/offers?page=${pageNo}&pageSize=${FETCH_SIZE}`,
          { force: true },
        );
        const batch = data.offers || [];
        total = data.total || 0;
        collected.push(...batch.map(offerFromRow));
        if (batch.length === 0 || collected.length >= total) break;
        pageNo += 1;
      }
      setOffers(collected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load offers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Bucket counts across ALL offers, not just the visible page.
  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      All: offers.length,
      "Active now": 0,
      Scheduled: 0,
      Expired: 0,
      Off: 0,
    };
    for (const o of offers) c[offerStatus(o, now)] += 1;
    return c;
  }, [offers, now]);

  const stats = useMemo(
    () => ({
      coupons: offers.filter((o) => o.type === "coupon").length,
      stackable: offers.filter((o) => o.stackable).length,
      freeDelivery: offers.filter((o) => o.type === "free_delivery" || o.free_delivery).length,
    }),
    [offers],
  );

  const filtered = useMemo(
    () => (filter === "All" ? offers : offers.filter((o) => offerStatus(o, now) === filter)),
    [offers, filter, now],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp rather than store a page that no longer exists after a filter change.
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function selectFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  async function toggleEnabled(offer: Offer) {
    setBusyId(offer.id);
    setError("");
    // Optimistic flip; revert (via reload) if the server rejects (e.g. the
    // exclusion constraint refuses a second overlapping non-stackable offer).
    setOffers((prev) => prev.map((o) => (o.id === offer.id ? { ...o, enabled: !o.enabled } : o)));
    try {
      await adminSend(`/api/admin/offers/${offer.id}`, "PATCH", { enabled: !offer.enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(offer: Offer) {
    setBusyId(offer.id);
    setError("");
    try {
      await adminSend(`/api/admin/offers/${offer.id}/duplicate`, "POST");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to duplicate");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(offer: Offer) {
    if (!window.confirm(`Delete "${offer.name}"? This cannot be undone.`)) return;
    setBusyId(offer.id);
    setError("");
    try {
      await adminSend(`/api/admin/offers/${offer.id}`, "DELETE");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>Offers</h1>
        <Link href="/admin/dashboard/offers/new" style={{ ...primaryBtn, textDecoration: "none", ...(isMobile ? { minHeight: 44, width: "100%", textAlign: "center" } : {}) }}>
          + New Offer
        </Link>
      </div>
      <p style={{ color: BERRY, opacity: 0.7, marginTop: 4, fontSize: "0.9rem" }}>
        Status is worked out live from each offer’s on/off switch and schedule — there’s nothing to flip manually.
      </p>

      {error && <p style={errorBox}>{error}</p>}

      {/* OFFER DASHBOARD — bucket counts double as filters ---------------- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))",
          gap: 12,
          marginTop: 20,
        }}
      >
        {FILTERS.map((f) => (
          <BucketCard
            key={f}
            label={FILTER_LABELS[f]}
            count={counts[f]}
            selected={filter === f}
            loading={loading}
            onClick={() => selectFilter(f)}
          />
        ))}
      </div>

      {/* QUICK STATISTICS ------------------------------------------------- */}
      <div style={{ background: "white", borderRadius: 16, padding: "1rem 1.25rem", marginTop: 12, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
        <h2 style={{ color: WINE, fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>
          Quick statistics
        </h2>
        <div style={{ display: "flex", gap: isMobile ? 16 : 32, flexWrap: "wrap" }}>
          <QuickStat label="Coupon codes" value={stats.coupons} loading={loading} />
          <QuickStat label="Stackable" value={stats.stackable} loading={loading} />
          <QuickStat label="Include free delivery" value={stats.freeDelivery} loading={loading} />
        </div>
      </div>

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading offers…</p>
      ) : offers.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>
          No offers yet. Click “New Offer” to create your first one.
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>
          No {FILTER_LABELS[filter].toLowerCase()} offers.{" "}
          <button onClick={() => selectFilter("All")} style={{ ...linkBtn, marginLeft: 0 }}>Show all offers</button>
        </p>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {visible.map((o) => {
            const status = offerStatus(o, now);
            return (
              <div key={o.id} style={{ background: "white", borderRadius: 14, padding: "14px 16px", boxShadow: "0 8px 24px rgba(135,56,83,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 700, color: BERRY, flex: 1 }}>{o.name}</span>
                  <StatusPill status={status} />
                </div>
                <CardField label="Type" value={TYPE_LABELS[o.type] ?? o.type} />
                <CardField label="Priority" value={String(o.priority)} />
                <CardField label="Starts" value={fmtDate(o.start_at)} />
                <CardField label="Ends" value={fmtDate(o.end_at)} />
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <Toggle on={o.enabled} onClick={() => toggleEnabled(o)} />
                  <span style={{ color: BERRY, fontWeight: 600, fontSize: "0.85rem" }}>{o.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <Link href={`/admin/dashboard/offers/${o.id}`} style={{ ...secondaryBtn, minHeight: 44, flex: 1, textAlign: "center", textDecoration: "none" }}>Edit</Link>
                  <button onClick={() => duplicate(o)} disabled={busyId === o.id} style={{ ...secondaryBtn, minHeight: 44, flex: 1 }}>Duplicate</button>
                  <button onClick={() => remove(o)} disabled={busyId === o.id} style={{ ...secondaryBtn, minHeight: 44, flex: 1, borderColor: "#d9534f", color: "#d9534f" }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "white", borderRadius: 16, overflow: "auto", marginTop: 16, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr style={{ background: "rgba(135,56,83,0.06)", textAlign: "left" }}>
                <th style={th}>Name</th>
                <th style={th}>Type</th>
                <th style={th}>Status</th>
                <th style={th}>Priority</th>
                <th style={th}>Start</th>
                <th style={th}>End</th>
                <th style={th}>Enabled</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => {
                const status = offerStatus(o, now);
                return (
                  <tr key={o.id} style={{ borderTop: "1px solid rgba(135,56,83,0.08)" }}>
                    <td style={{ ...td, fontWeight: 600 }}>{o.name}</td>
                    <td style={td}>{TYPE_LABELS[o.type] ?? o.type}</td>
                    <td style={td}><StatusPill status={status} /></td>
                    <td style={td}>{o.priority}</td>
                    <td style={td}>{fmtDate(o.start_at)}</td>
                    <td style={td}>{fmtDate(o.end_at)}</td>
                    <td style={td}><Toggle on={o.enabled} onClick={() => toggleEnabled(o)} /></td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <Link href={`/admin/dashboard/offers/${o.id}`} style={linkBtn}>Edit</Link>
                      <button onClick={() => duplicate(o)} disabled={busyId === o.id} style={linkBtn}>Duplicate</button>
                      <button onClick={() => remove(o)} disabled={busyId === o.id} style={{ ...linkBtn, color: "#d9534f" }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, color: BERRY }}>
          <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1} style={{ ...secondaryBtn, opacity: safePage === 1 ? 0.4 : 1 }}>Previous</button>
            <span style={{ padding: "10px 6px", fontWeight: 600 }}>{safePage} / {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} style={{ ...secondaryBtn, opacity: safePage === totalPages ? 0.4 : 1 }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BucketCard({
  label,
  count,
  selected,
  loading,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        background: "white",
        borderRadius: 16,
        padding: "1rem 1.1rem",
        textAlign: "left",
        cursor: "pointer",
        border: `2px solid ${selected ? WINE : "transparent"}`,
        boxShadow: "0 10px 30px rgba(135,56,83,0.08)",
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.6 }}>
        {label}
      </div>
      <div style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, lineHeight: 1.2, marginTop: 4 }}>
        {loading ? "—" : count}
      </div>
    </button>
  );
}

function QuickStat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div>
      <div style={{ color: WINE, fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.2 }}>{loading ? "—" : value}</div>
      <div style={{ fontSize: "0.82rem", color: BERRY, opacity: 0.7, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const c = STATUS_COLORS[status];
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, background: c.bg, color: c.fg, fontWeight: 700, fontSize: "0.78rem", whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.6 }}>{label}</span>
      <span style={{ color: BERRY, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{ width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer", background: on ? WINE : "rgba(135,56,83,0.2)", position: "relative", transition: "background 0.15s" }}
    >
      <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left 0.15s" }} />
    </button>
  );
}

const th: React.CSSProperties = { padding: "12px 14px", fontSize: "0.8rem", fontWeight: 700, color: BERRY, textTransform: "uppercase", letterSpacing: "0.03em" };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: "0.92rem", color: BERRY, verticalAlign: "middle" };
const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: WINE, color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${WINE}`, background: "transparent", color: WINE, fontWeight: 700, cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: WINE, fontWeight: 700, cursor: "pointer", marginLeft: 12, fontSize: "0.9rem", textDecoration: "none" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };
