"use client";

// ============================================================
// Le Rasa Bakery — Offer create / edit form
// One page handles both create ("new") and edit (an offer id), organised into
// the sections from the spec: Basics, Discount value, Eligibility, Cart
// conditions, Audience, Schedule, Storefront content. Persists via the
// password-gated /api/admin/offers routes; the server (Phase 3) is the source
// of truth — the client validation here only mirrors it for a quick message.
// Styled to match the Products / Content & Settings admin pages.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminGet, adminSend, adminUpload } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";
import { offerFromRow, offerHeroText } from "@/lib/offers";

const WINE = "#873853";
const BERRY = "#5C2A41";

const TYPE_OPTIONS = [
  { value: "percentage", label: "Percentage off" },
  { value: "fixed_amount", label: "Fixed amount off" },
  { value: "buy_x_get_y", label: "Buy X get Y" },
  { value: "free_delivery", label: "Free delivery" },
  { value: "coupon", label: "Coupon code" },
  { value: "custom", label: "Custom" },
] as const;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type OfferType = (typeof TYPE_OPTIONS)[number]["value"];

type FormState = {
  name: string;
  type: OfferType;
  enabled: boolean;
  stackable: boolean;
  priority: string;
  percentage_value: string;
  fixed_amount_value: string;
  buy_x_quantity: string;
  get_y_quantity: string;
  get_y_discount_percent: string;
  free_delivery: boolean;
  coupon_code: string;
  coupon_discount_type: "percentage" | "fixed_amount";
  eligibility_scope: "all" | "categories" | "products";
  includeCategories: string[];
  includeProducts: string[];
  excludeCategories: string[];
  excludeProducts: string[];
  min_order_amount: string;
  max_order_amount: string;
  min_quantity: string;
  max_quantity: string;
  audience: "everyone" | "first_order" | "new_customer" | "specific_emails";
  emailsText: string;
  usage_limit_total: string;
  usage_limit_per_customer: string;
  start_at: string;
  end_at: string;
  time_start: string;
  time_end: string;
  days_of_week: number[];
  announcement_text: string;
  hero_heading: string;
  hero_subtext: string;
  hero_highlight_text: string;
  cta_text: string;
  cta_link: string;
  banner_image_url: string;
  hero_display_mode: "text" | "image";
  hero_image_url: string;
  popup_title: string;
  popup_description: string;
  popup_image_url: string;
  popup_cta_text: string;
  popup_cta_link: string;
};

/** The three image fields, so one upload handler serves all of them. */
type ImageField = "banner_image_url" | "hero_image_url" | "popup_image_url";

const EMPTY_FORM: FormState = {
  name: "",
  type: "percentage",
  enabled: false,
  stackable: false,
  priority: "0",
  percentage_value: "",
  fixed_amount_value: "",
  buy_x_quantity: "",
  get_y_quantity: "",
  get_y_discount_percent: "100",
  free_delivery: false,
  coupon_code: "",
  coupon_discount_type: "percentage",
  eligibility_scope: "all",
  includeCategories: [],
  includeProducts: [],
  excludeCategories: [],
  excludeProducts: [],
  min_order_amount: "",
  max_order_amount: "",
  min_quantity: "",
  max_quantity: "",
  audience: "everyone",
  emailsText: "",
  usage_limit_total: "",
  usage_limit_per_customer: "",
  start_at: "",
  end_at: "",
  time_start: "",
  time_end: "",
  days_of_week: [],
  announcement_text: "",
  hero_heading: "",
  hero_subtext: "",
  hero_highlight_text: "",
  cta_text: "",
  cta_link: "",
  banner_image_url: "",
  hero_display_mode: "text",
  hero_image_url: "",
  popup_title: "",
  popup_description: "",
  popup_image_url: "",
  popup_cta_text: "",
  popup_cta_link: "",
};

const numStr = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** A worked example of a banner title for the offer type being authored. */
function bannerTitlePlaceholder(type: OfferType): string {
  switch (type) {
    case "percentage": return "e.g. 30% Off All Birthday Cakes";
    case "fixed_amount": return "e.g. £10 Off Orders Above £50";
    case "buy_x_get_y": return "e.g. Buy 1 Get 1 Free";
    case "free_delivery": return "e.g. Free Delivery Over £40";
    case "coupon": return "e.g. Use Code SAVE20 At Checkout";
    case "custom":
    default: return "e.g. Christmas Special";
  }
}

/**
 * Exactly the hero text the storefront will derive if the field is left blank.
 * Runs the REAL offerHeroText() over the in-progress form (with the explicit
 * highlight deliberately omitted) so this hint can never drift from what the
 * banner actually renders.
 */
function heroTextPlaceholder(form: FormState): string {
  return offerHeroText(
    offerFromRow({
      name: form.name,
      type: form.type,
      percentage_value: form.percentage_value,
      fixed_amount_value: form.fixed_amount_value,
      buy_x_quantity: form.buy_x_quantity,
      get_y_quantity: form.get_y_quantity,
      get_y_discount_percent: form.get_y_discount_percent,
    }),
  );
}

export default function OfferFormPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const id = params.id;
  const isNew = id === "new";

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; name: string }[]>([]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // --- load option sources (categories + products) for the pickers ---------
  useEffect(() => {
    (async () => {
      try {
        const cats = await adminGet<{ categories: { name: string; count: number }[] }>(
          "/api/admin/products/categories",
          { force: true },
        );
        setCategoryOptions((cats.categories || []).map((c) => c.name));
      } catch {
        /* leave empty; the picker shows a hint */
      }
      try {
        const prods = await adminGet<{ products: { id: string; name: string }[] }>(
          "/api/admin/products?page=1&pageSize=100",
        );
        setProductOptions((prods.products || []).map((p) => ({ id: p.id, name: p.name })));
      } catch {
        /* leave empty */
      }
    })();
  }, []);

  // --- load the offer being edited -----------------------------------------
  const loadOffer = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ offer: Record<string, unknown> }>(`/api/admin/offers/${id}`, {
        force: true,
      });
      const o = offerFromRow(data.offer);
      setForm({
        name: o.name,
        type: (o.type as OfferType) || "percentage",
        enabled: o.enabled,
        stackable: o.stackable,
        priority: numStr(o.priority),
        percentage_value: numStr(o.percentage_value),
        fixed_amount_value: numStr(o.fixed_amount_value),
        buy_x_quantity: numStr(o.buy_x_quantity),
        get_y_quantity: numStr(o.get_y_quantity),
        get_y_discount_percent: numStr(o.get_y_discount_percent) || "100",
        free_delivery: !!o.free_delivery,
        coupon_code: o.coupon_code ?? "",
        coupon_discount_type: o.coupon_discount_type === "fixed_amount" ? "fixed_amount" : "percentage",
        eligibility_scope: o.eligibility_scope || "all",
        includeCategories: o.categoryRules.filter((r) => r.mode === "include").map((r) => r.category),
        includeProducts: o.productRules.filter((r) => r.mode === "include").map((r) => r.product_id),
        excludeCategories: o.categoryRules.filter((r) => r.mode === "exclude").map((r) => r.category),
        excludeProducts: o.productRules.filter((r) => r.mode === "exclude").map((r) => r.product_id),
        min_order_amount: numStr(o.min_order_amount),
        max_order_amount: numStr(o.max_order_amount),
        min_quantity: numStr(o.min_quantity),
        max_quantity: numStr(o.max_quantity),
        audience: o.audience || "everyone",
        emailsText: (o.emails ?? []).join("\n"),
        usage_limit_total: numStr(o.usage_limit_total),
        usage_limit_per_customer: numStr(o.usage_limit_per_customer),
        start_at: (o.start_at ?? "").slice(0, 16),
        end_at: (o.end_at ?? "").slice(0, 16),
        time_start: (o.time_start ?? "").slice(0, 5),
        time_end: (o.time_end ?? "").slice(0, 5),
        days_of_week: Array.isArray(o.days_of_week) ? o.days_of_week : [],
        announcement_text: o.announcement_text ?? "",
        hero_heading: o.hero_heading ?? "",
        hero_subtext: o.hero_subtext ?? "",
        hero_highlight_text: o.hero_highlight_text ?? "",
        cta_text: o.cta_text ?? "",
        cta_link: o.cta_link ?? "",
        banner_image_url: o.banner_image_url ?? "",
        hero_display_mode: o.hero_display_mode === "image" ? "image" : "text",
        hero_image_url: o.hero_image_url ?? "",
        popup_title: o.popup_title ?? "",
        popup_description: o.popup_description ?? "",
        popup_image_url: o.popup_image_url ?? "",
        popup_cta_text: o.popup_cta_text ?? "",
        popup_cta_link: o.popup_cta_link ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load offer");
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => {
    loadOffer();
  }, [loadOffer]);

  function toggleDay(d: number) {
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(d)
        ? f.days_of_week.filter((x) => x !== d)
        : [...f.days_of_week, d].sort((a, b) => a - b),
    }));
  }

  /** Upload into any of the three image fields (background / hero / popup). */
  function handleImage(field: ImageField) {
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      setError("");
      try {
        const { url } = await adminUpload(file, "/api/admin/site-assets/upload");
        set(field, url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    };
  }

  // Mirror (not replace) the server-side validation for a fast message.
  function clientValidate(): string | null {
    if (!form.name.trim()) return "Name is required.";
    switch (form.type) {
      case "percentage":
        if (!(Number(form.percentage_value) > 0)) return "Enter a percentage value.";
        break;
      case "fixed_amount":
        if (!(Number(form.fixed_amount_value) > 0)) return "Enter a fixed amount.";
        break;
      case "buy_x_get_y":
        if (!(Number(form.buy_x_quantity) > 0) || !(Number(form.get_y_quantity) > 0))
          return "Enter Buy X and Get Y quantities.";
        break;
      case "coupon": {
        if (!form.coupon_code.trim()) return "Enter a coupon code.";
        const v =
          form.coupon_discount_type === "percentage" ? form.percentage_value : form.fixed_amount_value;
        if (!(Number(v) > 0)) return "Enter the coupon discount value.";
        break;
      }
    }
    return null;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const invalid = clientValidate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError("");

    const categoryRules = [
      ...(form.eligibility_scope === "categories"
        ? form.includeCategories.map((c) => ({ category: c, mode: "include" as const }))
        : []),
      ...form.excludeCategories.map((c) => ({ category: c, mode: "exclude" as const })),
    ];
    const productRules = [
      ...(form.eligibility_scope === "products"
        ? form.includeProducts.map((p) => ({ product_id: p, mode: "include" as const }))
        : []),
      ...form.excludeProducts.map((p) => ({ product_id: p, mode: "exclude" as const })),
    ];
    const emails = form.emailsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      type: form.type,
      enabled: form.enabled,
      stackable: form.stackable,
      priority: form.priority,
      percentage_value: form.percentage_value,
      fixed_amount_value: form.fixed_amount_value,
      buy_x_quantity: form.buy_x_quantity,
      get_y_quantity: form.get_y_quantity,
      get_y_discount_percent: form.get_y_discount_percent,
      free_delivery: form.free_delivery,
      coupon_code: form.coupon_code,
      coupon_discount_type: form.coupon_discount_type,
      eligibility_scope: form.eligibility_scope,
      min_order_amount: form.min_order_amount,
      max_order_amount: form.max_order_amount,
      min_quantity: form.min_quantity,
      max_quantity: form.max_quantity,
      audience: form.audience,
      usage_limit_total: form.usage_limit_total,
      usage_limit_per_customer: form.usage_limit_per_customer,
      start_at: form.start_at || null,
      end_at: form.end_at || null,
      time_start: form.time_start || null,
      time_end: form.time_end || null,
      days_of_week: form.days_of_week,
      announcement_text: form.announcement_text,
      hero_heading: form.hero_heading,
      hero_subtext: form.hero_subtext,
      hero_highlight_text: form.hero_highlight_text,
      cta_text: form.cta_text,
      cta_link: form.cta_link,
      banner_image_url: form.banner_image_url,
      hero_display_mode: form.hero_display_mode,
      hero_image_url: form.hero_image_url,
      popup_title: form.popup_title,
      popup_description: form.popup_description,
      popup_image_url: form.popup_image_url,
      popup_cta_text: form.popup_cta_text,
      popup_cta_link: form.popup_cta_link,
      categoryRules,
      productRules,
      emails,
    };

    try {
      if (isNew) {
        await adminSend("/api/admin/offers", "POST", payload);
      } else {
        await adminSend(`/api/admin/offers/${id}`, "PUT", payload);
      }
      router.push("/admin/dashboard/offers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save offer");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (isNew) return;
    if (!window.confirm(`Delete "${form.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      await adminSend(`/api/admin/offers/${id}`, "DELETE");
      router.push("/admin/dashboard/offers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete offer");
    }
  }

  // Duplicates the SAVED offer, not the form — the server copies the stored row.
  // Any unsaved edits on screen are therefore not carried into the copy, so say
  // so rather than silently dropping them.
  async function handleDuplicate() {
    if (isNew) return;
    if (
      !window.confirm(
        `Duplicate "${form.name}"? The copy is created disabled, without the coupon code, and from the last saved version — unsaved changes on this page won't be copied.`,
      )
    ) {
      return;
    }
    setDuplicating(true);
    setError("");
    try {
      const { id: newId } = await adminSend<{ id: string }>(`/api/admin/offers/${id}/duplicate`, "POST");
      router.push(`/admin/dashboard/offers/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate offer");
      setDuplicating(false);
    }
  }

  if (loading) {
    return <p style={{ color: BERRY, opacity: 0.7 }}>Loading offer…</p>;
  }

  const productOpts = productOptions.map((p) => ({ value: p.id, label: p.name }));
  const catOpts = categoryOptions.map((c) => ({ value: c, label: c }));

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>
          {isNew ? "New Offer" : "Edit Offer"}
        </h1>
        <button type="button" onClick={() => router.push("/admin/dashboard/offers")} style={secondaryBtn}>
          ← Back to offers
        </button>
      </div>

      {error && <p style={errorBox}>{error}</p>}

      <form onSubmit={handleSave} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* BASICS ------------------------------------------------------- */}
        <Section title="Basics">
          <Field label="Name (internal label)">
            <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Summer 20% off" />
          </Field>
          <Field label="Type">
            <select style={inputStyle} value={form.type} onChange={(e) => set("type", e.target.value as OfferType)}>
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
            <label style={checkRow}>
              <Toggle on={form.enabled} onClick={() => set("enabled", !form.enabled)} /> Enabled
            </label>
            <label style={checkRow}>
              <Toggle on={form.stackable} onClick={() => set("stackable", !form.stackable)} /> Stackable
            </label>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Priority</label>
              <input style={inputStyle} type="number" value={form.priority} onChange={(e) => set("priority", e.target.value)} />
            </div>
          </div>
          <p style={hintStyle}>
            Stackable offers run alongside another active offer. Priority breaks ties when more than one
            non-stackable offer could be active.
          </p>
        </Section>

        {/* DISCOUNT VALUE ---------------------------------------------- */}
        <Section title="Discount value">
          {form.type === "percentage" && (
            <Field label="Percentage off (%)">
              <input style={inputStyle} type="number" step="0.01" min="0" max="100" value={form.percentage_value} onChange={(e) => set("percentage_value", e.target.value)} placeholder="e.g. 20" />
            </Field>
          )}
          {form.type === "fixed_amount" && (
            <Field label="Amount off (£)">
              <input style={inputStyle} type="number" step="0.01" min="0" value={form.fixed_amount_value} onChange={(e) => set("fixed_amount_value", e.target.value)} placeholder="e.g. 5.00" />
            </Field>
          )}
          {form.type === "buy_x_get_y" && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={labelStyle}>Buy quantity (X)</label>
                <input style={inputStyle} type="number" min="1" value={form.buy_x_quantity} onChange={(e) => set("buy_x_quantity", e.target.value)} placeholder="e.g. 2" />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={labelStyle}>Get quantity (Y)</label>
                <input style={inputStyle} type="number" min="1" value={form.get_y_quantity} onChange={(e) => set("get_y_quantity", e.target.value)} placeholder="e.g. 1" />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={labelStyle}>Y discount (%)</label>
                <input style={inputStyle} type="number" step="0.01" min="0" max="100" value={form.get_y_discount_percent} onChange={(e) => set("get_y_discount_percent", e.target.value)} placeholder="100 = free" />
              </div>
            </div>
          )}
          {form.type === "coupon" && (
            <>
              <Field label="Coupon code">
                <input style={inputStyle} value={form.coupon_code} onChange={(e) => set("coupon_code", e.target.value)} placeholder="e.g. WELCOME10" />
              </Field>
              <Field label="Coupon discount type">
                <select style={inputStyle} value={form.coupon_discount_type} onChange={(e) => set("coupon_discount_type", e.target.value as "percentage" | "fixed_amount")}>
                  <option value="percentage">Percentage off</option>
                  <option value="fixed_amount">Fixed amount off</option>
                </select>
              </Field>
              {form.coupon_discount_type === "percentage" ? (
                <Field label="Percentage off (%)">
                  <input style={inputStyle} type="number" step="0.01" min="0" max="100" value={form.percentage_value} onChange={(e) => set("percentage_value", e.target.value)} placeholder="e.g. 10" />
                </Field>
              ) : (
                <Field label="Amount off (£)">
                  <input style={inputStyle} type="number" step="0.01" min="0" value={form.fixed_amount_value} onChange={(e) => set("fixed_amount_value", e.target.value)} placeholder="e.g. 5.00" />
                </Field>
              )}
            </>
          )}
          {form.type === "free_delivery" && (
            <p style={hintStyle}>Free delivery offers need no discount value — the delivery fee is waived when the offer is active.</p>
          )}
          {form.type === "custom" && (
            <p style={hintStyle}>Custom offers carry no automatic discount math; use the free-delivery toggle and/or storefront content below.</p>
          )}
          <label style={{ ...checkRow, marginTop: 6 }}>
            <Toggle on={form.free_delivery} onClick={() => set("free_delivery", !form.free_delivery)} /> Also give free delivery
          </label>
        </Section>

        {/* ELIGIBILITY -------------------------------------------------- */}
        <Section title="Eligibility">
          <Field label="Applies to">
            <select style={inputStyle} value={form.eligibility_scope} onChange={(e) => set("eligibility_scope", e.target.value as FormState["eligibility_scope"])}>
              <option value="all">All products</option>
              <option value="categories">Specific categories</option>
              <option value="products">Specific products</option>
            </select>
          </Field>
          {form.eligibility_scope === "categories" && (
            <MultiPicker label="Include categories" options={catOpts} selected={form.includeCategories} onChange={(v) => set("includeCategories", v)} emptyHint="No categories found." />
          )}
          {form.eligibility_scope === "products" && (
            <MultiPicker label="Include products" options={productOpts} selected={form.includeProducts} onChange={(v) => set("includeProducts", v)} emptyHint="No products found." />
          )}
          <p style={hintStyle}>Exclusions always apply, whatever the scope above — use them for “everything except…”.</p>
          <MultiPicker label="Exclude categories" options={catOpts} selected={form.excludeCategories} onChange={(v) => set("excludeCategories", v)} emptyHint="No categories found." />
          <MultiPicker label="Exclude products" options={productOpts} selected={form.excludeProducts} onChange={(v) => set("excludeProducts", v)} emptyHint="No products found." />
        </Section>

        {/* CART CONDITIONS --------------------------------------------- */}
        <Section title="Cart conditions">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Min order amount (£)</label>
              <input style={inputStyle} type="number" step="0.01" min="0" value={form.min_order_amount} onChange={(e) => set("min_order_amount", e.target.value)} placeholder="No minimum" />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Max order amount (£)</label>
              <input style={inputStyle} type="number" step="0.01" min="0" value={form.max_order_amount} onChange={(e) => set("max_order_amount", e.target.value)} placeholder="No maximum" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Min quantity</label>
              <input style={inputStyle} type="number" min="0" value={form.min_quantity} onChange={(e) => set("min_quantity", e.target.value)} placeholder="No minimum" />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Max quantity</label>
              <input style={inputStyle} type="number" min="0" value={form.max_quantity} onChange={(e) => set("max_quantity", e.target.value)} placeholder="No maximum" />
            </div>
          </div>
        </Section>

        {/* AUDIENCE ----------------------------------------------------- */}
        <Section title="Audience">
          <Field label="Who can use this offer">
            <select style={inputStyle} value={form.audience} onChange={(e) => set("audience", e.target.value as FormState["audience"])}>
              <option value="everyone">Everyone</option>
              <option value="first_order">First order only</option>
              <option value="new_customer">New customers only</option>
              <option value="specific_emails">Specific emails</option>
            </select>
          </Field>
          {form.audience === "specific_emails" && (
            <Field label="Allowed emails (one per line)">
              <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={form.emailsText} onChange={(e) => set("emailsText", e.target.value)} placeholder={"alice@example.com\nbob@example.com"} />
            </Field>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Usage limit (total)</label>
              <input style={inputStyle} type="number" min="0" value={form.usage_limit_total} onChange={(e) => set("usage_limit_total", e.target.value)} placeholder="Unlimited" />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Usage limit (per customer)</label>
              <input style={inputStyle} type="number" min="0" value={form.usage_limit_per_customer} onChange={(e) => set("usage_limit_per_customer", e.target.value)} placeholder="Unlimited" />
            </div>
          </div>
        </Section>

        {/* SCHEDULE ----------------------------------------------------- */}
        <Section title="Schedule">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Starts</label>
              <input style={inputStyle} type="datetime-local" value={form.start_at} onChange={(e) => set("start_at", e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Ends</label>
              <input style={inputStyle} type="datetime-local" value={form.end_at} onChange={(e) => set("end_at", e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Daily from (optional)</label>
              <input style={inputStyle} type="time" value={form.time_start} onChange={(e) => set("time_start", e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Daily until (optional)</label>
              <input style={inputStyle} type="time" value={form.time_end} onChange={(e) => set("time_end", e.target.value)} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Days of week (leave all unchecked for every day)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DAY_LABELS.map((d, i) => {
                const on = form.days_of_week.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(i)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: `1px solid ${on ? WINE : "rgba(135,56,83,0.25)"}`,
                      background: on ? WINE : "transparent",
                      color: on ? "white" : BERRY,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <p style={hintStyle}>
            There is no scheduler to switch offers on and off — an offer is “active” whenever it’s enabled and
            the current time falls inside this schedule.
          </p>
        </Section>

        {/* STOREFRONT CONTENT — BANNER --------------------------------- */}
        <Section title="Storefront content">
          <Field label="Announcement bar text">
            <input style={inputStyle} value={form.announcement_text} onChange={(e) => set("announcement_text", e.target.value)} placeholder="Overrides the top bar while active" />
          </Field>
          <Field label="Banner title">
            <input style={inputStyle} value={form.hero_heading} onChange={(e) => set("hero_heading", e.target.value)} placeholder={bannerTitlePlaceholder(form.type)} />
          </Field>
          <Field label="Banner description">
            <input style={inputStyle} value={form.hero_subtext} onChange={(e) => set("hero_subtext", e.target.value)} placeholder="e.g. On all Birthday Cakes" />
          </Field>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={labelStyle}>Call-to-action text</label>
              <input style={inputStyle} value={form.cta_text} onChange={(e) => set("cta_text", e.target.value)} placeholder="e.g. Shop the sale" />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={labelStyle}>Call-to-action link</label>
              <input style={inputStyle} value={form.cta_link} onChange={(e) => set("cta_link", e.target.value)} placeholder="/menu" />
            </div>
          </div>
          <Field label="Background image (optional)">
            {form.banner_image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={form.banner_image_url} alt="background preview" style={{ width: "100%", maxWidth: 320, borderRadius: 10, display: "block", marginBottom: 8 }} />
            )}
            <input type="file" accept="image/*" onChange={handleImage("banner_image_url")} disabled={uploading} />
            {uploading && <span style={{ color: BERRY, opacity: 0.7, marginLeft: 8 }}>Uploading…</span>}
          </Field>
        </Section>

        {/* BANNER RIGHT SIDE ------------------------------------------- */}
        <Section title="Banner right side">
          <Field label="Display mode">
            <select style={inputStyle} value={form.hero_display_mode} onChange={(e) => set("hero_display_mode", e.target.value as FormState["hero_display_mode"])}>
              <option value="text">Hero text</option>
              <option value="image">Hero image</option>
            </select>
          </Field>

          {form.hero_display_mode === "text" ? (
            <>
              <Field label="Hero text">
                <input style={inputStyle} value={form.hero_highlight_text} onChange={(e) => set("hero_highlight_text", e.target.value)} placeholder={heroTextPlaceholder(form)} />
              </Field>
              <p style={hintStyle}>
                The large promotional text on the right of the banner — e.g. 30% OFF, £10 OFF, BUY 1 GET 1
                FREE, FREE DELIVERY, SAVE20, CHRISTMAS SALE. Leave blank and it is derived from this offer’s
                type and values ({heroTextPlaceholder(form) || "the product count"}).
              </p>
              {form.type === "coupon" && (
                <p style={{ ...hintStyle, color: "#9a6212", opacity: 1 }}>
                  Coupon codes are never published automatically. To show this code on the banner, type it in
                  above.
                </p>
              )}
            </>
          ) : (
            <Field label="Hero image">
              {form.hero_image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={form.hero_image_url} alt="hero preview" style={{ width: "100%", maxWidth: 240, borderRadius: 10, display: "block", marginBottom: 8 }} />
              )}
              <input type="file" accept="image/*" onChange={handleImage("hero_image_url")} disabled={uploading} />
              {uploading && <span style={{ color: BERRY, opacity: 0.7, marginLeft: 8 }}>Uploading…</span>}
              <p style={{ ...hintStyle, marginTop: 8 }}>
                Shown instead of the hero text, which is hidden completely. Without an image the banner falls
                back to hero text.
              </p>
            </Field>
          )}
        </Section>

        {/* HOME PAGE POPUP --------------------------------------------- */}
        <Section title="Home page popup">
          <p style={hintStyle}>
            Shown once per visit on the home page while this offer is active. Every field is optional — blank
            fields reuse the banner content above.
          </p>
          <Field label="Popup title">
            <input style={inputStyle} value={form.popup_title} onChange={(e) => set("popup_title", e.target.value)} placeholder={form.hero_heading.trim() || form.name.trim() || "Banner title"} />
          </Field>
          <Field label="Popup description">
            <input style={inputStyle} value={form.popup_description} onChange={(e) => set("popup_description", e.target.value)} placeholder={form.announcement_text.trim() || form.hero_subtext.trim() || "Banner description"} />
          </Field>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={labelStyle}>Popup button text</label>
              <input style={inputStyle} value={form.popup_cta_text} onChange={(e) => set("popup_cta_text", e.target.value)} placeholder={form.cta_text.trim() || "View Offers"} />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={labelStyle}>Popup button link</label>
              <input style={inputStyle} value={form.popup_cta_link} onChange={(e) => set("popup_cta_link", e.target.value)} placeholder={form.cta_link.trim() || "/menu"} />
            </div>
          </div>
          <Field label="Popup image (optional)">
            {form.popup_image_url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={form.popup_image_url} alt="popup preview" style={{ width: "100%", maxWidth: 320, borderRadius: 10, display: "block", marginBottom: 8 }} />
            )}
            <input type="file" accept="image/*" onChange={handleImage("popup_image_url")} disabled={uploading} />
            {uploading && <span style={{ color: BERRY, opacity: 0.7, marginLeft: 8 }}>Uploading…</span>}
          </Field>
        </Section>

        {/* PREVIEW ------------------------------------------------------ */}
        <Section title="Preview">
          <p style={hintStyle}>
            How this offer’s content appears on the storefront while it’s active. Blank fields fall back to the
            existing site content, shown here as muted placeholders.
          </p>
          <OfferPreview form={form} isMobile={isMobile} />
        </Section>

        {/* ACTIONS ------------------------------------------------------ */}
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
          {!isNew ? (
            <button type="button" onClick={handleDelete} disabled={saving || duplicating} style={{ ...secondaryBtn, borderColor: "#d9534f", color: "#d9534f" }}>
              Delete offer
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => router.push("/admin/dashboard/offers")} style={secondaryBtn}>Cancel</button>
            {!isNew && (
              <button type="button" onClick={handleDuplicate} disabled={saving || duplicating} style={{ ...secondaryBtn, opacity: saving || duplicating ? 0.6 : 1 }}>
                {duplicating ? "Duplicating…" : "Duplicate"}
              </button>
            )}
            <button type="submit" disabled={saving || duplicating || uploading} style={{ ...primaryBtn, opacity: saving || duplicating || uploading ? 0.6 : 1 }}>
              {saving ? "Saving…" : isNew ? "Create offer" : "Save offer"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------
// Live preview of the offer's storefront content. Mirrors the real surfaces:
// AnnouncementBar (components/announcement-bar.tsx) and the offer slide of
// RotatingBanners (components/rotating-banners.tsx) — same palette, same
// watermark-vs-heading layering, same CTA pill.
// ------------------------------------------------------------
function OfferPreview({ form, isMobile }: { form: FormState; isMobile: boolean }) {
  const announcement = form.announcement_text.trim();
  const heading = form.hero_heading.trim();
  const subtext = form.hero_subtext.trim();
  const ctaText = form.cta_text.trim();
  const ctaLink = form.cta_link.trim();

  // The right side resolves exactly as the storefront does: an image replaces
  // the hero text entirely, and a blank hero text falls back to the value
  // derived from this offer's type.
  const heroImage = form.hero_image_url.trim();
  const showHeroImage = form.hero_display_mode === "image" && heroImage !== "";
  const highlight = showHeroImage
    ? ""
    : form.hero_highlight_text.trim() || heroTextPlaceholder(form);

  // Popup content mirrors resolveOfferDisplay()'s fallback chain.
  const popupTitle = form.popup_title.trim() || heading || form.name.trim();
  const popupDescription = form.popup_description.trim() || announcement || subtext;
  const popupImage = form.popup_image_url.trim() || form.banner_image_url.trim();
  const popupCtaText = form.popup_cta_text.trim() || ctaText || "View Offers";

  const muted = "rgba(92,42,65,0.45)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Announcement bar --------------------------------------------- */}
      <div>
        <PreviewLabel>Announcement bar</PreviewLabel>
        <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(135,56,83,0.15)" }}>
          {announcement ? (
            <div style={{ background: WINE, color: "white", textAlign: "center", padding: "8px 16px", fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.4 }}>
              {announcement}
            </div>
          ) : (
            <div style={{ background: "rgba(135,56,83,0.05)", color: muted, textAlign: "center", padding: "8px 16px", fontSize: "0.85rem", fontStyle: "italic" }}>
              No announcement text — the site-wide announcement bar stays as it is.
            </div>
          )}
        </div>
      </div>

      {/* Special Offer hero banner ------------------------------------ */}
      <div>
        <PreviewLabel>Special Offer banner</PreviewLabel>
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid rgba(135,56,83,0.15)",
            background: "#F9EEEA",
            padding: isMobile ? "1.5rem 1.25rem" : "2.25rem 2rem",
            minHeight: 180,
            ...(form.banner_image_url
              ? {
                  backgroundImage: `linear-gradient(to right, rgba(249,238,234,0.94), rgba(249,238,234,0.7)), url(${form.banner_image_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : {}),
          }}
        >
          {/* Right side — hidden on mobile, exactly as the real banner does.
              Either the hero image or the big hero text, never both. */}
          {!isMobile && (
            showHeroImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={heroImage}
                alt=""
                aria-hidden
                style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", height: 150, maxWidth: "40%", objectFit: "contain", objectPosition: "right", pointerEvents: "none", userSelect: "none" }}
              />
            ) : (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  right: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "6.5rem",
                  fontWeight: 900,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  color: "rgba(122,46,77,0.5)",
                  pointerEvents: "none",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {highlight || <span style={{ color: muted, fontSize: "1rem", fontWeight: 600, fontStyle: "italic" }}>product count</span>}
              </span>
            )
          )}

          <div style={{ position: "relative", maxWidth: "60%" }}>
            {heading ? (
              <h3 style={{ color: "#612437", fontSize: isMobile ? "1.6rem" : "2.2rem", fontWeight: 800, lineHeight: 1.15, margin: 0 }}>{heading}</h3>
            ) : (
              <h3 style={{ color: muted, fontSize: isMobile ? "1.6rem" : "2.2rem", fontWeight: 800, lineHeight: 1.15, margin: 0, fontStyle: "italic" }}>
                Existing banner heading
              </h3>
            )}
            {subtext ? (
              <p style={{ color: "#9C616D", marginTop: 12, marginBottom: 0 }}>{subtext}</p>
            ) : (
              <p style={{ color: muted, marginTop: 12, marginBottom: 0, fontStyle: "italic" }}>Existing banner subtext</p>
            )}
            {ctaText && (
              <span style={{ display: "inline-block", marginTop: 18, background: WINE, color: "#FDF6F3", borderRadius: 999, padding: "10px 22px", fontSize: "0.85rem", fontWeight: 600 }}>
                {ctaText}
              </span>
            )}
          </div>
        </div>
        {ctaText && !ctaLink && (
          <p style={{ ...hintStyle, marginTop: 8, color: "#9a6212", opacity: 1 }}>
            The button needs a link as well as text — the storefront only renders a CTA when both are set.
          </p>
        )}
        {ctaLink && !ctaText && (
          <p style={{ ...hintStyle, marginTop: 8, color: "#9a6212", opacity: 1 }}>
            The button needs text as well as a link — the storefront only renders a CTA when both are set.
          </p>
        )}
      </div>

      {/* Home page popup ---------------------------------------------- */}
      <div>
        <PreviewLabel>Home page popup</PreviewLabel>
        <div style={{ maxWidth: 320, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(135,56,83,0.15)", background: "#FDF6F3" }}>
          {popupImage && (
            <div style={{ height: 110, backgroundImage: `url(${popupImage})`, backgroundSize: "cover", backgroundPosition: "center" }} aria-hidden />
          )}
          <div style={{ padding: "16px 18px 20px", textAlign: "center" }}>
            {highlight && (
              <span style={{ display: "inline-block", marginBottom: 10, background: WINE, color: "#FDF6F3", borderRadius: 999, padding: "4px 12px", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {highlight}
              </span>
            )}
            {popupTitle ? (
              <h3 style={{ color: "#4A1F30", fontSize: "1.15rem", fontWeight: 800, margin: 0, lineHeight: 1.3 }}>🎉 {popupTitle}</h3>
            ) : (
              <h3 style={{ color: muted, fontSize: "1.15rem", fontWeight: 800, margin: 0, fontStyle: "italic" }}>Offer name</h3>
            )}
            {popupDescription ? (
              <p style={{ color: "#6E4152", fontSize: "0.85rem", marginTop: 8, marginBottom: 0 }}>{popupDescription}</p>
            ) : (
              <p style={{ color: muted, fontSize: "0.85rem", marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>
                Check out our latest offers on the Menu page.
              </p>
            )}
            <span style={{ display: "inline-block", marginTop: 16, background: WINE, color: "#FDF6F3", borderRadius: 999, padding: "9px 20px", fontSize: "0.82rem", fontWeight: 600 }}>
              {popupCtaText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: BERRY, opacity: 0.55, marginBottom: 6 }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------
// Small presentational helpers (match the products/settings styling)
// ------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 16, padding: "1.25rem 1.4rem", boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
      <h2 style={{ color: WINE, fontSize: "1.15rem", fontWeight: 800, margin: "0 0 14px" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{ width: 44, height: 24, borderRadius: 999, border: "none", cursor: "pointer", background: on ? WINE : "rgba(135,56,83,0.2)", position: "relative", transition: "background 0.15s", flexShrink: 0 }}
    >
      <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "white", transition: "left 0.15s" }} />
    </button>
  );
}

function MultiPicker({
  label,
  options,
  selected,
  onChange,
  emptyHint,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyHint: string;
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {options.length === 0 ? (
        <p style={hintStyle}>{emptyHint}</p>
      ) : (
        <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid rgba(135,56,83,0.25)", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
          {options.map((o) => (
            <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, color: BERRY, fontSize: "0.9rem", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(135,56,83,0.25)", fontSize: "0.95rem", color: BERRY, outline: "none" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: BERRY, marginBottom: 6, fontSize: "0.9rem" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, color: BERRY, fontWeight: 600 };
const hintStyle: React.CSSProperties = { color: BERRY, opacity: 0.65, fontSize: "0.82rem", margin: 0 };
const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: WINE, color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${WINE}`, background: "transparent", color: WINE, fontWeight: 700, cursor: "pointer" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };
