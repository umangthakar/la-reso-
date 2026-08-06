"use client";

// ============================================================
// Le Rasa Bakery — Product Management
// Table with image, name, category, price, badge, Visible toggle,
// In Stock toggle, edit/delete. Drag rows to reorder (persists
// sort_order). Add/Edit modal incl. allergens. Categories sub-section
// renames a category across all its products. All DB work via the
// password-gated /api/admin/products routes.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORT_OPTIONS,
  type ProductSortKey,
} from "@/lib/product-sort";
import { displayPriceOf, type SizeLike } from "@/lib/product-pricing";
import RichIngredientsEditor from "@/components/admin/rich-ingredients-editor";
import { INGREDIENT_ICONS } from "@/lib/ingredient-icons";
import {
  NUTRITION_ROWS,
  emptyNutrition,
  normalizeNutrition,
  normalizeSizeNutrition,
  normalizeCustomNutrition,
  newCustomRowId,
  type NutritionData,
  type NutritionKey,
  type NutritionCustomRow,
} from "@/lib/nutrition";

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

/**
 * The nearest thing this catalogue has to a SKU.
 *
 * The products table has NO sku column — it never has — so a product's
 * reference is the first block of its own id: what the database actually calls
 * it, stable for the product's whole life, and short enough to read off a
 * screen and type into the search box. Same definition the hero slider's
 * product picker shows beside a name (see its `shortRef`); duplicated as a line
 * rather than imported so this page doesn't pull that whole module into its
 * bundle for one string operation.
 */
function shortRef(id: string): string {
  return (id ?? "").split("-")[0] ?? "";
}

type Product = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  /** The base price column — what the edit form's Price field holds. A product
   *  with size variants does NOT charge this; see productPrice() below. */
  price: number;
  badge: string | null;
  image_url: string | null;
  in_stock: boolean;
  visible: boolean;
  allergens: string | null;
  sort_order: number;
  /** Size variants, embedded by /api/admin/products. */
  product_sizes?: SizeLike[] | null;
};

/**
 * The price the STOREFRONT shows for a product: its default variant's when it
 * has sizes, its base price when it doesn't. Same helper the cards and the
 * product page use, so this table can't quote a price no customer ever sees.
 */
function productPrice(p: Product): number {
  return displayPriceOf(p.price, p.product_sizes);
}

// Gallery image + size variant shapes used by the form (client-side only).
type ImageItem = { url: string; is_primary: boolean };
// Each size variant owns its nutrition table (all cells present; blank =
// unset). Blank throughout means "inherit the product-level nutrition".
type SizeItem = {
  id?: string;
  label: string;
  serves: string;
  price: string;
  nutrition: NutritionData;
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
  // New: ingredients list, multiple gallery images, and size variants.
  ingredients: string[];
  // Rich-text ingredients description (sanitized HTML, bold support) and the
  // selected ingredient-icon keys (see lib/ingredient-icons).
  ingredientsRich: string;
  ingredientIcons: string[];
  images: ImageItem[];
  sizes: SizeItem[];
  // Optional per-product nutrition table (all cells present; blank = unset).
  nutrition: NutritionData;
  // Admin-defined extra rows (Vitamin C, Calcium, …), in insertion order.
  nutritionCustom: NutritionCustomRow[];
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
  ingredients: [],
  ingredientsRich: "",
  ingredientIcons: [],
  images: [],
  sizes: [],
  nutrition: emptyNutrition(),
  nutritionCustom: [],
};

export default function ProductsAdminPage() {
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  // "" = All Categories. Applied in the DB (see load()), not in the browser, so
  // it narrows the whole catalogue rather than only the loaded page.
  const [categoryFilter, setCategoryFilter] = useState("");
  // How the table is ordered — see lib/product-sort. A→Z by default so the
  // list is never arbitrary. "Manual order" is the sort_order arrangement the
  // homepage picks its featured products from, and the only sort in which
  // dragging a row means anything, so it is the only one that allows it.
  const [sortKey, setSortKey] = useState<ProductSortKey>(DEFAULT_PRODUCT_SORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [ingredientInput, setIngredientInput] = useState("");
  // Which size variant has its nutrition panel expanded (index into
  // form.sizes, or null). Display only — never part of the saved payload.
  const [openSizeNutrition, setOpenSizeNutrition] = useState<number | null>(null);
  // Categories in tree order, each carrying its nesting depth so the form
  // dropdown can indent subcategories. Names are unchanged — depth is display
  // only, and the value stored on a product is still the plain category name.
  const [categoryTree, setCategoryTree] = useState<{ name: string; depth: number }[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Options for the product form's Category dropdown: the live managed list,
  // falling back to the defaults until it loads / while none exist.
  const categoryNames = useMemo(() => categoryTree.map((c) => c.name), [categoryTree]);
  const catOptions = categoryNames.length > 0 ? categoryNames : DEFAULT_CATEGORIES;
  // The same options with their depth, so subcategories render indented under
  // their parent. Falls back to flat defaults exactly as catOptions does.
  const catOptionRows =
    categoryTree.length > 0
      ? categoryTree
      : DEFAULT_CATEGORIES.map((name) => ({ name, depth: 0 }));

  // Options for the FILTER dropdown above the table. Built from what actually
  // exists — the managed category list, plus any category found on a loaded
  // product that isn't in it yet — so a category the admin creates shows up on
  // its own and nothing in the table is unreachable by the filter. Never the
  // hardcoded DEFAULT_CATEGORIES: those are form placeholders, not real data.
  // A-Z, matching the product order. No extra fetch — both sources are loaded.
  const filterCatOptions = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (name: string | null) => {
      const clean = (name ?? "").trim();
      if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean);
    };
    categoryNames.forEach(add);
    products.forEach((p) => add(p.category));
    // Keep the active filter selectable even if its last product just moved
    // out of it, so the dropdown never shows a blank selection.
    add(categoryFilter);
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [categoryNames, products, categoryFilter]);

  // ---- Instant client-side product search (no DB call, no reload) ----------
  // Filters the products ALREADY loaded for the current page as the admin
  // types. Case-insensitive; matches name, the product's short reference (the
  // nearest thing this catalogue has to a SKU — the products table has no sku
  // column, so the same first-block-of-the-id the hero picker shows is used
  // here), and the category and badge the box has always searched.
  //
  // Memoised so it only recomputes when the list or the term changes, and it
  // preserves the order it is given — the database has already sorted, so
  // filtering an array cannot disturb it. Runs ON TOP of the category filter,
  // since the loaded page is already narrowed to it.
  const searching = searchTerm.trim().length > 0;
  // Either control being active means the table is showing a subset.
  const filtering = searching || categoryFilter !== "";
  // Dragging persists sort_order from the row positions on screen, so it is
  // only honest when those positions ARE sort_order and the page holds the
  // whole slice — never over a sorted list or a filtered subset.
  const canReorder = sortKey === "manual" && !filtering;
  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, shortRef(p.id), p.category, p.badge].some((field) =>
        (field ?? "").toLowerCase().includes(q),
      ),
    );
  }, [products, searchTerm]);

  // Switching category restarts at page 1 — page 3 of "all products" is rarely
  // a page that exists once the list is narrowed to one category.
  function changeCategory(next: string) {
    setCategoryFilter(next);
    setPage(1);
  }

  // Same reasoning for the sort: row 40 of one ordering is not row 40 of
  // another, so the page number means nothing across the switch.
  function changeSort(next: ProductSortKey) {
    setSortKey(next);
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // ONE request per page/category/sort combination — adminGet caches by
      // URL, so returning to a combination already viewed is served from
      // memory without touching the network.
      const data = await adminGet<{ products: Product[]; total: number }>(
        `/api/admin/products?page=${page}&pageSize=${PAGE_SIZE}&sort=${sortKey}` +
          (categoryFilter ? `&category=${encodeURIComponent(categoryFilter)}` : ""),
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
  }, [page, categoryFilter, sortKey]);

  // Live category names for the product form dropdown. Kept in sync with the
  // Categories panel below via the onChanged callback.
  const loadCategories = useCallback(async () => {
    try {
      const data = await adminGet<{
        categories: { name: string; count: number; depth?: number }[];
      }>("/api/admin/products/categories", { force: true });
      setCategoryTree(
        (data.categories || []).map((c) => ({ name: c.name, depth: c.depth ?? 0 })),
      );
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
    setIngredientInput("");
    setOpenSizeNutrition(null);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    // Seed the gallery with the product's single image so old products keep
    // showing (and preserving) it; the details fetch below replaces this with
    // the full gallery / sizes / ingredients once it arrives.
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
      ingredients: [],
      ingredientsRich: "",
      ingredientIcons: [],
      images: p.image_url ? [{ url: p.image_url, is_primary: true }] : [],
      sizes: [],
      nutrition: emptyNutrition(),
      nutritionCustom: [],
    });
    setIngredientInput("");
    setOpenSizeNutrition(null);
    setShowForm(true);

    // Pull ingredients / gallery / sizes for this product. Degrades to the
    // seeded single image if the extras tables aren't migrated.
    setLoadingDetails(true);
    (async () => {
      try {
        const d = await adminGet<{
          ingredients: string[];
          ingredientsRich?: string;
          ingredientIcons?: string[];
          nutrition: NutritionData | null;
          nutritionCustom: NutritionCustomRow[];
          images: { url: string; is_primary: boolean }[];
          sizes: {
            id: string;
            label: string;
            serves: number | null;
            price: number;
            nutrition?: NutritionData | null;
          }[];
        }>(`/api/admin/products/${p.id}/details`, { force: true });
        setForm((f) => {
          if (f.id !== p.id) return f; // a different product was opened meanwhile
          const images: ImageItem[] =
            d.images && d.images.length > 0
              ? d.images.map((im) => ({ url: im.url, is_primary: !!im.is_primary }))
              : f.images;
          return {
            ...f,
            ingredients: Array.isArray(d.ingredients) ? d.ingredients : [],
            ingredientsRich: typeof d.ingredientsRich === "string" ? d.ingredientsRich : "",
            ingredientIcons: Array.isArray(d.ingredientIcons) ? d.ingredientIcons : [],
            // Fill blanks for any missing keys so every cell renders.
            nutrition: normalizeNutrition(d.nutrition) ?? emptyNutrition(),
            nutritionCustom: normalizeCustomNutrition(d.nutritionCustom),
            images,
            sizes: (d.sizes || []).map((s) => ({
              id: s.id,
              label: s.label,
              serves: s.serves === null || s.serves === undefined ? "" : String(s.serves),
              price: String(s.price ?? ""),
              // Fill blanks for any missing keys so every cell renders. A size
              // with none stays blank and keeps inheriting the product table.
              nutrition: normalizeSizeNutrition(s.nutrition) ?? emptyNutrition(),
            })),
          };
        });
      } catch {
        /* leave the seeded single image + empty lists in place */
      } finally {
        setLoadingDetails(false);
      }
    })();
  }

  function closeForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setIngredientInput("");
    setOpenSizeNutrition(null);
  }

  // ---- Ingredient tag helpers ----
  function addIngredient() {
    const v = ingredientInput.trim();
    if (!v) return;
    setForm((f) =>
      f.ingredients.some((x) => x.toLowerCase() === v.toLowerCase())
        ? f
        : { ...f, ingredients: [...f.ingredients, v] },
    );
    setIngredientInput("");
  }
  function removeIngredient(i: number) {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((_, n) => n !== i) }));
  }

  // Toggle a single ingredient-icon key on/off for this product.
  function toggleIngredientIcon(key: string) {
    setForm((f) =>
      f.ingredientIcons.includes(key)
        ? { ...f, ingredientIcons: f.ingredientIcons.filter((k) => k !== key) }
        : { ...f, ingredientIcons: [...f.ingredientIcons, key] },
    );
  }

  // ---- Nutrition helpers ----
  function updateNutrition(key: NutritionKey, field: "per_100g" | "per_portion", value: string) {
    setForm((f) => ({
      ...f,
      nutrition: { ...f.nutrition, [key]: { ...f.nutrition[key], [field]: value } },
    }));
  }

  // ---- Custom nutrition row helpers ----
  function addCustomRow() {
    setForm((f) => ({
      ...f,
      nutritionCustom: [
        ...f.nutritionCustom,
        { id: newCustomRowId(), label: "", per_100g: "", per_portion: "" },
      ],
    }));
  }
  function updateCustomRow(id: string, patch: Partial<Omit<NutritionCustomRow, "id">>) {
    setForm((f) => ({
      ...f,
      nutritionCustom: f.nutritionCustom.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }
  function removeCustomRow(id: string) {
    setForm((f) => ({ ...f, nutritionCustom: f.nutritionCustom.filter((r) => r.id !== id) }));
  }
  function moveCustomRow(i: number, dir: -1 | 1) {
    setForm((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.nutritionCustom.length) return f;
      const rows = [...f.nutritionCustom];
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...f, nutritionCustom: rows };
    });
  }

  // ---- Gallery image helpers ----
  function removeImage(i: number) {
    setForm((f) => {
      const images = f.images.filter((_, n) => n !== i);
      // Keep exactly one primary: if we removed it, promote the first.
      if (images.length > 0 && !images.some((im) => im.is_primary)) {
        images[0] = { ...images[0], is_primary: true };
      }
      return { ...f, images, image_url: images.find((im) => im.is_primary)?.url ?? images[0]?.url ?? "" };
    });
  }
  function setPrimaryImage(i: number) {
    setForm((f) => {
      const images = f.images.map((im, n) => ({ ...im, is_primary: n === i }));
      return { ...f, images, image_url: images[i]?.url ?? f.image_url };
    });
  }
  function moveImage(i: number, dir: -1 | 1) {
    setForm((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.images.length) return f;
      const images = [...f.images];
      [images[i], images[j]] = [images[j], images[i]];
      return { ...f, images };
    });
  }

  // ---- Size variant helpers ----
  function addSize() {
    setForm((f) => ({
      ...f,
      sizes: [...f.sizes, { label: "", serves: "", price: "", nutrition: emptyNutrition() }],
    }));
  }
  function updateSize(i: number, patch: Partial<SizeItem>) {
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s, n) => (n === i ? { ...s, ...patch } : s)),
    }));
  }
  /** Edit ONE cell of ONE size's nutrition table. Every other size is returned
   *  by identity, so saving 6" can never overwrite 8" / 10" / 12". */
  function updateSizeNutrition(
    i: number,
    key: NutritionKey,
    field: "per_100g" | "per_portion",
    value: string,
  ) {
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s, n) =>
        n === i
          ? { ...s, nutrition: { ...s.nutrition, [key]: { ...s.nutrition[key], [field]: value } } }
          : s,
      ),
    }));
  }
  function removeSize(i: number) {
    setForm((f) => ({ ...f, sizes: f.sizes.filter((_, n) => n !== i) }));
    // The open panel is tracked by index — collapse rather than leave it
    // pointing at whichever size shifted up into this slot.
    setOpenSizeNutrition((open) => (open === null || open === i ? null : open > i ? open - 1 : open));
  }
  function moveSize(i: number, dir: -1 | 1) {
    setForm((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.sizes.length) return f;
      const sizes = [...f.sizes];
      [sizes[i], sizes[j]] = [sizes[j], sizes[i]];
      return { ...f, sizes };
    });
    // Follow the row that moved, so the expanded panel stays with its size.
    setOpenSizeNutrition((open) => {
      const j = i + dir;
      if (open === null || j < 0 || j >= form.sizes.length) return open;
      if (open === i) return j;
      if (open === j) return i;
      return open;
    });
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      // Upload each selected file and append to the gallery. The first image
      // ever added becomes primary so a product always has one.
      const uploaded: string[] = [];
      for (const file of files) {
        const { url } = await adminUpload(file);
        uploaded.push(url);
      }
      setForm((f) => {
        const existing = f.images;
        const additions: ImageItem[] = uploaded.map((url) => ({ url, is_primary: false }));
        let images = [...existing, ...additions];
        if (!images.some((im) => im.is_primary) && images.length > 0) {
          images = images.map((im, i) => ({ ...im, is_primary: i === 0 }));
        }
        return {
          ...f,
          images,
          image_url: images.find((im) => im.is_primary)?.url ?? images[0]?.url ?? f.image_url,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Allow re-selecting the same file(s) again.
      e.target.value = "";
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
    // Primary image drives the legacy single image_url (used by every card
    // query); the full gallery + sizes + ingredients ride alongside.
    const primaryUrl =
      form.images.find((im) => im.is_primary)?.url ?? form.images[0]?.url ?? form.image_url;
    const payload = {
      name: form.name.trim(),
      category: form.category || null,
      description: form.description,
      price: form.price,
      badge: form.badge,
      image_url: primaryUrl,
      allergens: form.allergens,
      in_stock: form.in_stock,
      visible: form.visible,
      ingredients: form.ingredients,
      // Rich-text ingredients (sanitized server-side) + selected icon keys.
      ingredients_rich: form.ingredientsRich,
      ingredient_icons: form.ingredientIcons,
      // Server normalizes to null when every cell is blank (→ no nutrition).
      nutrition: form.nutrition,
      // Custom rows in insertion order; server drops blank-label drafts.
      nutrition_custom: form.nutritionCustom,
      images: form.images.map((im, i) => ({
        url: im.url,
        sort_order: i,
        is_primary: !!im.is_primary,
      })),
      // Only keep size rows that have a label; blank draft rows are dropped.
      sizes: form.sizes
        .filter((s) => s.label.trim())
        .map((s, i) => ({
          label: s.label.trim(),
          serves: s.serves === "" ? null : Number(s.serves),
          price: Number(s.price) || 0,
          sort_order: i,
          // This size's own nutrition. The server validates each cell and
          // stores null when the whole table is blank, in which case the size
          // keeps inheriting the product-level nutrition above.
          nutrition: s.nutrition,
        })),
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
    // Reordering is unavailable unless the table IS the sort_order arrangement,
    // unfiltered: sort_order is persisted from the row positions on screen, so
    // dragging an alphabetical list, a search hit list, or one category's slice
    // of the catalogue would overwrite the admin's arrangement with a shape they
    // never chose. Switch to Manual and clear the filters to reorder.
    if (!canReorder) return;
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
      <h1 style={{ color: WINE, fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>Products</h1>
      <p style={{ color: BERRY, opacity: 0.7, marginTop: 4, fontSize: "0.9rem" }}>
        {canReorder
          ? "Drag the ⠿ handle to reorder. Toggle Visible to show/hide on the menu."
          : sortKey !== "manual"
            ? "Sort to “Manual order” to drag the ⠿ handle and reorder. Toggle Visible to show/hide on the menu."
            : "Clear the search and category filter to drag the ⠿ handle and reorder. Toggle Visible to show/hide on the menu."}
      </p>

      {/* THE FILTER ROW — Search + Category + Sort on the left, Add product on
          the right. One row on desktop, wrapping as a group on tablet, each
          control full-width on its own line on mobile. Search filters the
          loaded products instantly in the browser; Category and Sort go to the
          query so they reach the whole catalogue rather than one page. All
          three combine. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, width: isMobile ? "100%" : "auto" }}>
          <div style={{ position: "relative", width: isMobile ? "100%" : 360, maxWidth: "100%" }}>
            <span aria-hidden style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(135,56,83,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products..."
              aria-label="Search products by name, reference, category or badge"
              style={{ ...inputStyle, paddingLeft: 38 }}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => changeCategory(e.target.value)}
            aria-label="Filter products by category"
            style={{ ...inputStyle, width: isMobile ? "100%" : 220, ...(isMobile ? { minHeight: 44 } : {}) }}
          >
            <option value="">All Categories</option>
            {filterCatOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {/* Sort — the same <select> as the category filter beside it, so the
              row reads as three of one control rather than three designs. The
              options come from lib/product-sort, which is also what the query
              reads, so the list can never offer an order the DB won't give. */}
          <select
            value={sortKey}
            onChange={(e) => changeSort(e.target.value as ProductSortKey)}
            aria-label="Sort products"
            style={{ ...inputStyle, width: isMobile ? "100%" : 200, ...(isMobile ? { minHeight: 44 } : {}) }}
          >
            {PRODUCT_SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <button onClick={openAdd} style={{ ...primaryBtn, ...(isMobile ? { minHeight: 44, width: "100%" } : {}) }}>+ Add product</button>
      </div>

      {error && <p style={errorBox}>{error}</p>}

      {loading ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>Loading products…</p>
      ) : products.length === 0 && !filtering ? (
        <p style={{ color: BERRY, opacity: 0.7, marginTop: 24 }}>
          No products yet. Click “Add product” to create your first one.
        </p>
      ) : filteredProducts.length === 0 ? (
        /* Nothing matched — which is a filter result, not an empty catalogue,
           so it says so rather than repeating "no products yet". */
        <div style={{ marginTop: 16, padding: "36px 16px", textAlign: "center", color: BERRY, background: "white", borderRadius: 16, boxShadow: "0 10px 30px rgba(135,56,83,0.08)" }}>
          <p style={{ margin: 0, fontWeight: 700 }}>No matching products found.</p>
          <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: "0.9rem" }}>
            {categoryFilter
              ? "Try a different search, or switch back to All Categories."
              : "Try a different name, reference, category or badge."}
          </p>
        </div>
      ) : (
        <>
          {isMobile ? (
            /* Stacked card view — drag the ⠿ handle to reorder */
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filteredProducts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                  {filteredProducts.map((p) => (
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
            /* DndContext wraps the TABLE, not the table's children.
               It renders its own accessibility live-region <div>, and a <div>
               between <table> and <tbody> is invalid HTML: the browser hoists
               it out during parsing, so the server and client trees differed
               and React reported a hydration error on every visit to this page.
               SortableContext renders no DOM of its own, so it can stay inside
               and keep wrapping <tbody> — drag-and-drop behaviour, sensors and
               handlers are all unchanged. */
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
                  <SortableContext items={filteredProducts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {filteredProducts.map((p) => (
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
                </table>
              </div>
            </DndContext>
          )}

          {/* Pagination — hidden while searching, since the filter applies to
              the loaded page and these controls page the full catalogue. */}
          {!searching && totalPages > 1 && (
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
                {catOptionRows.map((c) => (
                  // The VALUE is always the plain category name — indentation
                  // is display only, so selecting a subcategory stores exactly
                  // what it always did.
                  <option key={c.name} value={c.name}>{hierarchyLabel(c.name, c.depth)}</option>
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

            {/* Ingredients — free-text tags. Kept for backward compatibility;
                the rich-text description below takes precedence on the storefront
                when set. Only shown to customers when set. */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Ingredient tags (optional)</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                  value={ingredientInput}
                  onChange={(e) => setIngredientInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addIngredient();
                    }
                  }}
                  placeholder="e.g. Fresh Cream, then press Add"
                />
                <button type="button" onClick={addIngredient} style={{ ...secondaryBtn, padding: "8px 14px" }}>
                  Add
                </button>
              </div>
              {form.ingredients.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {form.ingredients.map((ing, i) => (
                    <span
                      key={`${ing}-${i}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "rgba(135,56,83,0.08)",
                        color: BERRY,
                        borderRadius: 999,
                        padding: "5px 10px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                      }}
                    >
                      {ing}
                      <button
                        type="button"
                        onClick={() => removeIngredient(i)}
                        aria-label={`Remove ${ing}`}
                        style={{ background: "none", border: "none", cursor: "pointer", color: WINE, fontWeight: 800, lineHeight: 1, fontSize: "1rem" }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Ingredients description — rich text with bold support. When set,
                this is what the storefront shows inside the Ingredients box
                (formatting preserved). Blank → falls back to the tags above. */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Ingredients description (rich text — bold supported)</label>
              <RichIngredientsEditor
                value={form.ingredientsRich}
                onChange={(html) => setForm((f) => ({ ...f, ingredientsRich: html }))}
                placeholder="e.g. Milk, Wheat, Soya, Chocolate, Butter — select a word and press B to bold it."
              />
            </div>

            {/* Ingredient icons — INGREDIENT icons only (not allergens). Tick the
                ones this product contains; they show above the Ingredients box. */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Ingredient icons (optional)</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: 8,
                  border: "1px solid rgba(135,56,83,0.18)",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                {INGREDIENT_ICONS.map((ic) => {
                  const checked = form.ingredientIcons.includes(ic.key);
                  return (
                    <label
                      key={ic.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px",
                        borderRadius: 8,
                        cursor: "pointer",
                        background: checked ? "rgba(135,56,83,0.08)" : "transparent",
                        color: BERRY,
                        fontSize: "0.88rem",
                        fontWeight: 600,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleIngredientIcon(ic.key)}
                        style={{ accentColor: WINE }}
                      />
                      <span style={{ fontSize: "1.05rem" }}>{ic.emoji}</span>
                      <span>{ic.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Nutrition Information — optional per-product table. Leave every
                cell blank to store nothing (the storefront hides the section). */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Nutrition Information (optional)</label>
              <div style={{ border: "1px solid rgba(135,56,83,0.18)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", background: "rgba(135,56,83,0.06)", padding: "8px 12px", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: "0.78rem", fontWeight: 700, color: BERRY, opacity: 0.75 }} />
                  <span style={{ width: 96, textAlign: "center", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.75 }}>Per 100g</span>
                  <span style={{ width: 96, textAlign: "center", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.75 }}>Per Portion</span>
                </div>
                {NUTRITION_ROWS.map((row, i) => (
                  <div
                    key={row.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderTop: i === 0 ? "none" : "1px solid rgba(135,56,83,0.08)",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: "0.88rem",
                        color: BERRY,
                        fontWeight: row.indent ? 500 : 600,
                        paddingLeft: row.indent ? 14 : 0,
                        opacity: row.indent ? 0.85 : 1,
                      }}
                    >
                      {row.label}
                    </span>
                    <input
                      style={{ ...inputStyle, width: 96, padding: "8px 10px" }}
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={form.nutrition[row.key].per_100g}
                      onChange={(e) => updateNutrition(row.key, "per_100g", e.target.value)}
                      placeholder="—"
                      aria-label={`${row.label} per 100g`}
                    />
                    <input
                      style={{ ...inputStyle, width: 96, padding: "8px 10px" }}
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={form.nutrition[row.key].per_portion}
                      onChange={(e) => updateNutrition(row.key, "per_portion", e.target.value)}
                      placeholder="—"
                      aria-label={`${row.label} per portion`}
                    />
                  </div>
                ))}
              </div>
              <p style={{ color: BERRY, opacity: 0.6, fontSize: "0.78rem", marginTop: 6 }}>
                Enter values for each row. Leave all cells blank to hide the nutrition table for this product.
              </p>

              {/* Custom rows — admin-defined extra rows (Vitamin C, Calcium…).
                  Kept separate from the default rows above; unlimited, ordered,
                  each individually deletable. Default rows can never be deleted. */}
              {form.nutritionCustom.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                  {form.nutritionCustom.map((row, i) => (
                    <div key={row.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        style={{ ...inputStyle, flex: 2, minWidth: 130 }}
                        value={row.label}
                        onChange={(e) => updateCustomRow(row.id, { label: e.target.value })}
                        placeholder="Name e.g. Vitamin C"
                        aria-label="Custom nutrition name"
                      />
                      <input
                        style={{ ...inputStyle, width: 96, padding: "8px 10px" }}
                        value={row.per_100g}
                        onChange={(e) => updateCustomRow(row.id, { per_100g: e.target.value })}
                        placeholder="Per 100g"
                        aria-label={`${row.label || "Custom row"} per 100g`}
                      />
                      <input
                        style={{ ...inputStyle, width: 96, padding: "8px 10px" }}
                        value={row.per_portion}
                        onChange={(e) => updateCustomRow(row.id, { per_portion: e.target.value })}
                        placeholder="Per Portion"
                        aria-label={`${row.label || "Custom row"} per portion`}
                      />
                      <button type="button" onClick={() => moveCustomRow(i, -1)} disabled={i === 0} title="Move up" style={miniBtn(i === 0)}>↑</button>
                      <button type="button" onClick={() => moveCustomRow(i, 1)} disabled={i === form.nutritionCustom.length - 1} title="Move down" style={miniBtn(i === form.nutritionCustom.length - 1)}>↓</button>
                      <button
                        type="button"
                        onClick={() => removeCustomRow(row.id)}
                        aria-label={`Delete ${row.label || "custom row"}`}
                        title="Delete row"
                        style={{ ...miniBtn(false), color: "#d9534f", borderColor: "#d9534f" }}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={addCustomRow} style={{ ...secondaryBtn, padding: "8px 14px", marginTop: 10 }}>
                + Add Nutrition Row
              </button>
              <p style={{ color: BERRY, opacity: 0.6, fontSize: "0.78rem", marginTop: 6 }}>
                Add your own rows (e.g. Vitamin C, Calcium, Iron). Values can include units like “mg”.
              </p>
            </div>

            {/* Images — multiple, with primary + reorder + delete. */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>
                Images {loadingDetails && <span style={{ opacity: 0.6, fontWeight: 500 }}>· loading…</span>}
              </label>
              {form.images.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  {form.images.map((im, i) => (
                    <div
                      key={`${im.url}-${i}`}
                      style={{
                        position: "relative",
                        width: 90,
                        border: im.is_primary ? `2px solid ${WINE}` : "2px solid transparent",
                        borderRadius: 12,
                        padding: 2,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={im.url} alt={`image ${i + 1}`} style={{ width: "100%", height: 84, objectFit: "cover", borderRadius: 9, display: "block" }} />
                      {im.is_primary && (
                        <span style={{ position: "absolute", top: 4, left: 4, background: WINE, color: "white", fontSize: "0.6rem", fontWeight: 800, padding: "2px 5px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                          Primary
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        aria-label="Delete image"
                        style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "white", cursor: "pointer", fontWeight: 800, lineHeight: 1, fontSize: "0.8rem" }}
                      >
                        ×
                      </button>
                      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 4 }}>
                        <button type="button" onClick={() => moveImage(i, -1)} disabled={i === 0} title="Move left" style={miniBtn(i === 0)}>‹</button>
                        {!im.is_primary && (
                          <button type="button" onClick={() => setPrimaryImage(i)} title="Set as primary" style={{ ...miniBtn(false), width: "auto", padding: "0 6px", fontSize: "0.65rem", fontWeight: 700 }}>★</button>
                        )}
                        <button type="button" onClick={() => moveImage(i, 1)} disabled={i === form.images.length - 1} title="Move right" style={miniBtn(i === form.images.length - 1)}>›</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <input type="file" accept="image/*" multiple onChange={handleImage} disabled={uploading} />
              {uploading && <span style={{ color: BERRY, opacity: 0.7, marginLeft: 8 }}>Uploading…</span>}
              <p style={{ color: BERRY, opacity: 0.6, fontSize: "0.78rem", marginTop: 6 }}>
                Upload one or more images. The ★ Primary image is used on cards and listings.
              </p>
            </div>

            {/* Size variants — optional. Empty = single-price product (unchanged). */}
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Sizes (optional)</label>
              {form.sizes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                  {form.sizes.map((s, i) => {
                    const nutritionOpen = openSizeNutrition === i;
                    // How many of this size's own cells are filled — surfaced on
                    // the toggle so the admin can see at a glance which sizes
                    // already have their own table without opening each one.
                    const filled = NUTRITION_ROWS.reduce(
                      (n, row) =>
                        n +
                        (s.nutrition[row.key]?.per_100g ? 1 : 0) +
                        (s.nutrition[row.key]?.per_portion ? 1 : 0),
                      0,
                    );
                    const sizeName = s.label.trim() || `size ${i + 1}`;
                    return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          style={{ ...inputStyle, flex: 2, minWidth: 110 }}
                          value={s.label}
                          onChange={(e) => updateSize(i, { label: e.target.value })}
                          placeholder="Label e.g. Medium"
                        />
                        <input
                          style={{ ...inputStyle, flex: 1, minWidth: 80 }}
                          type="number"
                          min="0"
                          value={s.serves}
                          onChange={(e) => updateSize(i, { serves: e.target.value })}
                          placeholder="Serves"
                        />
                        <input
                          style={{ ...inputStyle, flex: 1, minWidth: 80 }}
                          type="number"
                          step="0.01"
                          min="0"
                          value={s.price}
                          onChange={(e) => updateSize(i, { price: e.target.value })}
                          placeholder="Price £"
                        />
                        {/* Opens THIS size's own nutrition table below. Each size
                            edits its own copy, so one never overwrites another. */}
                        <button
                          type="button"
                          onClick={() => setOpenSizeNutrition(nutritionOpen ? null : i)}
                          aria-expanded={nutritionOpen}
                          title={`Nutrition for ${sizeName}`}
                          style={{ ...miniBtn(false), width: "auto", padding: "0 8px", fontSize: "0.7rem", fontWeight: 700, height: 24, gap: 4 }}
                        >
                          {nutritionOpen ? "▾" : "▸"} Nutrition
                          {filled > 0 && <span style={{ opacity: 0.7 }}>({filled})</span>}
                        </button>
                        <button type="button" onClick={() => moveSize(i, -1)} disabled={i === 0} title="Move up" style={miniBtn(i === 0)}>↑</button>
                        <button type="button" onClick={() => moveSize(i, 1)} disabled={i === form.sizes.length - 1} title="Move down" style={miniBtn(i === form.sizes.length - 1)}>↓</button>
                        <button
                          type="button"
                          onClick={() => removeSize(i)}
                          aria-label="Delete size"
                          style={{ ...miniBtn(false), color: "#d9534f", borderColor: "#d9534f" }}
                        >
                          ×
                        </button>
                      </div>

                      {/* This size's own Nutrition Information — the same nine
                          rows as the product-level table above, stored against
                          this size. Blank throughout = inherit the product's. */}
                      {nutritionOpen && (
                        <div style={{ border: "1px solid rgba(135,56,83,0.18)", borderRadius: 12, overflow: "hidden", marginLeft: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", background: "rgba(135,56,83,0.06)", padding: "8px 12px", gap: 8 }}>
                            <span style={{ flex: 1, fontSize: "0.78rem", fontWeight: 700, color: BERRY, opacity: 0.75 }}>
                              Nutrition — {sizeName}
                            </span>
                            <span style={{ width: 96, textAlign: "center", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.75 }}>Per 100g</span>
                            <span style={{ width: 96, textAlign: "center", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em", color: BERRY, opacity: 0.75 }}>Per Portion</span>
                          </div>
                          {NUTRITION_ROWS.map((row) => (
                            <div
                              key={row.key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                borderTop: "1px solid rgba(135,56,83,0.08)",
                              }}
                            >
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: "0.88rem",
                                  color: BERRY,
                                  fontWeight: row.indent ? 500 : 600,
                                  paddingLeft: row.indent ? 14 : 0,
                                  opacity: row.indent ? 0.85 : 1,
                                }}
                              >
                                {row.label}
                              </span>
                              <input
                                style={{ ...inputStyle, width: 96, padding: "8px 10px" }}
                                type="number"
                                step="0.1"
                                min="0"
                                inputMode="decimal"
                                value={s.nutrition[row.key].per_100g}
                                onChange={(e) => updateSizeNutrition(i, row.key, "per_100g", e.target.value)}
                                placeholder="—"
                                aria-label={`${sizeName} — ${row.label} per 100g`}
                              />
                              <input
                                style={{ ...inputStyle, width: 96, padding: "8px 10px" }}
                                type="number"
                                step="0.1"
                                min="0"
                                inputMode="decimal"
                                value={s.nutrition[row.key].per_portion}
                                onChange={(e) => updateSizeNutrition(i, row.key, "per_portion", e.target.value)}
                                placeholder="—"
                                aria-label={`${sizeName} — ${row.label} per portion`}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={addSize} style={{ ...secondaryBtn, padding: "8px 14px" }}>
                + Add size
              </button>
              <p style={{ color: BERRY, opacity: 0.6, fontSize: "0.78rem", marginTop: 6 }}>
                Add sizes to let customers pick (e.g. Small / Medium / Large). The selected size price is charged. Leave empty to keep a single price.
              </p>
              <p style={{ color: BERRY, opacity: 0.6, fontSize: "0.78rem", marginTop: 6 }}>
                Each size has its own Nutrition Information — the customer sees the selected size&apos;s table. Leave a size&apos;s table blank to fall back to the product-level nutrition above.
              </p>
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

/**
 * The 48px product thumbnail, with the tinted placeholder shown when a product
 * has no image yet. The desktop table row and the mobile card rendered this
 * identically; they now share one definition so the two lists cannot drift.
 */
function ProductThumb({ product: p }: { product: Product }) {
  const box = { width: 48, height: 48, borderRadius: 8 } as const;
  return p.image_url ? (
    <Image
      src={p.image_url}
      alt={p.name}
      width={48}
      height={48}
      style={{ ...box, objectFit: "cover" }}
    />
  ) : (
    <div style={{ ...box, background: "rgba(135,56,83,0.08)" }} />
  );
}

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
        <ProductThumb product={p} />
      </td>
      <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
      <td style={td}>{p.category || "—"}</td>
      <td style={td}>£{productPrice(p).toFixed(2)}</td>
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
        <ProductThumb product={p} />
        <span style={{ fontWeight: 700, color: BERRY, flex: 1 }}>{p.name}</span>
      </div>

      <CardField label="Category" value={p.category || "—"} />
      <CardField label="Price" value={`£${productPrice(p).toFixed(2)}`} />
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
type CategoryRow = {
  name: string;
  count: number;
  /** Parent category name; null for a top-level category. */
  parent?: string | null;
  /** Nesting level, 0 for top level. Drives the indentation below. */
  depth?: number;
};

function CategoriesSection({ onChanged }: { onChanged: () => void }) {
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [adding, setAdding] = useState(false);
  // The category the delete confirmation is open for, and whether that delete
  // is in flight — kept apart from `busy` so the dialog's own button is the
  // only control that shows the spinner.
  const [confirming, setConfirming] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Why the delete failed, shown INSIDE the dialog. The section-level `error`
  // box sits at the top of the panel, which is off-screen when you delete a
  // row further down the list — a failure reported only there reads as the
  // button doing nothing at all.
  const [deleteError, setDeleteError] = useState("");
  // Success feedback for a delete, in the same box the errors already use.
  const [notice, setNotice] = useState("");

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
    setNotice("");
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
    setNotice("");
    try {
      // `parent` is optional — "" means top level, exactly as before.
      await adminSend("/api/admin/products/categories", "PUT", { name, parent: newParent });
      setNewName("");
      setNewParent("");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add category");
    } finally {
      setAdding(false);
    }
  }

  /** Move a category under a different parent, or back to top level ("").
   *  Hierarchy only — products stay exactly where they are. */
  async function setParent(c: CategoryRow, parent: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminSend("/api/admin/products/categories", "PATCH", { name: c.name, parent });
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change parent");
    } finally {
      setBusy(false);
    }
  }

  /** Open the confirmation. Nothing is sent until it is confirmed. */
  function askRemove(c: CategoryRow) {
    setError("");
    setNotice("");
    setDeleteError("");
    setConfirming(c);
  }

  /** Close the confirmation without deleting, discarding any failed attempt. */
  function cancelRemove() {
    setConfirming(null);
    setDeleteError("");
  }

  /**
   * Delete the category the dialog is showing: it goes, so do the products
   * filed DIRECTLY under it, while its subcategories survive as top-level
   * categories with their own products intact. The API does all of that in one
   * transaction — this just reports what came back.
   */
  async function confirmRemove() {
    const c = confirming;
    // `deleting` also guards the button, so a double click can't send twice.
    if (!c || deleting) return;
    setDeleting(true);
    setError("");
    setDeleteError("");
    try {
      const res = await adminSend<{
        deletedProducts?: number;
        promotedChildren?: string[];
        orphanedFiles?: string[];
      }>("/api/admin/products/categories", "DELETE", { name: c.name });

      const products = res.deletedProducts ?? 0;
      const promoted = res.promotedChildren?.length ?? 0;
      const stranded = res.orphanedFiles?.length ?? 0;
      setNotice(
        `Category deleted successfully. ` +
          `${products} product${products === 1 ? "" : "s"} removed. ` +
          `${promoted} child categor${promoted === 1 ? "y" : "ies"} moved to top level.` +
          // Only ever shown when Storage refused: the rows are gone, so the
          // files need clearing by hand rather than another delete.
          (stranded > 0
            ? ` ${stranded} image file${stranded === 1 ? "" : "s"} could not be removed from storage — delete ${res.orphanedFiles?.join(", ")} in Supabase Storage.`
            : ""),
      );
      setConfirming(null);
      await load();
      onChanged();
    } catch (e) {
      // The dialog STAYS OPEN and says why, right where the click happened.
      // Also logged, so the exact server message survives even if the admin
      // dismisses the dialog before reading it.
      console.error("[categories] delete failed:", e);
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ marginTop: 36 }}>
      <h2 style={{ color: WINE, fontSize: "1.25rem", fontWeight: 800, margin: 0 }}>Categories</h2>
      <p style={{ color: BERRY, opacity: 0.7, marginTop: 4, fontSize: "0.9rem" }}>
        Add a new category, rename one (updates every product using it), or delete one along with
        the products filed directly under it — its subcategories are kept and become top level.
        Give a category a parent to file it as a subcategory — products never move.
      </p>
      {error && <p style={errorBox}>{error}</p>}
      {notice && (
        <p role="status" aria-live="polite" style={noticeBox}>
          {notice}
        </p>
      )}

      {/* Add a new (empty) category, optionally under a parent */}
      <form onSubmit={add} style={{ display: "flex", gap: 10, marginTop: 14, maxWidth: 520, flexWrap: "wrap" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          style={{ ...inputStyle, flex: 1, minWidth: 180 }}
        />
        <select
          value={newParent}
          onChange={(e) => setNewParent(e.target.value)}
          aria-label="Parent category for the new category"
          style={{ ...inputStyle, width: 170 }}
        >
          <option value="">Parent: None</option>
          {cats.map((c) => (
            <option key={c.name} value={c.name}>{hierarchyLabel(c.name, c.depth ?? 0)}</option>
          ))}
        </select>
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
                // Indentation is the ONLY visual change to the list: a
                // subcategory sits under its parent, nothing is restyled.
                paddingLeft: 16 + (c.depth ?? 0) * 20,
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
                  <span style={{ flex: 1, fontWeight: 600, color: BERRY }}>
                    {(c.depth ?? 0) > 0 && (
                      <span style={{ opacity: 0.45, marginRight: 6 }}>└</span>
                    )}
                    {c.name}
                  </span>
                  <span style={{ color: BERRY, opacity: 0.6, fontSize: "0.85rem" }}>{c.count} product{c.count === 1 ? "" : "s"}</span>
                  {/* Change the parent in place — the rename flow is untouched.
                      Its own subtree is excluded so a cycle can't be picked
                      (the API refuses one regardless). */}
                  <select
                    value={c.parent ?? ""}
                    disabled={busy}
                    onChange={(e) => setParent(c, e.target.value)}
                    aria-label={`Parent category for ${c.name}`}
                    title="Move this category under another one"
                    style={{ ...inputStyle, width: 150, padding: "6px 8px", fontSize: "0.85rem" }}
                  >
                    <option value="">Parent: None</option>
                    {cats
                      .filter((o) => o.name !== c.name && !isDescendantOf(cats, o.name, c.name))
                      .map((o) => (
                        <option key={o.name} value={o.name}>{hierarchyLabel(o.name, o.depth ?? 0)}</option>
                      ))}
                  </select>
                  <button onClick={() => start(c.name)} style={linkBtn}>Rename</button>
                  <button
                    onClick={() => askRemove(c)}
                    disabled={busy || deleting}
                    title="Delete this category and the products filed directly under it"
                    style={{ ...linkBtn, color: "#d9534f" }}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {confirming && (
        <DeleteCategoryDialog
          category={confirming}
          childCount={cats.filter((x) => x.parent === confirming.name).length}
          deleting={deleting}
          error={deleteError}
          onCancel={cancelRemove}
          onConfirm={confirmRemove}
        />
      )}
    </div>
  );
}

/**
 * The confirmation shown before a category is deleted. Spells out exactly what
 * goes and what stays, because the two are easy to confuse: the products filed
 * DIRECTLY under this category are deleted, while its subcategories — and
 * everything filed under those — survive as top-level categories.
 *
 * Built from the panel's existing overlay/modal and button styles; the only
 * control that can start the delete is its own button, which disables itself
 * for the duration so a second click cannot send a second request.
 */
function DeleteCategoryDialog({
  category,
  childCount,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  category: CategoryRow;
  childCount: number;
  deleting: boolean;
  /** Why the last attempt failed, if it did. Shown here rather than at the top
   *  of the panel so the reason is where the admin is already looking. */
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={overlay} onClick={deleting ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-category-title"
        onClick={(e) => e.stopPropagation()}
        style={{ ...modal, maxWidth: 440 }}
      >
        <h2 id="delete-category-title" style={{ color: WINE, marginTop: 0, fontSize: "1.3rem" }}>
          Delete category?
        </h2>

        <dl style={{ margin: "0 0 14px", color: BERRY, fontSize: "0.95rem" }}>
          <div style={confirmRow}>
            <dt style={confirmLabel}>Category</dt>
            <dd style={confirmValue}>{category.name}</dd>
          </div>
          <div style={confirmRow}>
            <dt style={confirmLabel}>Products to delete</dt>
            <dd style={confirmValue}>{category.count}</dd>
          </div>
          <div style={confirmRow}>
            <dt style={confirmLabel}>Child categories</dt>
            <dd style={confirmValue}>{childCount}</dd>
          </div>
        </dl>

        {childCount > 0 && (
          <p style={{ color: BERRY, opacity: 0.75, fontSize: "0.9rem", margin: "0 0 10px" }}>
            Child categories will NOT be deleted. They will become top-level categories, and their
            products stay where they are.
          </p>
        )}
        <p style={{ color: "#b03030", fontWeight: 600, fontSize: "0.9rem", margin: "0 0 18px" }}>
          This action cannot be undone.
        </p>

        {error && (
          <p role="alert" style={{ ...errorBox, marginTop: 0, marginBottom: 18 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onCancel} disabled={deleting} style={secondaryBtn}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              ...primaryBtn,
              background: "#d9534f",
              opacity: deleting ? 0.6 : 1,
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            {deleting ? "Deleting…" : "Delete Forever"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Label a category for a <select>, indented by its depth so subcategories read
 * as nested. Display only — the option's VALUE is always the plain name, so a
 * product still stores exactly the category name it always did.
 * Uses non-breaking spaces because browsers collapse ordinary ones in options.
 */
function hierarchyLabel(name: string, depth: number): string {
  return depth > 0 ? `${" ".repeat(depth * 4)}└ ${name}` : name;
}

/**
 * True when `name` sits anywhere beneath `ancestor`. Used to hide a category's
 * own subtree from its parent picker, so the UI can't even offer the move that
 * would create a cycle. The visited set keeps a malformed tree from looping.
 */
function isDescendantOf(
  rows: { name: string; parent?: string | null }[],
  name: string,
  ancestor: string,
): boolean {
  const parentOf = new Map(rows.map((r) => [r.name, r.parent ?? null]));
  const seen = new Set<string>();
  let cursor = parentOf.get(name) ?? null;
  while (cursor) {
    if (cursor === ancestor) return true;
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(135,56,83,0.25)", fontSize: "0.95rem", color: BERRY, outline: "none" };
// Small square control used by the image/size reorder + primary buttons.
const miniBtn = (disabled: boolean): React.CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: 7,
  border: `1px solid ${WINE}`,
  background: "white",
  color: WINE,
  fontWeight: 800,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.35 : 1,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
});
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600, color: BERRY, marginBottom: 6, fontSize: "0.9rem" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, color: BERRY, fontWeight: 600 };
const th: React.CSSProperties = { padding: "12px 14px", fontSize: "0.8rem", fontWeight: 700, color: BERRY, textTransform: "uppercase", letterSpacing: "0.03em" };
const td: React.CSSProperties = { padding: "12px 14px", fontSize: "0.92rem", color: BERRY, verticalAlign: "middle" };
const primaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: WINE, color: "white", fontWeight: 700, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: `1px solid ${WINE}`, background: "transparent", color: WINE, fontWeight: 700, cursor: "pointer" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: WINE, fontWeight: 700, cursor: "pointer", marginLeft: 12, fontSize: "0.9rem" };
const errorBox: React.CSSProperties = { background: "#fde8e8", color: "#b03030", padding: "10px 14px", borderRadius: 10, marginTop: 16 };
// Success twin of errorBox — same box, the panel's own colours.
const noticeBox: React.CSSProperties = { background: "rgba(135,56,83,0.08)", color: BERRY, padding: "10px 14px", borderRadius: 10, marginTop: 16 };
// Rows of the delete confirmation's summary list.
const confirmRow: React.CSSProperties = { display: "flex", gap: 12, justifyContent: "space-between", padding: "6px 0" };
const confirmLabel: React.CSSProperties = { margin: 0, opacity: 0.7 };
const confirmValue: React.CSSProperties = { margin: 0, fontWeight: 700 };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(60,20,40,0.45)", display: "grid", placeItems: "center", padding: "1.5rem", zIndex: 50 };
const modal: React.CSSProperties = { width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "white", borderRadius: 18, padding: "1.75rem" };
