"use client";

// ============================================================
// Le Rasa Bakery — Hero Slider · THE PRODUCT PICKER
// ------------------------------------------------------------
// Choosing which product a hero image advertises. Used twice on the Hero
// Slider page and built once here:
//
//   ProductPickerPanel   search box + result list, EMBEDDED in the upload
//                        dialog beside the file field.
//   ProductPickerDialog  the same panel in its own modal, opened from a row to
//                        re-link an image that already exists.
//
// One panel, two frames — so "how a product is searched for and shown" is
// decided in one place and cannot drift between the two entry points.
//
// SEARCH IS CLIENT-SIDE, over the whole catalogue fetched once
// (/api/admin/products/options). A bakery has tens of products, so filtering an
// array beats a request per keystroke: results appear as fast as the admin can
// type, with no debounce to tune and nothing to spin while they wait. The same
// call the Products page's own instant search makes.
//
// The design language is the existing admin panel's, unchanged: inline styles
// (no Tailwind in /admin), the WINE/BERRY constants, the same white card, 16px
// radius, shadow and buttons as the delete dialog on the page next door.
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminGet } from "@/lib/admin-api";
import { money } from "@/lib/pricing";

const WINE = "#873853";
const BERRY = "#5C2A41";

/** A product as the picker shows it — the shape /api/admin/products/options
 *  returns, and a strict subset of the products table. */
export type ProductOption = {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  image_url: string | null;
  visible: boolean;
};

/**
 * The catalogue, loaded once per dashboard session.
 *
 * adminGet's in-memory cache means the second and later openings of the picker
 * are instant and silent — the fetch below returns from memory without
 * touching the network. `force` is deliberately NOT passed: a product added in
 * another tab a minute ago is not worth a round trip on every dropdown open,
 * and any write through the panel clears that cache anyway.
 */
export function useProductOptions(): {
  products: ProductOption[];
  loading: boolean;
  error: string;
  reload: () => void;
} {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    adminGet<{ products: ProductOption[] }>("/api/admin/products/options", {
      force: nonce > 0,
    })
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load products");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // A component unmounted mid-flight (the dialog closed) must not set state.
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { products, loading, error, reload };
}

/**
 * The products matching what the admin has typed, best first.
 *
 * Matches on NAME and CATEGORY, because those are the two things an admin
 * thinks in ("chocolate", "cupcakes"), and on the short reference id so a
 * product can be found by the code the list shows next to it.
 *
 * Every term must match SOMETHING, so typing more words narrows rather than
 * widens — "choc truffle" finds Chocolate Truffle, and does not also return
 * every other chocolate. Ranked so a name that STARTS with the query comes
 * before one that merely contains it, which is what puts the obvious answer
 * at the top of a list of near-misses.
 */
export function filterProducts(products: ProductOption[], query: string): ProductOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  const terms = q.split(/\s+/);

  return products
    .map((product) => {
      const name = product.name.toLowerCase();
      const haystack = `${name} ${(product.category ?? "").toLowerCase()} ${shortRef(product.id)}`;
      if (!terms.every((term) => haystack.includes(term))) return null;
      // 0 best: an exact name, then a name that opens with the query, then a
      // name that contains it, then a match that was only on category or ref.
      const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3;
      return { product, rank };
    })
    .filter((hit): hit is { product: ProductOption; rank: number } => hit !== null)
    .sort((a, b) => a.rank - b.rank)
    .map((hit) => hit.product);
}

/**
 * The short reference shown beside a product's name.
 *
 * The products table has NO sku column — the catalogue has never had one — so
 * rather than invent a code that would be a second identity to keep in step,
 * this is the first block of the product's own id. It is what the database
 * actually calls the product, it is stable for the product's whole life, and it
 * is short enough to read off a screen and search for.
 */
export function shortRef(id: string): string {
  return (id ?? "").split("-")[0] ?? "";
}

/** The meta line under a product's name: what it is, what it costs, and the
 *  reference — skipping any part that isn't set rather than printing a gap. */
function metaLine(product: ProductOption): string {
  const parts = [product.category, product.price === null ? null : money(product.price)];
  parts.push(`#${shortRef(product.id)}`);
  return parts.filter(Boolean).join(" · ");
}

// ============================================================
// THE PANEL — search box + results
// ------------------------------------------------------------
// A listbox, not a native <select>: an option here is a thumbnail, a name and a
// meta line, and a <select> can hold none of that. Keyboard support is
// therefore explicit — ↑ / ↓ move the active option, Enter takes it, and the
// active one is scrolled into view — since nothing comes free once the native
// control is given up.
// ============================================================
export function ProductPickerPanel({
  products,
  loading,
  error,
  selectedId,
  onSelect,
  onReload,
  autoFocus = false,
  height = 260,
}: {
  products: ProductOption[];
  loading: boolean;
  error: string;
  /** The product currently chosen, or null. Highlighted in the list. */
  selectedId: string | null;
  onSelect: (product: ProductOption) => void;
  onReload: () => void;
  autoFocus?: boolean;
  /** Result-list height. The dialog gives it more room than the inline use. */
  height?: number;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterProducts(products, query), [products, query]);

  // Which option the keyboard is on. Reset on every new query, because the
  // list under it has changed and keeping index 3 would leave the highlight on
  // an unrelated product.
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [query]);

  const listRef = useRef<HTMLDivElement>(null);

  // Keep the active option in view when it moves by keyboard. Scrolling only
  // the option that is off-screen (`nearest`) rather than centring it, so the
  // list doesn't lurch on every arrow press.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active, results.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      // The panel can sit inside a form-ish dialog; Enter must choose the
      // highlighted product, never submit anything.
      e.preventDefault();
      const chosen = results[active];
      if (chosen) onSelect(chosen);
    }
  }

  return (
    <div>
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search products by name, category or ref…"
        aria-label="Search products"
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(135,56,83,0.25)",
          fontSize: "0.92rem",
          color: BERRY,
          outlineColor: WINE,
        }}
      />

      {error ? (
        <div style={{ background: "#fde8e8", color: "#b03030", padding: "10px 12px", borderRadius: 10, marginTop: 10, fontSize: "0.85rem" }}>
          {error}{" "}
          <button
            type="button"
            onClick={onReload}
            style={{ background: "none", border: "none", color: "#b03030", fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}
          >
            Try again
          </button>
        </div>
      ) : null}

      <div
        ref={listRef}
        role="listbox"
        aria-label="Products"
        style={{
          marginTop: 10,
          maxHeight: height,
          overflowY: "auto",
          border: "1px solid rgba(135,56,83,0.12)",
          borderRadius: 12,
        }}
      >
        {loading ? (
          <p style={{ margin: 0, padding: "18px 14px", color: BERRY, opacity: 0.7, fontSize: "0.9rem" }}>
            Loading products…
          </p>
        ) : results.length === 0 ? (
          <p style={{ margin: 0, padding: "18px 14px", color: BERRY, opacity: 0.7, fontSize: "0.9rem" }}>
            {products.length === 0
              ? "No products yet. Add one in Products first."
              : `No products match “${query}”.`}
          </p>
        ) : (
          results.map((product, index) => (
            <ProductOptionRow
              key={product.id}
              product={product}
              index={index}
              active={index === active}
              selected={product.id === selectedId}
              onHover={() => setActive(index)}
              onPick={() => onSelect(product)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProductOptionRow({
  product,
  index,
  active,
  selected,
  onHover,
  onPick,
}: {
  product: ProductOption;
  index: number;
  active: boolean;
  selected: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-index={index}
      onMouseEnter={onHover}
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        border: "none",
        borderBottom: "1px solid rgba(135,56,83,0.07)",
        background: selected ? "rgba(135,56,83,0.10)" : active ? "rgba(135,56,83,0.05)" : "white",
        cursor: "pointer",
      }}
    >
      <ProductThumb url={product.image_url} size={40} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: WINE, fontWeight: 700, fontSize: "0.92rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.name}
        </span>
        <span style={{ display: "block", color: BERRY, opacity: 0.65, fontSize: "0.78rem", marginTop: 2 }}>
          {metaLine(product)}
        </span>
      </span>
      {/* A hidden product can still be linked — it just won't resolve for a
          customer until it is shown again, and the admin should know that at
          the moment they choose it rather than after publishing. */}
      {product.visible ? null : (
        <span style={{ flexShrink: 0, fontSize: "0.7rem", fontWeight: 700, color: "rgba(92,42,65,0.55)", background: "rgba(92,42,65,0.08)", padding: "3px 8px", borderRadius: 999 }}>
          Hidden
        </span>
      )}
    </button>
  );
}

/** A product's catalogue photo at thumbnail size, or a neutral tile when it has
 *  none. A plain <img>, not next/image: an arbitrary uploaded URL in the admin
 *  panel, the same call every other preview in this panel makes. */
export function ProductThumb({ url, size = 36 }: { url: string | null; size?: number }) {
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 8,
        background: "rgba(135,56,83,0.06)",
        border: "1px solid rgba(135,56,83,0.10)",
        overflow: "hidden",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <span aria-hidden style={{ fontSize: size * 0.45, lineHeight: 1 }}>
          🎂
        </span>
      )}
    </span>
  );
}

// ============================================================
// THE DIALOG — the panel, framed, for re-linking an existing row
// ------------------------------------------------------------
// Escape cancels, the scrim cancels, and choosing an option commits
// immediately: there is no Save button because there is nothing else on this
// dialog to save, and a second click to confirm a click is a step that only
// slows the admin down.
// ============================================================
export function ProductPickerDialog({
  open,
  title,
  selectedId,
  isMobile,
  onPick,
  onUnlink,
  onCancel,
}: {
  open: boolean;
  title: string;
  selectedId: string | null;
  isMobile: boolean;
  onPick: (product: ProductOption) => void;
  /** Offered only when something is linked — see the button below. */
  onUnlink?: () => void;
  onCancel: () => void;
}) {
  const { products, loading, error, reload } = useProductOptions();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

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
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 16,
          padding: isMobile ? "1.25rem" : "1.5rem",
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 24px 60px rgba(60,20,40,0.35)",
        }}
      >
        <h2 style={{ margin: 0, color: WINE, fontSize: "1.15rem", fontWeight: 800 }}>{title}</h2>
        <p style={{ color: BERRY, opacity: 0.7, fontSize: "0.86rem", marginTop: 6, marginBottom: 14 }}>
          The hero&rsquo;s Order Now button opens the product linked to the cake on screen.
        </p>

        <ProductPickerPanel
          products={products}
          loading={loading}
          error={error}
          selectedId={selectedId}
          onSelect={onPick}
          onReload={reload}
          autoFocus
          height={300}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between", alignItems: "center" }}>
          {/* Unlinking is destructive-ish and rare, so it is a quiet link on
              the far side of the row rather than a button competing with
              Cancel — and it is absent entirely when nothing is linked. */}
          {selectedId && onUnlink ? (
            <button
              type="button"
              onClick={onUnlink}
              style={{ background: "none", border: "none", color: "#d9534f", fontWeight: 700, cursor: "pointer", fontSize: "0.88rem", padding: 0 }}
            >
              Remove link
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: `1px solid ${WINE}`,
              background: "transparent",
              color: WINE,
              fontWeight: 700,
              cursor: "pointer",
              ...(isMobile ? { minHeight: 44 } : {}),
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
