"use client";

// ============================================================
// Le Rasa Bakery — Accessories
// ------------------------------------------------------------
// The Accessories Management System. Categories (Candles, Cake Toppers,
// Greeting Cards, Balloons, … or anything the admin invents) each own a
// display type and the items inside them. Everything the customization page
// shows is edited here — nothing about accessories is hardcoded in the app.
//
// Create / edit / delete / enable / disable / reorder / upload an image, for
// both categories and the accessories inside them.
//
// NOTE: Client Component — must NOT export route segment config
// (`dynamic`/`revalidate`); that 500s the route.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { adminGet, adminSend, adminUpload } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  DISPLAY_TYPES,
  type AccessoryCategory,
  type Accessory,
  type DisplayType,
} from "@/lib/customization";

const WINE = "#873853";
const BERRY = "#5C2A41";
const BLUSH = "#F9EEEA";

/** What each display type means, in the admin's language. */
const TYPE_HELP: Record<DisplayType, string> = {
  radio: "Pick exactly one — shown as a list of buttons.",
  dropdown: "Pick exactly one — shown as a select menu.",
  checkbox: "Pick any number of items.",
  toggle: "A yes/no switch. Priced at the CATEGORY price, not per item.",
  quantity: "A number stepper per item (3 balloons, 6 macarons). Priced per unit.",
  text: "A single-line message. Priced at the CATEGORY price when filled in.",
  textarea: "A multi-line message. Priced at the CATEGORY price when filled in.",
};

/** Display types whose items are priced individually. */
const ITEM_TYPES: DisplayType[] = ["radio", "dropdown", "checkbox", "quantity"];

type CategoryForm = {
  id?: string;
  name: string;
  display_type: DisplayType;
  description: string;
  placeholder: string;
  price: string;
  required: boolean;
  max_chars: string;
  min_qty: string;
  max_qty: string;
  depends_on_key: string;
  depends_on_value: string;
  sort_order: string;
  active: boolean;
};

type AccessoryForm = {
  id?: string;
  category_id: string;
  name: string;
  description: string;
  image_url: string;
  price: string;
  min_qty: string;
  max_qty: string;
  is_default: boolean;
  sort_order: string;
  active: boolean;
};

const EMPTY_CATEGORY: CategoryForm = {
  name: "",
  display_type: "checkbox",
  description: "",
  placeholder: "",
  price: "0",
  required: false,
  max_chars: "",
  min_qty: "0",
  max_qty: "10",
  depends_on_key: "",
  depends_on_value: "",
  sort_order: "0",
  active: true,
};

const emptyAccessory = (categoryId: string): AccessoryForm => ({
  category_id: categoryId,
  name: "",
  description: "",
  image_url: "",
  price: "0",
  min_qty: "1",
  max_qty: "10",
  is_default: false,
  sort_order: "0",
  active: true,
});

export default function AccessoriesPage() {
  const isMobile = useIsMobile();
  const [categories, setCategories] = useState<AccessoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [accessoryForm, setAccessoryForm] = useState<AccessoryForm | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminGet<{ categories: AccessoryCategory[] }>(
        "/api/admin/accessories",
        { force: true },
      );
      setCategories(data.categories ?? []);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? `${e.message} — has supabase/sql/22_accessories.sql been run?`
          : "Failed to load accessories",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- mutations -------------------------------------------------------

  async function saveCategory() {
    if (!categoryForm) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        kind: "category",
        name: categoryForm.name,
        display_type: categoryForm.display_type,
        description: categoryForm.description,
        placeholder: categoryForm.placeholder,
        price: Number(categoryForm.price) || 0,
        required: categoryForm.required,
        max_chars: categoryForm.max_chars === "" ? null : Number(categoryForm.max_chars),
        min_qty: Number(categoryForm.min_qty) || 0,
        max_qty: Number(categoryForm.max_qty) || 10,
        depends_on_key: categoryForm.depends_on_key,
        depends_on_value: categoryForm.depends_on_value,
        sort_order: Number(categoryForm.sort_order) || 0,
        active: categoryForm.active,
      };
      if (categoryForm.id) {
        await adminSend(
          `/api/admin/accessories/${categoryForm.id}?kind=category`,
          "PATCH",
          payload,
        );
      } else {
        await adminSend("/api/admin/accessories", "POST", payload);
      }
      setCategoryForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save category");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccessory() {
    if (!accessoryForm) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        kind: "accessory",
        category_id: accessoryForm.category_id,
        name: accessoryForm.name,
        description: accessoryForm.description,
        image_url: accessoryForm.image_url,
        price: Number(accessoryForm.price) || 0,
        min_qty: Number(accessoryForm.min_qty) || 0,
        max_qty: Number(accessoryForm.max_qty) || 10,
        is_default: accessoryForm.is_default,
        sort_order: Number(accessoryForm.sort_order) || 0,
        active: accessoryForm.active,
      };
      if (accessoryForm.id) {
        await adminSend(
          `/api/admin/accessories/${accessoryForm.id}?kind=accessory`,
          "PATCH",
          payload,
        );
      } else {
        await adminSend("/api/admin/accessories", "POST", payload);
      }
      setAccessoryForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save accessory");
    } finally {
      setSaving(false);
    }
  }

  async function patch(
    kind: "category" | "accessory",
    id: string,
    body: Record<string, unknown>,
  ) {
    setError(null);
    try {
      await adminSend(`/api/admin/accessories/${id}?kind=${kind}`, "PATCH", body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function remove(kind: "category" | "accessory", id: string, name: string) {
    const warning =
      kind === "category"
        ? `Delete the "${name}" category and every accessory inside it? Orders already placed keep what they recorded.`
        : `Delete "${name}"?`;
    if (!window.confirm(warning)) return;
    setError(null);
    try {
      await adminSend(`/api/admin/accessories/${id}?kind=${kind}`, "DELETE");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  /** Swap this row's sort_order with its neighbour's. */
  async function move(
    kind: "category" | "accessory",
    list: { id: string; sortIndex: number }[],
    index: number,
    dir: -1 | 1,
  ) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const a = list[index];
    const b = list[target];
    setError(null);
    try {
      // Positions are re-stated from the array index, so a list where every
      // row still has sort_order 0 (never dragged) reorders correctly instead
      // of swapping two identical values and appearing to do nothing.
      await Promise.all([
        adminSend(`/api/admin/accessories/${a.id}?kind=${kind}`, "PATCH", {
          sort_order: (target + 1) * 10,
        }),
        adminSend(`/api/admin/accessories/${b.id}?kind=${kind}`, "PATCH", {
          sort_order: (index + 1) * 10,
        }),
      ]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reorder");
    }
  }

  // ---- render ----------------------------------------------------------

  if (loading) return <p style={{ color: BERRY }}>Loading accessories…</p>;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h1 style={{ color: WINE, margin: 0, fontSize: "1.6rem" }}>Accessories</h1>
          <p style={{ color: BERRY, opacity: 0.75, margin: "6px 0 0", fontSize: "0.9rem" }}>
            Everything the cake customization page offers. Each category is one
            control; the accessories inside it are the choices.
          </p>
        </div>
        <button
          style={primaryBtn}
          onClick={() => setCategoryForm({ ...EMPTY_CATEGORY })}
        >
          + New category
        </button>
      </div>

      {error && (
        <p
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            background: "#fee2e2",
            color: "#991b1b",
            fontWeight: 600,
          }}
        >
          {error}
        </p>
      )}

      {categories.length === 0 && !error && (
        <p style={{ marginTop: 24, color: BERRY }}>
          No accessory categories yet. Create one, or run
          {" "}<code>supabase/sql/22_accessories.sql</code>{" "}
          to seed the starter set.
        </p>
      )}

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {categories.map((cat, i) => (
          <section key={cat.id} style={{ ...card, opacity: cat.active ? 1 : 0.6 }}>
            {/* Category header */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, color: WINE, fontSize: "1.1rem" }}>{cat.name}</h2>
                  <span style={pill}>{cat.displayType}</span>
                  {cat.required && <span style={{ ...pill, background: "#fdebd0", color: "#92400e" }}>Required</span>}
                  {!cat.active && <span style={{ ...pill, background: "#e5e7eb", color: "#374151" }}>Disabled</span>}
                  {cat.dependsOnKey && (
                    <span style={{ ...pill, background: "#dbeafe", color: "#1e40af" }}>
                      only when {cat.dependsOnKey} = {cat.dependsOnValue}
                    </span>
                  )}
                </div>
                <p style={{ margin: "6px 0 0", color: BERRY, opacity: 0.7, fontSize: "0.85rem" }}>
                  key: <code>{cat.key}</code>
                  {cat.price > 0 && ` · £${cat.price.toFixed(2)}`}
                  {cat.maxChars ? ` · max ${cat.maxChars} chars` : ""}
                  {cat.displayType === "quantity" ? ` · up to ${cat.maxQty}` : ""}
                </p>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  style={iconBtn}
                  title="Move up"
                  onClick={() =>
                    move(
                      "category",
                      categories.map((c, n) => ({ id: c.id, sortIndex: n })),
                      i,
                      -1,
                    )
                  }
                >
                  ↑
                </button>
                <button
                  style={iconBtn}
                  title="Move down"
                  onClick={() =>
                    move(
                      "category",
                      categories.map((c, n) => ({ id: c.id, sortIndex: n })),
                      i,
                      1,
                    )
                  }
                >
                  ↓
                </button>
                <button
                  style={ghostBtn}
                  onClick={() => patch("category", cat.id, { active: !cat.active })}
                >
                  {cat.active ? "Disable" : "Enable"}
                </button>
                <button
                  style={ghostBtn}
                  onClick={() =>
                    setCategoryForm({
                      id: cat.id,
                      name: cat.name,
                      display_type: cat.displayType,
                      description: cat.description ?? "",
                      placeholder: cat.placeholder ?? "",
                      price: String(cat.price),
                      required: cat.required,
                      max_chars: cat.maxChars == null ? "" : String(cat.maxChars),
                      min_qty: String(cat.minQty),
                      max_qty: String(cat.maxQty),
                      depends_on_key: cat.dependsOnKey ?? "",
                      depends_on_value: cat.dependsOnValue ?? "",
                      sort_order: String((i + 1) * 10),
                      active: cat.active,
                    })
                  }
                >
                  Edit
                </button>
                <button
                  style={{ ...ghostBtn, borderColor: "#991b1b", color: "#991b1b" }}
                  onClick={() => remove("category", cat.id, cat.name)}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Accessories inside this category */}
            {ITEM_TYPES.includes(cat.displayType) ? (
              <div style={{ marginTop: 14 }}>
                {cat.accessories.length === 0 && (
                  <p style={{ color: BERRY, opacity: 0.7, fontSize: "0.85rem", margin: "0 0 10px" }}>
                    No accessories yet — this category will not appear until it has at least one.
                  </p>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {cat.accessories.map((acc, j) => (
                    <AccessoryRow
                      key={acc.id}
                      accessory={acc}
                      showQty={cat.displayType === "quantity"}
                      isMobile={isMobile}
                      onUp={() =>
                        move(
                          "accessory",
                          cat.accessories.map((a, n) => ({ id: a.id, sortIndex: n })),
                          j,
                          -1,
                        )
                      }
                      onDown={() =>
                        move(
                          "accessory",
                          cat.accessories.map((a, n) => ({ id: a.id, sortIndex: n })),
                          j,
                          1,
                        )
                      }
                      onToggle={() => patch("accessory", acc.id, { active: !acc.active })}
                      onEdit={() =>
                        setAccessoryForm({
                          id: acc.id,
                          category_id: cat.id,
                          name: acc.name,
                          description: acc.description ?? "",
                          image_url: acc.imageUrl ?? "",
                          price: String(acc.price),
                          min_qty: String(acc.minQty),
                          max_qty: String(acc.maxQty),
                          is_default: acc.isDefault,
                          sort_order: String((j + 1) * 10),
                          active: acc.active,
                        })
                      }
                      onDelete={() => remove("accessory", acc.id, acc.name)}
                    />
                  ))}
                </div>

                <button
                  style={{ ...ghostBtn, marginTop: 10 }}
                  onClick={() => setAccessoryForm(emptyAccessory(cat.id))}
                >
                  + Add accessory to {cat.name}
                </button>
              </div>
            ) : (
              <p style={{ marginTop: 12, color: BERRY, opacity: 0.7, fontSize: "0.85rem" }}>
                {TYPE_HELP[cat.displayType]}
              </p>
            )}
          </section>
        ))}
      </div>

      {/* ---- Category form ---- */}
      {categoryForm && (
        <Modal
          title={categoryForm.id ? "Edit category" : "New category"}
          onClose={() => setCategoryForm(null)}
          onSave={saveCategory}
          saving={saving}
          isMobile={isMobile}
        >
          <Field label="Name">
            <input
              style={input}
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="Candles"
            />
          </Field>

          <Field label="Display type" hint={TYPE_HELP[categoryForm.display_type]}>
            <select
              style={input}
              value={categoryForm.display_type}
              onChange={(e) =>
                setCategoryForm({
                  ...categoryForm,
                  display_type: e.target.value as DisplayType,
                })
              }
            >
              {DISPLAY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Description (shown under the heading)">
            <input
              style={input}
              value={categoryForm.description}
              onChange={(e) =>
                setCategoryForm({ ...categoryForm, description: e.target.value })
              }
            />
          </Field>

          {/* Price applies to the CATEGORY only for toggle / text types — for
              radio, dropdown, checkbox and quantity, each accessory is priced. */}
          {!ITEM_TYPES.includes(categoryForm.display_type) && (
            <Field label="Price (£)" hint="Charged when this is switched on / filled in.">
              <input
                style={input}
                type="number"
                step="0.01"
                min="0"
                value={categoryForm.price}
                onChange={(e) => setCategoryForm({ ...categoryForm, price: e.target.value })}
              />
            </Field>
          )}

          {(categoryForm.display_type === "text" ||
            categoryForm.display_type === "textarea") && (
            <>
              <Field label="Placeholder">
                <input
                  style={input}
                  value={categoryForm.placeholder}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, placeholder: e.target.value })
                  }
                />
              </Field>
              <Field label="Maximum characters" hint="Blank = no limit.">
                <input
                  style={input}
                  type="number"
                  min="1"
                  value={categoryForm.max_chars}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, max_chars: e.target.value })
                  }
                />
              </Field>
            </>
          )}

          {categoryForm.display_type === "quantity" && (
            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Minimum quantity">
                <input
                  style={input}
                  type="number"
                  min="0"
                  value={categoryForm.min_qty}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, min_qty: e.target.value })
                  }
                />
              </Field>
              <Field label="Maximum quantity">
                <input
                  style={input}
                  type="number"
                  min="1"
                  value={categoryForm.max_qty}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, max_qty: e.target.value })
                  }
                />
              </Field>
            </div>
          )}

          <label style={checkRow}>
            <input
              type="checkbox"
              checked={categoryForm.required}
              onChange={(e) =>
                setCategoryForm({ ...categoryForm, required: e.target.checked })
              }
            />
            Required — the customer cannot continue without answering
          </label>

          <label style={checkRow}>
            <input
              type="checkbox"
              checked={categoryForm.active}
              onChange={(e) =>
                setCategoryForm({ ...categoryForm, active: e.target.checked })
              }
            />
            Enabled
          </label>

          {/* Conditional visibility */}
          <div style={{ marginTop: 10, padding: 12, background: BLUSH, borderRadius: 10 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, color: WINE, fontSize: "0.85rem" }}>
              Only show this category when…
            </p>
            <p style={{ margin: "0 0 10px", color: BERRY, opacity: 0.75, fontSize: "0.78rem" }}>
              Leave blank to always show it. Example: show &quot;Card message&quot; only when
              the <code>greeting_card</code> toggle is <code>yes</code>.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Category key">
                <select
                  style={input}
                  value={categoryForm.depends_on_key}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, depends_on_key: e.target.value })
                  }
                >
                  <option value="">— always show —</option>
                  {categories
                    .filter((c) => c.id !== categoryForm.id)
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.name} ({c.key})
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="…holds this value">
                <input
                  style={input}
                  value={categoryForm.depends_on_value}
                  placeholder="yes"
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, depends_on_value: e.target.value })
                  }
                />
              </Field>
            </div>
          </div>
        </Modal>
      )}

      {/* ---- Accessory form ---- */}
      {accessoryForm && (
        <Modal
          title={accessoryForm.id ? "Edit accessory" : "New accessory"}
          onClose={() => setAccessoryForm(null)}
          onSave={saveAccessory}
          saving={saving}
          isMobile={isMobile}
        >
          <Field label="Name">
            <input
              style={input}
              value={accessoryForm.name}
              onChange={(e) =>
                setAccessoryForm({ ...accessoryForm, name: e.target.value })
              }
              placeholder="Sparkler"
            />
          </Field>

          <Field label="Description">
            <input
              style={input}
              value={accessoryForm.description}
              onChange={(e) =>
                setAccessoryForm({ ...accessoryForm, description: e.target.value })
              }
            />
          </Field>

          <Field label="Price (£)">
            <input
              style={input}
              type="number"
              step="0.01"
              min="0"
              value={accessoryForm.price}
              onChange={(e) =>
                setAccessoryForm({ ...accessoryForm, price: e.target.value })
              }
            />
          </Field>

          <div style={{ display: "flex", gap: 10 }}>
            <Field label="Minimum quantity">
              <input
                style={input}
                type="number"
                min="0"
                value={accessoryForm.min_qty}
                onChange={(e) =>
                  setAccessoryForm({ ...accessoryForm, min_qty: e.target.value })
                }
              />
            </Field>
            <Field label="Maximum quantity">
              <input
                style={input}
                type="number"
                min="1"
                value={accessoryForm.max_qty}
                onChange={(e) =>
                  setAccessoryForm({ ...accessoryForm, max_qty: e.target.value })
                }
              />
            </Field>
          </div>

          <ImageField
            value={accessoryForm.image_url}
            onChange={(url) => setAccessoryForm({ ...accessoryForm, image_url: url })}
            onError={setError}
          />

          <label style={checkRow}>
            <input
              type="checkbox"
              checked={accessoryForm.is_default}
              onChange={(e) =>
                setAccessoryForm({ ...accessoryForm, is_default: e.target.checked })
              }
            />
            Selected by default
          </label>

          <label style={checkRow}>
            <input
              type="checkbox"
              checked={accessoryForm.active}
              onChange={(e) =>
                setAccessoryForm({ ...accessoryForm, active: e.target.checked })
              }
            />
            Enabled
          </label>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Pieces
// ------------------------------------------------------------

function AccessoryRow({
  accessory,
  showQty,
  isMobile,
  onUp,
  onDown,
  onToggle,
  onEdit,
  onDelete,
}: {
  accessory: Accessory;
  showQty: boolean;
  isMobile: boolean;
  onUp: () => void;
  onDown: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 10,
        background: BLUSH,
        flexWrap: isMobile ? "wrap" : "nowrap",
        opacity: accessory.active ? 1 : 0.55,
      }}
    >
      {accessory.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnail, same as the Products page
        <img
          src={accessory.imageUrl}
          alt={accessory.name}
          style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }}
        />
      ) : (
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "#eadfdb" }} />
      )}

      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontWeight: 600, color: BERRY }}>{accessory.name}</div>
        <div style={{ fontSize: "0.78rem", color: BERRY, opacity: 0.7 }}>
          {accessory.price > 0 ? `£${accessory.price.toFixed(2)}` : "Free"}
          {showQty ? ` · ${accessory.minQty}–${accessory.maxQty}` : ""}
          {accessory.isDefault ? " · default" : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button style={iconBtn} title="Move up" onClick={onUp}>↑</button>
        <button style={iconBtn} title="Move down" onClick={onDown}>↓</button>
        <button style={ghostBtn} onClick={onEdit}>Edit</button>
        <button style={ghostBtn} onClick={onToggle}>
          {accessory.active ? "Disable" : "Enable"}
        </button>
        <button
          style={{ ...ghostBtn, borderColor: "#991b1b", color: "#991b1b" }}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ImageField({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (url: string) => void;
  onError: (msg: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      // Reuses the existing product-images bucket + upload route.
      const { url } = await adminUpload(file);
      onChange(url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field label="Image">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-only preview
          <img
            src={value}
            alt=""
            style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 8, background: "#eadfdb" }} />
        )}
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
          style={{ fontSize: "0.85rem", color: BERRY }}
        />
        {value && (
          <button style={ghostBtn} onClick={() => onChange("")} type="button">
            Remove
          </button>
        )}
      </div>
      {uploading && (
        <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: BERRY }}>Uploading…</p>
      )}
    </Field>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginTop: 12, flex: 1 }}>
      <span style={{ display: "block", fontWeight: 600, fontSize: "0.85rem", color: BERRY }}>
        {label}
      </span>
      {children}
      {hint && (
        <span
          style={{
            display: "block",
            marginTop: 4,
            fontSize: "0.78rem",
            color: BERRY,
            opacity: 0.7,
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function Modal({
  title,
  children,
  onClose,
  onSave,
  saving,
  isMobile,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  isMobile: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(60,20,40,0.45)",
        zIndex: 60,
        display: "flex",
        justifyContent: "center",
        alignItems: isMobile ? "flex-end" : "center",
        padding: isMobile ? 0 : 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: isMobile ? "16px 16px 0 0" : 16,
          padding: "1.5rem",
          width: "100%",
          maxWidth: 520,
          maxHeight: isMobile ? "88vh" : "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(60,20,40,0.3)",
        }}
      >
        <h2 style={{ margin: 0, color: WINE, fontSize: "1.2rem" }}>{title}</h2>
        {children}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button style={{ ...primaryBtn, flex: 1 }} onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button style={{ ...ghostBtn, flex: 1 }} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Styles (inline, matching the rest of the admin panel)
// ------------------------------------------------------------

const card: React.CSSProperties = {
  background: "white",
  borderRadius: 14,
  padding: "1.1rem 1.25rem",
  boxShadow: "0 2px 10px rgba(60,20,40,0.06)",
};

const pill: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#f3e8ee",
  color: WINE,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
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
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${WINE}`,
  background: "transparent",
  color: WINE,
  fontWeight: 600,
  fontSize: "0.82rem",
  cursor: "pointer",
};

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: `1px solid rgba(135,56,83,0.3)`,
  background: "white",
  color: WINE,
  fontWeight: 700,
  cursor: "pointer",
};

const input: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid rgba(135,56,83,0.25)",
  fontSize: "0.9rem",
  color: BERRY,
  boxSizing: "border-box",
};

const checkRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 12,
  fontSize: "0.88rem",
  fontWeight: 600,
  color: BERRY,
};
