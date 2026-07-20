"use client";

// ============================================================
// Le Rasa Bakery — My Custom Cake Inquiries (/account/inquiries)
// ------------------------------------------------------------
// Lists the signed-in customer's Custom Cake Inquiries (matched by their
// verified session email), each with its permanent Inquiry Number and status.
// Clicking a card opens a details modal with every field, the reference
// images (view + download), a timeline, and — for a closed/cancelled inquiry
// — a Reopen action. Customers can never edit or delete an inquiry.
//
// Same bakery theme + layout as My Orders; nothing else in the account
// section is changed.
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CakeSlice,
  ChevronLeft,
  Loader2,
  X,
  CalendarDays,
  User,
  ImageIcon,
  Download,
  RotateCcw,
  PlusCircle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import {
  inquiryStatusMeta,
  INQUIRY_TIMELINE,
  type Inquiry,
} from "@/lib/inquiries";

function formatDate(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function InquiriesPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/account/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/inquiries");
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setInquiries(Array.isArray(data.inquiries) ? (data.inquiries as Inquiry[]) : []);
      } catch {
        if (!cancelled) setInquiries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  // Close modal on Escape + lock scroll.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [selected]);

  function onReopened(id: string) {
    setInquiries((prev) =>
      prev.map((x) => (x.id === id ? { ...x, status: "new", closed_at: null, cancelled_at: null } : x)),
    );
    setSelected((s) => (s && s.id === id ? { ...s, status: "new", closed_at: null, cancelled_at: null } : s));
  }

  if (!ready || !user) {
    return (
      <section className="pt-28 sm:pt-36">
        <div className="container flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-wine" />
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <div className="pointer-events-none absolute -left-20 top-28 h-64 w-64 rounded-full bg-dustyrose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-dustyrose/25 blur-3xl" />

      <div className="container relative mx-auto max-w-xl">
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-sm font-semibold text-wine-dark transition-colors hover:text-plum"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to account
        </Link>

        <h1 className="mt-4 font-display text-2xl font-semibold text-darkberry sm:text-3xl">
          My Custom Cake Inquiries
        </h1>

        {loading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-wine" />
          </div>
        ) : inquiries.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 flex flex-col items-center rounded-clay bg-blush-50 px-6 py-14 text-center shadow-clay"
          >
            <span className="grid h-20 w-20 place-items-center rounded-full bg-dustyrose-light text-wine-dark">
              <CakeSlice className="h-9 w-9" />
            </span>
            <h2 className="mt-5 font-display text-xl font-semibold text-darkberry">
              No inquiries yet
            </h2>
            <p className="mt-2 max-w-xs text-sm text-darkberry-light">
              Send us a custom cake inquiry and it&apos;ll show up here so you can
              track it.
            </p>
            <Button asChild className="mt-6">
              <Link href="/contact#inquiry">Start an inquiry</Link>
            </Button>
          </motion.div>
        ) : (
          <ul className="mt-5 space-y-3">
            {inquiries.map((q, i) => {
              const s = inquiryStatusMeta(q.status);
              return (
                <motion.li
                  key={q.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.3) }}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(q)}
                    aria-label={`View inquiry ${q.inquiry_number}`}
                    className="w-full rounded-clay bg-blush-50 p-5 text-left shadow-clay-sm transition-all hover:-translate-y-0.5 hover:shadow-clay"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-bold text-darkberry">
                          {q.inquiry_number || "Custom Cake Inquiry"}
                        </p>
                        <p className="text-xs text-darkberry-light">
                          {q.event_type || "Custom cake"} · Submitted {formatDate(q.created_at)}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${s.className}`}>
                        {s.label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-dustyrose/30 pt-3 text-xs text-darkberry-light">
                      <Cell label="Delivery" value={formatDate(q.delivery_date)} />
                      <Cell label="Flavour" value={q.flavour} />
                      <Cell label="Servings" value={q.servings} />
                      {q.budget ? <Cell label="Budget" value={q.budget} /> : null}
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <InquiryDetailsModal
            inquiry={selected}
            onClose={() => setSelected(null)}
            onReopened={onReopened}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between gap-2">
      <span className="text-darkberry-light/70">{label}</span>
      <span className="min-w-0 truncate text-right font-semibold text-darkberry">
        {value || "—"}
      </span>
    </span>
  );
}

// ------------------------------------------------------------
// Details modal — same design language as the order-details modal.
// ------------------------------------------------------------
function InquiryDetailsModal({
  inquiry,
  onClose,
  onReopened,
}: {
  inquiry: Inquiry;
  onClose: () => void;
  onReopened: (id: string) => void;
}) {
  const router = useRouter();
  const s = inquiryStatusMeta(inquiry.status);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState("");
  const canReopen = inquiry.status === "closed" || inquiry.status === "cancelled";

  async function reopen() {
    setReopening(true);
    setError("");
    try {
      const res = await fetch(`/api/account/inquiries/${inquiry.id}/reopen`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not reopen this inquiry.");
      onReopened(inquiry.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reopen this inquiry.");
    } finally {
      setReopening(false);
    }
  }

  // Prefill the inquiry form with these details and jump there.
  function createSimilar() {
    try {
      sessionStorage.setItem(
        "inquiry-prefill",
        JSON.stringify({
          name: inquiry.name,
          phone: inquiry.phone,
          email: inquiry.email,
          eventType: inquiry.event_type,
          servings: inquiry.servings,
          budget: inquiry.budget,
          flavour: inquiry.flavour,
          shape: inquiry.shape,
          colour: inquiry.colour_theme,
          cakeMessage: inquiry.cake_message,
          notes: inquiry.notes,
        }),
      );
    } catch {
      /* ignore */
    }
    router.push("/contact#inquiry");
  }

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="absolute inset-0 bg-darkberry/40 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Inquiry ${inquiry.inquiry_number}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F9EEEA] shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-clay"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-dustyrose/40 bg-blush-50 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-wine-dark">Inquiry number</p>
            <h2 className="truncate font-display text-xl font-bold text-darkberry">
              {inquiry.inquiry_number || "Custom Cake Inquiry"}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${s.className}`}>{s.label}</span>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full bg-[#F9EEEA] text-darkberry shadow-clay-sm transition-shadow hover:shadow-clay"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <InquiryTimeline inquiry={inquiry} />

          <Section icon={<User className="h-4 w-4" />} title="Your details">
            <Line label="Name" value={inquiry.name} />
            <Line label="Phone" value={inquiry.phone} />
            <Line label="Email" value={inquiry.email} />
          </Section>

          <Section icon={<CalendarDays className="h-4 w-4" />} title="Cake details">
            <Line label="Event type" value={inquiry.event_type} />
            <Line label="Delivery date" value={formatDate(inquiry.delivery_date)} />
            <Line label="Servings" value={inquiry.servings} />
            <Line label="Budget" value={inquiry.budget} />
            <Line label="Flavour" value={inquiry.flavour} />
            <Line label="Shape" value={inquiry.shape} />
            <Line label="Colour theme" value={inquiry.colour_theme} />
            <Line label="Cake message" value={inquiry.cake_message} />
            <Line label="Additional notes" value={inquiry.notes} />
          </Section>

          {inquiry.reference_images.length > 0 && (
            <Section icon={<ImageIcon className="h-4 w-4" />} title="Reference images">
              <div className="grid grid-cols-3 gap-2">
                {inquiry.reference_images.map((url, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-wine/10">
                    <a href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
                    </a>
                    <a
                      href={url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Download reference ${i + 1}`}
                      className="absolute bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-darkberry/80 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>

        {/* Footer — reopen (when eligible) + create similar. No edit/delete. */}
        <div className="space-y-3 border-t border-dustyrose/40 bg-blush-50 px-5 py-4">
          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            {canReopen && (
              <button
                type="button"
                onClick={reopen}
                disabled={reopening}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-wine/40 px-4 py-2.5 text-sm font-bold text-wine-dark transition-colors hover:bg-wine/10 disabled:opacity-50"
              >
                {reopening ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Reopen inquiry
              </button>
            )}
            <button
              type="button"
              onClick={createSimilar}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-wine px-4 py-2.5 text-sm font-bold text-blush-50 transition-colors hover:bg-wine-dark"
            >
              <PlusCircle className="h-4 w-4" />
              Create another inquiry
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function InquiryTimeline({ inquiry }: { inquiry: Inquiry }) {
  // Cancelled steps out of the flow.
  if (inquiry.status === "cancelled") {
    return (
      <div className="rounded-clay bg-blush-50 p-4 shadow-clay-sm">
        <div className="mb-2 flex items-center gap-2 text-red-600">
          <X className="h-4 w-4" />
          <h3 className="text-xs font-bold uppercase tracking-wide">Inquiry cancelled</h3>
        </div>
        <p className="text-sm text-darkberry-light">
          This inquiry was cancelled. You can reopen it below to pick things back up.
        </p>
      </div>
    );
  }

  const stampFor: Record<string, string | null> = {
    new: inquiry.created_at,
    contacted: inquiry.contacted_at,
    confirmed: inquiry.confirmed_at,
    closed: inquiry.closed_at,
  };
  const activeIndex = INQUIRY_TIMELINE.reduce(
    (acc, step, i) => (stampFor[step.key] ? i : acc),
    0,
  );

  return (
    <div className="rounded-clay bg-blush-50 p-4 shadow-clay-sm">
      <div className="mb-3 flex items-center gap-2 text-wine-dark">
        <CalendarDays className="h-4 w-4" />
        <h3 className="text-xs font-bold uppercase tracking-wide">Timeline</h3>
      </div>
      <ol className="space-y-0">
        {INQUIRY_TIMELINE.map((step, i) => {
          const done = i < activeIndex;
          const current = i === activeIndex;
          const last = i === INQUIRY_TIMELINE.length - 1;
          const at = stampFor[step.key];
          return (
            <li key={step.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    done
                      ? "bg-wine text-white"
                      : current
                        ? "bg-wine text-white ring-4 ring-dustyrose/40"
                        : "bg-dustyrose-light/60 text-wine-dark/50"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {!last && (
                  <span
                    className={`w-0.5 flex-1 ${done ? "bg-wine" : "bg-dustyrose/40"}`}
                    style={{ minHeight: 18 }}
                  />
                )}
              </div>
              <div className={last ? "pb-0" : "pb-4"}>
                <p
                  className={`text-sm font-bold ${
                    current ? "text-wine-dark" : done ? "text-darkberry" : "text-darkberry-light/60"
                  }`}
                >
                  {step.label}
                </p>
                {at && <p className="text-xs text-darkberry-light">{formatDate(at)}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-clay bg-blush-50 p-4 shadow-clay-sm">
      <div className="mb-3 flex items-center gap-2 text-wine-dark">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-darkberry-light">{label}</span>
      <span className="min-w-0 text-right font-semibold text-darkberry">{value}</span>
    </div>
  );
}
