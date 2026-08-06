"use client";

// ============================================================
// Le Rasa Bakery — Cake customization page (/customize/[slug])
// ------------------------------------------------------------
// Sits between "Buy Now" and the cart, for cake products only. EVERY control
// on this page is rendered from the Accessories Management System in the
// database — there is no hardcoded list of candles, cards, balloons or
// toppers here, and adding a new accessory category needs no change to this
// file.
//
// Pricing, visibility and validation all come from lib/customization.ts, the
// same module /api/checkout/create-intent uses to re-price the basket
// server-side. The customer is never shown a total the server won't charge.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { ArrowRight, ChevronLeft, Minus, Plus, Sparkles } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useCart } from "@/components/cart/cart-context";
import { useAuth } from "@/lib/use-auth";
import { useCustomization } from "@/lib/use-customization";
import { loginHrefFor } from "@/lib/purchase-intent";
import { isCakeCategory } from "@/lib/custom-cake";
import { slugify } from "@/lib/slug";
import { money } from "@/lib/pricing";
import { selectedSizeOf, sizedCartLineId, type SizeLike } from "@/lib/product-pricing";
import {
  buildCustomization,
  cartLineId,
  categoriesForProduct,
  defaultSelections,
  priceSelections,
  validateSelections,
  visibleCategories,
  type Accessory,
  type AccessoryCategory,
  type Selections,
} from "@/lib/customization";

type WizardProduct = {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  in_stock: boolean;
  is_customizable: boolean;
};

/** A size variant carried over from the product page. */
type ChosenSize = { id: string; label: string; price: number };

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80";

// The most digits a customer can put on a cake (e.g. "100").
const MAX_CANDLE_DIGITS = 6;

/** A "Number candle" accessory — opens the digit configurator when chosen. */
function isNumberCandle(acc: Accessory): boolean {
  return acc.value === "number" || /number\s*candle/i.test(acc.name);
}

const INPUT =
  "w-full rounded-2xl border border-dustyrose/50 bg-blush-50 px-4 py-3 text-darkberry placeholder:text-berry/60 shadow-clay-sm focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/30";

/** "+£2.50" / "Free" — the price tag next to an accessory. */
function PriceTag({ price }: { price: number }) {
  return (
    <span
      className={`shrink-0 text-xs font-bold uppercase tracking-wide ${
        price > 0 ? "text-wine-dark" : "text-berry/70"
      }`}
    >
      {price > 0 ? `+${money(price)}` : "Free"}
    </span>
  );
}

/** An accessory's photo, when the admin has uploaded one. */
function Thumb({ accessory }: { accessory: Accessory }) {
  if (!accessory.imageUrl) return null;
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl">
      <Image
        src={accessory.imageUrl}
        alt={accessory.name}
        fill
        sizes="44px"
        className="object-cover"
      />
    </div>
  );
}

export default function CustomizePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const router = useRouter();
  const { addItem } = useCart();
  const { user, ready: authReady } = useAuth();
  const { config, loading: configLoading } = useCustomization();

  const [product, setProduct] = useState<WizardProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  // The size chosen on the product page (?size=<id>), resolved against
  // product_sizes. Its price is ABSOLUTE and replaces the base product price,
  // exactly as on /menu/[slug].
  const [sizeParam, setSizeParam] = useState<string | null>(null);
  const [size, setSize] = useState<ChosenSize | null>(null);
  const [selections, setSelections] = useState<Selections>({});
  const [seeded, setSeeded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  // Number-candle digit configurator: which category/accessory it's editing,
  // and the digits chosen so far (ordered).
  const [numberModal, setNumberModal] = useState<{ catKey: string; accValue: string; price: number } | null>(null);
  const [draftDigits, setDraftDigits] = useState<string[]>([]);

  // Quantity is carried over from the product page's stepper. Read straight
  // from the URL rather than via useSearchParams, which would force a Suspense
  // boundary at build time (same reason as the login page).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = Number(params.get("qty"));
    if (Number.isFinite(raw) && raw > 0) {
      setQty(Math.min(99, Math.max(1, Math.trunc(raw))));
    }
    setSizeParam(params.get("size"));
  }, []);

  // Purchasing requires a signed-in customer — including when someone lands on
  // this URL directly. They come straight back here afterwards.
  useEffect(() => {
    if (!authReady || user) return;
    router.replace(loginHrefFor(`/customize/${slug}${window.location.search}`));
  }, [authReady, user, router, slug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = createClient() as unknown as SupabaseClient;
      const { data } = await db
        .from("products")
        .select("id,name,price,image_url,category,in_stock,is_customizable")
        .order("sort_order", { ascending: true });
      if (cancelled) return;

      const rows = (data ?? []) as {
        id: string;
        name: string;
        price: number;
        image_url: string | null;
        category: string | null;
        in_stock: boolean | null;
        is_customizable: boolean | null;
      }[];
      const match = rows.find((r) => slugify(r.name) === slug) ?? null;

      setProduct(
        match && {
          id: match.id,
          name: match.name,
          category: match.category ?? "",
          price: Number(match.price) || 0,
          image: match.image_url || FALLBACK_IMAGE,
          in_stock: match.in_stock ?? true,
          is_customizable: match.is_customizable ?? false,
        },
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Resolve ?size=<id> against this product's variants. All of them are read,
  // not just the requested one, so a wizard reached WITHOUT a size (or with one
  // that has since been deleted) falls back to the product's DEFAULT VARIANT —
  // the same variant its card advertised and the same one the server charges
  // (lib/basket-pricing) — instead of silently dropping to the base price.
  // Own try/catch so a database without `product_sizes` leaves the base price.
  useEffect(() => {
    if (!product) {
      setSize(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const db = createClient() as unknown as SupabaseClient;
        const { data, error } = await db
          .from("product_sizes")
          .select("id,label,price,sort_order")
          .eq("product_id", product.id);
        if (cancelled) return;
        const rows = error || !Array.isArray(data) ? [] : (data as SizeLike[]);
        const chosen = selectedSizeOf(rows, sizeParam);
        setSize(
          chosen
            ? {
                id: String(chosen.id),
                label: String(chosen.label),
                price: Number(chosen.price) || 0,
              }
            : null,
        );
      } catch {
        if (!cancelled) setSize(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product, sizeParam]);

  // Accessories, the cake message and the whole wizard belong to CAKES only —
  // decided by the product's category, never its name (see isCakeCategory).
  // Cupcakes and everything else fall through to the minimal add-to-basket view.
  const isCake = useMemo(
    () => (product ? isCakeCategory(product.category) : false),
    [product],
  );

  // The accessory categories offered for THIS cake — every one made OPTIONAL.
  // "None" stays the default (from defaultSelections) and no accessory or cake
  // message is ever forced, so the customer can go straight to the basket.
  // Pricing is untouched: priceSelections/summarize ignore `required` entirely.
  const categories: AccessoryCategory[] = useMemo(() => {
    if (!product || !isCake) return [];
    return categoriesForProduct(config.categories, product.category).map(
      (cat) => ({ ...cat, required: false }),
    );
  }, [config.categories, product, isCake]);

  // Open with every category's configured default.
  useEffect(() => {
    if (seeded || categories.length === 0) return;
    setSelections(defaultSelections(categories));
    setSeeded(true);
  }, [categories, seeded]);

  // The full accessories experience shows only for a cake that actually has
  // accessory categories configured. Anything else (cupcakes, brownies, or a
  // cake whose accessories were all disabled) renders the minimal add-to-basket
  // view below instead of the wizard — no redirect, no empty accessories page.
  const showFull = isCake && categories.length > 0;

  // A size variant's price is absolute — it replaces the base product price
  // everywhere on this page, so the total matches what the product page showed.
  const basePrice = size ? size.price : product?.price ?? 0;

  const shown = useMemo(
    () => visibleCategories(categories, selections),
    [categories, selections],
  );
  const addons = useMemo(
    () => priceSelections(categories, selections),
    [categories, selections],
  );
  const summary = useMemo(
    () => buildCustomization(categories, selections),
    [categories, selections],
  );

  // Re-validate as they fix things, but only once they've tried to continue —
  // nobody wants to be shouted at before they've filled anything in.
  useEffect(() => {
    if (!submitted) return;
    setErrors(validateSelections(categories, selections).errors);
  }, [submitted, categories, selections]);

  // `Selections[string]`, not `Selection` — the latter is a DOM global.
  function update(key: string, patch: Partial<Selections[string]>) {
    setSelections((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function toggleCheckbox(key: string, value: string, on: boolean) {
    setSelections((prev) => {
      const current = prev[key]?.values ?? [];
      const values = on
        ? Array.from(new Set([...current, value]))
        : current.filter((v) => v !== value);
      return { ...prev, [key]: { ...prev[key], values } };
    });
  }

  function setQuantity(key: string, value: string, next: number) {
    setSelections((prev) => {
      const quantities = { ...(prev[key]?.quantities ?? {}) };
      if (next <= 0) delete quantities[value];
      else quantities[value] = next;
      return { ...prev, [key]: { ...prev[key], quantities } };
    });
  }

  // ---- Number-candle digit configurator ----
  function openNumberModal(cat: AccessoryCategory, acc: Accessory) {
    setDraftDigits((selections[cat.key]?.digits ?? "").replace(/\D/g, "").split("").filter(Boolean));
    setNumberModal({ catKey: cat.key, accValue: acc.value, price: acc.price });
  }
  function addDigit(d: string) {
    setDraftDigits((prev) => (prev.length >= MAX_CANDLE_DIGITS ? prev : [...prev, d]));
  }
  function removeDigit(i: number) {
    setDraftDigits((prev) => prev.filter((_, idx) => idx !== i));
  }
  /** Pick a choice option; open the configurator when it's a number candle,
   *  and always clear any previous digits when switching to a plain option. */
  function chooseCandle(cat: AccessoryCategory, acc: Accessory) {
    if (isNumberCandle(acc)) {
      update(cat.key, { values: [acc.value] });
      openNumberModal(cat, acc);
    } else {
      update(cat.key, { values: [acc.value], digits: "" });
    }
  }
  function confirmNumber() {
    if (numberModal) update(numberModal.catKey, { digits: draftDigits.join("") });
    setNumberModal(null);
  }

  // ---- Skip an accessory section ----
  /** Smooth-scroll (~300ms, native) to the section after `key`, or to the order
   *  summary when it's the last one. Deferred a frame so any state change that
   *  reflows the sections lands first; a missing target is a safe no-op. */
  function scrollToNext(key: string) {
    const idx = shown.findIndex((c) => c.key === key);
    const next = idx >= 0 ? shown[idx + 1] : undefined;
    const targetId = next ? `cat-${next.key}` : "order-summary";
    requestAnimationFrame(() => {
      const el =
        document.getElementById(targetId) ??
        document.getElementById("order-summary");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /** "Skip Accessories →": reset this category to its zero-cost "None" state
   *  (accessory total stays £0, "None" stays selected) and glide to the next
   *  section. Never validates or blocks — skipping always moves the flow on. */
  function skipCategory(cat: AccessoryCategory) {
    if (cat.displayType === "toggle") {
      update(cat.key, { enabled: false });
    } else if (cat.displayType === "quantity") {
      update(cat.key, { quantities: {} });
    } else if (cat.displayType === "checkbox") {
      update(cat.key, { values: [] });
    } else {
      // radio / dropdown must always hold one value — pick the explicit free
      // "None" option so nothing is charged and the control never blanks.
      const none =
        cat.accessories.find((a) => a.value === "none") ??
        cat.accessories.find((a) => a.price === 0 && a.isDefault) ??
        cat.accessories.find((a) => a.price === 0) ??
        cat.accessories[0];
      if (none) update(cat.key, { values: [none.value], digits: "" });
    }
    scrollToNext(cat.key);
  }

  function handleContinue() {
    if (!product) return;

    // The chosen size (when the product page sent one) keeps each size its own
    // cart line and carries the identity the server re-prices from.
    const sizeLine = size ? { sizeId: size.id, sizeLabel: size.label } : {};
    const sizedId = sizedCartLineId(product.id, size?.id);

    // Non-cake (or a cake with nothing to customize): add the plain product and
    // go — no accessories, no message, no validation. Identical line shape to
    // the menu page's straight-to-checkout path, so pricing is unchanged.
    if (!showFull) {
      addItem(
        {
          id: sizedId,
          productId: product.id,
          name: product.name,
          price: basePrice,
          image: product.image,
          category: product.category,
          slug,
          ...sizeLine,
        },
        qty,
      );
      router.push("/checkout");
      return;
    }

    setSubmitted(true);

    const result = validateSelections(categories, selections);
    if (!result.ok) {
      setErrors(result.errors);
      // Take them to the first thing that needs fixing.
      const firstKey = shown.find((c) => result.errors[c.key])?.key;
      if (firstKey) {
        document
          .getElementById(`cat-${firstKey}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    const customization = buildCustomization(categories, selections);
    addItem(
      {
        // A distinct line per distinct customization: two cakes with different
        // candles must not collapse into one line of quantity 2. The size is
        // part of that identity too, so Small and Large stay separate lines.
        id: cartLineId(sizedId, customization.selections),
        productId: product.id,
        name: product.name,
        price: basePrice,
        image: product.image,
        category: product.category,
        slug,
        ...sizeLine,
        addons: customization.total,
        customization,
      },
      qty,
    );
    router.push("/checkout");
  }

  if (loading || configLoading || !authReady || !user) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-dustyrose border-t-wine" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-darkberry">
          We couldn&apos;t find that cake
        </h1>
        <Link
          href="/menu"
          className="rounded-full bg-wine px-6 py-3 text-sm font-semibold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
        >
          Back to menu
        </Link>
      </div>
    );
  }

  const lineTotal = (basePrice + addons) * qty;

  // ---- Minimal view: non-cake products (cupcakes, brownies, …) ----
  // Only the product image, a quantity selector, the price and Add to Basket —
  // no accessories, no candle/sparkler/number/magic candle selectors, and no
  // cake message. The order summary sits on its own, nothing left empty beside
  // it. Add to Basket adds the plain product, exactly as the menu page does.
  if (!showFull) {
    return (
      <div className="pb-24 pt-6">
        <div className="container max-w-md">
          <Link
            href={`/menu/${slug}`}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-wine-dark transition-colors hover:text-wine"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to {product.name}
          </Link>

          <div className="rounded-clay bg-[#F9EEEA] p-6 shadow-clay-sm">
            {/* Product image */}
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl">
              <Image
                src={product.image}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 448px"
                className="object-cover"
              />
            </div>

            <h1 className="mt-4 font-display text-2xl font-bold text-darkberry">
              {product.name}
            </h1>
            <p className="mt-1 text-berry">
              {size ? `${size.label} · ` : ""}
              {money(basePrice)} each
            </p>

            {/* Quantity */}
            <div className="mt-5 flex items-center justify-between">
              <span className="text-sm font-semibold text-darkberry">Quantity</span>
              <div className="flex items-center gap-2 rounded-full bg-blush-50 p-1 shadow-clay-sm">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="grid h-8 w-8 place-items-center rounded-full text-wine-dark transition-transform active:scale-90"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center font-display font-bold text-darkberry">
                  {qty}
                </span>
                <button
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  aria-label="Increase quantity"
                  className="grid h-8 w-8 place-items-center rounded-full text-wine-dark transition-transform active:scale-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Price */}
            <div className="mt-5 flex items-center justify-between border-t border-dustyrose/40 pt-4">
              <span className="font-bold text-darkberry">Total</span>
              <span className="font-display text-lg font-bold text-wine-dark">
                {money(lineTotal)}
              </span>
            </div>

            <button
              onClick={handleContinue}
              disabled={!product.in_stock}
              className="mt-5 w-full rounded-full bg-wine py-3.5 text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {product.in_stock ? "Add to basket" : "Currently unavailable"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 pt-6">
      <div className="container max-w-5xl">
        <Link
          href={`/menu/${slug}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-wine-dark transition-colors hover:text-wine"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to {product.name}
        </Link>

        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-wine" />
          <h1 className="font-display text-3xl font-bold text-darkberry md:text-4xl">
            Make it yours
          </h1>
        </div>
        <p className="mt-2 text-berry">
          A few finishing touches for your {product.name.toLowerCase()}.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
          {/* ---- Left: the accessory categories, straight from the database ---- */}
          <div className="space-y-5">
            {shown.map((cat) => {
              const sel = selections[cat.key] ?? {};
              const error = errors[cat.key];
              return (
                <motion.section
                  key={cat.key}
                  id={`cat-${cat.key}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={`scroll-mt-28 rounded-clay bg-blush-50 p-6 shadow-clay-sm ${
                    error ? "ring-2 ring-red-400" : ""
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-darkberry">
                        {cat.name}
                        {cat.required && (
                          <span className="ml-1.5 text-sm text-wine">*</span>
                        )}
                      </h2>
                      {cat.description && (
                        <p className="mt-0.5 text-sm text-berry">{cat.description}</p>
                      )}
                    </div>
                    {/* Right cluster: any category-level price, plus a subtle
                        "Skip Accessories →". Desktop: top-right. Mobile: below the
                        title (the header stacks). Text/message sections aren't an
                        accessory to skip, so they don't get the button. */}
                    <div className="flex shrink-0 items-center gap-3">
                      {(cat.displayType === "toggle" ||
                        cat.displayType === "text" ||
                        cat.displayType === "textarea") &&
                        cat.price > 0 && <PriceTag price={cat.price} />}
                      {cat.displayType !== "text" &&
                        cat.displayType !== "textarea" && (
                          <button
                            type="button"
                            onClick={() => skipCategory(cat)}
                            className="inline-flex items-center gap-1 py-1 text-xs font-semibold uppercase tracking-wide text-berry/80 underline-offset-4 transition-colors hover:text-wine-dark hover:underline"
                          >
                            Skip Accessories
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                    </div>
                  </div>

                  <div className="mt-4">
                    {/* RADIO */}
                    {cat.displayType === "radio" && (
                      <div className="space-y-2">
                        {cat.accessories.map((acc) => {
                          const checked = (sel.values ?? []).includes(acc.value);
                          const numberChosen = isNumberCandle(acc) && checked;
                          const chosenDigits = (sel.digits ?? "").replace(/\D/g, "");
                          return (
                            <div key={acc.value}>
                              <label
                                className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors ${
                                  checked
                                    ? "border-wine bg-wine/5"
                                    : "border-dustyrose/40 hover:bg-dustyrose-light/30"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={cat.key}
                                  className="h-4 w-4 accent-[#873853]"
                                  checked={checked}
                                  onChange={() => chooseCandle(cat, acc)}
                                />
                                <Thumb accessory={acc} />
                                <span className="flex-1">
                                  <span className="block text-sm font-semibold text-darkberry">
                                    {acc.name}
                                  </span>
                                  {acc.description && (
                                    <span className="block text-xs text-berry">
                                      {acc.description}
                                    </span>
                                  )}
                                </span>
                                <PriceTag price={acc.price} />
                              </label>

                              {/* Number-candle: show the chosen digits + edit. */}
                              {numberChosen && (
                                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-dustyrose-light/30 px-3 py-2">
                                  <span className="text-xs font-semibold uppercase tracking-wide text-wine-dark">
                                    Number
                                  </span>
                                  {chosenDigits ? (
                                    <span className="flex gap-1">
                                      {chosenDigits.split("").map((d, di) => (
                                        <span
                                          key={di}
                                          className="grid h-7 w-6 place-items-center rounded-lg bg-wine text-sm font-bold text-blush-50"
                                        >
                                          {d}
                                        </span>
                                      ))}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-berry">No digits chosen yet</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openNumberModal(cat, acc)}
                                    className="ml-auto rounded-full bg-wine px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-blush-50 transition-colors hover:bg-wine-dark"
                                  >
                                    {chosenDigits ? "Edit number" : "Choose number"}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* DROPDOWN */}
                    {cat.displayType === "dropdown" && (
                      <select
                        className={INPUT}
                        value={(sel.values ?? [])[0] ?? ""}
                        onChange={(e) => {
                          const acc = cat.accessories.find((a) => a.value === e.target.value);
                          if (acc) chooseCandle(cat, acc);
                          else update(cat.key, { values: [e.target.value], digits: "" });
                        }}
                      >
                        {cat.accessories.map((acc) => (
                          <option key={acc.value} value={acc.value}>
                            {acc.name}
                            {acc.price > 0 ? ` (+${money(acc.price)})` : ""}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* CHECKBOX / MULTI-SELECT */}
                    {cat.displayType === "checkbox" && (
                      <div className="space-y-2">
                        {cat.accessories.map((acc) => {
                          const checked = (sel.values ?? []).includes(acc.value);
                          return (
                            <label
                              key={acc.value}
                              className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors ${
                                checked
                                  ? "border-wine bg-wine/5"
                                  : "border-dustyrose/40 hover:bg-dustyrose-light/30"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded accent-[#873853]"
                                checked={checked}
                                onChange={(e) =>
                                  toggleCheckbox(cat.key, acc.value, e.target.checked)
                                }
                              />
                              <Thumb accessory={acc} />
                              <span className="flex-1">
                                <span className="block text-sm font-semibold text-darkberry">
                                  {acc.name}
                                </span>
                                {acc.description && (
                                  <span className="block text-xs text-berry">
                                    {acc.description}
                                  </span>
                                )}
                              </span>
                              <PriceTag price={acc.price} />
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* QUANTITY SELECTOR — one stepper per accessory */}
                    {cat.displayType === "quantity" && (
                      <div className="space-y-2">
                        {cat.accessories.map((acc) => {
                          const current = sel.quantities?.[acc.value] ?? 0;
                          const max = Math.min(acc.maxQty, cat.maxQty);
                          return (
                            <div
                              key={acc.value}
                              className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors ${
                                current > 0
                                  ? "border-wine bg-wine/5"
                                  : "border-dustyrose/40"
                              }`}
                            >
                              <Thumb accessory={acc} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-darkberry">
                                  {acc.name}
                                </span>
                                <span className="block text-xs text-berry">
                                  {acc.price > 0 ? `${money(acc.price)} each` : "Free"}
                                  {acc.description ? ` · ${acc.description}` : ""}
                                </span>
                              </span>

                              <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-blush-50 p-1 shadow-clay-sm">
                                <button
                                  type="button"
                                  aria-label={`One fewer ${acc.name}`}
                                  disabled={current <= 0}
                                  onClick={() =>
                                    setQuantity(cat.key, acc.value, current - 1)
                                  }
                                  className="grid h-8 w-8 place-items-center rounded-full text-wine-dark transition-transform active:scale-90 disabled:opacity-30"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-5 text-center text-sm font-bold text-darkberry">
                                  {current}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`One more ${acc.name}`}
                                  disabled={current >= max}
                                  onClick={() =>
                                    setQuantity(cat.key, acc.value, current + 1)
                                  }
                                  className="grid h-8 w-8 place-items-center rounded-full text-wine-dark transition-transform active:scale-90 disabled:opacity-30"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* TOGGLE */}
                    {cat.displayType === "toggle" && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!sel.enabled}
                        onClick={() => update(cat.key, { enabled: !sel.enabled })}
                        className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 transition-colors ${
                          sel.enabled
                            ? "border-wine bg-wine/5"
                            : "border-dustyrose/40 hover:bg-dustyrose-light/30"
                        }`}
                      >
                        <span className="text-sm font-semibold text-darkberry">
                          {sel.enabled ? "Yes please" : "No thanks"}
                        </span>
                        <span
                          className={`relative h-6 w-11 rounded-full transition-colors ${
                            sel.enabled ? "bg-wine" : "bg-dustyrose/60"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                              sel.enabled ? "left-[22px]" : "left-0.5"
                            }`}
                          />
                        </span>
                      </button>
                    )}

                    {/* TEXT / TEXTAREA */}
                    {(cat.displayType === "text" ||
                      cat.displayType === "textarea") && (
                      <>
                        {cat.displayType === "text" ? (
                          <input
                            className={INPUT}
                            value={sel.text ?? ""}
                            maxLength={cat.maxChars ?? undefined}
                            placeholder={cat.placeholder ?? ""}
                            onChange={(e) => update(cat.key, { text: e.target.value })}
                          />
                        ) : (
                          <textarea
                            className={INPUT}
                            rows={3}
                            value={sel.text ?? ""}
                            maxLength={cat.maxChars ?? undefined}
                            placeholder={cat.placeholder ?? ""}
                            onChange={(e) => update(cat.key, { text: e.target.value })}
                          />
                        )}
                        {cat.maxChars && (
                          <p className="mt-1.5 text-right text-xs text-berry">
                            {(sel.text ?? "").length}/{cat.maxChars}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {error && (
                    <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>
                  )}
                </motion.section>
              );
            })}
          </div>

          {/* ---- Right: live summary — Cake, Accessories, Prices, Grand total ---- */}
          <aside
            id="order-summary"
            className="h-fit scroll-mt-28 rounded-clay bg-[#F9EEEA] p-6 shadow-clay-sm lg:sticky lg:top-28"
          >
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold text-darkberry">
                  {product.name}
                </p>
                <p className="text-xs text-berry">
                  {size ? `${size.label} · ` : ""}
                  {money(basePrice)} each
                </p>
              </div>
            </div>

            {/* Quantity */}
            <div className="mt-5 flex items-center justify-between">
              <span className="text-sm font-semibold text-darkberry">Quantity</span>
              <div className="flex items-center gap-2 rounded-full bg-blush-50 p-1 shadow-clay-sm">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="grid h-8 w-8 place-items-center rounded-full text-wine-dark transition-transform active:scale-90"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center font-display font-bold text-darkberry">
                  {qty}
                </span>
                <button
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  aria-label="Increase quantity"
                  className="grid h-8 w-8 place-items-center rounded-full text-wine-dark transition-transform active:scale-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <dl className="mt-5 space-y-1.5 border-t border-dustyrose/40 pt-4 text-sm">
              <div className="flex justify-between text-berry">
                <dt>Cake</dt>
                <dd className="font-semibold text-darkberry">
                  {money(basePrice * qty)}
                </dd>
              </div>
              {summary.lines.map((line, i) => (
                <div
                  key={`${line.key}-${line.value}-${i}`}
                  className="flex justify-between gap-2 text-berry"
                >
                  <dt className="min-w-0 truncate">
                    {line.label}
                    <span className="text-berry/70">
                      {" · "}
                      {line.value}
                      {line.quantity && line.quantity > 1 ? ` × ${line.quantity}` : ""}
                    </span>
                  </dt>
                  <dd className="shrink-0 font-semibold text-darkberry">
                    {line.price > 0 ? money(line.price * qty) : "Free"}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-dustyrose/40 pt-2">
                <dt className="font-bold text-darkberry">Total</dt>
                <dd className="font-display text-lg font-bold text-wine-dark">
                  {money(lineTotal)}
                </dd>
              </div>
            </dl>

            <button
              onClick={handleContinue}
              disabled={!product.in_stock}
              className="mt-5 w-full rounded-full bg-wine py-3.5 text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {product.in_stock ? "Add to basket" : "Currently unavailable"}
            </button>

            {submitted && Object.keys(errors).length > 0 && (
              <p className="mt-3 text-center text-xs font-semibold text-red-600">
                Please check the highlighted options above.
              </p>
            )}
          </aside>
        </div>
      </div>

      {/* ---- Number-candle digit configurator ---- */}
      {numberModal && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-darkberry/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setNumberModal(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-clay bg-blush-50 p-6 shadow-clay"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold text-darkberry">
                  Number candle
                </h3>
                <p className="mt-0.5 text-sm text-berry">
                  Tap digits to build the age or number.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNumberModal(null)}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-dustyrose-light/60 text-wine-dark transition-colors hover:bg-dustyrose-light"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            {/* Live preview */}
            <div className="mt-5 min-h-[64px] rounded-2xl border-2 border-dashed border-dustyrose/50 bg-white/50 p-3">
              {draftDigits.length === 0 ? (
                <p className="grid h-full place-items-center py-3 text-center text-sm text-berry">
                  Your number will appear here
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {draftDigits.map((d, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => removeDigit(i)}
                      title="Remove this digit"
                      className="group relative grid h-12 w-10 place-items-center rounded-xl bg-wine text-lg font-bold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
                    >
                      {d}
                      <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-darkberry text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        ✕
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quantity + price */}
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-darkberry">
                Quantity: {draftDigits.length} {draftDigits.length === 1 ? "candle" : "candles"}
              </span>
              <span className="font-semibold text-wine-dark">
                {draftDigits.length > 0
                  ? `+${money(numberModal.price * draftDigits.length)}`
                  : "—"}
              </span>
            </div>

            {/* Digit pad 0-9 */}
            <div className="mt-4 grid grid-cols-5 gap-2">
              {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => addDigit(d)}
                  disabled={draftDigits.length >= MAX_CANDLE_DIGITS}
                  className="grid h-12 place-items-center rounded-xl border-2 border-dustyrose/50 bg-white text-lg font-bold text-darkberry transition-colors hover:border-wine hover:bg-wine/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDraftDigits([])}
                disabled={draftDigits.length === 0}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-wine-dark transition-colors hover:bg-dustyrose-light/40 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={confirmNumber}
                className="ml-auto flex-1 rounded-full bg-wine py-3 text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5"
              >
                Continue
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
