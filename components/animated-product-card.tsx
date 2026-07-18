"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Star, ShoppingCart, Zap, X, ArrowRight, Leaf } from "lucide-react";
import type { Product } from "@/lib/data";
import { useCart } from "@/components/cart/cart-context";
import { slugify } from "@/lib/slug";
import { useActiveOffer, type ActiveOffers } from "@/lib/use-active-offer";
import { usePurchaseGate } from "@/lib/use-purchase-gate";
import { useCustomization } from "@/lib/use-customization";
import { PriceText } from "@/components/product-price";

/* ------------------------------------------------------------------ *
 * Le Rasa — Animated Product Card
 *
 * A three-step reveal built on Framer Motion, triggered on hover
 * (desktop) or tap (touch):
 *
 *   STEP 1 — Initial : minimal blush trapezoid container, image tucked
 *                      to the right, only title + price on the left.
 *   STEP 2 — Slide-in: container elevates & scales; a white details
 *                      panel slides in from the left (half-overhanging
 *                      the container) with a staggered content reveal —
 *                      Title → Rating → Price → Description → Add to Cart.
 *   STEP 3 — Focus   : the product image zooms & takes the right half,
 *                      the backdrop dims, and a price badge, star rating,
 *                      ADD TO CART + BUY NOW surface over the image.
 * ------------------------------------------------------------------ */

// Every product shows a static five-star display (visual only — no review
// system, no calculation), matching the product cards and detail page.
const PRODUCT_RATING = 5;

function StarRow({ value, className = "" }: { value: number; className?: string }) {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.5;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Rated ${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < full;
        const half = !filled && i === full && hasHalf;
        return (
          <span key={i} className="relative inline-block h-4 w-4">
            <Star className="absolute inset-0 h-4 w-4 text-amber-400/40" strokeWidth={1.5} />
            {(filled || half) && (
              <Star
                className="absolute inset-0 h-4 w-4 fill-amber-400 text-amber-400"
                strokeWidth={1.5}
                style={half ? { clipPath: "inset(0 50% 0 0)" } : undefined}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}

/* --- Motion variants (keyed by "closed" / "open", inherited by children) --- */

const container: Variants = {
  closed: {
    scale: 1,
    boxShadow:
      "4px 4px 12px rgba(116, 50, 73, 0.15), -3px -3px 10px rgba(255, 255, 255, 0.65)",
  },
  open: {
    scale: 1.03,
    boxShadow: "0 24px 60px -18px rgba(135, 56, 83, 0.55)",
    // Blueprint — Scale: 0.8s
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
  },
};

// The details panel slides in from the left and orchestrates the
// staggered reveal of its own children.
const detailsPanel: Variants = {
  // Slides in from the left (Blueprint — Slide In: 0.6s)
  closed: { x: -40, opacity: 0 },
  open: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.1,
      delayChildren: 0.15,
    },
  },
};

const line: Variants = {
  closed: { opacity: 0, x: -20 },
  open: { opacity: 1, x: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// Collapsed label (title + price) that cross-fades out on open.
const collapsedLabel: Variants = {
  closed: { opacity: 1, transition: { duration: 0.3 } },
  open: { opacity: 0, transition: { duration: 0.2 } },
};

const imageWrap: Variants = {
  closed: { scale: 1 },
  // Blueprint — Zoom: 0.6s
  open: { scale: 1.08, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const dim: Variants = {
  closed: { opacity: 0 },
  open: { opacity: 1, transition: { duration: 0.6 } },
};

// Overlay chrome (badge, stars, buttons) that appears over the image.
const overlayItem: Variants = {
  closed: { opacity: 0, y: 12 },
  open: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut", delay: 0.25 } },
};

export function AnimatedProductCard({ product }: { product: Product }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const open = hovered || pinned;
  const rating = PRODUCT_RATING;
  const { offers: activeOffers } = useActiveOffer();

  // Portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  // Lock body scroll + close on Escape while the modal is open.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setModalOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  const openModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setModalOpen(true);
  };

  const router = useRouter();
  const { addItem, openCart } = useCart();
  const { requireAuth } = usePurchaseGate();
  const { isCustomizable } = useCustomization();
  const slug = slugify(product.name);
  const detailHref = `/menu/${slug}`;

  // Snapshot passed to the cart when adding this product.
  const cartLine = {
    id: product.id,
    name: product.name,
    price: product.price,
    image: product.image,
    category: product.category,
    slug,
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(cartLine);
    openCart();
  };

  // Purchasing requires a signed-in customer. When they aren't, the gate
  // remembers this product and sends them to Google login; the product page
  // they return to replays the Buy Now automatically.
  const handleBuyNow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const allowed = await requireAuth({
      action: "buy-now",
      productId: product.id,
      slug,
      quantity: 1,
      href: detailHref,
    });
    if (!allowed) return;
    // A cake is customized before it reaches the cart; everything else keeps
    // the existing straight-to-checkout flow.
    if (isCustomizable(product.id)) {
      router.push(`/customize/${slug}?qty=1`);
      return;
    }
    addItem(cartLine);
    router.push("/checkout");
  };

  return (
    <>
    <motion.article
      variants={container}
      initial="closed"
      animate={open ? "open" : "closed"}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onTapStart={() => setPinned((p) => !p)}
      className="group relative isolate flex w-full max-w-[560px] cursor-pointer select-none flex-col overflow-hidden rounded-[28px] md:h-[320px] md:flex-row"
      style={{ transformOrigin: "50% 50%" }}
    >
      {/* Blush trapezoid backdrop — right edge sits higher than the left.
          Clipped by the card's overflow-hidden so nothing escapes. */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-br from-[#F9EEEA] to-[#F2DCD6]"
        style={{ clipPath: "polygon(0 7%, 100% 0, 100% 100%, 0 100%)" }}
      />

      {/* ------------------------------- LEFT / DETAILS -------------------------------
          Below the image on mobile (order-2), left column on desktop (order-1).
          Everything stays inside this column — no overhang. */}
      <div className="relative order-2 flex min-w-0 flex-1 flex-col justify-center p-4 md:order-1 md:p-5">
        {/* Desktop resting label — cross-fades out on hover */}
        <motion.div
          variants={collapsedLabel}
          className="pointer-events-none absolute inset-0 hidden flex-col justify-center px-5 md:flex"
        >
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#9C616D]">
            {product.category}
          </span>
          <h3 className="mt-1 line-clamp-3 font-display text-xl font-bold leading-snug text-[#612437]">
            {product.name}
          </h3>
          <span className="mt-2 block font-display text-lg font-bold text-[#743249]">
            <PriceText product={product} offers={activeOffers} />
          </span>
        </motion.div>

        {/* Desktop hover panel — slides in from the left, fully inside the column */}
        <motion.div
          variants={detailsPanel}
          className="absolute inset-2 z-20 hidden flex-col justify-center rounded-[20px] bg-white/95 p-4 shadow-[0_18px_45px_-20px_rgba(116,50,73,0.55)] backdrop-blur-sm md:flex md:p-5"
          style={{ pointerEvents: open ? "auto" : "none" }}
        >
          <ProductDetails
            product={product}
            rating={rating}
            onReadMore={openModal}
            offers={activeOffers}
            animated
          />
        </motion.div>

        {/* Mobile static details — always visible, stacked under the image */}
        <div className="md:hidden">
          <ProductDetails
            product={product}
            rating={rating}
            onReadMore={openModal}
            offers={activeOffers}
          />
        </div>
      </div>

      {/* ------------------------------- RIGHT / IMAGE -------------------------------
          On top on mobile (order-1), right column on desktop (order-2). */}
      <div className="relative order-1 aspect-[4/3] w-full shrink-0 overflow-hidden md:order-2 md:aspect-auto md:h-full md:w-[44%]">
        {/* Tapping the image opens the product detail page */}
        <Link
          href={detailHref}
          aria-label={`View ${product.name}`}
          className="absolute inset-0 z-10"
        />
        <motion.div variants={imageWrap} className="absolute inset-0">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, 260px"
            className="object-cover"
          />
        </motion.div>

        {/* Dim scrim + overlay chrome — desktop hover reveal only */}
        <motion.div
          variants={dim}
          className="absolute inset-0 hidden bg-gradient-to-t from-[#3b1622]/80 via-[#3b1622]/25 to-transparent md:block"
        />

        {/* Price badge — top right */}
        <motion.span
          variants={overlayItem}
          className="absolute right-2 top-2 hidden rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-[#743249] shadow-md md:block"
        >
          <PriceText product={product} offers={activeOffers} />
        </motion.span>

        {/* Rating + actions — bottom of the image */}
        <div className="absolute inset-x-0 bottom-0 z-20 hidden flex-col gap-2 p-3 md:flex">
          <motion.div variants={overlayItem} className="flex items-center gap-1.5">
            <StarRow value={rating} />
            <span className="text-xs font-semibold text-white/95">{rating.toFixed(1)}</span>
          </motion.div>
          <motion.div
            variants={overlayItem}
            className="flex gap-2"
            style={{ pointerEvents: open ? "auto" : "none" }}
          >
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-[#873853] px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition-transform hover:-translate-y-0.5"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add to Cart</span>
              <span className="sm:hidden">Cart</span>
            </button>
            <button
              type="button"
              onClick={handleBuyNow}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-white px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-[#743249] transition-transform hover:-translate-y-0.5"
            >
              <Zap className="h-3.5 w-3.5" />
              Buy Now
            </button>
          </motion.div>
        </div>

        {/* Category tag chip — resting state accent */}
        {product.tag && (
          <span className="absolute left-2 top-2 rounded-full bg-[#743249] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
            {product.tag}
          </span>
        )}
      </div>
    </motion.article>

    {/* Read More modal — rendered in a portal so the card's overflow-hidden
        never clips it. AnimatePresence stays mounted for the exit animation. */}
    {mounted &&
      createPortal(
        <AnimatePresence>
          {modalOpen && (
            <ProductModal
              product={product}
              rating={rating}
              onClose={() => setModalOpen(false)}
              handleAdd={handleAdd}
              handleBuyNow={handleBuyNow}
              offers={activeOffers}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

/* Shared details block — rendered as a staggered reveal on desktop hover
   (`animated`) and as a static stack on mobile. */
function ProductDetails({
  product,
  rating,
  onReadMore,
  offers,
  animated = false,
}: {
  product: Product;
  rating: number;
  onReadMore: (e: React.MouseEvent) => void;
  offers: ActiveOffers;
  animated?: boolean;
}) {
  const Row = animated ? motion.div : "div";
  const rowProps = animated ? { variants: line } : {};
  return (
    <>
      <Row {...rowProps} className="text-[11px] font-bold uppercase tracking-widest text-[#9C616D]">
        {product.category}
      </Row>
      <Row
        {...rowProps}
        className="mt-1 line-clamp-2 font-display text-xl font-bold leading-snug text-[#612437]"
      >
        {product.name}
      </Row>
      <Row {...rowProps} className="mt-2 flex items-center gap-2">
        <StarRow value={rating} />
        <span className="text-sm font-semibold text-[#743249]">{rating.toFixed(1)}</span>
      </Row>
      <Row {...rowProps} className="mt-2 font-display text-2xl font-bold text-[#743249]">
        <PriceText product={product} offers={offers} />
      </Row>
      <Row
        {...rowProps}
        className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[#9C616D]"
      >
        {product.description}
      </Row>
      <Row {...rowProps} className="mt-3">
        <button
          type="button"
          onClick={onReadMore}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#873853] px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(135,56,83,0.7)] transition-transform hover:-translate-y-0.5"
        >
          Read More
          <ArrowRight className="h-4 w-4" />
        </button>
      </Row>
    </>
  );
}

/* --------------------------- Read More modal --------------------------- *
 * Full-screen sheet on mobile, centered 600px popup on desktop. Opens and
 * closes with a Framer Motion fade + rise; the backdrop dims behind it.
 * ---------------------------------------------------------------------- */
function ProductModal({
  product,
  rating,
  onClose,
  handleAdd,
  handleBuyNow,
  offers,
}: {
  product: Product;
  rating: number;
  onClose: () => void;
  handleAdd: (e: React.MouseEvent) => void;
  handleBuyNow: (e: React.MouseEvent) => void;
  offers: ActiveOffers;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Dimming backdrop */}
      <div
        className="absolute inset-0 bg-[#3b1622]/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-[600px] sm:rounded-[28px]"
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Large image */}
        <div className="relative h-56 w-full shrink-0 sm:h-72">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, 600px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
          {/* Close button — top right */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#743249] shadow-md transition-transform hover:scale-105"
          >
            <X className="h-5 w-5" />
          </button>
          {product.tag && (
            <span className="absolute left-3 top-3 rounded-full bg-[#743249] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
              {product.tag}
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          <span className="inline-block rounded-full bg-[#F9EEEA] px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#9C616D]">
            {product.category}
          </span>
          <h2 className="mt-3 font-display text-2xl font-bold leading-snug text-[#612437] sm:text-3xl">
            {product.name}
          </h2>

          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <StarRow value={rating} />
              <span className="text-sm font-semibold text-[#743249]">{rating.toFixed(1)}</span>
            </div>
            <span className="font-display text-2xl font-bold text-[#743249]">
              <PriceText product={product} offers={offers} badge />
            </span>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-[#9C616D] sm:text-base">
            {product.description}
          </p>

          {/* Ingredients & allergens */}
          <div className="mt-5 rounded-[20px] bg-[#F9EEEA] p-4">
            <div className="flex items-center gap-2 text-[#743249]">
              <Leaf className="h-4 w-4" />
              <h3 className="text-sm font-bold uppercase tracking-wide">
                Ingredients &amp; Allergens
              </h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[#9C616D]">
              100% eggless &amp; vegetarian, freshly handcrafted. Made in a kitchen
              that also handles <strong>wheat (gluten), dairy, soya</strong> and
              <strong> tree nuts</strong>. Please let us know about any allergies
              when ordering.
            </p>
          </div>
        </div>

        {/* Sticky action footer */}
        <div className="flex shrink-0 gap-3 border-t border-[#F2DCD6] bg-white p-4 sm:p-5">
          <button
            type="button"
            onClick={(e) => {
              handleAdd(e);
              onClose();
            }}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#873853] px-4 py-3 text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(135,56,83,0.7)] transition-transform hover:-translate-y-0.5"
          >
            <ShoppingCart className="h-4 w-4" />
            Add to Cart
          </button>
          <button
            type="button"
            onClick={handleBuyNow}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[#873853] bg-white px-4 py-3 text-sm font-semibold text-[#743249] transition-transform hover:-translate-y-0.5"
          >
            <Zap className="h-4 w-4" />
            Buy Now
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
