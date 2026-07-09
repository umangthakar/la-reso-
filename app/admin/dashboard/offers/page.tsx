"use client";

// ============================================================
// Le Rasa Bakery — Offer Management (list view)
// Table of offers with a computed Status pill ("Active now" / "Scheduled" /
// "Expired" / "Off"), derived client-side from isOfferCurrentlyActive() in
// lib/offers.ts — never a stored status column. Row actions: Edit, Duplicate,
// enabled Toggle, Delete. All DB work via the password-gated
// /api/admin/offers routes. Styled to match the Products admin page.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminGet, adminSend } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";
import { offerFromRow, isOfferCurrentlyActive, type Offer } from "@/lib/offers";

const WINE = "#873853";
const BERRY = "#5C2A41";
const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  percentage: "Percentage off",
  fixed_amount: "Fixed amount off",
  buy_x_get_y: "Buy X get Y",
  free_delivery: "Free delivery",
  coupon: "Coupon code",
  custom: "Custom",
};

type Status = "Active now" | "Scheduled" | "Expired" | "Off";

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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ offers: Record<string, unknown>[]; total: number }>(
        `/api/admin/offers?page=${page}&pageSize=${PAGE_SIZE}`,
        { force: true },
      );
      setOffers((data.offers || []).map(offerFromRow));
      setTotal(data.total || 0);
      if ((data.offers || []).length === 0 && page > 1) setPage((p) => p - 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load offers");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

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

  const now = new Date();

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

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading offers…</p>
      ) : offers.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>
          No offers yet. Click “New Offer” to create your first one.
        </p>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {offers.map((o) => {
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
              {offers.map((o) => {
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
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ ...secondaryBtn, opacity: page === 1 ? 0.4 : 1 }}>Previous</button>
            <span style={{ padding: "10px 6px", fontWeight: 600 }}>{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ ...secondaryBtn, opacity: page === totalPages ? 0.4 : 1 }}>Next</button>
          </div>
        </div>
      )}
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
