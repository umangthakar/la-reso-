"use client";

// ============================================================
// Le Rasa Bakery — Policy Management (list view)
// Title / Slug / Status / Display Order, with drag-to-reorder (persists
// display_order), an Enabled toggle, and edit + delete row actions.
// Create/edit lives on its own page (./[id]) rather than in a modal: a
// policy is a long Markdown document with a side-by-side preview, which
// needs far more room than the product modal has.
// All DB work via the password-gated /api/admin/policies routes.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { adminGet, adminSend } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";
import type { Policy } from "@/lib/policies";

const WINE = "#873853";
const BERRY = "#5C2A41";

export default function PoliciesAdminPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminGet<{ policies: Policy[] }>("/api/admin/policies", { force: true });
      setPolicies(data.policies || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(p: Policy) {
    const next = !p.enabled;
    // Optimistic: flip it now, roll back by reloading if the write fails.
    setPolicies((prev) => prev.map((x) => (x.id === p.id ? { ...x, enabled: next } : x)));
    setError("");
    try {
      await adminSend(`/api/admin/policies/${p.id}`, "PATCH", { enabled: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      await load();
    }
  }

  async function handleDelete(p: Policy) {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    setError("");
    try {
      await adminSend(`/api/admin/policies/${p.id}`, "DELETE");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = policies.findIndex((p) => p.id === active.id);
    const newIndex = policies.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(policies, oldIndex, newIndex);
    // Renumber locally so the Display Order column matches what was just
    // dropped — the same numbers we're about to persist. Without this the
    // column would keep showing the OLD orders until the next reload.
    const renumbered = reordered.map((p, i) => ({ ...p, display_order: i }));
    setPolicies(renumbered);
    setError("");
    try {
      await adminSend("/api/admin/policies/reorder", "POST", {
        order: renumbered.map((p) => ({ id: p.id, display_order: p.display_order })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save new order");
      await load();
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>Policies</h1>
        <button
          onClick={() => router.push("/admin/dashboard/policies/new")}
          style={{ ...primaryBtn, ...(isMobile ? { minHeight: 44, width: "100%" } : {}) }}
        >
          + New Policy
        </button>
      </div>
      <p style={{ color: BERRY, opacity: 0.7, marginTop: 4, fontSize: "0.9rem" }}>
        Drag the ⠿ handle to reorder how policies appear in the website footer. Disabled policies are
        hidden from customers completely.
      </p>

      {error && <p style={errorBox}>{error}</p>}

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading policies…</p>
      ) : policies.length === 0 ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>
          No policies yet. Click “New Policy” to create your first one.
        </p>
      ) : isMobile ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={policies.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              {policies.map((p) => (
                <SortableCard
                  key={p.id}
                  policy={p}
                  onEdit={() => router.push(`/admin/dashboard/policies/${p.id}`)}
                  onDelete={() => handleDelete(p)}
                  onToggle={() => toggleEnabled(p)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div style={{ background: "white", borderRadius: 16, overflow: "auto", marginTop: 16, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "rgba(135,56,83,0.06)", textAlign: "left" }}>
                <th style={th}></th>
                <th style={th}>Title</th>
                <th style={th}>Slug</th>
                <th style={th}>Status</th>
                <th style={th}>Order</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={policies.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {policies.map((p) => (
                    <SortableRow
                      key={p.id}
                      policy={p}
                      onEdit={() => router.push(`/admin/dashboard/policies/${p.id}`)}
                      onDelete={() => handleDelete(p)}
                      onToggle={() => toggleEnabled(p)}
                    />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Sortable table row
// ------------------------------------------------------------
function SortableRow({
  policy: p,
  onEdit,
  onDelete,
  onToggle,
}: {
  policy: Policy;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
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
      <td style={{ ...td, fontWeight: 600 }}>{p.title}</td>
      <td style={{ ...td, opacity: 0.75, fontFamily: "monospace", fontSize: "0.85rem" }}>/policies/{p.slug}</td>
      <td style={td}><StatusPill enabled={p.enabled} /></td>
      <td style={td}>{p.display_order}</td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        <Toggle on={p.enabled} onClick={onToggle} />
        <button onClick={onEdit} style={linkBtn}>Edit</button>
        <button onClick={onDelete} style={{ ...linkBtn, color: "#d9534f" }}>Delete</button>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------
// Sortable card — mobile equivalent of SortableRow
// ------------------------------------------------------------
function SortableCard({
  policy: p,
  onEdit,
  onDelete,
  onToggle,
}: {
  policy: Policy;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
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
        <span style={{ fontWeight: 700, color: BERRY, flex: 1 }}>{p.title}</span>
        <StatusPill enabled={p.enabled} />
      </div>

      <CardField label="Slug" value={`/policies/${p.slug}`} />
      <CardField label="Order" value={String(p.display_order)} />

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, color: BERRY, fontWeight: 600, fontSize: "0.85rem" }}>
        <Toggle on={p.enabled} onClick={onToggle} /> Enabled
      </label>

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
      <span style={{ color: BERRY, fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: "0.75rem",
        fontWeight: 700,
        background: enabled ? "rgba(135,56,83,0.10)" : "rgba(92,42,65,0.06)",
        color: enabled ? WINE : "rgba(92,42,65,0.55)",
      }}
    >
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? "Disable policy" : "Enable policy"}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: on ? WINE : "rgba(135,56,83,0.2)",
        position: "relative",
        transition: "background 0.15s",
        verticalAlign: "middle",
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

const th: React.CSSProperties = { padding: "12px 14px", fontSize: "0.8rem", fontWeight: 700, color: BERRY, textTransform: "uppercase", letterSpacing: "0.03em" };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: "0.92rem", color: BERRY, verticalAlign: "middle" };
const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: WINE, color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${WINE}`, background: "transparent", color: WINE, fontWeight: 700, cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: WINE, fontWeight: 700, cursor: "pointer", marginLeft: 12, fontSize: "0.9rem" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };
