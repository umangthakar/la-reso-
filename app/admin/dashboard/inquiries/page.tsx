"use client";

// ============================================================
// Le Rasa Bakery — Custom Cake Inquiries (admin)
// ------------------------------------------------------------
// Lists every inquiry with its prominent Inquiry Number, searchable by
// Inquiry Number / customer name / phone / email / event type, and filterable
// by status. Click a row to open the full details (all fields + reference
// images + timeline) and move it through New → Contacted → Confirmed → Closed
// (or Cancelled). Details are read-only here; only the status changes.
//
// Service-role, password-gated via /api/admin/inquiries. Inline-styled to
// match the rest of the admin panel.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { adminGet, adminSend } from "@/lib/admin-api";
import {
  INQUIRY_STATUSES,
  inquiryStatusMeta,
  type Inquiry,
  type InquiryStatus,
} from "@/lib/inquiries";

const WINE = "#873853";
const BERRY = "#5C2A41";

// Inline badge colours (the admin panel uses inline styles, not Tailwind).
const BADGE: Record<InquiryStatus, { bg: string; fg: string }> = {
  new: { bg: "rgba(135,56,83,0.12)", fg: WINE },
  contacted: { bg: "#fef3c7", fg: "#92400e" },
  confirmed: { bg: "#dcfce7", fg: "#166534" },
  closed: { bg: "#e5e7eb", fg: "#374151" },
  cancelled: { bg: "#fee2e2", fg: "#b91c1c" },
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminInquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Seed the search from ?q= so the owner-email "View Inquiry" link lands
  // pre-filtered on that inquiry number.
  const [q, setQ] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [statusFilter, setStatusFilter] = useState<"" | InquiryStatus>("");
  const [selected, setSelected] = useState<Inquiry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (statusFilter) params.set("status", statusFilter);
      const data = await adminGet<{ inquiries: Inquiry[] }>(
        `/api/admin/inquiries${params.toString() ? `?${params}` : ""}`,
        { force: true },
      );
      setInquiries(Array.isArray(data.inquiries) ? data.inquiries : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inquiries");
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter]);

  // Runs on mount and whenever the status filter changes. (Free-text search is
  // applied on submit / Enter via load(), not on every keystroke.)
  useEffect(() => {
    load();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(id: string, status: InquiryStatus) {
    try {
      const { inquiry } = await adminSend<{ inquiry: Record<string, unknown> }>(
        `/api/admin/inquiries/${id}`,
        "PATCH",
        { status },
      );
      // Merge the returned timestamps into our row + open modal.
      setInquiries((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                status,
                contacted_at: (inquiry.contacted_at as string) ?? x.contacted_at,
                confirmed_at: (inquiry.confirmed_at as string) ?? x.confirmed_at,
                closed_at: (inquiry.closed_at as string) ?? x.closed_at,
                cancelled_at: (inquiry.cancelled_at as string) ?? x.cancelled_at,
              }
            : x,
        ),
      );
      setSelected((s) => (s && s.id === id ? { ...s, status } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>
        Custom Cake Inquiries
      </h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>
        Every inquiry carries a permanent Inquiry Number (CQ-YYYYMMDD-NNN). Search
        by number, name, phone, email or event type.
      </p>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "18px 0" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          style={{ display: "flex", gap: 8, flex: 1, minWidth: 240 }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search CQ-…, name, phone, email, event type"
            style={inputStyle}
          />
          <button type="submit" style={primaryBtn}>Search</button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | InquiryStatus)}
          style={{ ...inputStyle, width: "auto" }}
        >
          <option value="">All statuses</option>
          {INQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {inquiryStatusMeta(s).label}
            </option>
          ))}
        </select>
      </div>

      {error && <p style={errorBox}>{error}</p>}

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7 }}>Loading…</p>
      ) : inquiries.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7 }}>No inquiries found.</p>
      ) : (
        <div style={{ overflowX: "auto", background: "white", borderRadius: 14, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                {["Inquiry No.", "Customer", "Event", "Delivery", "Created", "Status", ""].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inquiries.map((inq) => {
                const badge = BADGE[inq.status];
                return (
                  <tr key={inq.id} style={{ borderTop: "1px solid rgba(135,56,83,0.1)" }}>
                    <td style={{ ...td, fontWeight: 800, color: WINE, whiteSpace: "nowrap" }}>
                      {inq.inquiry_number || "—"}
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{inq.name || "—"}</div>
                      <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{inq.phone || inq.email}</div>
                    </td>
                    <td style={td}>{inq.event_type || "—"}</td>
                    <td style={td}>{formatDate(inq.delivery_date)}</td>
                    <td style={td}>{formatDate(inq.created_at)}</td>
                    <td style={td}>
                      <span style={{ background: badge.bg, color: badge.fg, borderRadius: 999, padding: "3px 10px", fontSize: "0.78rem", fontWeight: 700 }}>
                        {inquiryStatusMeta(inq.status).label}
                      </span>
                    </td>
                    <td style={td}>
                      <button type="button" onClick={() => setSelected(inq)} style={ghostBtn}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DetailsModal
          inquiry={selected}
          onClose={() => setSelected(null)}
          onStatus={(status) => updateStatus(selected.id, status)}
        />
      )}
    </div>
  );
}

function DetailsModal({
  inquiry,
  onClose,
  onStatus,
}: {
  inquiry: Inquiry;
  onClose: () => void;
  onStatus: (s: InquiryStatus) => void;
}) {
  const rows: [string, string][] = [
    ["Event type", inquiry.event_type],
    ["Delivery date", formatDate(inquiry.delivery_date)],
    ["Servings", inquiry.servings],
    ["Budget", inquiry.budget],
    ["Flavour", inquiry.flavour],
    ["Shape", inquiry.shape],
    ["Colour theme", inquiry.colour_theme],
    ["Cake message", inquiry.cake_message],
    ["Additional notes", inquiry.notes],
  ];
  const timeline: [string, string | null][] = [
    ["Submitted", inquiry.created_at],
    ["Contacted", inquiry.contacted_at],
    ["Confirmed", inquiry.confirmed_at],
    ["Closed", inquiry.closed_at],
    ["Cancelled", inquiry.cancelled_at],
  ];

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: WINE }}>
              Inquiry number
            </p>
            <h2 style={{ margin: "2px 0 0", color: BERRY, fontSize: "1.4rem", fontWeight: 800 }}>
              {inquiry.inquiry_number || "—"}
            </h2>
          </div>
          <button type="button" onClick={onClose} style={{ ...ghostBtn, fontSize: "1.1rem", lineHeight: 1 }} aria-label="Close">×</button>
        </div>

        {/* Contact on WhatsApp — opens a chat to the CUSTOMER's number with a
            professional pre-filled message. */}
        {(() => {
          const digits = inquiry.phone.replace(/[^\d]/g, "");
          if (!digits) return null;
          const msg =
            `Hello ${inquiry.name || "there"}\n\n` +
            `Thank you for contacting Le Rasa Bakery.\n\n` +
            `Your enquiry ${inquiry.inquiry_number} has been received.\n\n` +
            `Let's discuss your cake.\n\n` +
            `Regards,\nLe Rasa Bakery`;
          const href = `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginTop: 16,
                padding: "10px 18px",
                borderRadius: 10,
                background: "#25D366",
                color: "white",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              💬 Contact on WhatsApp
            </a>
          );
        })()}

        {/* Status control */}
        <div style={{ marginTop: 16 }}>
          <label style={labelStyle}>Status</label>
          <select
            value={inquiry.status}
            onChange={(e) => onStatus(e.target.value as InquiryStatus)}
            style={inputStyle}
          >
            {INQUIRY_STATUSES.map((s) => (
              <option key={s} value={s}>{inquiryStatusMeta(s).label}</option>
            ))}
          </select>
        </div>

        {/* Customer */}
        <Group title="Customer">
          <KV k="Name" v={inquiry.name} />
          <KV k="Phone" v={inquiry.phone} />
          <KV k="Email" v={inquiry.email} />
        </Group>

        {/* Cake details */}
        <Group title="Cake details">
          {rows.map(([k, v]) => (
            <KV key={k} k={k} v={v} />
          ))}
        </Group>

        {/* Reference images */}
        {inquiry.reference_images.length > 0 && (
          <Group title="Reference images">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {inquiry.reference_images.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Reference ${i + 1}`}
                    style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(135,56,83,0.15)" }}
                  />
                </a>
              ))}
            </div>
          </Group>
        )}

        {/* Timeline */}
        <Group title="Timeline">
          {timeline
            .filter(([, at]) => at)
            .map(([label, at]) => (
              <KV key={label} k={label} v={formatDate(at)} />
            ))}
        </Group>

        {inquiry.converted_order_id && (
          <p style={{ ...hint, marginTop: 12 }}>
            Converted to order <strong>{inquiry.converted_order_id.slice(0, 8).toUpperCase()}</strong>.
          </p>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, borderTop: "1px solid rgba(135,56,83,0.12)", paddingTop: 12 }}>
      <h3 style={{ margin: "0 0 8px", color: WINE, fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  if (!v) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "3px 0", fontSize: "0.9rem" }}>
      <span style={{ color: BERRY, opacity: 0.7, flexShrink: 0 }}>{k}</span>
      <span style={{ color: BERRY, fontWeight: 600, textAlign: "right", minWidth: 0, wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(135,56,83,0.25)",
  fontSize: "0.95rem",
  color: BERRY,
  outline: "none",
  background: "white",
};
const primaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: WINE,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const ghostBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 8,
  border: `1px solid ${WINE}`,
  background: "transparent",
  color: WINE,
  fontWeight: 700,
  cursor: "pointer",
};
const th: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: "0.75rem",
  fontWeight: 800,
  color: BERRY,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  textAlign: "left",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "12px 14px", fontSize: "0.9rem", color: BERRY, verticalAlign: "middle" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: BERRY, marginBottom: 6, fontSize: "0.9rem" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginBottom: 16 };
const hint: React.CSSProperties = { color: BERRY, opacity: 0.7, fontSize: "0.85rem" };
const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(60,20,40,0.45)",
  display: "grid",
  placeItems: "center",
  padding: "1.5rem",
  zIndex: 50,
};
const modal: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "white",
  borderRadius: 18,
  padding: "1.75rem",
};
