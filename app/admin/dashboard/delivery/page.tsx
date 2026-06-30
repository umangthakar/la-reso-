"use client";

// ============================================================
// Le Rasa Bakery — Delivery Settings admin
// Manage delivery zones & fees, lead time, blocked dates,
// delivery days and the daily order cap. Everything persists to the
// site_settings row via /api/admin/delivery.
//
// Requires the columns added by supabase/sql/05_delivery_settings.sql.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { adminGet, adminSend } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";

const DAYS: { key: string; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

type Zone = { id: string; name: string; postcode_prefix: string; fee: number };

type Settings = {
  delivery_zones: Zone[];
  lead_time_days: number;
  blocked_dates: string[];
  delivery_days: string[];
  daily_order_cap: number | null;
};

const EMPTY: Settings = {
  delivery_zones: [],
  lead_time_days: 3,
  blocked_dates: [],
  delivery_days: DAYS.map((d) => d.key),
  daily_order_cap: null,
};

// ---- local-date helpers (avoid UTC off-by-one from toISOString) ----
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromKey(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function prettyDate(s: string): string {
  return fromKey(s).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DeliverySettingsPage() {
  const [s, setS] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);

  // Local inputs for the two "Save"-button sections.
  const [leadInput, setLeadInput] = useState("3");
  const [capInput, setCapInput] = useState("");

  // Zone modal state.
  const [zoneModal, setZoneModal] = useState<Zone | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ settings: Settings }>("/api/admin/delivery");
      const next = { ...EMPTY, ...data.settings };
      setS(next);
      setLeadInput(String(next.lead_time_days));
      setCapInput(next.daily_order_cap == null ? "" : String(next.daily_order_cap));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load delivery settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Persist the full settings object; the API replaces all delivery fields.
  async function save(next: Settings) {
    setSaving(true);
    setError("");
    try {
      const data = await adminSend<{ settings: Settings }>(
        "/api/admin/delivery",
        "PUT",
        next,
      );
      const merged = { ...EMPTY, ...data.settings };
      setS(merged);
      setLeadInput(String(merged.lead_time_days));
      setCapInput(merged.daily_order_cap == null ? "" : String(merged.daily_order_cap));
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      // Reload to resync UI with whatever is actually stored.
      load();
    } finally {
      setSaving(false);
    }
  }

  const blockedDateObjs = useMemo(
    () => s.blocked_dates.map(fromKey),
    [s.blocked_dates],
  );

  // ---- handlers ----
  function saveZone(zone: Zone) {
    const exists = s.delivery_zones.some((z) => z.id === zone.id);
    const zones = exists
      ? s.delivery_zones.map((z) => (z.id === zone.id ? zone : z))
      : [...s.delivery_zones, zone];
    setZoneModal(null);
    save({ ...s, delivery_zones: zones });
  }
  function deleteZone(id: string) {
    save({ ...s, delivery_zones: s.delivery_zones.filter((z) => z.id !== id) });
  }

  function onCalendarSelect(dates: Date[] | undefined) {
    const keys = Array.from(new Set((dates ?? []).map(toKey))).sort();
    save({ ...s, blocked_dates: keys });
  }
  function removeBlocked(key: string) {
    save({ ...s, blocked_dates: s.blocked_dates.filter((d) => d !== key) });
  }

  function toggleDay(key: string) {
    const has = s.delivery_days.includes(key);
    const days = has
      ? s.delivery_days.filter((d) => d !== key)
      : [...s.delivery_days, key];
    save({ ...s, delivery_days: days });
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>
        Delivery Settings
      </h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>
        Delivery zones &amp; fees, lead time, blocked dates, delivery days and the
        daily order cap.
      </p>

      {error && <p style={errorBox}>{error}</p>}
      {!error && savedAt > 0 && <p style={okBox}>Saved! ✓</p>}

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading…</p>
      ) : (
        <>
          {/* ---------------- DELIVERY ZONES ---------------- */}
          <Card>
            <SectionHead
              title="Delivery zones"
              action={
                <button
                  style={primaryBtn}
                  onClick={() =>
                    setZoneModal({
                      id: crypto.randomUUID(),
                      name: "",
                      postcode_prefix: "",
                      fee: 0,
                    })
                  }
                >
                  + Add zone
                </button>
              }
            />
            {s.delivery_zones.length === 0 ? (
              <Empty>No zones yet. Add one to charge a delivery fee by area.</Empty>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead>
                  <tr>
                    <Th>Zone name</Th>
                    <Th>Postcode prefix</Th>
                    <Th>Delivery fee</Th>
                    <Th style={{ textAlign: "right" }}>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {s.delivery_zones.map((z) => (
                    <tr key={z.id} style={{ borderTop: "1px solid rgba(135,56,83,0.12)" }}>
                      <Td style={{ fontWeight: 600 }}>{z.name}</Td>
                      <Td>{z.postcode_prefix || "—"}</Td>
                      <Td>£{z.fee.toFixed(2)}</Td>
                      <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button style={linkBtn} onClick={() => setZoneModal(z)}>
                          Edit
                        </button>
                        <button
                          style={{ ...linkBtn, color: "#b03030" }}
                          onClick={() => deleteZone(z.id)}
                        >
                          Delete
                        </button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* ---------------- LEAD TIME ---------------- */}
          <Card>
            <SectionHead title="Lead time" />
            <label style={labelStyle}>Minimum days notice required</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="number"
                min={0}
                value={leadInput}
                onChange={(e) => setLeadInput(e.target.value)}
                style={{ ...inputStyle, width: 120 }}
              />
              <button
                style={primaryBtn}
                disabled={saving}
                onClick={() =>
                  save({
                    ...s,
                    lead_time_days: Math.max(0, Math.trunc(Number(leadInput)) || 0),
                  })
                }
              >
                Save
              </button>
            </div>
            <p style={hint}>
              Customers can&apos;t pick a delivery date sooner than this many days
              from today.
            </p>
          </Card>

          {/* ---------------- BLOCKED DATES ---------------- */}
          <Card>
            <SectionHead title="Blocked dates" />
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div style={{ color: BERRY }}>
                <DayPicker
                  mode="multiple"
                  selected={blockedDateObjs}
                  onSelect={onCalendarSelect}
                  showOutsideDays
                  styles={{ root: { ["--rdp-accent-color" as string]: WINE } }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                <label style={labelStyle}>Blocked dates ({s.blocked_dates.length})</label>
                {s.blocked_dates.length === 0 ? (
                  <Empty>No blocked dates. Click a day on the calendar to block it.</Empty>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                    {s.blocked_dates.map((d) => (
                      <li
                        key={d}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "8px 12px",
                          background: "rgba(135,56,83,0.06)",
                          borderRadius: 10,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{prettyDate(d)}</span>
                        <button
                          style={{ ...linkBtn, color: "#b03030" }}
                          onClick={() => removeBlocked(d)}
                          aria-label={`Remove ${d}`}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {/* ---------------- DELIVERY DAYS ---------------- */}
          <Card>
            <SectionHead title="Delivery days" />
            <p style={{ ...hint, marginTop: 0, marginBottom: 12 }}>
              Days deliveries are offered. Toggle a day on or off.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DAYS.map((d) => {
                const on = s.delivery_days.includes(d.key);
                return (
                  <button
                    key={d.key}
                    onClick={() => toggleDay(d.key)}
                    disabled={saving}
                    style={{
                      padding: "10px 16px",
                      borderRadius: 10,
                      border: `1px solid ${on ? WINE : "rgba(135,56,83,0.3)"}`,
                      background: on ? WINE : "white",
                      color: on ? "white" : BERRY,
                      fontWeight: 700,
                      cursor: "pointer",
                      minWidth: 64,
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ---------------- DAILY CAP ---------------- */}
          <Card>
            <SectionHead title="Daily cap" />
            <label style={labelStyle}>Max orders per delivery date</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="number"
                min={0}
                placeholder="No limit"
                value={capInput}
                onChange={(e) => setCapInput(e.target.value)}
                style={{ ...inputStyle, width: 140 }}
              />
              <button
                style={primaryBtn}
                disabled={saving}
                onClick={() => {
                  const n = Math.trunc(Number(capInput));
                  save({
                    ...s,
                    daily_order_cap: capInput.trim() !== "" && n > 0 ? n : null,
                  });
                }}
              >
                Save
              </button>
            </div>
            <p style={hint}>Leave blank for no limit.</p>
          </Card>
        </>
      )}

      {zoneModal && (
        <ZoneModal
          zone={zoneModal}
          saving={saving}
          onClose={() => setZoneModal(null)}
          onSave={saveZone}
        />
      )}
    </div>
  );
}

// ---------------- Zone modal ----------------
function ZoneModal({
  zone,
  saving,
  onClose,
  onSave,
}: {
  zone: Zone;
  saving: boolean;
  onClose: () => void;
  onSave: (z: Zone) => void;
}) {
  const [name, setName] = useState(zone.name);
  const [prefix, setPrefix] = useState(zone.postcode_prefix);
  const [fee, setFee] = useState(String(zone.fee ?? 0));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      id: zone.id,
      name: name.trim(),
      postcode_prefix: prefix.trim().toUpperCase(),
      fee: Number.isFinite(Number(fee)) ? Number(fee) : 0,
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: "white",
          borderRadius: 16,
          padding: "1.75rem",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
        }}
      >
        <h2 style={{ color: WINE, marginTop: 0, fontSize: "1.3rem", fontWeight: 800 }}>
          {zone.name ? "Edit zone" : "Add zone"}
        </h2>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Zone name</label>
          <input
            autoFocus
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Central London"
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Postcode prefix</label>
          <input
            style={inputStyle}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="e.g. EC1 or SW"
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Delivery fee (£)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            style={inputStyle}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" style={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" style={primaryBtn} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save zone"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------- small presentational helpers ----------------
function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "white",
        borderRadius: 16,
        padding: "1.5rem 1.75rem",
        marginTop: 20,
        boxShadow: "0 10px 30px rgba(135,56,83,0.08)",
      }}
    >
      {children}
    </section>
  );
}

function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
        gap: 12,
      }}
    >
      <h2 style={{ color: WINE, margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>{title}</h2>
      {action}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: BERRY, opacity: 0.6, margin: "4px 0 0" }}>{children}</p>;
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        textAlign: "left",
        fontSize: "0.8rem",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color: BERRY,
        opacity: 0.6,
        padding: "6px 8px",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "10px 8px", color: BERRY, fontSize: "0.95rem", ...style }}>{children}</td>;
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
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  color: BERRY,
  marginBottom: 6,
  fontSize: "0.9rem",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: WINE,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  border: `1px solid ${WINE}`,
  background: "transparent",
  color: WINE,
  fontWeight: 700,
  cursor: "pointer",
};

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: WINE,
  fontWeight: 700,
  cursor: "pointer",
  padding: "4px 8px",
};

const hint: React.CSSProperties = {
  color: BERRY,
  opacity: 0.6,
  fontSize: "0.85rem",
  marginTop: 10,
  marginBottom: 0,
};

const errorBox: React.CSSProperties = {
  background: "#fde8e8",
  color: "#b03030",
  padding: "10px 14px",
  borderRadius: 10,
  marginTop: 16,
};

const okBox: React.CSSProperties = {
  background: "#e6f5ea",
  color: "#2e7d4f",
  padding: "10px 14px",
  borderRadius: 10,
  marginTop: 16,
};
