"use client";

// ============================================================
// Le Rasa Bakery — Hero Slider (list + upload + management)
// Preview / Image / Linked Product / Order / Visible, with drag-to-reorder, a
// visibility toggle and delete. Its own module, deliberately separate from
// Products: these rows are hero artwork, not catalogue items. They REFERENCE a
// product — every image says which cake it advertises, so the hero's Order Now
// can open it — but they copy nothing from one: the name, price and photo shown
// below are read through the link on every load (see product-picker.tsx).
// All DB work via the password-gated /api/admin/hero-slider routes.
// Schema: supabase/sql/36_hero_slider.sql + 37_hero_slider_product.sql.
//
// EVERY WRITE IS OPTIMISTIC, THEN RECONCILED.
// The UI changes on the click or the drop, the request goes out, and the
// server's response — which carries the whole resulting list — replaces local
// state. A failure rolls the change back to the snapshot taken before it and
// raises a toast. So the table is instant, but it never keeps a state the
// database rejected.
//
// The design language is the existing admin panel's, unchanged: inline styles
// (no Tailwind in /admin), the WINE/BERRY constants, the same white card,
// 16px radius, shadow, uppercase table head, pill, toggle and ⠿ handle as
// /admin/dashboard/policies — including its desktop-table / mobile-card split
// driven by useIsMobile, since inline styles can't carry media queries, and its
// dnd-kit sensor/strategy setup.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
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
import { adminUpload, adminGet, adminSend, AdminApiError } from "@/lib/admin-api";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  HERO_SLIDER_ERRORS,
  heroSliderFilename,
  isPngFilename,
  resequenceHeroSliderImages,
  validateHeroSliderBytes,
  type HeroSliderImage,
} from "@/lib/hero-slider";
import {
  ProductPickerDialog,
  ProductPickerPanel,
  ProductThumb,
  shortRef,
  useProductOptions,
  type ProductOption,
} from "./product-picker";

const WINE = "#873853";
const BERRY = "#5C2A41";

type Toast = { kind: "success" | "error"; message: string } | null;

/** What a row can be busy doing. One row does one thing at a time. */
type RowAction = "toggle" | "delete" | "link";

/** What every mutating route hands back: the full list, already in order. */
type ListResponse = { images: HeroSliderImage[] };

export default function HeroSliderAdminPage() {
  const isMobile = useIsMobile();
  const [images, setImages] = useState<HeroSliderImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Which row has a request in flight, and what kind. One row can only be busy
  // with one thing, and its controls are disabled while it is — that is what
  // stops a double-click sending two deletes, or a fast toggle racing itself.
  const [busy, setBusy] = useState<{ id: string; action: RowAction } | null>(null);
  // Reordering locks the whole table rather than one row: a drop moves every
  // position, so a second drop mid-save would be reordering a list the server
  // has not agreed to yet.
  const [reordering, setReordering] = useState(false);
  // The row awaiting delete confirmation.
  const [confirming, setConfirming] = useState<HeroSliderImage | null>(null);
  // The row whose product link is being changed, if any.
  const [linking, setLinking] = useState<HeroSliderImage | null>(null);
  // Whether the upload dialog is open. Uploading is no longer one click on a
  // hidden file input: an image needs a product as well as bytes, so the two
  // are chosen together in one dialog and sent in one request.
  const [uploadOpen, setUploadOpen] = useState(false);

  const sensors = useSensors(
    // 5px before a drag starts, so clicking the handle's row doesn't jitter
    // into a reorder — same activation constraint as the products and policies
    // tables.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // force: the admin must see the true current list, not the 60s
      // in-memory GET cache in lib/admin-api.
      const data = await adminGet<ListResponse>("/api/admin/hero-slider", { force: true });
      setImages(data.images || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hero slider images");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- Upload ------------------------------------------------
  // The dialog has already validated the file and made the admin choose a
  // product, so this is the request and nothing else.
  async function handleUpload(file: File, productId: string) {
    setUploading(true);
    setToast(null);
    try {
      // The panel's existing uploader (lib/admin-api), pointed at this
      // module's endpoint — not a second upload implementation. That endpoint
      // writes the file and inserts the row together, so what comes back is
      // the created row, ready to render, with its product already embedded.
      const { image } = await adminUpload<{ image: HeroSliderImage; url: string }>(
        file,
        "/api/admin/hero-slider/upload",
        { productId },
      );
      // Append the row the server actually created rather than refetching:
      // the table updates instantly with authoritative data, and the list
      // stays in display_order because the new row's order is max + 1.
      setImages((prev) => [...prev, image]);
      setToast({ kind: "success", message: "Image uploaded." });
      // Closed only on success: a failed upload leaves the dialog open with
      // the file and product still chosen, so retrying is one click.
      setUploadOpen(false);
    } catch (err) {
      setToast({ kind: "error", message: mutationErrorMessage(err, "Upload failed") });
    } finally {
      setUploading(false);
    }
  }

  // --- Product link ------------------------------------------
  // `product` is null when the admin removes the link. Optimistic like every
  // other write here: the cell changes on the click, and the server's list
  // replaces it — or the snapshot does, if it refused.
  async function handleLink(image: HeroSliderImage, product: ProductOption | null) {
    setLinking(null);
    if (busy || reordering) return;
    // Choosing the product that is already linked is a no-op, not a request.
    if ((image.product_id ?? null) === (product?.id ?? null)) return;

    const previous = images;
    setImages((prev) =>
      prev.map((img) =>
        img.id === image.id ? { ...img, product_id: product?.id ?? null, product } : img,
      ),
    );
    setBusy({ id: image.id, action: "link" });
    setToast(null);
    try {
      const data = await adminSend<ListResponse>(`/api/admin/hero-slider/${image.id}`, "PATCH", {
        product_id: product?.id ?? null,
      });
      if (data.images) setImages(data.images);
      setToast({
        kind: "success",
        message: product ? `Linked to ${product.name}.` : "Product link removed.",
      });
    } catch (err) {
      setImages(previous);
      setToast({ kind: "error", message: mutationErrorMessage(err, "Could not link the product") });
    } finally {
      setBusy(null);
    }
  }

  // --- Reorder -----------------------------------------------
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = images.findIndex((img) => img.id === active.id);
    const to = images.findIndex((img) => img.id === over.id);
    if (from === -1 || to === -1) return;

    // Snapshot for the rollback, before anything moves.
    const previous = images;
    // Renumber locally to 0..n-1 so the Order column shows what was just
    // dropped — the same numbers about to be persisted. Without this the column
    // would keep the OLD positions until the next reload.
    const next = resequenceHeroSliderImages(arrayMove(images, from, to));

    setImages(next);
    setReordering(true);
    setToast(null);
    try {
      const data = await adminSend<ListResponse>("/api/admin/hero-slider/reorder", "POST", {
        order: next.map((img) => ({ id: img.id, display_order: img.display_order })),
      });
      // Settle on the server's version rather than keeping the optimistic one.
      if (data.images) setImages(data.images);
    } catch (err) {
      setImages(previous);
      setToast({ kind: "error", message: mutationErrorMessage(err, "Could not save the new order") });
    } finally {
      setReordering(false);
    }
  }

  // --- Visibility --------------------------------------------
  async function handleToggle(image: HeroSliderImage) {
    if (busy || reordering) return; // one write at a time
    const previous = images;
    const nextVisible = !image.visible;

    setImages((prev) =>
      prev.map((img) => (img.id === image.id ? { ...img, visible: nextVisible } : img)),
    );
    setBusy({ id: image.id, action: "toggle" });
    setToast(null);
    try {
      const data = await adminSend<ListResponse>(
        `/api/admin/hero-slider/${image.id}`,
        "PATCH",
        { visible: nextVisible },
      );
      if (data.images) setImages(data.images);
    } catch (err) {
      setImages(previous);
      setToast({
        kind: "error",
        message: mutationErrorMessage(err, "Could not change the image's visibility"),
      });
    } finally {
      setBusy(null);
    }
  }

  // --- Delete ------------------------------------------------
  async function handleDelete(image: HeroSliderImage) {
    setConfirming(null);
    if (busy || reordering) return;

    const previous = images;
    // Optimistic removal, renumbered so the gap closes on screen the way the
    // server is about to close it in the database.
    setImages(resequenceHeroSliderImages(previous.filter((img) => img.id !== image.id)));
    setBusy({ id: image.id, action: "delete" });
    setToast(null);
    try {
      const data = await adminSend<ListResponse>(`/api/admin/hero-slider/${image.id}`, "DELETE");
      if (data.images) setImages(data.images);
      setToast({ kind: "success", message: "Image deleted." });
    } catch (err) {
      // Nothing was removed server-side (the route rolls its own storage
      // failure back), so the row goes straight back on screen.
      setImages(previous);
      setToast({ kind: "error", message: mutationErrorMessage(err, "Could not delete the image") });
    } finally {
      setBusy(null);
    }
  }

  const rowState = (image: HeroSliderImage) => ({
    // A row is locked while it is saving, while any OTHER row is saving, and
    // while the table is reordering — so there is never a second request for
    // the admin to fire by accident.
    locked: reordering || busy !== null,
    action: busy?.id === image.id ? busy.action : null,
  });

  const uploadButton = (extra?: React.CSSProperties) => (
    <button
      type="button"
      onClick={() => setUploadOpen(true)}
      disabled={uploading}
      style={{
        ...primaryBtn,
        ...(uploading ? disabledStyle : {}),
        ...(isMobile ? { minHeight: 44, width: "100%" } : {}),
        ...extra,
      }}
    >
      {uploading ? "Uploading…" : "+ Upload PNG"}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>
          Hero Slider Images
        </h1>
        {uploadButton()}
      </div>
      <p style={{ color: BERRY, opacity: 0.7, marginTop: 4, fontSize: "0.9rem" }}>
        Drag the ⠿ handle to reorder how images appear in the home page hero. Every image links to a
        product — the hero&rsquo;s Order Now button opens the linked product of the cake on screen.
        Hidden images never show on the website. PNG only, at least 400×400 pixels, up to 10 MB.
      </p>

      {error && <p style={errorBox}>{error}</p>}

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading hero slider images…</p>
      ) : images.length === 0 ? (
        <EmptyState isMobile={isMobile} uploadButton={uploadButton} />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={images.map((img) => img.id)} strategy={verticalListSortingStrategy}>
            {isMobile ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {images.map((img, i) => (
                  <ImageCard
                    key={img.id}
                    image={img}
                    position={i + 1}
                    {...rowState(img)}
                    onToggle={() => handleToggle(img)}
                    onDelete={() => setConfirming(img)}
                    onLink={() => setLinking(img)}
                  />
                ))}
              </div>
            ) : (
              <div style={{ background: "white", borderRadius: 16, overflow: "auto", marginTop: 16, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: "rgba(135,56,83,0.06)", textAlign: "left" }}>
                      <th style={th}></th>
                      <th style={th}>Preview</th>
                      <th style={th}>Image</th>
                      <th style={th}>Linked Product</th>
                      <th style={th}>Order</th>
                      <th style={th}>Visible</th>
                      <th style={{ ...th, textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {images.map((img) => (
                      <ImageRow
                        key={img.id}
                        image={img}
                        {...rowState(img)}
                        onToggle={() => handleToggle(img)}
                        onDelete={() => setConfirming(img)}
                        onLink={() => setLinking(img)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SortableContext>
        </DndContext>
      )}

      {reordering && (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 12, fontSize: "0.85rem" }}>Saving order…</p>
      )}

      <UploadDialog
        open={uploadOpen}
        isMobile={isMobile}
        uploading={uploading}
        onCancel={() => setUploadOpen(false)}
        onUpload={handleUpload}
      />

      <ProductPickerDialog
        open={linking !== null}
        title="Link a product"
        isMobile={isMobile}
        selectedId={linking?.product_id ?? null}
        onPick={(product) => linking && handleLink(linking, product)}
        onUnlink={() => linking && handleLink(linking, null)}
        onCancel={() => setLinking(null)}
      />

      <ConfirmDialog
        image={confirming}
        isMobile={isMobile}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && handleDelete(confirming)}
      />

      <ToastBar toast={toast} isMobile={isMobile} onDismiss={() => setToast(null)} />
    </div>
  );
}

/**
 * Turn a thrown request failure into something the admin can act on.
 *
 * The routes' own messages are already written for them (wrong format, too
 * small, rollback outcome, "the list has changed"), so those pass straight
 * through. The cases a route cannot describe are handled here: a request that
 * never arrived, and an expired session.
 */
function mutationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof AdminApiError) {
    if (err.status === 401) return "Your admin session has expired. Please log in again.";
    return err.message;
  }
  // fetch() rejects with a TypeError when the request never completed — no
  // connection, server down, or the tab went offline mid-request.
  if (err instanceof TypeError) return `${fallback} — check your connection and try again.`;
  return err instanceof Error ? err.message : `${fallback}. Please try again.`;
}

// ============================================================
// UPLOAD DIALOG — the PNG and the product it advertises, chosen together
// ------------------------------------------------------------
// Uploading used to be a single hidden file input: pick a file, it uploads.
// That cannot work now that an image also carries a product — a file input
// fires and is gone, leaving nowhere to make the second choice, and uploading
// first and asking after would create rows that are live on the hero with
// nothing behind their Order Now.
//
// So both are chosen in one dialog and sent in one request. The Upload button
// stays disabled until there IS both, which is what makes "every Hero Slider
// image is linked to a product" true by construction rather than by reminder.
//
// The file is validated the moment it is picked, not on submit: an admin who
// chose a JPEG finds out while the picker is still in their hand, and no bytes
// leave the browser. Same shared rules the server re-runs (lib/hero-slider.ts).
// ============================================================
function UploadDialog({
  open,
  isMobile,
  uploading,
  onCancel,
  onUpload,
}: {
  open: boolean;
  isMobile: boolean;
  uploading: boolean;
  onCancel: () => void;
  onUpload: (file: File, productId: string) => void;
}) {
  const { products, loading, error, reload } = useProductOptions();
  const [file, setFile] = useState<File | null>(null);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on open, so a cancelled attempt doesn't leave last time's file and
  // product sitting in the next one.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setProduct(null);
    setFileError("");
  }, [open]);

  // Escape closes — but never mid-upload, when there is a request in flight
  // that closing would orphan.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, uploading, onCancel]);

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const chosen = input.files?.[0];
    // Always clear the input, whatever happens below: without it, picking the
    // same file again fires no change event and nothing happens. Done first so
    // every early return is covered.
    input.value = "";
    if (!chosen) return;

    setFile(null);
    setFileError("");

    // The name/type pair is checked first because it is free and catches the
    // ordinary mistake (a .jpg from the photo library) with the exact wording
    // the admin needs. Then the bytes themselves are read, which is what
    // actually settles it — an extension proves nothing.
    if (!isPngFilename(chosen.name) || (chosen.type && chosen.type !== "image/png")) {
      setFileError(HERO_SLIDER_ERRORS.notPng);
      return;
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await chosen.arrayBuffer());
    } catch {
      // Picked but unreadable — moved, renamed or on a disconnected drive
      // since the picker closed.
      setFileError(HERO_SLIDER_ERRORS.unreadable);
      return;
    }

    // Size, PNG signature and the 400×400 minimum.
    const failure = validateHeroSliderBytes(bytes);
    if (failure) {
      setFileError(failure);
      return;
    }

    setFile(chosen);
  }

  if (!open) return null;

  const ready = file !== null && product !== null && !uploading;

  return (
    <div
      onClick={() => !uploading && onCancel()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(60,20,40,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hero-slider-upload-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 16,
          padding: isMobile ? "1.25rem" : "1.5rem",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 60px rgba(60,20,40,0.35)",
        }}
      >
        <h2
          id="hero-slider-upload-title"
          style={{ margin: 0, color: WINE, fontSize: "1.15rem", fontWeight: 800 }}
        >
          Add a Hero Slider image
        </h2>

        {/* ---- 1. The file ---- */}
        <p style={fieldLabel}>1 · Choose the PNG</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,.png"
          onChange={pickFile}
          disabled={uploading}
          style={{ display: "none" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ ...secondaryBtn, ...(uploading ? disabledStyle : {}), ...(isMobile ? { minHeight: 44 } : {}) }}
          >
            {file ? "Change file" : "Choose file"}
          </button>
          <span style={{ flex: 1, minWidth: 0, color: BERRY, fontSize: "0.85rem", opacity: file ? 0.8 : 0.5, wordBreak: "break-all" }}>
            {file ? file.name : "No file chosen"}
          </span>
        </div>
        {fileError ? (
          <p style={{ ...errorBox, marginTop: 10, fontSize: "0.85rem" }}>{fileError}</p>
        ) : null}

        {/* ---- 2. The product ---- */}
        <p style={fieldLabel}>2 · Link a product</p>
        {product ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "8px 10px", borderRadius: 10, background: "rgba(135,56,83,0.06)" }}>
            <ProductThumb url={product.image_url} size={36} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", color: WINE, fontWeight: 700, fontSize: "0.9rem" }}>
                {product.name}
              </span>
              <span style={{ display: "block", color: BERRY, opacity: 0.6, fontSize: "0.75rem" }}>
                #{shortRef(product.id)}
              </span>
            </span>
            <span aria-hidden style={{ color: WINE, fontWeight: 800 }}>
              ✓
            </span>
          </div>
        ) : null}
        <ProductPickerPanel
          products={products}
          loading={loading}
          error={error}
          selectedId={product?.id ?? null}
          onSelect={setProduct}
          onReload={reload}
          height={220}
        />

        {/* ---- 3. Send ---- */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column-reverse" : "row" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={uploading}
            style={{ ...secondaryBtn, ...(uploading ? disabledStyle : {}), ...(isMobile ? { minHeight: 44, width: "100%" } : {}) }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => file && product && onUpload(file, product.id)}
            disabled={!ready}
            style={{ ...primaryBtn, ...(ready ? {} : disabledStyle), ...(isMobile ? { minHeight: 44, width: "100%" } : {}) }}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The little uppercase caption above each step of the upload dialog. */
const fieldLabel: React.CSSProperties = {
  margin: "18px 0 8px",
  fontSize: "0.78rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: BERRY,
  opacity: 0.6,
};

// ------------------------------------------------------------
// Delete confirmation
// ------------------------------------------------------------
// An in-page modal rather than window.confirm (which the policies page uses):
// a native confirm can only offer OK/Cancel, and this needs a button that says
// Delete. Built from the panel's own tokens — same white card, radius, shadow
// and buttons — so it is the existing design language, not a new one.
//
// Escape cancels, the scrim cancels, and focus moves to the dialog on open so
// keyboard users are not left behind the overlay.
function ConfirmDialog({
  image,
  isMobile,
  onCancel,
  onConfirm,
}: {
  image: HeroSliderImage | null;
  isMobile: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!image) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [image, onCancel]);

  if (!image) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(60,20,40,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hero-slider-delete-title"
        // The card must not inherit the scrim's dismiss-on-click.
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 16,
          padding: isMobile ? "1.25rem" : "1.75rem",
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 24px 60px rgba(60,20,40,0.35)",
        }}
      >
        <h2
          id="hero-slider-delete-title"
          style={{ margin: 0, color: WINE, fontSize: "1.15rem", fontWeight: 800 }}
        >
          Delete Hero Slider image?
        </h2>
        <p style={{ color: BERRY, opacity: 0.75, fontSize: "0.92rem", marginTop: 8, marginBottom: 0 }}>
          This action cannot be undone.
        </p>
        <p style={{ color: BERRY, opacity: 0.6, fontSize: "0.82rem", fontFamily: "monospace", marginTop: 10, marginBottom: 0, wordBreak: "break-all" }}>
          {heroSliderFilename(image.image_url)}
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column-reverse" : "row" }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{ ...secondaryBtn, ...(isMobile ? { minHeight: 44, width: "100%" } : {}) }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              ...primaryBtn,
              background: "#d9534f",
              ...(isMobile ? { minHeight: 44, width: "100%" } : {}),
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Toast — feedback for every write.
// ------------------------------------------------------------
// Local to this page and built from the panel's own tokens, not a new
// dependency or a global provider: this is the only screen with actions whose
// result needs announcing away from the thing that started them.
//
// Pinned bottom-centre on mobile and bottom-right on desktop, above the
// sidebar's z-index. role="status" + aria-live so it is announced rather than
// only seen, and dismissible because an error the admin is reading must not
// vanish on a timer.
function ToastBar({
  toast,
  isMobile,
  onDismiss,
}: {
  toast: Toast;
  isMobile: boolean;
  onDismiss: () => void;
}) {
  // A success needs no action, so it clears itself; an error stays until
  // dismissed. Keyed on the message so consecutive toasts each get their own
  // timer instead of inheriting the first one's.
  useEffect(() => {
    if (!toast || toast.kind !== "success") return;
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isError = toast.kind === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        zIndex: 60,
        bottom: isMobile ? 16 : 24,
        left: isMobile ? 16 : "auto",
        right: isMobile ? 16 : 24,
        maxWidth: isMobile ? "none" : 420,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        background: isError ? "#fde8e8" : "white",
        color: isError ? "#b03030" : BERRY,
        border: `1px solid ${isError ? "rgba(176,48,48,0.25)" : "rgba(135,56,83,0.15)"}`,
        boxShadow: "0 12px 34px rgba(135,56,83,0.18)",
        fontSize: "0.9rem",
        fontWeight: 600,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1.3 }}>
        {isError ? "⚠" : "✓"}
      </span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          border: "none",
          background: "transparent",
          color: "inherit",
          opacity: 0.6,
          cursor: "pointer",
          fontSize: "1.1rem",
          lineHeight: 1,
          padding: 0,
          // 44px hit area on touch, per the rest of the panel's mobile rules.
          minWidth: isMobile ? 44 : 20,
          minHeight: isMobile ? 44 : 20,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ------------------------------------------------------------
// Empty state — the first thing the admin sees, so it carries the
// instruction rather than just reporting the absence.
// ------------------------------------------------------------
function EmptyState({
  isMobile,
  uploadButton,
}: {
  isMobile: boolean;
  uploadButton: (extra?: React.CSSProperties) => React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 16,
        marginTop: 16,
        padding: isMobile ? "2.5rem 1.25rem" : "3.5rem 2rem",
        textAlign: "center",
        boxShadow: "0 10px 30px rgba(135,56,83,0.08)",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 76,
          height: 76,
          margin: "0 auto 18px",
          borderRadius: 20,
          background: "rgba(135,56,83,0.07)",
          display: "grid",
          placeItems: "center",
          fontSize: "2rem",
          lineHeight: 1,
        }}
      >
        🎂
      </div>
      <p style={{ margin: 0, color: WINE, fontWeight: 800, fontSize: "1.1rem" }}>
        No Hero Slider images available.
      </p>
      <p style={{ margin: "8px auto 0", color: BERRY, opacity: 0.7, fontSize: "0.92rem", maxWidth: 420 }}>
        Upload your first PNG image.
      </p>
      <div style={{ marginTop: 22 }}>{uploadButton()}</div>
    </div>
  );
}

// ------------------------------------------------------------
// Sortable table row (desktop)
// ------------------------------------------------------------
type RowProps = {
  image: HeroSliderImage;
  locked: boolean;
  action: RowAction | null;
  onToggle: () => void;
  onDelete: () => void;
  onLink: () => void;
};

function ImageRow({ image, locked, action, onToggle, onDelete, onLink }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled: locked,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "rgba(135,56,83,0.06)" : "white",
    borderTop: "1px solid rgba(135,56,83,0.08)",
    // The row being deleted fades while its request is in flight.
    opacity: action === "delete" ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style}>
      <td
        style={{
          ...td,
          cursor: locked ? "not-allowed" : "grab",
          touchAction: "none",
          color: "rgba(135,56,83,0.5)",
          fontSize: "1.2rem",
        }}
        {...attributes}
        {...listeners}
      >
        ⠿
      </td>
      <td style={td}>
        <Preview image={image} />
      </td>
      <td style={{ ...td, opacity: 0.75, fontFamily: "monospace", fontSize: "0.85rem", wordBreak: "break-all" }}>
        {heroSliderFilename(image.image_url)}
      </td>
      <td style={{ ...td, minWidth: 200 }}>
        <LinkedProduct
          image={image}
          locked={locked}
          busy={action === "link"}
          onLink={onLink}
        />
      </td>
      <td style={td}>{image.display_order}</td>
      <td style={td}>
        <StatusPill visible={image.visible} />
      </td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        <Toggle on={image.visible} onClick={onToggle} disabled={locked} busy={action === "toggle"} />
        <button
          type="button"
          onClick={onDelete}
          disabled={locked}
          style={{ ...linkBtn, ...(locked ? disabledStyle : {}), color: "#d9534f" }}
        >
          {action === "delete" ? "Deleting…" : "Delete"}
        </button>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------
// Sortable card (mobile) — same fields as the row, stacked. A 760px-wide table
// can't be read on a phone, so the admin panel's convention is a card list.
// ------------------------------------------------------------
function ImageCard({
  image,
  position,
  locked,
  action,
  onToggle,
  onDelete,
  onLink,
}: RowProps & { position: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    disabled: locked,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "rgba(135,56,83,0.04)" : "white",
    borderRadius: 14,
    padding: "14px 16px",
    boxShadow: "0 8px 24px rgba(135,56,83,0.08)",
    opacity: action === "delete" ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          {...attributes}
          {...listeners}
          style={{
            cursor: locked ? "not-allowed" : "grab",
            touchAction: "none",
            color: "rgba(135,56,83,0.5)",
            fontSize: "1.4rem",
            lineHeight: 1,
          }}
        >
          ⠿
        </span>
        <Preview image={image} />
        <span style={{ marginLeft: "auto" }}>
          <StatusPill visible={image.visible} />
        </span>
      </div>

      <CardField label="Image" value={heroSliderFilename(image.image_url)} />
      <CardField label="Order" value={String(image.display_order)} />
      <CardField label="Position" value={`#${position}`} />

      <div style={{ marginTop: 12 }}>
        <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.6, marginBottom: 6 }}>
          Linked Product
        </span>
        <LinkedProduct image={image} locked={locked} busy={action === "link"} onLink={onLink} />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, color: BERRY, fontWeight: 600, fontSize: "0.85rem" }}>
        <Toggle on={image.visible} onClick={onToggle} disabled={locked} busy={action === "toggle"} />
        {image.visible ? "Visible" : "Hidden"}
      </label>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          onClick={onDelete}
          disabled={locked}
          style={{
            ...secondaryBtn,
            ...(locked ? disabledStyle : {}),
            minHeight: 44,
            flex: 1,
            borderColor: "#d9534f",
            color: "#d9534f",
          }}
        >
          {action === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function CardField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.6 }}>
        {label}
      </span>
      <span style={{ color: BERRY, fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}

// ------------------------------------------------------------
// Row internals
// ------------------------------------------------------------

/** Hero images are PNGs with transparent backgrounds, so the thumbnail sits on
 *  a tinted tile — on white they would read as floating fragments. A plain
 *  <img>, not next/image: this is an admin thumbnail of an arbitrary uploaded
 *  URL, the same call every other admin preview in this panel makes. */
function Preview({ image }: { image: HeroSliderImage }) {
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 72,
        height: 48,
        borderRadius: 10,
        background: "rgba(135,56,83,0.06)",
        border: "1px solid rgba(135,56,83,0.10)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {image.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.image_url}
          alt=""
          // Dragging a photo starts a native image drag in every browser, which
          // kills the sortable gesture halfway.
          draggable={false}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
        />
      ) : (
        <span style={{ color: BERRY, opacity: 0.45, fontSize: "0.7rem" }}>—</span>
      )}
    </span>
  );
}

/**
 * The Linked Product cell: which cake this image advertises, and the way in to
 * change it.
 *
 * THREE STATES, and the difference between the last two matters:
 *
 *   linked          thumbnail, name and reference. Clicking re-links.
 *   NOT LINKED      flagged in the panel's warning colour, because the hero's
 *                   Order Now falls back to the whole menu for this image —
 *                   the composition still works, so nothing else on the page
 *                   would ever tell the admin about it.
 *   linked, hidden  the product exists but is off the storefront, so the link
 *                   resolves to a page customers can't reach. Shown as linked,
 *                   with the Hidden pill the picker uses.
 *
 * The whole cell is the button. A separate "Change" link beside a static label
 * would be a smaller target for the same action, and there is no other reason
 * to click here.
 */
function LinkedProduct({
  image,
  locked,
  busy,
  onLink,
}: {
  image: HeroSliderImage;
  locked: boolean;
  busy: boolean;
  onLink: () => void;
}) {
  const product = image.product;
  return (
    <button
      type="button"
      onClick={onLink}
      disabled={locked}
      aria-label={product ? `Change linked product (${product.name})` : "Link a product"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "6px 8px",
        marginLeft: -8,
        borderRadius: 10,
        border: "1px solid transparent",
        background: "transparent",
        cursor: locked ? "not-allowed" : "pointer",
        opacity: locked ? 0.6 : 1,
      }}
    >
      {product ? (
        <>
          <ProductThumb url={product.image_url} size={36} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", color: WINE, fontWeight: 700, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {product.name}
            </span>
            <span style={{ display: "block", color: BERRY, opacity: 0.6, fontSize: "0.75rem", marginTop: 2 }}>
              {busy ? "Saving…" : `#${shortRef(product.id)}`}
            </span>
          </span>
          {product.visible ? null : (
            <span style={{ flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, color: "rgba(92,42,65,0.55)", background: "rgba(92,42,65,0.08)", padding: "3px 8px", borderRadius: 999 }}>
              Hidden
            </span>
          )}
        </>
      ) : (
        <>
          <span
            aria-hidden
            style={{ display: "grid", placeItems: "center", width: 36, height: 36, flexShrink: 0, borderRadius: 8, border: "1px dashed rgba(176,48,48,0.35)", color: "#b03030", fontSize: "1rem", lineHeight: 1 }}
          >
            +
          </span>
          <span style={{ color: "#b03030", fontWeight: 700, fontSize: "0.85rem" }}>
            {busy ? "Saving…" : "No product linked"}
          </span>
        </>
      )}
    </button>
  );
}

function StatusPill({ visible }: { visible: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: "0.75rem",
        fontWeight: 700,
        background: visible ? "rgba(135,56,83,0.10)" : "rgba(92,42,65,0.06)",
        color: visible ? WINE : "rgba(92,42,65,0.55)",
      }}
    >
      {visible ? "Visible" : "Hidden"}
    </span>
  );
}

/** The panel's standard toggle. Dims while its own request is in flight, so the
 *  admin can see the change is still being saved. */
function Toggle({
  on,
  onClick,
  disabled,
  busy,
}: {
  on: boolean;
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role="switch"
      aria-checked={on}
      aria-busy={busy}
      aria-label={on ? "Hide image" : "Show image"}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: on ? WINE : "rgba(135,56,83,0.2)",
        position: "relative",
        transition: "background 0.15s",
        verticalAlign: "middle",
        opacity: disabled ? 0.5 : 1,
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
// Styles — identical to /admin/dashboard/policies, so the two modules read as
// one panel. Nothing here is new design; it is the panel's existing language.
// ------------------------------------------------------------
const th: React.CSSProperties = { padding: "12px 14px", fontSize: "0.8rem", fontWeight: 700, color: BERRY, textTransform: "uppercase", letterSpacing: "0.03em" };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: "0.92rem", color: BERRY, verticalAlign: "middle" };
const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: WINE, color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${WINE}`, background: "transparent", color: WINE, fontWeight: 700, cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: WINE, fontWeight: 700, cursor: "pointer", marginLeft: 12, fontSize: "0.9rem" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };

/** Applied on top of a button style while a control is locked. */
const disabledStyle: React.CSSProperties = { opacity: 0.45, cursor: "not-allowed" };
