"use client";

// ============================================================
// Le Rasa Bakery — multi-step checkout (/checkout)
//   1. Contact   2. Delivery   3. Review   4. Payment (Stripe)
// On successful payment the order is saved via /api/orders/create
// and the customer is sent to /order-confirmation/[orderId].
// ============================================================

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { Check, ChevronLeft, Lock, Loader2, ShoppingBag } from "lucide-react";
import { useCart } from "@/components/cart/cart-context";
import { getStripePromise, stripeConfigured } from "@/lib/stripe-client";
import { money } from "@/lib/pricing";

const INPUT =
  "w-full rounded-2xl border border-dustyrose/50 bg-blush-50 px-4 py-3 text-darkberry placeholder:text-berry/60 shadow-clay-sm focus:border-wine focus:outline-none focus:ring-2 focus:ring-wine/30";
const LABEL = "mb-1.5 block text-sm font-semibold text-darkberry";

type Form = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  deliveryDate: string;
  instructions: string;
};

const STEPS = ["Contact", "Delivery", "Review", "Payment"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Earliest selectable delivery date = today + 2 days (lead time). */
function minDeliveryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

/** Short, human order number from a DB uuid or a Stripe PaymentIntent id. */
function toOrderNumber(id: string): string {
  return id.replace(/^pi_/, "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, deliveryFee, total, count, clearCart } = useCart();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Form>({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postcode: "",
    deliveryDate: "",
    instructions: "",
  });

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);

  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const step1Valid =
    form.name.trim() !== "" && EMAIL_RE.test(form.email) && form.phone.trim() !== "";
  const step2Valid =
    form.address.trim() !== "" &&
    form.postcode.trim() !== "" &&
    form.deliveryDate !== "";

  // Empty-cart guard (after hooks, so hook order stays stable).
  if (count === 0 && step < 4) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-dustyrose-light/60">
          <ShoppingBag className="h-7 w-7 text-wine-dark" />
        </div>
        <h1 className="font-display text-2xl font-bold text-darkberry">
          Your basket is empty
        </h1>
        <p className="text-berry">Add a treat before checking out.</p>
        <Link
          href="/menu"
          className="rounded-full bg-wine px-6 py-3 text-sm font-semibold text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
        >
          Browse the menu
        </Link>
      </div>
    );
  }

  async function goToPayment() {
    setLoadingIntent(true);
    setIntentError(null);
    try {
      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ id: i.id, quantity: i.quantity })),
          deliveryDate: form.deliveryDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start payment.");
      setClientSecret(data.clientSecret);
      setStep(4);
    } catch (e) {
      setIntentError(e instanceof Error ? e.message : "Could not start payment.");
    } finally {
      setLoadingIntent(false);
    }
  }

  function next() {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    if (step === 3) {
      goToPayment();
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  }
  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  const appearance: Appearance = {
    theme: "flat",
    variables: {
      colorPrimary: "#873853",
      colorBackground: "#FDF8F6",
      colorText: "#612437",
      colorDanger: "#b00020",
      borderRadius: "14px",
      fontFamily: "inherit",
    },
  };

  return (
    <div className="pb-24 pt-6">
      <div className="container max-w-5xl">
        <Link
          href="/menu"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-wine-dark transition-colors hover:text-wine"
        >
          <ChevronLeft className="h-4 w-4" />
          Continue shopping
        </Link>

        <h1 className="font-display text-3xl font-bold text-darkberry md:text-4xl">
          Checkout
        </h1>

        {/* Stepper */}
        <ol className="mt-6 flex items-center gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <div
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${
                    active
                      ? "bg-wine text-blush-50"
                      : done
                        ? "bg-wine/80 text-blush-50"
                        : "bg-dustyrose-light/60 text-wine-dark"
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : n}
                </div>
                <span
                  className={`hidden text-sm font-semibold sm:inline ${
                    active ? "text-darkberry" : "text-berry"
                  }`}
                >
                  {label}
                </span>
                {n < STEPS.length && (
                  <span className="mx-1 hidden h-px flex-1 bg-dustyrose/50 sm:block" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          {/* ---- Left: step content ---- */}
          <div className="rounded-clay bg-blush-50 p-6 shadow-clay-sm md:p-8">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-bold text-darkberry">
                  Your details
                </h2>
                <div>
                  <label className={LABEL} htmlFor="name">Full name</label>
                  <input id="name" className={INPUT} value={form.name}
                    onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" />
                </div>
                <div>
                  <label className={LABEL} htmlFor="email">Email</label>
                  <input id="email" type="email" className={INPUT} value={form.email}
                    onChange={(e) => set("email", e.target.value)} placeholder="jane@example.com" />
                </div>
                <div>
                  <label className={LABEL} htmlFor="phone">Phone</label>
                  <input id="phone" type="tel" className={INPUT} value={form.phone}
                    onChange={(e) => set("phone", e.target.value)} placeholder="07123 456789" />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl font-bold text-darkberry">
                  Delivery
                </h2>
                <div>
                  <label className={LABEL} htmlFor="address">Address</label>
                  <input id="address" className={INPUT} value={form.address}
                    onChange={(e) => set("address", e.target.value)} placeholder="12 Baker Street" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={LABEL} htmlFor="city">City</label>
                    <input id="city" className={INPUT} value={form.city}
                      onChange={(e) => set("city", e.target.value)} placeholder="London" />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="postcode">Postcode</label>
                    <input id="postcode" className={INPUT} value={form.postcode}
                      onChange={(e) => set("postcode", e.target.value.toUpperCase())} placeholder="SW1A 1AA" />
                  </div>
                </div>
                <div>
                  <label className={LABEL} htmlFor="deliveryDate">Delivery date</label>
                  <input id="deliveryDate" type="date" className={INPUT} min={minDeliveryDate()}
                    value={form.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} />
                  <p className="mt-1 text-xs text-berry">We need at least 2 days&apos; notice.</p>
                </div>
                <div>
                  <label className={LABEL} htmlFor="instructions">Special instructions (optional)</label>
                  <textarea id="instructions" rows={3} className={INPUT} value={form.instructions}
                    onChange={(e) => set("instructions", e.target.value)}
                    placeholder="Message on the cake, gate code, allergies…" />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <h2 className="font-display text-xl font-bold text-darkberry">
                  Review your order
                </h2>
                <div className="space-y-3">
                  {items.map((i) => (
                    <div key={i.id} className="flex items-center gap-3">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                        <Image src={i.image} alt={i.name} fill sizes="56px" className="object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-darkberry">{i.name}</p>
                        <p className="text-xs text-berry">Qty {i.quantity}</p>
                      </div>
                      <span className="text-sm font-bold text-wine-dark">
                        {money(i.price * i.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-[#F9EEEA] p-4 text-sm">
                  <p className="font-bold text-darkberry">{form.name}</p>
                  <p className="text-berry">{form.email} · {form.phone}</p>
                  <p className="mt-2 text-darkberry">
                    {form.address}{form.city ? `, ${form.city}` : ""}, {form.postcode}
                  </p>
                  <p className="text-berry">Delivery: {form.deliveryDate}</p>
                  {form.instructions && (
                    <p className="mt-2 text-berry">“{form.instructions}”</p>
                  )}
                </div>

                {intentError && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {intentError}
                  </p>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-5">
                <h2 className="flex items-center gap-2 font-display text-xl font-bold text-darkberry">
                  <Lock className="h-5 w-5 text-wine" />
                  Payment
                </h2>

                {!stripeConfigured ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Payments aren&apos;t configured yet. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
                    and STRIPE_SECRET_KEY to your environment.
                  </p>
                ) : clientSecret ? (
                  <Elements
                    stripe={getStripePromise()}
                    options={{ clientSecret, appearance }}
                  >
                    <PaymentForm
                      total={total}
                      onPaid={async (paymentIntentId) => {
                        // The payment already succeeded — from here on we NEVER
                        // surface an error to the customer. Persisting the order
                        // to Supabase is best-effort; a snapshot is always saved
                        // so the confirmation page can render regardless.
                        let orderId = paymentIntentId;
                        try {
                          const res = await fetch("/api/orders/create", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              paymentIntentId,
                              customer: {
                                name: form.name,
                                email: form.email,
                                phone: form.phone,
                              },
                              address: {
                                line: form.address,
                                city: form.city,
                                postcode: form.postcode,
                              },
                              deliveryDate: form.deliveryDate,
                              specialInstructions: form.instructions,
                              items: items.map((i) => ({
                                id: i.id,
                                name: i.name,
                                price: i.price,
                                quantity: i.quantity,
                              })),
                            }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (res.ok && data.orderId) orderId = data.orderId;
                        } catch {
                          /* payment already went through — ignore save errors */
                        }

                        // Snapshot the order for the confirmation screen.
                        const snapshot = {
                          orderId,
                          orderNumber: toOrderNumber(orderId),
                          items: items.map((i) => ({
                            name: i.name,
                            quantity: i.quantity,
                            price: i.price,
                          })),
                          subtotal,
                          deliveryFee,
                          total,
                          deliveryDate: form.deliveryDate,
                          customerName: form.name,
                          email: form.email,
                        };
                        try {
                          sessionStorage.setItem(
                            "lerasa_last_order",
                            JSON.stringify(snapshot),
                          );
                        } catch {
                          /* private mode / storage full — non-fatal */
                        }

                        clearCart();
                        router.push(`/order-confirmation/${orderId}`);
                      }}
                    />
                  </Elements>
                ) : (
                  <div className="flex items-center gap-2 text-berry">
                    <Loader2 className="h-4 w-4 animate-spin" /> Preparing secure payment…
                  </div>
                )}
              </div>
            )}

            {/* Nav buttons (steps 1-3; step 4 has its own pay button) */}
            {step < 4 && (
              <div className="mt-8 flex items-center justify-between gap-3">
                {step > 1 ? (
                  <button
                    onClick={back}
                    className="rounded-full border-2 border-wine/40 px-6 py-3 text-sm font-semibold text-wine-dark transition-colors hover:bg-wine/10"
                  >
                    Back
                  </button>
                ) : (
                  <span />
                )}
                <button
                  onClick={next}
                  disabled={
                    (step === 1 && !step1Valid) ||
                    (step === 2 && !step2Valid) ||
                    loadingIntent
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-wine px-8 py-3 text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loadingIntent && <Loader2 className="h-4 w-4 animate-spin" />}
                  {step === 3 ? "Go to payment" : "Continue"}
                </button>
              </div>
            )}
          </div>

          {/* ---- Right: order summary ---- */}
          <aside className="h-fit rounded-clay bg-[#F9EEEA] p-6 shadow-clay-sm lg:sticky lg:top-28">
            <h2 className="font-display text-lg font-bold text-darkberry">
              Order summary
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 text-berry">
                  <span className="min-w-0 truncate">
                    {i.quantity} × {i.name}
                  </span>
                  <span className="shrink-0 font-semibold text-darkberry">
                    {money(i.price * i.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-dustyrose/40 pt-4 text-sm">
              <div className="flex justify-between text-berry">
                <dt>Subtotal</dt>
                <dd className="font-semibold text-darkberry">{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-berry">
                <dt>Delivery</dt>
                <dd className="font-semibold text-darkberry">
                  {deliveryFee === 0 ? "Free" : money(deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-dustyrose/40 pt-2">
                <dt className="font-bold text-darkberry">Total</dt>
                <dd className="font-display text-lg font-bold text-wine-dark">
                  {money(total)}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Stripe payment form (rendered inside <Elements>)
// ------------------------------------------------------------
function PaymentForm({
  total,
  onPaid,
}: {
  total: number;
  onPaid: (paymentIntentId: string) => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: submitErr } = await elements.submit();
    if (submitErr) {
      setError(submitErr.message ?? "Please check your card details.");
      setSubmitting(false);
      return;
    }

    const { error: payErr, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        return_url:
          typeof window !== "undefined"
            ? `${window.location.origin}/checkout`
            : undefined,
      },
    });

    // Only a genuine Stripe payment error should surface a message.
    if (payErr) {
      setError(payErr.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
      return;
    }

    const status = paymentIntent?.status;
    if (status === "succeeded" || status === "processing") {
      // Payment went through. Never show an error now — hand off to onPaid,
      // which persists the order (best-effort) and navigates to confirmation.
      try {
        await onPaid(paymentIntent!.id);
      } catch {
        // Extremely defensive: even if the hand-off hiccups, the payment
        // succeeded, so still take the customer to their confirmation.
        window.location.href = `/order-confirmation/${paymentIntent!.id}`;
      }
      return; // keep the spinner until navigation completes
    }

    // No Stripe error but not yet complete (rare with cards) — stay calm.
    setError("Your payment is still being confirmed. Please hold on a moment.");
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-wine py-3.5 text-sm font-bold uppercase tracking-wide text-blush-50 shadow-clay-sm transition-all hover:bg-wine-dark hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" /> Pay {money(total)}
          </>
        )}
      </button>
      <p className="text-center text-xs text-berry">
        Secured by Stripe · your card details never touch our servers.
      </p>
    </form>
  );
}
