"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { categories } from "@/lib/data";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    // Demo only — no backend. Simulate a request.
    setTimeout(() => setStatus("done"), 1100);
  }

  return (
    <div className="relative rounded-clay bg-blush-50 p-6 shadow-clay sm:p-8">
      <AnimatePresence mode="wait">
        {status === "done" ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-mauve/20 text-mauve">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <h3 className="mt-5 font-display text-2xl font-semibold text-darkberry">
              Order inquiry received!
            </h3>
            <p className="mt-2 max-w-sm text-darkberry-light">
              Thank you — our pastry team will be in touch within 24 hours to
              confirm the sweet details.
            </p>
            <Button
              className="mt-6"
              variant="secondary"
              onClick={() => setStatus("idle")}
            >
              Send another
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
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" placeholder="Jane Doe" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="jane@email.com"
                  required
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+44 …"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Needed by</Label>
                <Input id="date" name="date" type="date" />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">What are you after?</Label>
                <select
                  id="category"
                  name="category"
                  defaultValue=""
                  className="flex h-12 w-full rounded-2xl border border-wine/20 bg-blush-50 px-4 text-sm text-darkberry shadow-clay-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wine/50"
                >
                  <option value="" disabled>
                    Select a treat…
                  </option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  <option value="Other">Something else</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="servings">Servings / size</Label>
                <Input id="servings" name="servings" placeholder="e.g. 12 people" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Tell us about your celebration</Label>
              <Textarea
                id="message"
                name="message"
                placeholder="Occasion, flavours, colours, dietary notes, inspiration…"
                required
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={status === "sending"}
            >
              {status === "sending" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send order inquiry
                </>
              )}
            </Button>
            <p className="text-center text-xs text-darkberry-light">
              We&apos;ll reply within 24 hours. No deposit needed to inquire.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
