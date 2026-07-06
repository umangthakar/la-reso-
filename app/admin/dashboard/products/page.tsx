"use client";

// ============================================================
// Le Rasa Bakery — Product Management
// Table with image, name, category, price, badge, Visible toggle,
// In Stock toggle, edit/delete. Drag rows to reorder (persists
// sort_order). Add/Edit modal incl. allergens. Categories sub-section
// renames a category across all its products. All DB work via the
// password-gated /api/admin/products routes.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { adminGet, adminSend, adminUpload } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";

const WINE = "#873853";
const BERRY = "#5C2A41";
const PAGE_SIZE = 20;

// Fallback options shown in the product form only until the live category
// list loads (or when none have been created yet).
const DEFAULT_CATEGORIES = [
  "Birthday Cakes",
  "Cupcakes",
  "Custom Cakes",
  "Brownies",
  "Cookies",
  "Gift Boxes",
];

type Product = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  price: number;
  badge: string | null;
  image_url: string | null;
  in_stock: boolean;
  visible: boolean;
  allergens: string | null;
  sort_order: number;
};

type FormState = {
  id: string | null;
  name: string;
  category: string;
  description: string;
  price: string;
  badge: string;
  image_url: string;
  allergens: string;
  in_stock: boolean;
  visible: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  category: "",
  description: "",
  price: "",
  badge: "",
  image_url: "",
  allergens: "",
  in_stock: true,
  visible: true,
};

export default function ProductsAdminPage() {
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Options for the product form's Category dropdown: the live managed list,
  // falling back to the defaults until it loads / while none exist.
  const catOptions = categoryNames.length > 0 ? categoryNames : DEFAULT_CATEGORIES;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ products: Product[]; total: number }>(
        `/api/admin/products?page=${page}&pageSize=${PAGE_SIZE}`,
      );
      setProducts(data.products || []);
      setTotal(data.total || 0);
      // If a deletion emptied the last page, step back to the previous one.
      if ((data.products || []).length === 0 && page > 1) setPage((p) => p - 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Live category names for the product form dropdown. Kept in sync with the
  // Categories panel below via the onChanged callback.
  const loadCategories = useCallback(async () => {
    try {
      const data = await adminGet<{ categories: { name: string; count: number }[] }>(
        "/api/admin/products/categories",
        { force: true },
      );
      setCategoryNames((data.categories || []).map((c) => c.name));
    } catch {
      /* leave the previous list in place */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  function openAdd() {
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setForm({
      id: p.id,
      name: p.name,
      category: p.category ?? "",
      description: p.description ?? "",
      price: String(p.price ?? ""),
      badge: p.badge ?? "",
      image_url: p.image_url ?? "",
      allergens: p.allergens ?? "",
      in_stock: p.in_stock,
      visible: p.visible,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { url } = await adminUpload(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Please enter a product name.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      category: form.category || null,
      description: form.description,
      price: form.price,
      badge: form.badge,
      image_url: form.image_url,
      allergens: form.allergens,
      in_stock: form.in_stock,
      visible: form.visible,
    };
    try {
      if (form.id) {
        await adminSend(`/api/admin/products/${form.id}`, "PUT", payload);
      } else {
        await adminSend("/api/admin/products", "POST", { ...payload, sort_order: total });
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      await adminSend(`/api/admin/products/${p.id}`, "DELETE");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function toggleField(p: Product, field: "visible" | "in_stock") {
    const next = !p[field];
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: next } : x)));
    try {
      await adminSend(`/api/admin/products/${p.id}`, "PATCH", { [field]: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      await load();
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = products.findIndex((p) => p.id === active.id);
    const newIndex = products.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(products, oldIndex, newIndex);
    setProducts(reordered);
    setError("");
    // Persist absolute sort_order across pages, not the page-local index.
    const offset = (page - 1) * PAGE_SIZE;
    try {
      await adminSend("/api/admin/products/reorder", "POST", {
        order: reordered.map((p, i) => ({ id: p.id, sort_order: offset + i })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save new order");
      await load();
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>Products</h1>
        <button onClick={openAdd} style={{ ...primaryBtn, ...(isMobile ? { minHeight: 44, width: "100%" } : {}) }}>+ Add product</button>
      </div>
      <p style={{ color: BERRY, opacity: 0.7, marginTop: 4, fontSize: "0.9rem" }}>
        Drag the ⠿ handle to reorder. Toggle Visible to show/hide on the menu.
      </p>

      {error && <p style={errorBox}>{error}</p>}

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading products…</p>
      ) : products.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>
          No products yet. Click “Add product” to create your first one.
        </p>
      ) : (
        <>
          {isMobile ? (
            /* Stacked card view — drag the ⠿ handle to reorder */
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                  {products.map((p) => (
                    <SortableCard
                      key={p.id}
                      product={p}
                      onEdit={() => openEdit(p)}
                      onDelete={() => handleDelete(p)}
                      onToggle={(f) => toggleField(p, f)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div style={{ background: "white", borderRadius: 16, overflow: "auto", marginTop: 16, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                <thead>
                  <tr style={{ background: "rgba(135,56,83,0.06)", textAlign: "left" }}>
                    <th style={th}></th>
                    <th style={th}>Image</th>
                    <th style={th}>Name</th>
                    <th style={th}>Category</th>
                    <th style={th}>Price</th>
                    <th style={th}>Badge</th>
                    <th style={th}>Visible</th>
                    <th style={th}>In Stock</th>
                    <th style={{ ...th, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {products.map((p) => (
                        <SortableRow
                          key={p.id}
                          product={p}
                          onEdit={() => openEdit(p)}
                          onDelete={() => handleDelete(p)}
                          onToggle={(f) => toggleField(p, f)}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </DndContext>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, color: BERRY }}>
              <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
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
          )}
        </>
      )}

      <CategoriesSection
        onChanged={() => {
          load();
          loadCategories();
        }}
      />

      {showForm && (
        <div style={{ ...overlay, ...(isMobile ? { padding: 0 } : {}) }} onClick={closeForm}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ ...modal, ...(isMobile ? { maxWidth: "100%", width: "100%", height: "100vh", maxHeight: "100vh", borderRadius: 0 } : {}) }}>
            <h2 style={{ color: WINE, marginTop: 0, fontSize: "1.3rem" }}>
              {form.id ? "Edit product" : "Add product"}
            </h2>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chocolate Fudge Cake" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Category</label>
              <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">— Select a category —</option>
                {catOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {/* keep an existing custom category selectable */}
                {form.category && !catOptions.includes(form.category) && (
                  <option value={form.category}>{form.category}</option>
                )}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description for customers" />
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Price (£)</label>
                <input style={inputStyle} type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Badge (optional)</label>
                <input style={inputStyle} value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} placeholder="e.g. Bestseller" />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Allergens (optional)</label>
              <input style={inputStyle} value={form.allergens} onChange={(e) => setForm({ ...form, allergens: e.target.value })} placeholder="e.g. Contains nuts, gluten, dairy" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Image</label>
              {form.image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={form.image_url} alt="preview" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 10, display: "block", marginBottom: 8 }} />
              )}
              <input type="file" accept="image/*" onChange={handleImage} disabled={uploading} />
              {uploading && <span style={{ color: BERRY, opacity: 0.7, marginLeft: 8 }}>Uploading…</span>}
            </div>

            <div style={{ display: "flex", gap: 24, marginBottom: 22 }}>
              <label style={checkRow}>
                <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
                Visible on menu
              </label>
              <label style={checkRow}>
                <input type="checkbox" checked={form.in_stock} onChange={(e) => setForm({ ...form, in_stock: e.target.checked })} />
                In stock
              </label>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={closeForm} style={{ ...secondaryBtn, ...(isMobile ? { minHeight: 44, flex: 1 } : {}) }}>Cancel</button>
              <button type="submit" disabled={saving || uploading} style={{ ...primaryBtn, opacity: saving || uploading ? 0.6 : 1, ...(isMobile ? { minHeight: 44, flex: 1 } : {}) }}>
                {saving ? "Saving…" : "Save product"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Sortable table row
// ------------------------------------------------------------
function SortableRow({
  product: p,
  onEdit,
  onDelete,
  onToggle,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (field: "visible" | "in_stock") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "rgba(135,56,83,0.06)" : "white",
    borderTop: "1px solid rgba(135,56,83,0.08)",
  };

  return (
    <tr ref={setNodeRef} style={style}>
      <td style={{ ...td, cursor: "grab", touchAction: "none", color: "rgba(135,56,83,0.5)", fontSize: "1.2rem" }} {...attributes} {...listeners}>
        ⠿
      </td>
      <td style={td}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 8, background: "rgba(135,56,83,0.08)" }} />
        )}
      </td>
      <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
      <td style={td}>{p.category || "—"}</td>
      <td style={td}>£{Number(p.price).toFixed(2)}</td>
      <td style={td}>{p.badge || "—"}</td>
      <td style={td}><Toggle on={p.visible} onClick={() => onToggle("visible")} /></td>
      <td style={td}><Toggle on={p.in_stock} onClick={() => onToggle("in_stock")} /></td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        <button onClick={onEdit} style={linkBtn}>Edit</button>
        <button onClick={onDelete} style={{ ...linkBtn, color: "#d9534f" }}>Delete</button>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------
// Sortable card — mobile equivalent of SortableRow (label:value pairs)
// ------------------------------------------------------------
function SortableCard({
  product: p,
  onEdit,
  onDelete,
  onToggle,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (field: "visible" | "in_stock") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "rgba(135,56,83,0.04)" : "white",
    borderRadius: 14,
    padding: "14px 16px",
    boxShadow: "0 8px 24px rgba(135,56,83,0.08)",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", touchAction: "none", color: "rgba(135,56,83,0.5)", fontSize: "1.4rem", lineHeight: 1 }}
        >
          ⠿
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
        ) : (
          <div style={{ width: 48, height: 48, borderRadius: 8, background: "rgba(135,56,83,0.08)" }} />
        )}
        <span style={{ fontWeight: 700, color: BERRY, flex: 1 }}>{p.name}</span>
      </div>

      <CardField label="Category" value={p.category || "—"} />
      <CardField label="Price" value={`£${Number(p.price).toFixed(2)}`} />
      <CardField label="Badge" value={p.badge || "—"} />

      <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: BERRY, fontWeight: 600, fontSize: "0.85rem" }}>
          <Toggle on={p.visible} onClick={() => onToggle("visible")} /> Visible
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: BERRY, fontWeight: 600, fontSize: "0.85rem" }}>
          <Toggle on={p.in_stock} onClick={() => onToggle("in_stock")} /> In stock
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={onEdit} style={{ ...secondaryBtn, minHeight: 44, flex: 1 }}>Edit</button>
        <button onClick={onDelete} style={{ ...secondaryBtn, minHeight: 44, flex: 1, borderColor: "#d9534f", color: "#d9534f" }}>Delete</button>
      </div>
    </div>
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
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: on ? WINE : "rgba(135,56,83,0.2)",
        position: "relative",
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "white",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

// ------------------------------------------------------------
// Categories sub-section — full management: add an empty category,
// rename one across all its products, and delete an unused one.
// Every change calls onChanged() so the product table + form dropdown
// (and, via /api/categories, the storefront menu tabs) stay in sync.
// ------------------------------------------------------------
type CategoryRow = { name: string; count: number };

function CategoriesSection({ onChanged }: { onChanged: () => void }) {
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGet<{ categories: CategoryRow[] }>(
        "/api/admin/products/categories",
        { force: true },
      );
      setCats(data.categories || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function start(name: string) {
    setEditing(name);
    setDraft(name);
    setError("");
  }

  async function save(oldName: string) {
    if (!draft.trim() || draft.trim() === oldName) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await adminSend("/api/admin/products/categories", "POST", { oldName, newName: draft.trim() });
      setEditing(null);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setError("");
    try {
      await adminSend("/api/admin/products/categories", "PUT", { name });
      setNewName("");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add category");
    } finally {
      setAdding(false);
    }
  }

  async function remove(c: CategoryRow) {
    if (c.count > 0) {
      setError(`Cannot delete "${c.name}" — ${c.count} product${c.count === 1 ? "" : "s"} still use it. Move or delete them first.`);
      return;
    }
    if (!window.confirm(`Delete the category "${c.name}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await adminSend("/api/admin/products/categories", "DELETE", { name: c.name });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 36 }}>
      <h2 style={{ color: WINE, fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Categories</h2>
      <p style={{ color: BERRY, opacity: 0.7, marginTop: 4, fontSize: "0.9rem" }}>
        Add a new category, rename one (updates every product using it), or delete an empty one.
      </p>
      {error && <p style={errorBox}>{error}</p>}

      {/* Add a new (empty) category */}
      <form onSubmit={add} style={{ display: "flex", gap: 10, marginTop: 14, maxWidth: 520, flexWrap: "wrap" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <button type="submit" disabled={adding || !newName.trim()} style={{ ...primaryBtn, opacity: adding || !newName.trim() ? 0.6 : 1 }}>
          {adding ? "Adding…" : "Add Category"}
        </button>
      </form>

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 12 }}>Loading categories…</p>
      ) : cats.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 12 }}>No categories yet. Add one above.</p>
      ) : (
        <div style={{ background: "white", borderRadius: 16, overflow: "hidden", marginTop: 12, boxShadow: "0 10px 30px rgba(135,56,83,0.08)", maxWidth: 520 }}>
          {cats.map((c, i) => (
            <div
              key={c.name}
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: "12px 16px",
                borderTop: i === 0 ? "none" : "1px solid rgba(135,56,83,0.08)",
              }}
            >
              {editing === c.name ? (
                <>
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={() => save(c.name)} disabled={busy} style={{ ...primaryBtn, padding: "8px 14px" }}>
                    {busy ? "…" : "Save"}
                  </button>
                  <button onClick={() => setEditing(null)} style={{ ...secondaryBtn, padding: "8px 14px" }}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontWeight: 600, color: BERRY }}>{c.name}</span>
                  <span style={{ color: BERRY, opacity: 0.6, fontSize: "0.85rem" }}>{c.count} product{c.count === 1 ? "" : "s"}</span>
                  <button onClick={() => start(c.name)} style={linkBtn}>Rename</button>
                  <button
                    onClick={() => remove(c)}
                    disabled={busy}
                    title={c.count > 0 ? "Only empty categories can be deleted" : "Delete category"}
                    style={{ ...linkBtn, color: c.count > 0 ? "rgba(135,56,83,0.35)" : "#d9534f", cursor: c.count > 0 ? "not-allowed" : "pointer" }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(135,56,83,0.25)", fontSize: "0.95rem", color: BERRY, outline: "none" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: BERRY, marginBottom: 6, fontSize: "0.9rem" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, color: BERRY, fontWeight: 600 };
const th: React.CSSProperties = { padding: "12px 14px", fontSize: "0.8rem", fontWeight: 700, color: BERRY, textTransform: "uppercase", letterSpacing: "0.03em" };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: "0.92rem", color: BERRY, verticalAlign: "middle" };
const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: WINE, color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${WINE}`, background: "transparent", color: WINE, fontWeight: 700, cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: WINE, fontWeight: 700, cursor: "pointer", marginLeft: 12, fontSize: "0.9rem" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(60,20,40,0.45)", display: "grid", placeItems: "center", padding: "1.5rem", zIndex: 50 };
const modal: React.CSSProperties = { width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "white", borderRadius: 18, padding: "1.75rem" };
