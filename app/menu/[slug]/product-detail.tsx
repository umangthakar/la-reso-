"use client";

// ============================================================
// Le Rasa Bakery — product detail page (/menu/[slug])
// Slug is derived from the product name (see lib/slug). Fetches the
// public catalogue with the anon client, resolves the product, and
// shows related items from the same category.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import {
  Star,
  Plus,
  Minus,
  ShoppingCart,
  Zap,
  ChevronLeft,
  ChevronDown,
  Leaf,
  MessageCircle,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useCart } from "@/components/cart/cart-context";
import { slugify } from "@/lib/slug";
import { money } from "@/lib/pricing";
import {
  PRODUCT_SIZES_EMBED,
  defaultSizeOf,
  displayPriceOf,
  orderedSizes,
  selectedSizeOf,
  sizedCartLineId,
  type SizeLike,
} from "@/lib/product-pricing";
import { formatSizeLabel } from "@/lib/size-label";
import { useActiveOffer } from "@/lib/use-active-offer";
import { usePurchaseGate } from "@/lib/use-purchase-gate";
import { useCustomization } from "@/lib/use-customization";
import { useSiteSettings } from "@/lib/use-site-settings";
import { isCustomCakeCategory, isCakeCategory, customCakeWhatsappHref } from "@/lib/custom-cake";
import { consumePurchaseIntent, peekPurchaseIntent } from "@/lib/purchase-intent";
import { PriceText } from "@/components/product-price";
import {
  normalizeNutrition,
  normalizeSizeNutrition,
  normalizeCustomNutrition,
  resolveNutrition,
  hasNutrition,
  emptyNutrition,
  type NutritionData,
  type NutritionCustomRow,
} from "@/lib/nutrition";
import { resolveIngredientIcons } from "@/lib/ingredient-icons";
import { sanitizeIngredientsRich, isIngredientsRichEmpty } from "@/lib/ingredients-rich";
import IngredientIconList from "@/components/ingredient-icon-list";
import ProductTrustBadges from "@/components/product-trust-badges";
import ProductNutrition from "@/components/product-nutrition";

type DetailProduct = {
  id: string;
  name: string;
  category: string;
  /** The BASE product price (products.price). What the page actually shows is
   *  `displayPrice` below — the default variant's price when there are sizes. */
  price: number;
  /** What this product costs at a glance: the DEFAULT VARIANT's price when it
   *  has sizes, else the base price. Identical rule to every product card, so
   *  the related tiles here and the cards elsewhere quote the same number. */
  displayPrice: number;
  image: string;
  description: string;
  allergens: string | null;
  badge: string | null;
  in_stock: boolean;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80";

type SupaRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
  badge: string | null;
  allergens: string | null;
  in_stock: boolean | null;
  /** Embedded size variants; absent when product_sizes isn't migrated. */
  product_sizes?: SizeLike[] | null;
};

function toDetail(r: SupaRow): DetailProduct {
  return {
    id: r.id,
    name: r.name,
    category: r.category ?? "",
    price: Number(r.price) || 0,
    displayPrice: displayPriceOf(r.price, r.product_sizes),
    image: r.image_url || FALLBACK_IMAGE,
    description: r.description ?? "",
    allergens: r.allergens,
    badge: r.badge,
    in_stock: r.in_stock ?? true,
  };
}

// A size variant (Small / Medium / Large …). Empty for products with a
// single price — those keep behaving exactly as before.
type SizeVariant = {
  id: string;
  label: string;
  serves: number | null;
  price: number;
  /** Carried so the shared ordering rule (lib/product-pricing) can resolve the
   *  default variant from this list exactly as the cards resolve it. */
  sort_order: number;
  /** This size's own nutrition table, loaded with the size itself so switching
   *  size swaps the table with no extra request. Null = inherit the product's. */
  nutrition: NutritionData | null;
};

function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full;
        const isHalf = !filled && i === full && half;
        return (
          <span key={i} className="relative inline-block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-amber-400/40" strokeWidth={1.5} />
            {(filled || isHalf) && (
              <Star
                className="absolute inset-0 h-4 w-4 fill-amber-400 text-amber-400"
                strokeWidth={1.5}
                style={isHalf ? { clipPath: "inset(0 50% 0 0)" } : undefined}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const router = useRouter();
  const { addItem, openCart } = useCart();
  const { offers: activeOffers } = useActiveOffer();
  const { requireAuth, user, ready: authReady } = usePurchaseGate();
  const { isCustomizable, loading: configLoading } = useCustomization();
  const { settings } = useSiteSettings();

  const [products, setProducts] = useState<DetailProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);

  // Product extras (gallery, size variants, ingredients). Loaded once the
  // product resolves; all degrade to empty if 26_product_variants.sql hasn't
  // been run, so old products keep working unchanged.
  const [gallery, setGallery] = useState<string[]>([]);
  const [activeImage, setActiveImage] = useState(0);
  const [sizes, setSizes] = useState<SizeVariant[]>([]);
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientsRich, setIngredientsRich] = useState<string>("");
  const [ingredientIcons, setIngredientIcons] = useState<string[]>([]);
  const [ingredientsOpen, setIngredientsOpen] = useState(false);
  const [nutrition, setNutrition] = useState<NutritionData | null>(null);
  const [nutritionCustom, setNutritionCustom] = useState<NutritionCustomRow[]>([]);
  // Flips true once the extras (esp. sizes) have loaded for this product, so a
  // resumed "Buy Now" can restore the exact size the customer had chosen.
  const [extrasReady, setExtrasReady] = useState(false);

  // A "Buy Now" the customer started before signing in leaves a pending
  // intent behind. Note it on mount (before the catalogue arrives) so the
  // spinner stays up while we replay it, instead of flashing the product.
  const [resuming, setResuming] = useState(false);
  const resumed = useRef(false);

  useEffect(() => {
    const pending = peekPurchaseIntent();
    if (pending && pending.action === "buy-now") setResuming(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = createClient() as unknown as SupabaseClient;
      // Sizes are embedded so the "You might also love" tiles can quote each
      // product's default variant, like every other card on the site. This
      // product's OWN sizes are still loaded separately below (it needs their
      // serves + nutrition too). Retry without the embed keeps a database
      // without product_sizes working unchanged.
      const base =
        "id,name,description,price,image_url,category,badge,allergens,in_stock";
      const read = (cols: string) =>
        db.from("products").select(cols).order("sort_order", { ascending: true });
      let res = await read(`${base},${PRODUCT_SIZES_EMBED}`);
      if (res.error) res = await read(base);
      if (cancelled) return;
      setProducts(
        res.error || !Array.isArray(res.data)
          ? []
          : (res.data as unknown as SupaRow[]).map(toDetail),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const product = useMemo(
    () => products.find((p) => slugify(p.name) === slug) ?? null,
    [products, slug],
  );

  const related = useMemo(() => {
    if (!product) return [];
    return products
      .filter((p) => p.category === product.category && p.id !== product.id)
      .slice(0, 3);
  }, [products, product]);

  // Load the product's extras once it resolves: gallery images, size variants
  // and ingredients. Each reads with the public anon client (RLS allows public
  // SELECT on product_images / product_sizes) and each is wrapped so a missing
  // table/column (26_product_variants.sql not run) simply leaves that extra
  // empty — old single-image, single-price products keep working unchanged.
  const productId = product?.id;
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setActiveImage(0);
    setExtrasReady(false);
    (async () => {
      const db = createClient() as unknown as SupabaseClient;

      try {
        const { data, error } = await db
          .from("product_images")
          .select("url,sort_order,is_primary")
          .eq("product_id", productId)
          .order("sort_order", { ascending: true });
        if (!cancelled) {
          const urls =
            !error && Array.isArray(data)
              ? data.map((r) => String(r.url)).filter(Boolean)
              : [];
          setGallery(urls);
        }
      } catch {
        if (!cancelled) setGallery([]);
      }

      try {
        // Each size's nutrition rides along with the size itself — one query,
        // so switching size later is a pure re-render with no fetch. If the
        // `nutrition` column isn't there yet (42_size_nutrition.sql not run)
        // we retry without it and the product-level table is used as before.
        const base = "id,label,serves,price,sort_order";
        const read = (cols: string) =>
          db
            .from("product_sizes")
            .select(cols)
            .eq("product_id", productId)
            .order("sort_order", { ascending: true });
        let res = await read(`${base},nutrition`);
        if (res.error) res = await read(base);
        const { data, error } = res;
        if (!cancelled) {
          // orderedSizes() — not the query's order alone — decides which size is
          // FIRST, because that first size is the default the page opens on and
          // the one the cards advertise. Sharing the ordering rule is what stops
          // the two from ever picking different variants.
          const list: SizeVariant[] = orderedSizes(
            !error && Array.isArray(data)
              ? (data as unknown as (Record<string, unknown> & SizeLike)[])
              : [],
          ).map((r) => ({
            id: String(r.id),
            label: String(r.label),
            serves:
              r.serves === null || r.serves === undefined ? null : Number(r.serves),
            price: Number(r.price) || 0,
            sort_order: Number(r.sort_order) || 0,
            nutrition: normalizeSizeNutrition(r.nutrition),
          }));
          setSizes(list);
          setSelectedSizeId(defaultSizeOf(list)?.id ?? null);
        }
      } catch {
        if (!cancelled) {
          setSizes([]);
          setSelectedSizeId(null);
        }
      }

      try {
        const { data } = await db
          .from("products")
          .select("ingredients")
          .eq("id", productId)
          .maybeSingle();
        if (!cancelled) {
          const raw = (data as { ingredients?: unknown } | null)?.ingredients;
          setIngredients(
            Array.isArray(raw)
              ? raw.map((x) => String(x ?? "").trim()).filter(Boolean)
              : [],
          );
        }
      } catch {
        if (!cancelled) setIngredients([]);
      }

      // Rich-text ingredients description — own read/try so a missing
      // `ingredients_rich` column (30 migration not run) leaves it empty and
      // the storefront falls back to the plain tag list above.
      try {
        const { data, error } = await db
          .from("products")
          .select("ingredients_rich")
          .eq("id", productId)
          .maybeSingle();
        if (!cancelled) {
          setIngredientsRich(
            error
              ? ""
              : sanitizeIngredientsRich(
                  (data as { ingredients_rich?: unknown } | null)?.ingredients_rich,
                ),
          );
        }
      } catch {
        if (!cancelled) setIngredientsRich("");
      }

      // Ingredient icon keys — own read/try so a missing `ingredient_icons`
      // column (30 migration not run) leaves it empty (no icons shown).
      try {
        const { data, error } = await db
          .from("products")
          .select("ingredient_icons")
          .eq("id", productId)
          .maybeSingle();
        if (!cancelled) {
          const raw = error
            ? []
            : (data as { ingredient_icons?: unknown } | null)?.ingredient_icons;
          setIngredientIcons(
            Array.isArray(raw) ? raw.map((x) => String(x ?? "").trim()).filter(Boolean) : [],
          );
        }
      } catch {
        if (!cancelled) setIngredientIcons([]);
      }

      // Nutrition — its own read/try so a missing `nutrition` column
      // (28_nutrition.sql not run) leaves it null and the section hidden.
      try {
        const { data, error } = await db
          .from("products")
          .select("nutrition")
          .eq("id", productId)
          .maybeSingle();
        if (!cancelled) {
          setNutrition(
            error ? null : normalizeNutrition((data as { nutrition?: unknown } | null)?.nutrition),
          );
        }
      } catch {
        if (!cancelled) setNutrition(null);
      }

      // Custom nutrition rows — own read/try so a missing `nutrition_custom`
      // column (29_nutrition_custom.sql not run) leaves it empty.
      try {
        const { data, error } = await db
          .from("products")
          .select("nutrition_custom")
          .eq("id", productId)
          .maybeSingle();
        if (!cancelled) {
          setNutritionCustom(
            error
              ? []
              : normalizeCustomNutrition(
                  (data as { nutrition_custom?: unknown } | null)?.nutrition_custom,
                ),
          );
        }
      } catch {
        if (!cancelled) setNutritionCustom([]);
      }

      if (!cancelled) setExtrasReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Replay a "Buy Now" that was interrupted by the login gate: the customer
  // is back on the exact product they clicked, so restore the quantity, add
  // it to the basket and continue straight to checkout.
  useEffect(() => {
    if (!resuming || resumed.current) return;
    // `configLoading` matters: until it settles we don't know whether this is
    // a cake, and a cake must land in the wizard rather than the cart.
    // `extrasReady` matters too: we wait for the sizes to load so a resumed
    // Buy Now restores the exact size the customer picked before logging in.
    if (!authReady || loading || configLoading || !extrasReady) return;

    if (!user || !product || !product.in_stock) {
      // Signed out again, product gone, or sold out while they were away —
      // drop the intent and let the page behave normally.
      setResuming(false);
      return;
    }

    const pending = peekPurchaseIntent();
    const matches =
      !!pending &&
      pending.action === "buy-now" &&
      (pending.productId === product.id || pending.slug === slug);
    if (!matches) {
      setResuming(false);
      return;
    }

    resumed.current = true;
    consumePurchaseIntent();
    const quantity = Math.min(99, Math.max(1, pending!.quantity ?? 1));
    setQty(quantity);

    // Restore the chosen size (stashed as `variant`) if it still exists,
    // otherwise the default variant; its absolute price becomes the line price,
    // mirroring a fresh Buy Now.
    const resumeSize = selectedSizeOf(sizes, pending!.variant);

    // Same fork as a fresh Buy Now: only cakes get customized first. Cupcakes
    // and every other product skip the accessories page (category-gated, so a
    // stray is_customizable flag can't drag a cupcake into the wizard).
    if (isCustomizable(product.id) && isCakeCategory(product.category)) {
      router.push(
        `/customize/${slugify(product.name)}?qty=${quantity}` +
          (resumeSize ? `&size=${encodeURIComponent(resumeSize.id)}` : ""),
      );
      return;
    }
    addItem(
      {
        id: sizedCartLineId(product.id, resumeSize?.id),
        productId: product.id,
        name: product.name,
        price: resumeSize ? resumeSize.price : product.price,
        image: product.image,
        category: product.category,
        slug: slugify(product.name),
        ...(resumeSize
          ? { sizeId: resumeSize.id, sizeLabel: resumeSize.label }
          : {}),
      },
      quantity,
    );
    router.push("/checkout");
  }, [
    resuming,
    authReady,
    loading,
    configLoading,
    extrasReady,
    sizes,
    user,
    product,
    slug,
    addItem,
    isCustomizable,
    router,
  ]);

  if (loading || resuming) {
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
          We couldn&apos;t find that treat
        </h1>
        <p className="text-berry">It may have sold out or been renamed.</p>
        <Link
          href="/menu"
          className="rounded-full bg-wine px-6 py-3 text-sm font-semibold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
        >
          Back to menu
        </Link>
      </div>
    );
  }

  // Every product is shown with a full five-star rating (static display).
  const rating = 5;

  // The chosen size (if the product offers any). Its price is ABSOLUTE and
  // replaces the base product price for pricing, display and the cart line.
  // selectedSizeOf falls back to the DEFAULT variant — the same one the product
  // cards advertise — so the price this page opens on always matches the card
  // the customer clicked.
  const selectedSize = selectedSizeOf(sizes, selectedSizeId);
  const effectivePrice = selectedSize ? selectedSize.price : product.price;

  // Nutrition to render: the SELECTED SIZE's own table when it has one,
  // otherwise the product-level table (so products that had nutrition before
  // sizes gained their own keep showing exactly what they showed). Derived
  // straight from `selectedSizeId`, so picking a size swaps the table on the
  // next render — no refetch, no spinner. Blank cells render as "—".
  //
  // Default rows (blanks filled) are shown first when the section is visible,
  // then any custom rows — those stay per-product and are the same for every
  // size. The section appears when there are default values OR a custom row.
  const activeNutrition = resolveNutrition(selectedSize?.nutrition, nutrition);
  const nutritionRows = activeNutrition ?? emptyNutrition();
  const showNutrition = hasNutrition(activeNutrition) || nutritionCustom.length > 0;

  // Ingredients display: selected icons (shown above the box), plus a rich-text
  // description when set (bold preserved) — otherwise the plain tag list. Fully
  // backward compatible: products with only tags, or with neither, are unchanged.
  const ingredientIconList = resolveIngredientIcons(ingredientIcons);
  const hasRichIngredients = !isIngredientsRichEmpty(ingredientsRich);
  const showIngredients =
    ingredientIconList.length > 0 || hasRichIngredients || ingredients.length > 0;

  // Images to show: the gallery when present, otherwise the single image_url.
  const images = gallery.length > 0 ? gallery : [product.image];
  const heroImage = images[Math.min(activeImage, images.length - 1)] ?? product.image;

  // A product with size variants makes each size its own cart line (so Small
  // and Large don't merge), carrying the size identity + its absolute price.
  const productSlug = slugify(product.name);
  const cartLine = {
    id: sizedCartLineId(product.id, selectedSize?.id),
    productId: product.id,
    name: product.name,
    price: effectivePrice,
    image: product.image,
    category: product.category,
    slug: productSlug,
    ...(selectedSize
      ? { sizeId: selectedSize.id, sizeLabel: selectedSize.label }
      : {}),
  };

  // The accessories page for this product, carrying the quantity AND the size
  // the customer picked here (the wizard re-prices from it, so a Large cake
  // never falls back to the base price).
  const customizeHref =
    `/customize/${productSlug}?qty=${qty}` +
    (selectedSize ? `&size=${encodeURIComponent(selectedSize.id)}` : "");

  // Only a cake is customized before it reaches the basket; cupcakes and every
  // other product keep the existing straight-to-cart flow (category-gated, so a
  // stray is_customizable flag can't open the accessories page).
  const goesToWizard = isCustomizable(product.id) && isCakeCategory(product.category);

  const addToCart = () => {
    if (goesToWizard) {
      router.push(customizeHref);
      return;
    }
    addItem(cartLine, qty);
    openCart();
  };
  // Purchasing requires a signed-in customer: if they aren't, the gate stores
  // this exact product + quantity (and chosen size) and sends them to Google
  // login, and this page replays the Buy Now when they come back.
  //
  // A cake then goes through the customization wizard before the cart; every
  // other product keeps the existing straight-to-checkout flow.
  const buyNow = async () => {
    const allowed = await requireAuth({
      action: "buy-now",
      productId: product.id,
      slug: cartLine.slug,
      variant: selectedSize ? selectedSize.id : null,
      quantity: qty,
      href: `/menu/${cartLine.slug}`,
    });
    if (!allowed) return;
    // Only cakes go through the accessories page; everything else keeps the
    // existing straight-to-checkout flow.
    if (goesToWizard) {
      router.push(customizeHref);
      return;
    }
    addItem(cartLine, qty);
    router.push("/checkout");
  };

  // Products in the "Custom Cakes" category are enquiry-only: no Add to Cart /
  // Buy Now, just a WhatsApp enquiry. Every other category is untouched. The
  // number and message come from the shared helper (admin-configured number).
  const isCustomCake = isCustomCakeCategory(product.category);
  const waHref = customCakeWhatsappHref(settings.contact.whatsapp, product.name);

  return (
    <div className="pb-24 pt-6">
      <div className="container">
        <Link
          href="/menu"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-wine-dark transition-colors hover:text-wine"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to menu
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Image gallery — main image plus a thumbnail strip. Old products
              with a single image_url simply show one image, no thumbnails. */}
          <div>
            <motion.div
              key={heroImage}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative aspect-square w-full overflow-hidden rounded-clay bg-[#F9EEEA] shadow-clay"
            >
              <Image
                src={heroImage}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1024px) 90vw, 45vw"
                className="object-cover"
              />
              {product.badge && (
                <span className="absolute left-4 top-4 rounded-full bg-[#743249] px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
                  {product.badge}
                </span>
              )}
            </motion.div>

            {images.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {images.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setActiveImage(i)}
                    aria-label={`View image ${i + 1}`}
                    aria-current={i === activeImage}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#F9EEEA] shadow-clay-sm transition-all ${
                      i === activeImage
                        ? "ring-2 ring-wine ring-offset-2 ring-offset-blush-50"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <Image
                      src={src}
                      alt={`${product.name} thumbnail ${i + 1}`}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Nutrition Information — TABLET + DESKTOP mount. Sits under the
                gallery so it shares the image column's width. Hidden below
                `md`, where the mount inside the details column takes over (see
                below). Rendered only when the product has default values or at
                least one custom row (products with none show nothing — fully
                backward compatible). */}
            {showNutrition && (
              <ProductNutrition
                rows={nutritionRows}
                custom={nutritionCustom}
                className="mt-6 hidden md:block"
              />
            )}
          </div>

          {/* Details */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
            className="flex flex-col"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-berry">
              {product.category}
            </span>
            <h1 className="mt-1.5 font-display text-3xl font-bold leading-tight text-darkberry md:text-4xl">
              {product.name}
            </h1>

            {/* Trust badges — sit between the title and the rating row. The
                eggless claim lives here now, so the rating row no longer
                repeats it. */}
            <ProductTrustBadges className="mt-3" />

            <div className="mt-3 flex items-center gap-2">
              <Stars value={rating} />
              <span className="text-sm font-semibold text-wine-dark">
                {rating.toFixed(1)}
              </span>
            </div>

            <p className="mt-4 font-display text-3xl font-bold text-wine-dark">
              <PriceText
                product={{ ...product, price: effectivePrice }}
                offers={activeOffers}
                badge
              />
            </p>

            <p className="mt-4 leading-relaxed text-darkberry-light">
              {product.description || "A handcrafted Le Rasa treat, baked fresh."}
            </p>

            {/* Size variants — selecting one updates the price above and the
                cart line. Only shown when the product actually offers sizes. */}
            {sizes.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-wine-dark">
                  Choose a size
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {sizes.map((s) => {
                    const active = s.id === selectedSize?.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSizeId(s.id)}
                        aria-pressed={active}
                        className={`flex flex-col items-start rounded-2xl border-2 px-4 py-2.5 text-left transition-all ${
                          active
                            ? "border-wine bg-wine/10 text-darkberry"
                            : "border-dustyrose/50 bg-blush-50 text-darkberry-light hover:border-wine/50"
                        }`}
                      >
                        <span className="text-sm font-bold">
                          {formatSizeLabel(s.label)}
                        </span>
                        {s.serves != null && s.serves > 0 && (
                          <span className="text-xs text-berry">
                            Serves {s.serves}
                          </span>
                        )}
                        <span className="mt-0.5 text-sm font-semibold text-wine-dark">
                          {money(s.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ingredients — selected ingredient icons shown ABOVE the box, then
                the box itself: a rich-text description (bold preserved) when the
                admin set one, otherwise the plain tag list. Only rendered when the
                product has any of these, so old products are unaffected. */}
            {showIngredients && (
              <div className="mt-5">
                {/* Ingredient icons (INGREDIENT icons only — never allergens).
                    Minimal monochrome outline icons + labels; see
                    components/ingredient-icon-list. */}
                {ingredientIconList.length > 0 && (
                  <div className="mb-3">
                    <IngredientIconList icons={ingredientIconList} />
                  </div>
                )}

                {(hasRichIngredients || ingredients.length > 0) && (
                  <div className="overflow-hidden rounded-2xl bg-[#F9EEEA] shadow-clay-sm transition-shadow duration-200 hover:shadow-clay">
                    {/* Accordion trigger — real <button> so it's keyboard
                        accessible. Toggles the ingredients body below. The data
                        itself is unchanged; only its visibility is controlled. */}
                    <button
                      type="button"
                      onClick={() => setIngredientsOpen((v) => !v)}
                      aria-expanded={ingredientsOpen}
                      aria-controls="ingredients-panel"
                      className="flex w-full cursor-pointer items-center justify-between gap-2 p-4 text-left"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-wine-dark">
                        <Leaf className="h-4 w-4 shrink-0" />
                        Ingredients
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-wine-dark transition-transform duration-300 ${
                          ingredientsOpen ? "rotate-180" : "rotate-0"
                        }`}
                        aria-hidden="true"
                      />
                    </button>

                    {/* Collapsible body — CSS max-height/opacity transition, no
                        layout jump. Kept in the DOM (hidden) so no CLS. */}
                    <div
                      id="ingredients-panel"
                      className={`grid overflow-hidden transition-all duration-300 ease-in-out ${
                        ingredientsOpen
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="min-h-0">
                        <div className="px-4 pb-4">
                          {hasRichIngredients ? (
                            // Rich formatted ingredients, rendered exactly as entered
                            // (already sanitized to inert formatting tags). Bold preserved.
                            <div
                              className="lr-ingredients-rich text-sm leading-relaxed text-darkberry [&_b]:font-bold [&_strong]:font-bold"
                              dangerouslySetInnerHTML={{ __html: ingredientsRich }}
                            />
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {ingredients.map((ing, i) => (
                                <span
                                  key={`${ing}-${i}`}
                                  className="rounded-full bg-blush-50 px-3 py-1 text-sm text-darkberry shadow-clay-sm"
                                >
                                  {ing}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Nutrition Information — MOBILE mount. Same component as the one
                under the gallery; only one of the two is ever displayed. Below
                `md` the card reads better here, between Ingredients and
                Allergens. */}
            {showNutrition && (
              <ProductNutrition
                rows={nutritionRows}
                custom={nutritionCustom}
                className="mt-5 md:hidden"
              />
            )}

            {product.allergens && (
              <div className="mt-5 flex items-start gap-2 rounded-2xl bg-dustyrose-light/40 p-4">
                <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-wine-dark" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-wine-dark">
                    Allergens
                  </p>
                  <p className="text-sm text-darkberry">{product.allergens}</p>
                </div>
              </div>
            )}

            {/* Quantity + actions */}
            <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 rounded-full bg-[#F9EEEA] p-1.5 shadow-clay-sm">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="grid h-10 w-10 place-items-center rounded-full bg-blush-50 text-wine-dark shadow-clay-sm transition-transform active:scale-90"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-display text-lg font-bold text-darkberry">
                  {qty}
                </span>
                <button
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  aria-label="Increase quantity"
                  className="grid h-10 w-10 place-items-center rounded-full bg-blush-50 text-wine-dark shadow-clay-sm transition-transform active:scale-90"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {product.in_stock ? (
                isCustomCake ? (
                  // Custom Cakes are enquiry-only — a single, full-width
                  // WhatsApp button (no Add to Cart / Buy Now).
                  <div className="flex flex-1">
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-wine px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Contact on WhatsApp
                    </a>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                    <button
                      onClick={addToCart}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-wine px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5"
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Add to Cart
                    </button>
                    <button
                      onClick={buyNow}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-wine/40 bg-transparent px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-wine-dark transition-all hover:bg-wine/10"
                    >
                      <Zap className="h-4 w-4" />
                      Buy Now
                    </button>
                  </div>
                )
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-full bg-dustyrose-light/50 px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-wine-dark">
                  Currently unavailable
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Related products */}
        {related.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-2xl font-bold text-darkberry">
              You might also love
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/menu/${slugify(r.name)}`}
                  className="group flex flex-col overflow-hidden rounded-clay bg-blush-50 shadow-clay-sm transition-shadow hover:shadow-glow"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <Image
                      src={r.image}
                      alt={r.name}
                      fill
                      sizes="(max-width: 640px) 45vw, 30vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 font-display text-sm font-bold text-darkberry">
                      {r.name}
                    </h3>
                    {/* Static five-star display, matching the product cards. */}
                    <span className="mt-1 inline-flex">
                      <Stars value={5} />
                    </span>
                    <span className="mt-2 font-display text-base font-bold text-wine-dark">
                      {money(r.displayPrice)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
