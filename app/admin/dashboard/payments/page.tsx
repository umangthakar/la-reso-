"use client";

// ============================================================
// Le Rasa Bakery — Payments admin
// 1) Stripe Settings — save publishable/secret keys + test/live mode.
//    The secret key is encrypted at rest and never shown again.
// 2) Refunds — look up an order by id or email and issue a Stripe refund.
//
// All work goes through the password-gated /api/admin/payments/* routes;
// the secret key never reaches this client. Needs supabase/sql/06_payments.sql.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { adminGet, adminSend } from "@/lib/admin-api";

const WINE = "#873853";
const BERRY = "#5C2A41";

type StripeConfig = {
  publishable_key: string;
  mode: "test" | "live";
  has_secret_key: boolean;
  secret_key_last4: string;
};

type Order = {
  id: string;
  customer_name: string | null;
  email: string | null;
  amount: number | null;
  status: string | null;
  created_at: string;
  stripe_payment_intent: string | null;
  refunded_at: string | null;
};

export default function PaymentsPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, marginTop: 0 }}>Payments</h1>
      <p style={{ color: BERRY, opacity: 0.75, marginTop: 4 }}>
        Connect Stripe and issue refunds.
      </p>
      <StripeSettings />
      <Refunds />
    </div>
  );
}

// ---------------- STRIPE SETTINGS ----------------
function StripeSettings() {
  const [publishable, setPublishable] = useState("");
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [hasSecret, setHasSecret] = useState(false);
  const [last4, setLast4] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { config } = await adminGet<{ config: StripeConfig }>(
        "/api/admin/payments/stripe-config",
      );
      setPublishable(config.publishable_key ?? "");
      setMode(config.mode ?? "test");
      setHasSecret(config.has_secret_key);
      setLast4(config.secret_key_last4 ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Stripe settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const { config } = await adminSend<{ config: StripeConfig }>(
        "/api/admin/payments/stripe-config",
        "PUT",
        {
          publishable_key: publishable.trim(),
          secret_key: secret.trim(), // blank = keep existing
          mode,
        },
      );
      setHasSecret(config.has_secret_key);
      setLast4(config.secret_key_last4 ?? "");
      setSecret(""); // never keep the raw secret in component state after save
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 style={h2}>Stripe settings</h2>

      <div style={warnBanner}>
        🔒 Never share your secret key. This is stored securely.
      </div>

      {error && <p style={errorBox}>{error}</p>}
      {saved && <p style={okBox}>Saved! ✓</p>}

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7 }}>Loading…</p>
      ) : (
        <form onSubmit={save} style={{ marginTop: 4 }}>
          <Field label="Stripe publishable key">
            <input
              style={inputStyle}
              value={publishable}
              onChange={(e) => setPublishable(e.target.value)}
              placeholder="pk_test_..."
              autoComplete="off"
            />
          </Field>
          <Field label="Stripe secret key">
            <input
              style={inputStyle}
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={
                hasSecret
                  ? `•••••••••••• ${last4} (saved — leave blank to keep)`
                  : "sk_test_..."
              }
              autoComplete="new-password"
            />
          </Field>
          <Field label="Mode">
            <div style={{ display: "inline-flex", borderRadius: 10, overflow: "hidden", border: `1px solid ${WINE}` }}>
              {(["test", "live"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: "9px 20px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 700,
                    textTransform: "capitalize",
                    background: mode === m ? WINE : "white",
                    color: mode === m ? "white" : WINE,
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>

          <button type="submit" disabled={saving} style={{ ...primaryBtn, marginTop: 6 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
    </Card>
  );
}

// ---------------- REFUNDS ----------------
function Refunds() {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [searching, setSearching] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setOrder(null);
    if (!query.trim()) return;
    setSearching(true);
    try {
      const { order } = await adminGet<{ order: Order }>(
        `/api/admin/payments/order?q=${encodeURIComponent(query.trim())}`,
      );
      setOrder(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order not found");
    } finally {
      setSearching(false);
    }
  }

  async function issueRefund() {
    if (!order) return;
    setRefunding(true);
    setError("");
    setNotice("");
    try {
      const { order: updated, refund_id } = await adminSend<{
        order: Order;
        refund_id: string;
      }>("/api/admin/payments/refund", "POST", { order_id: order.id });
      setOrder(updated);
      setNotice(`Refund issued ✓ (Stripe refund ${refund_id})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setRefunding(false);
    }
  }

  const isRefunded = order?.status === "refunded";

  return (
    <Card>
      <h2 style={h2}>Refunds</h2>

      <form onSubmit={search} style={{ display: "flex", gap: 10, marginBottom: 4 }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Order # or customer email"
        />
        <button type="submit" disabled={searching} style={primaryBtn}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p style={errorBox}>{error}</p>}
      {notice && <p style={okBox}>{notice}</p>}

      {order && (
        <div style={{ marginTop: 16, border: "1px solid rgba(135,56,83,0.15)", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <Row label="Customer">
            {order.customer_name || "—"}
            {order.email ? <span style={{ opacity: 0.6 }}> · {order.email}</span> : null}
          </Row>
          <Row label="Amount">
            {order.amount != null ? `£${Number(order.amount).toFixed(2)}` : "—"}
          </Row>
          <Row label="Date">
            {new Date(order.created_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Row>
          <Row label="Refund status">
            <span
              style={{
                fontWeight: 700,
                color: isRefunded ? "#2e7d4f" : BERRY,
              }}
            >
              {isRefunded ? "Refunded" : "Not refunded"}
            </span>
            {isRefunded && order.refunded_at
              ? <span style={{ opacity: 0.6 }}> · {new Date(order.refunded_at).toLocaleDateString("en-GB")}</span>
              : null}
          </Row>

          <button
            onClick={issueRefund}
            disabled={refunding || isRefunded}
            style={{
              ...primaryBtn,
              marginTop: 14,
              opacity: refunding || isRefunded ? 0.5 : 1,
              cursor: refunding || isRefunded ? "not-allowed" : "pointer",
            }}
          >
            {isRefunded ? "Already refunded" : refunding ? "Issuing refund…" : "Issue Refund"}
          </button>
        </div>
      )}
    </Card>
  );
}

// ---------------- presentational helpers ----------------
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
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: "0.95rem", color: BERRY }}>
      <span style={{ width: 130, opacity: 0.6, fontWeight: 600 }}>{label}</span>
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
