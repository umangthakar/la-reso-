"use client";

// ============================================================
// Le Rasa Bakery — WhatsApp settings admin
// Configure the WhatsApp Cloud API integration entirely from the panel (no
// env vars): enable/disable, Meta app credentials, phone/WABA IDs, the
// business + owner numbers, webhook verify token and API version, plus a
// live status panel, "Test Connection" and "Send Test Message".
//
// All work goes through the password-gated /api/admin/whatsapp/* routes; the
// App Secret, Access Token and Verify Token never reach this client — only
// has_*/last-4 hints come back. Needs supabase/sql/25_whatsapp.sql.
//
// This page only manages configuration. Order notifications are a later task.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { adminGet, adminSend, AdminApiError } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";

const API_VERSIONS = ["v23.0", "v22.0", "v21.0", "v20.0", "v19.0"];

type Status = "connected" | "failed" | "not_configured" | "disabled";

type WhatsAppConfig = {
  enabled: boolean;
  app_id: string;
  phone_number_id: string;
  waba_id: string;
  business_number: string;
  owner_number: string;
  api_version: string;
  has_app_secret: boolean;
  app_secret_last4: string;
  has_access_token: boolean;
  access_token_last4: string;
  has_verify_token: boolean;
  verify_token_last4: string;
  status: Status;
  status_message: string;
  last_success_at: string;
  last_error: string;
  last_error_at: string;
};

type TestResult = {
  ok: boolean;
  status: Status;
  message: string;
  details?: {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    waba_name?: string;
  };
};

const STATUS_LABEL: Record<Status, string> = {
  connected: "Connected",
  failed: "Not Connected",
  not_configured: "Not Connected — not configured yet",
  disabled: "Not Connected — disabled",
};

function statusColor(s: Status): string {
  if (s === "connected") return "#2e7d4f";
  if (s === "not_configured" || s === "disabled") return BERRY;
  return "#b03030";
}

function formatWhen(iso: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}\n${time}`;
}

export default function WhatsAppPage() {
  const [enabled, setEnabled] = useState(false);
  const [appId, setAppId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [ownerNumber, setOwnerNumber] = useState("");
  const [apiVersion, setApiVersion] = useState(API_VERSIONS[0]);

  // Secrets: blank means "keep whatever is stored".
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");

  const [saved, setSaved] = useState<WhatsAppConfig | null>(null);
  const [status, setStatus] = useState<Status>("not_configured");
  const [lastSuccess, setLastSuccess] = useState("");
  const [lastError, setLastError] = useState("");
  const [lastErrorAt, setLastErrorAt] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const applyConfig = useCallback((c: WhatsAppConfig) => {
    setSaved(c);
    setEnabled(c.enabled);
    setAppId(c.app_id ?? "");
    setPhoneNumberId(c.phone_number_id ?? "");
    setWabaId(c.waba_id ?? "");
    setBusinessNumber(c.business_number ?? "");
    setOwnerNumber(c.owner_number ?? "");
    setApiVersion(c.api_version ?? API_VERSIONS[0]);
    setStatus(c.status ?? "not_configured");
    setLastSuccess(c.last_success_at ?? "");
    setLastError(c.last_error ?? "");
    setLastErrorAt(c.last_error_at ?? "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { config } = await adminGet<{ config: WhatsAppConfig }>(
        "/api/admin/whatsapp/config",
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
    setFieldErrors({});
    try {
      const { config } = await adminSend<{ config: WhatsAppConfig }>(
        "/api/admin/whatsapp/config",
        "PUT",
        {
          enabled,
          app_id: appId.trim(),
          phone_number_id: phoneNumberId.trim(),
          waba_id: wabaId.trim(),
          business_number: businessNumber.trim(),
          owner_number: ownerNumber.trim(),
          api_version: apiVersion,
          // Blank = keep existing.
          app_secret: appSecret.trim(),
          access_token: accessToken.trim(),
          verify_token: verifyToken.trim(),
        },
      );
      applyConfig(config);
      // Never keep raw secrets in component state after a save.
      setAppSecret("");
      setAccessToken("");
      setVerifyToken("");
      setNotice("Saved! ✓");
    } catch (e) {
      // A 400 from the config route carries per-field messages; show them
      // inline under each field as well as the summary at the top.
      if (e instanceof AdminApiError && e.fields) setFieldErrors(e.fields);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setError("");
    setNotice("");
    try {
      const { result, config } = await adminSend<{
        ok: boolean;
        result: TestResult;
        config: WhatsAppConfig;
      }>("/api/admin/whatsapp/test", "POST");
      applyConfig(config);
      if (result.ok) {
        const d = result.details ?? {};
        const bits = [
          d.display_phone_number,
          d.verified_name,
          d.quality_rating ? `quality ${d.quality_rating}` : "",
          d.waba_name ? `WABA: ${d.waba_name}` : "",
        ].filter(Boolean);
        setNotice(`✅ ${result.message}${bits.length ? ` — ${bits.join(" · ")}` : ""}`);
      } else {
        setError(`❌ ${result.message}`);
      }
    } catch (e) {
      setError(`❌ ${e instanceof Error ? e.message : "Test failed"}`);
    } finally {
      setTesting(false);
    }
  }

  async function sendTest() {
    setSending(true);
    setError("");
    setNotice("");
    try {
      const { result, config } = await adminSend<{
        ok: boolean;
        result: TestResult;
        config: WhatsAppConfig;
      }>("/api/admin/whatsapp/test-message", "POST");
      applyConfig(config);
      if (result.ok) setNotice(`✅ ${result.message}`);
      else setError(`❌ ${result.message}`);
    } catch (e) {
      setError(`❌ ${e instanceof Error ? e.message : "Send failed"}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>WhatsApp</h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>
        Connect the WhatsApp Cloud API so the bakery can send order notifications. Credentials are
        stored securely — never in code.
      </p>

      <Card>
        <h2 style={h2}>Settings</h2>

        <div style={warnBanner}>
          🔒 Your App Secret, Access Token and Verify Token are encrypted at rest and never shown
          again or sent to the browser.
        </div>

        {error && <p style={errorBox}>{error}</p>}
        {notice && <p style={okBox}>{notice}</p>}

        {loading ? (
          <p style={{ color: BERRY, opacity: 0.7 }}>Loading…</p>
        ) : (
          <form onSubmit={save} style={{ marginTop: 4 }}>
            <Field label="Enable WhatsApp Notifications">
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

            <Field label="Meta App ID" error={fieldErrors.app_id}>
              <input
                style={inputStyle}
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="1234567890123456"
                autoComplete="off"
              />
            </Field>

            <SecretField
              label="Meta App Secret"
              value={appSecret}
              onChange={setAppSecret}
              hasStored={saved?.has_app_secret ?? false}
              last4={saved?.app_secret_last4 ?? ""}
              error={fieldErrors.app_secret}
            />

            <SecretField
              label="Permanent Access Token"
              value={accessToken}
              onChange={setAccessToken}
              hasStored={saved?.has_access_token ?? false}
              last4={saved?.access_token_last4 ?? ""}
              error={fieldErrors.access_token}
              placeholder="EAA…"
            />

            <Field label="Phone Number ID" error={fieldErrors.phone_number_id}>
              <input
                style={inputStyle}
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="1234567890123456"
                autoComplete="off"
              />
            </Field>

            <Field label="WhatsApp Business Account ID" error={fieldErrors.waba_id}>
              <input
                style={inputStyle}
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="1234567890123456"
                autoComplete="off"
              />
            </Field>

            <Field label="Business WhatsApp Number" error={fieldErrors.business_number}>
              <input
                style={inputStyle}
                value={businessNumber}
                onChange={(e) => setBusinessNumber(e.target.value)}
                placeholder="+447960555702"
                autoComplete="off"
              />
            </Field>

            <Field
              label="Owner WhatsApp Number"
              hint="This is the number that will receive order notifications."
              error={fieldErrors.owner_number}
            >
              <input
                style={inputStyle}
                value={ownerNumber}
                onChange={(e) => setOwnerNumber(e.target.value)}
                placeholder="+447960555702"
                autoComplete="off"
              />
            </Field>

            <SecretField
              label="Webhook Verify Token"
              value={verifyToken}
              onChange={setVerifyToken}
              hasStored={saved?.has_verify_token ?? false}
              last4={saved?.verify_token_last4 ?? ""}
              error={fieldErrors.verify_token}
            />

            <Field label="API Version" error={fieldErrors.api_version}>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
              >
                {API_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
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
        <h2 style={h2}>Connection</h2>
        <Row label="Connection Status">
          <span style={{ fontWeight: 700, color: statusColor(status) }}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </Row>
        <Row label="Last Successful Test">
          <span style={{ whiteSpace: "pre-line" }}>{formatWhen(lastSuccess)}</span>
        </Row>
        <Row label="Last Error">
          {lastError ? (
            <span style={{ color: "#b03030" }}>
              {lastError}
              {lastErrorAt ? (
                <span style={{ opacity: 0.6 }}> · {formatWhen(lastErrorAt).replace("\n", " ")}</span>
              ) : null}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="API Version">{apiVersion}</Row>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={testConnection} disabled={testing} style={primaryBtn}>
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button type="button" onClick={sendTest} disabled={sending} style={secondaryBtn}>
            {sending ? "Sending…" : "Send Test Message"}
          </button>
        </div>
        <p style={{ color: BERRY, opacity: 0.65, fontSize: "0.85rem", marginBottom: 0 }}>
          Test Connection and Send Test Message both use the saved settings — save your changes
          first.
        </p>
      </Card>
    </div>
  );
}

// ---------------- presentational helpers (match Google Reviews page) ----------------
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

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center" }}>{children}</div>
      {hint && <p style={hintStyle}>{hint}</p>}
      {error && <p style={fieldErrorStyle}>{error}</p>}
    </div>
  );
}

function SecretField({
  label,
  value,
  onChange,
  hasStored,
  last4,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hasStored: boolean;
  last4: string;
  error?: string;
  placeholder?: string;
}) {
  const [reveal, setReveal] = useState(false);
  return (
    <Field label={label} error={error}>
      <div style={{ display: "flex", gap: 8, width: "100%" }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          type={reveal ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            hasStored
              ? `•••••••••••• ${last4} (saved — leave blank to keep)`
              : placeholder ?? ""
          }
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          style={secondaryBtn}
          aria-label={reveal ? `Hide ${label}` : `Reveal ${label}`}
        >
          {reveal ? "Hide" : "Reveal"}
        </button>
      </div>
    </Field>
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

const hintStyle: React.CSSProperties = {
  color: BERRY,
  opacity: 0.65,
  fontSize: "0.82rem",
  margin: "6px 0 0",
};

const fieldErrorStyle: React.CSSProperties = {
  color: "#b03030",
  fontSize: "0.82rem",
  fontWeight: 600,
  margin: "6px 0 0",
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
