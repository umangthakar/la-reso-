// ============================================================
// Le Rasa Bakery — authoritative basket pricing (SERVER ONLY)
// ------------------------------------------------------------
// The single place a basket is turned into money. Extracted from
// /api/checkout/create-intent so that /api/orders/create can run the
// EXACT same computation instead of trusting the item names, prices and
// add-on totals the browser sends it.
//
// The client is only ever trusted for IDENTIFIERS and QUANTITY:
//   productId, sizeId, the wizard's raw selections, quantity
// Everything that appears on the order — the product name, the unit price,
// the size label, the accessory extras and the resolved choice list — is
// re-read from the database here.
//
// Migration tolerance is preserved exactly as it was: a missing
// product_sizes table falls back to base prices, and unreadable
// customization tables simply mean no extras, rather than a failed
// checkout.
//
// NEVER import this from a Client Component.
// ============================================================

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/pricing";
import { selectedSizeOf } from "@/lib/product-pricing";
import {
  buildCustomization,
  categoriesForProduct,
  fetchAccessoryCategories,
  priceSelections,
  type AccessoryCategory,
  type Customization,
  type Selections,
} from "@/lib/customization";

/**
 * `id` is the cart LINE id; `productId` is the product it refers to. They
 * differ only for a customized cake (see lib/customization#cartLineId).
 * Baskets saved before customization existed send `id` alone — hence the
 * fallback, which keeps old tabs and old localStorage working.
 */
export type IncomingItem = {
  id?: string;
  quantity?: number;
  productId?: string;
  /** Selected size variant, when the product offers sizes. */
  sizeId?: string;
  customization?: { selections?: Selections } | null;
};

export type ProductRow = {
  id: string;
  name: string;
  price: number;
  in_stock: boolean | null;
  category: string | null;
};

/** One fully re-priced basket line. Every money field is DB-derived. */
export type PricedLine = {
  productId: string;
  /** DB product name, with the size label appended when a size is chosen. */
  name: string;
  category: string | null;
  quantity: number;
  sizeId: string | null;
  sizeLabel: string | null;
  /** Absolute unit price (the size's price when a valid size is named). */
  unitPrice: number;
  /** Per-unit accessory extra, re-priced from the live wizard config. */
  addons: number;
  /** Resolved customization (lines + kept selections + total), or null. */
  customization: Customization | null;
};

export type PricedBasket = {
  lines: PricedLine[];
  /** Product rows as read from the DB — the offer engine works on these. */
  productRows: ProductRow[];
  /** Size-aware subtotal per product id (what the offer engine sees). */
  productEffective: Map<string, number>;
  /** Total quantity per product id. */
  wanted: Map<string, number>;
  /** Sum of product lines only (offers discount cakes, not candles). */
  productSubtotal: number;
  /** Sum of accessory extras across the basket. */
  accessoriesTotal: number;
  /** productSubtotal + accessoriesTotal. */
  subtotal: number;
};

export type PriceBasketResult =
  | { ok: true; basket: PricedBasket }
  | { ok: false; error: string; status: number };

/**
 * Re-price a basket from the database. Returns a discriminated result so
 * callers keep their existing HTTP semantics (empty basket → 400, an
 * out-of-stock product → 409, an unpriceable basket → 400).
 */
export async function priceBasket(
  supabase: SupabaseClient,
  items: IncomingItem[],
): Promise<PriceBasketResult> {
  // Normalise + validate quantities. Lines are kept SEPARATE (not collapsed
  // into a per-product map) because two cakes of the same product can carry
  // different accessories and must be priced independently.
  type RawLine = {
    productId: string;
    quantity: number;
    sizeId: string | null;
    selections: Selections;
  };
  const raw: RawLine[] = [];
  for (const it of items ?? []) {
    const qty = Math.max(0, Math.trunc(Number(it?.quantity)) || 0);
    const productId = String(it?.productId ?? it?.id ?? "");
    if (!productId || qty <= 0) continue;
    raw.push({
      productId,
      quantity: qty,
      sizeId: it?.sizeId ? String(it.sizeId) : null,
      selections: it?.customization?.selections ?? {},
    });
  }
  if (raw.length === 0) {
    return { ok: false, error: "Your basket is empty.", status: 400 };
  }

  // Total quantity per product — what the offer engine works on.
  const wanted = new Map<string, number>();
  for (const line of raw) {
    wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.quantity);
  }

  const { data, error } = await supabase
    .from("products")
    .select("id,name,price,in_stock,category")
    .in("id", Array.from(wanted.keys()));

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  const productRows = (data ?? []) as ProductRow[];

  for (const row of productRows) {
    if (row.in_stock === false) {
      return {
        ok: false,
        error: `"${row.name}" is currently unavailable.`,
        status: 409,
      };
    }
  }

  // Every referenced product must actually exist. Previously an unknown id
  // simply priced at £0 and still produced an order line; now it is refused,
  // because order_items.product_id is a real foreign key and a fabricated id
  // has no legitimate origin.
  const byId = new Map(productRows.map((r) => [r.id, r]));
  const missing = Array.from(wanted.keys()).filter((id) => !byId.has(id));
  if (missing.length > 0) {
    return {
      ok: false,
      error: "One of the items in your basket is no longer available.",
      status: 409,
    };
  }

  // ---- SIZE VARIANT PRICES (re-priced from the DB, migration-tolerant) -----
  // A line that names a size is charged that size's ABSOLUTE price — never the
  // client's number.
  //
  // A line that names NO size (or a size that has since been deleted) for a
  // product that HAS sizes is charged its DEFAULT VARIANT, resolved by the same
  // selectedSizeOf() the storefront uses. That is the fix for the old
  // fall-back-to-base-price behaviour: the cards advertise the default variant,
  // so charging products.price for a sizeless line would have billed a number no
  // page ever showed (and still would for any basket saved before this change).
  //
  // Products with no size variants at all — and any database where
  // product_sizes isn't migrated — keep the base product price exactly as
  // before, so checkout never fails over a missing table.
  const basePrice = new Map(productRows.map((r) => [r.id, Number(r.price) || 0]));
  type SizeRecord = { id: string; productId: string; price: number; label: string | null; sort_order: number };
  const sizesByProduct = new Map<string, SizeRecord[]>();
  try {
    const { data: sizeRows, error: sizeErr } = await supabase
      .from("product_sizes")
      .select("id,product_id,price,label,sort_order")
      .in("product_id", Array.from(wanted.keys()));
    if (!sizeErr && Array.isArray(sizeRows)) {
      for (const s of sizeRows) {
        const productId = String(s.product_id);
        const record: SizeRecord = {
          id: String(s.id),
          productId,
          price: Number(s.price) || 0,
          label: (s as { label?: string | null }).label ?? null,
          sort_order: Number((s as { sort_order?: number | null }).sort_order) || 0,
        };
        const list = sizesByProduct.get(productId);
        if (list) list.push(record);
        else sizesByProduct.set(productId, [record]);
      }
    }
  } catch {
    /* table not migrated → base prices used (unchanged behaviour) */
  }

  /**
   * The size a line is charged at: the one it names when that size really
   * belongs to the product, otherwise the product's default variant. Null only
   * when the product has no sizes.
   */
  function sizeForLine(line: RawLine): SizeRecord | null {
    const sizes = sizesByProduct.get(line.productId);
    if (!sizes || sizes.length === 0) return null;
    return selectedSizeOf(sizes, line.sizeId);
  }

  // ---- ACCESSORY EXTRAS (re-priced from the live wizard config) ----------
  // Only what the config currently says is visible and available is charged;
  // an unknown or stale selection prices at £0 rather than failing a
  // customer's checkout because an admin edited an accessory mid-basket.
  let allCategories: AccessoryCategory[] | null = null;
  const hasSelections = raw.some((l) => Object.keys(l.selections).length > 0);
  if (hasSelections) {
    try {
      allCategories = await fetchAccessoryCategories(supabase);
    } catch {
      // Customization not migrated / unreadable → no extras.
      allCategories = null;
    }
  }

  const lines: PricedLine[] = [];
  const productEffective = new Map<string, number>();
  let accessoriesTotal = 0;

  for (const line of raw) {
    const product = byId.get(line.productId)!;
    const size = sizeForLine(line);
    const unitPrice = size ? size.price : basePrice.get(line.productId) ?? 0;

    let addons = 0;
    let customization: Customization | null = null;
    if (allCategories && Object.keys(line.selections).length > 0) {
      const categories = categoriesForProduct(allCategories, product.category ?? null);
      addons = round2(priceSelections(categories, line.selections));
      // Rebuild the human-readable choice list from the live config too, so the
      // baker's WhatsApp/email and the order snapshot describe what was
      // actually charged rather than what the client claimed.
      customization = buildCustomization(categories, line.selections);
    }

    accessoriesTotal += addons * line.quantity;
    productEffective.set(
      line.productId,
      round2((productEffective.get(line.productId) ?? 0) + unitPrice * line.quantity),
    );

    lines.push({
      productId: line.productId,
      // The chosen size rides on the stored name so it shows in order history,
      // the baker's WhatsApp and the customer's email — same shape the client
      // used to send, but built from the DB label.
      name: size?.label ? `${product.name} — ${size.label}` : product.name,
      category: product.category ?? null,
      quantity: line.quantity,
      // The size actually charged — which is the resolved default when the
      // client named none, so the order records the variant it paid for.
      sizeId: size ? size.id : null,
      sizeLabel: size?.label ?? null,
      unitPrice,
      addons,
      customization,
    });
  }

  accessoriesTotal = round2(accessoriesTotal);
  const productSubtotal = round2(
    Array.from(productEffective.values()).reduce((s, v) => s + v, 0),
  );
  const subtotal = round2(productSubtotal + accessoriesTotal);

  if (subtotal <= 0) {
    return { ok: false, error: "Could not price your basket.", status: 400 };
  }

  return {
    ok: true,
    basket: {
      lines,
      productRows,
      productEffective,
      wanted,
      productSubtotal,
      accessoriesTotal,
      subtotal,
    },
  };
}
