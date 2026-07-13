"use client";

// ============================================================
// Le Rasa Bakery — Cake Customization Wizard (/customize/[slug])
// ------------------------------------------------------------
// Sits between "Buy Now" and the cart, for cake products only. EVERY control
// on this page is rendered from the accessory groups in the database — there
// is no hardcoded list of candles, cards or toppers here, and adding a new
// accessory group needs no change to this file.
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
import { ChevronLeft, Sparkles } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useCart } from "@/components/cart/cart-context";
import { useAuth } from "@/lib/use-auth";
import { useCustomization } from "@/lib/use-customization";
import { loginHrefFor } from "@/lib/purchase-intent";
import { slugify } from "@/lib/slug";
import { money } from "@/lib/pricing";
import {
  buildCustomization,
  cartLineId,
  defaultSelections,
  groupsForCategory,
  priceSelections,
  validateSelections,
  visibleGroups,
  type AccessoryGroup,
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

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=900&q=80";

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
  const [selections, setSelections] = useState<Selections>({});
  const [seeded, setSeeded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Quantity is carried over from the product page's stepper. Read straight
  // from the URL rather than via useSearchParams, which would force a Suspense
  // boundary at build time (same reason as the login page).
  useEffect(() => {
    const raw = Number(new URLSearchParams(window.location.search).get("qty"));
    if (Number.isFinite(raw) && raw > 0) {
      setQty(Math.min(99, Math.max(1, Math.trunc(raw))));
    }
  }, []);

  // Purchasing requires a signed-in customer — including when someone lands on
  // this URL directly. They come straight back to the wizard afterwards.
  useEffect(() => {
    if (!authReady || user) return;
    router.replace(
      loginHrefFor(`/customize/${slug}${window.location.search}`),
    );
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

  // The accessory groups offered for THIS product's category.
  const groups: AccessoryGroup[] = useMemo(
    () => (product ? groupsForCategory(config.groups, product.category) : []),
    [config.groups, product],
  );

  // Open with every group's configured default.
  useEffect(() => {
    if (seeded || groups.length === 0) return;
    setSelections(defaultSelections(groups));
    setSeeded(true);
  }, [groups, seeded]);

  // A non-cake (or a product whose accessories were all deactivated) has
  // nothing to customize — send it back to its normal product page.
  useEffect(() => {
    if (loading || configLoading || !product) return;
    if (!product.is_customizable || groups.length === 0) {
      router.replace(`/menu/${slug}`);
    }
  }, [loading, configLoading, product, groups.length, router, slug]);

  const shown = useMemo(
    () => visibleGroups(groups, selections),
    [groups, selections],
  );
  const addons = useMemo(
    () => priceSelections(groups, selections),
    [groups, selections],
  );

  // Re-validate as they fix things, but only once they've tried to continue —
  // nobody wants to be shouted at before they've filled anything in.
  useEffect(() => {
    if (!submitted) return;
    setErrors(validateSelections(groups, selections).errors);
  }, [submitted, groups, selections]);

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

  function handleContinue() {
    if (!product) return;
    setSubmitted(true);

    const result = validateSelections(groups, selections);
    if (!result.ok) {
      setErrors(result.errors);
      // Take them to the first thing that needs fixing.
      const firstKey = shown.find((g) => result.errors[g.key])?.key;
      if (firstKey) {
        document
          .getElementById(`group-${firstKey}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    const customization = buildCustomization(groups, selections);
    addItem(
      {
        // A distinct line per distinct customization: two cakes with different
        // candles must not collapse into one line of quantity 2.
        id: cartLineId(product.id, customization.selections),
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        category: product.category,
        slug,
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

  const lineTotal = (product.price + addons) * qty;

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
          {/* ---- Left: the accessory groups, straight from the database ---- */}
          <div className="space-y-5">
            {shown.map((group) => {
              const sel = selections[group.key] ?? {};
              const error = errors[group.key];
              return (
                <motion.section
                  key={group.key}
                  id={`group-${group.key}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={`rounded-clay bg-blush-50 p-6 shadow-clay-sm ${
                    error ? "ring-2 ring-red-400" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-bold text-darkberry">
                        {group.label}
                        {group.required && (
                          <span className="ml-1.5 text-sm text-wine">*</span>
                        )}
                      </h2>
                      {group.helpText && (
                        <p className="mt-0.5 text-sm text-berry">{group.helpText}</p>
                      )}
                    </div>
                    {/* Toggles and free-text groups price at the group level. */}
                    {(group.displayType === "toggle" ||
                      group.displayType === "text" ||
                      group.displayType === "textarea") &&
                      group.price > 0 && <PriceTag price={group.price} />}
                  </div>

                  <div className="mt-4">
                    {/* RADIO */}
                    {group.displayType === "radio" && (
                      <div className="space-y-2">
                        {group.options.map((opt) => {
                          const checked = (sel.values ?? []).includes(opt.value);
                          return (
                            <label
                              key={opt.value}
                              className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors ${
                                checked
                                  ? "border-wine bg-wine/5"
                                  : "border-dustyrose/40 hover:bg-dustyrose-light/30"
                              }`}
                            >
                              <input
                                type="radio"
                                name={group.key}
                                className="h-4 w-4 accent-[#873853]"
                                checked={checked}
                                onChange={() =>
                                  update(group.key, { values: [opt.value] })
                                }
                              />
                              <span className="flex-1 text-sm font-semibold text-darkberry">
                                {opt.label}
                              </span>
                              <PriceTag price={opt.price} />
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* DROPDOWN */}
                    {group.displayType === "dropdown" && (
                      <select
                        className={INPUT}
                        value={(sel.values ?? [])[0] ?? ""}
                        onChange={(e) =>
                          update(group.key, { values: [e.target.value] })
                        }
                      >
                        {group.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                            {opt.price > 0 ? ` (+${money(opt.price)})` : ""}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* CHECKBOX / MULTI-SELECT */}
                    {group.displayType === "checkbox" && (
                      <div className="space-y-2">
                        {group.options.map((opt) => {
                          const checked = (sel.values ?? []).includes(opt.value);
                          return (
                            <label
                              key={opt.value}
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
                                  toggleCheckbox(group.key, opt.value, e.target.checked)
                                }
                              />
                              <span className="flex-1 text-sm font-semibold text-darkberry">
                                {opt.label}
                              </span>
                              <PriceTag price={opt.price} />
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* TOGGLE */}
                    {group.displayType === "toggle" && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!!sel.enabled}
                        onClick={() => update(group.key, { enabled: !sel.enabled })}
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
                    {(group.displayType === "text" ||
                      group.displayType === "textarea") && (
                      <>
                        {group.displayType === "text" ? (
                          <input
                            className={INPUT}
                            value={sel.text ?? ""}
                            maxLength={group.maxChars ?? undefined}
                            placeholder={group.placeholder ?? ""}
                            onChange={(e) =>
                              update(group.key, { text: e.target.value })
                            }
                          />
                        ) : (
                          <textarea
                            className={INPUT}
                            rows={3}
                            value={sel.text ?? ""}
                            maxLength={group.maxChars ?? undefined}
                            placeholder={group.placeholder ?? ""}
                            onChange={(e) =>
                              update(group.key, { text: e.target.value })
                            }
                          />
                        )}
                        {group.maxChars && (
                          <p className="mt-1.5 text-right text-xs text-berry">
                            {(sel.text ?? "").length}/{group.maxChars}
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

          {/* ---- Right: live summary ---- */}
          <aside className="h-fit rounded-clay bg-[#F9EEEA] p-6 shadow-clay-sm lg:sticky lg:top-28">
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
                <p className="text-xs text-berry">{money(product.price)} each</p>
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
                  −
                </button>
                <span className="w-6 text-center font-display font-bold text-darkberry">
                  {qty}
                </span>
                <button
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                  aria-label="Increase quantity"
                  className="grid h-8 w-8 place-items-center rounded-full text-wine-dark transition-transform active:scale-90"
                >
                  +
                </button>
              </div>
            </div>

            {/* Chosen accessories */}
            <dl className="mt-5 space-y-1.5 border-t border-dustyrose/40 pt-4 text-sm">
              <div className="flex justify-between text-berry">
                <dt>Cake</dt>
                <dd className="font-semibold text-darkberry">
                  {money(product.price * qty)}
                </dd>
              </div>
              {buildCustomization(groups, selections).lines.map((line) => (
                <div key={`${line.key}-${line.value}`} className="flex justify-between gap-2 text-berry">
                  <dt className="min-w-0 truncate">
                    {line.label}
                    <span className="text-berry/70"> · {line.value}</span>
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
    </div>
  );
}
