"use client";

// ============================================================
// Le Rasa Bakery — Custom Cake Inquiry form.
// ------------------------------------------------------------
// Collects the details for a bespoke cake and sends them straight to the
// bakery owner's WhatsApp. It deliberately does NOT create an order, hit
// checkout/Stripe, or send email — it just opens a pre-filled WhatsApp chat.
//
// Reference photos upload to a public bucket (/api/inquiry/upload) so their
// links can be dropped into the WhatsApp message for the owner to open.
// Same bakery theme / container as the previous contact form.
// ============================================================

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, CheckCircle2, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const EVENT_TYPES = [
  "Birthday",
  "Wedding",
  "Anniversary",
  "Baby Shower",
  "Corporate",
  "Other",
];

const SELECT_CLASS =
  "flex h-12 w-full rounded-2xl border border-wine/20 bg-blush-50 px-4 text-sm text-darkberry shadow-clay-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine/50";

type FormState = {
  name: string;
  phone: string;
  email: string;
  eventType: string;
  deliveryDate: string;
  servings: string;
  budget: string;
  flavour: string;
  shape: string;
  colour: string;
  cakeMessage: string;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  phone: "",
  email: "",
  eventType: "",
  deliveryDate: "",
  servings: "",
  budget: "",
  flavour: "",
  shape: "",
  colour: "",
  cakeMessage: "",
  notes: "",
};

type UploadedImage = { url: string; name: string };

export function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  // The Inquiry Number assigned on save (CQ-YYYYMMDD-NNN) + the customer's
  // WhatsApp number, both shown on the success screen.
  const [inquiryNumber, setInquiryNumber] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Optional prefill — the "Create another inquiry" action on the account page
  // stashes an inquiry's details here so the form opens ready to tweak & resend.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("inquiry-prefill");
      if (!raw) return;
      sessionStorage.removeItem("inquiry-prefill");
      const p = JSON.parse(raw) as Partial<FormState>;
      setForm((f) => ({ ...f, ...p }));
    } catch {
      /* ignore malformed prefill */
    }
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/inquiry/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Image upload failed");
        setImages((prev) => [...prev, { url: data.url, name: file.name }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(i: number) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Please add at least your name and phone number.");
      return;
    }
    setStatus("sending");

    // Persist the inquiry → the server saves it, assigns the Inquiry Number and
    // emails the owner. No WhatsApp, no redirect, no mail client — on success we
    // simply show the confirmation screen.
    try {
      const res = await fetch("/api/inquiry/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, images: images.map((i) => i.url) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Sorry, we couldn't submit your inquiry. Please try again.");
        setStatus("idle");
        return;
      }
      setInquiryNumber(String(data.inquiry_number ?? ""));
      setCustomerPhone(form.phone.trim());
      setStatus("done");
    } catch {
      setError("Sorry, we couldn't submit your inquiry. Please try again.");
      setStatus("idle");
    }
  }

  function reset() {
    setForm(EMPTY);
    setImages([]);
    setInquiryNumber("");
    setCustomerPhone("");
    setStatus("idle");
    setError("");
  }

  return (
    <div className="relative rounded-clay bg-blush-50 p-6 shadow-clay sm:p-8">
      <AnimatePresence mode="wait">
        {status === "done" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-14 text-center"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <h3 className="mt-5 font-display text-2xl font-semibold text-darkberry">
              Inquiry Submitted Successfully
            </h3>
            <p className="mt-3 max-w-sm text-darkberry-light">
              Thank you for contacting Le Rasa Bakery. Our cake designer will
              review your enquiry. We will contact you soon on your WhatsApp
              number.
            </p>

            <div className="mt-6 w-full max-w-xs space-y-3">
              {customerPhone && (
                <div className="rounded-2xl bg-[#F9EEEA] px-5 py-3 shadow-clay-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-wine-dark">
                    Your WhatsApp
                  </p>
                  <p className="mt-0.5 font-display text-lg font-bold text-darkberry">
                    {customerPhone}
                  </p>
                </div>
              )}
              {inquiryNumber && (
                <div className="rounded-2xl bg-[#F9EEEA] px-5 py-3 shadow-clay-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-wine-dark">
                    Reference Number
                  </p>
                  <p className="mt-0.5 font-display text-2xl font-bold text-darkberry">
                    {inquiryNumber}
                  </p>
                </div>
              )}
            </div>

            <Button className="mt-7" variant="secondary" onClick={reset}>
              Create Another Inquiry
            </Button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div>
              <h3 className="font-display text-xl font-bold text-darkberry">
                Custom Cake Inquiry
              </h3>
              <p className="mt-1 text-sm text-darkberry-light">
                Tell us your vision — we&apos;ll reply on WhatsApp with a quote.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full name *</Label>
                <Input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone number *</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+44 …" required />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jane@email.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventType">Event type</Label>
                <select
                  id="eventType"
                  value={form.eventType}
                  onChange={(e) => set("eventType", e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>
                    Select an occasion…
                  </option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="deliveryDate">Delivery date</Label>
                <Input id="deliveryDate" type="date" value={form.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="servings">Required servings</Label>
                <Input id="servings" value={form.servings} onChange={(e) => set("servings", e.target.value)} placeholder="e.g. 20 people" />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget (optional)</Label>
                <Input id="budget" value={form.budget} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. £80–£120" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="flavour">Cake flavour</Label>
                <Input id="flavour" value={form.flavour} onChange={(e) => set("flavour", e.target.value)} placeholder="e.g. Belgian chocolate" />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shape">Cake shape</Label>
                <Input id="shape" value={form.shape} onChange={(e) => set("shape", e.target.value)} placeholder="e.g. Round, 2-tier" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="colour">Cake colour theme</Label>
                <Input id="colour" value={form.colour} onChange={(e) => set("colour", e.target.value)} placeholder="e.g. Blush & gold" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cakeMessage">Cake message</Label>
              <Input id="cakeMessage" value={form.cakeMessage} onChange={(e) => set("cakeMessage", e.target.value)} placeholder="e.g. Happy 30th, Priya!" />
            </div>

            {/* Reference images — multiple, previewed before sending. */}
            <div className="space-y-2">
              <Label>Reference images</Label>
              <div className="flex flex-wrap gap-3">
                {images.map((img, i) => (
                  <div key={img.url} className="relative h-20 w-20 overflow-hidden rounded-2xl border border-wine/15 shadow-clay-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      aria-label={`Remove ${img.name}`}
                      className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-darkberry/80 text-white transition-colors hover:bg-darkberry"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-wine/30 text-wine-dark transition-colors hover:bg-dustyrose-light/30">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFiles}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-xs text-darkberry-light">
                Add one or more inspiration photos — they&apos;re attached as links in
                your WhatsApp message.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Additional notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Allergies, dietary notes, delivery details, anything else…"
              />
            </div>

            {error && (
              <p className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={status === "sending" || uploading}>
              {status === "sending" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Order Inquiry
                </>
              )}
            </Button>
            <p className="text-center text-xs text-darkberry-light">
              We&apos;ll review your enquiry and contact you soon — no deposit needed to inquire.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
