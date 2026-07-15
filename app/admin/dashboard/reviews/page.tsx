"use client";

// ============================================================
// Le Rasa Bakery — Google Reviews admin
// Manage the Google Reviews integration entirely from the panel (no env
// vars): enable/disable, Google Places API key (encrypted at rest, never
// shown again), Place ID, cache duration, plus live sync status, a manual
// "Refresh Reviews" and "Test Connection".
//
// All work goes through the password-gated /api/admin/reviews/* routes;
// the API key never reaches this client. Needs supabase/sql/24_google_reviews.sql.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { adminGet, adminSend } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";

const CACHE_OPTIONS = [
  { value: 1, label: "1 Hour" },
  { value: 3, label: "3 Hours" },
  { value: 6, label: "6 Hours" },
  { value: 12, label: "12 Hours" },
  { value: 24, label: "24 Hours" },
];

type Status =
  | "connected"
  | "failed"
  | "invalid_key"
  | "invalid_place"
  | "not_configured"
  | "disabled";

type ReviewsConfig = {
  enabled: boolean;
  place_id: string;
  cache_hours: number;
  has_api_key: boolean;
  api_key_last4: string;
  status: Status;
  status_message: string;
  last_synced_at: string;
  rating: number;
  total: number;
  review_count: number;
};

const STATUS_LABEL: Record<Status, string> = {
  connected: "Connected — last sync successful",
  failed: "Sync failed",
  invalid_key: "Invalid API key",
  invalid_place: "Invalid Place ID",
  not_configured: "Not configured yet",
  disabled: "Disabled",
};

function statusColor(s: Status): string {
  if (s === "connected") return "#2e7d4f";
  if (s === "not_configured" || s === "disabled") return BERRY;
  return "#b03030";
}

function formatSync(iso: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}\n${time}`;
}

export default function ReviewsPage() {
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [revealKey, setRevealKey] = useState(false);
  const [placeId, setPlaceId] = useState("");
  const [cacheHours, setCacheHours] = useState(6);

  const [hasKey, setHasKey] = useState(false);
  const [last4, setLast4] = useState("");
  const [status, setStatus] = useState<Status>("not_configured");
  const [statusMessage, setStatusMessage] = useState("");
  const [lastSync, setLastSync] = useState("");
  const [rating, setRating] = useState(0);
  const [total, setTotal] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const applyConfig = useCallback((c: ReviewsConfig) => {
    setEnabled(c.enabled);
    setPlaceId(c.place_id ?? "");
    setCacheHours(c.cache_hours ?? 6);
    setHasKey(c.has_api_key);
    setLast4(c.api_key_last4 ?? "");
    setStatus(c.status ?? "not_configured");
    setStatusMessage(c.status_message ?? "");
    setLastSync(c.last_synced_at ?? "");
    setRating(c.rating ?? 0);
    setTotal(c.total ?? 0);
    setReviewCount(c.review_count ?? 0);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { config } = await adminGet<{ config: ReviewsConfig }>(
        "/api/admin/reviews/config",
      );
      applyConfig(config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [applyConfig]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { config } = await adminSend<{ config: ReviewsConfig }>(
        "/api/admin/reviews/config",
        "PUT",
        {
          enabled,
          place_id: placeId.trim(),
          cache_hours: cacheHours,
          api_key: apiKey.trim(), // blank = keep existing
        },
      );
      applyConfig(config);
      setApiKey(""); // never keep the raw key in component state after save
      setRevealKey(false);
      setNotice("Saved! ✓");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const { config, result } = await adminSend<{
        ok: boolean;
        result: { status: Status; message: string };
        config: ReviewsConfig;
      }>("/api/admin/reviews/refresh", "POST");
      applyConfig(config);
      if (result.status === "connected") setNotice(`Reviews refreshed ✓ — ${result.message}`);
      else setError(result.message || "Refresh failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function test() {
    setTesting(true);
    setError("");
    setNotice("");
    try {
      const { result } = await adminSend<{
        result: { ok: boolean; status: Status; message: string; rating?: number; total?: number; count?: number };
      }>("/api/admin/reviews/test", "POST", {
        // Test the currently typed key/place id if present (pre-save), else stored.
        api_key: apiKey.trim() || undefined,
        place_id: placeId.trim() || undefined,
      });
      if (result.ok) {
        setNotice(
          `${result.message} Rating ${result.rating ?? "—"} · ${result.total ?? 0} reviews · ${result.count ?? 0} shown.`,
        );
      } else {
        setError(`${STATUS_LABEL[result.status] ?? "Failed"} — ${result.message}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>Google Reviews</h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>
        Pull live Google reviews into the homepage carousel. Credentials are stored securely — never in code.
      </p>

      <Card>
        <h2 style={h2}>Settings</h2>

        <div style={warnBanner}>
          🔒 Your Google API key is encrypted at rest and never shown again or sent to the browser.
        </div>

        {error && <p style={errorBox}>{error}</p>}
        {notice && <p style={okBox}>{notice}</p>}

        {loading ? (
          <p style={{ color: BERRY, opacity: 0.7 }}>Loading…</p>
        ) : (
          <form onSubmit={save} style={{ marginTop: 4 }}>
            {/* Enable toggle */}
            <Field label="Enable Google Reviews">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => setEnabled((v) => !v)}
                style={{
                  width: 56,
                  height: 30,
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  background: enabled ? WINE : "rgba(135,56,83,0.25)",
                  position: "relative",
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: enabled ? 29 : 3,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.2s",
                  }}
                />
              </button>
              <span style={{ marginLeft: 12, fontWeight: 700, color: enabled ? "#2e7d4f" : BERRY }}>
                {enabled ? "ON" : "OFF"}
              </span>
            </Field>

            {/* API key with reveal */}
            <Field label="Google Places API key">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  type={revealKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    hasKey
                      ? `•••••••••••• ${last4} (saved — leave blank to keep)`
                      : "AIza…"
                  }
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setRevealKey((v) => !v)}
                  style={secondaryBtn}
                  aria-label={revealKey ? "Hide API key" : "Reveal API key"}
                >
                  {revealKey ? "Hide" : "Reveal"}
                </button>
              </div>
            </Field>

            {/* Place ID */}
            <Field label="Google Place ID">
              <input
                style={inputStyle}
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
                placeholder="ChIJ…"
                autoComplete="off"
              />
            </Field>

            {/* Cache duration */}
            <Field label="Cache duration">
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={cacheHours}
                onChange={(e) => setCacheHours(Number(e.target.value))}
              >
                {CACHE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <button type="submit" disabled={saving} style={{ ...primaryBtn, marginTop: 6 }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </Card>

      {/* Status + actions */}
      <Card>
        <h2 style={h2}>Sync status</h2>
        <Row label="Status">
          <span style={{ fontWeight: 700, color: statusColor(status) }}>
            {STATUS_LABEL[status] ?? status}
          </span>
          {statusMessage ? <span style={{ opacity: 0.6 }}> · {statusMessage}</span> : null}
        </Row>
        <Row label="Last successful sync">
          <span style={{ whiteSpace: "pre-line" }}>{formatSync(lastSync)}</span>
        </Row>
        <Row label="Business rating">
          {rating ? `${rating.toFixed(1)} ★` : "—"}
        </Row>
        <Row label="Total reviews">{total || "—"}</Row>
        <Row label="Cached for carousel">{reviewCount || 0}</Row>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button onClick={refresh} disabled={refreshing} style={primaryBtn}>
            {refreshing ? "Refreshing…" : "Refresh Reviews"}
          </button>
          <button onClick={test} disabled={testing} style={secondaryBtn}>
            {testing ? "Testing…" : "Test Connection"}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ---------------- presentational helpers (match Payments page) ----------------
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center" }}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: "0.95rem", color: BERRY }}>
      <span style={{ width: 170, opacity: 0.6, fontWeight: 600 }}>{label}</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}

const h2: React.CSSProperties = { color: WINE, marginTop: 0, fontSize: "1.15rem", fontWeight: 800 };

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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  color: BERRY,
  marginBottom: 6,
  fontSize: "0.9rem",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "none",
  background: WINE,
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: `1px solid ${WINE}`,
  background: "white",
  color: WINE,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const warnBanner: React.CSSProperties = {
  background: "#fff6e6",
  border: "1px solid #f0c878",
  color: "#8a5a00",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 600,
  fontSize: "0.9rem",
  margin: "4px 0 16px",
};

const errorBox: React.CSSProperties = {
  background: "#fde8e8",
  color: "#b03030",
  padding: "10px 14px",
  borderRadius: 10,
  marginTop: 14,
};

const okBox: React.CSSProperties = {
  background: "#e6f5ea",
  color: "#2e7d4f",
  padding: "10px 14px",
  borderRadius: 10,
  marginTop: 14,
};
