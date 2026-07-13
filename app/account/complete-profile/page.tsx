"use client";

// ============================================================
// Le Rasa Bakery — complete / edit profile (/account/complete-profile)
// Shown after Google login when the profile is incomplete, and reused
// as "Edit Profile" from the account page (pre-fills saved data).
// Saves to the profiles table (upsert on the user's own row).
// ============================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { createClient } from "@/utils/supabase/client";

type Address = { line1: string; street: string; city: string; postcode: string };

const EMPTY_ADDRESS: Address = { line1: "", street: "", city: "", postcode: "" };

/** Only same-origin paths are honoured as a post-save destination. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/account";
  return raw;
}

export default function CompleteProfilePage() {
  const router = useRouter();
  const { user, ready } = useAuth();

  // Carried through from the OAuth callback: where the customer was headed
  // before login (e.g. the product they were buying). Read from the URL
  // directly to avoid the useSearchParams Suspense requirement.
  const [next, setNext] = useState("/account");
  useEffect(() => {
    setNext(safeNext(new URLSearchParams(window.location.search).get("next")));
  }, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to login once we know there's no session.
  useEffect(() => {
    if (ready && !user) router.replace("/account/login");
  }, [ready, user, router]);

  // "Skip for now" must not strand a customer mid-purchase either.
  const skip = () => router.push(next);

  // Pre-fill: Google name as a default, then override with any saved profile.
  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;

    const parts = user.name.trim().split(/\s+/);
    setFirstName((prev) => prev || parts[0] || "");
    setLastName((prev) => prev || (parts.length > 1 ? parts.slice(1).join(" ") : ""));

    (async () => {
      const supabase = createClient() as unknown as SupabaseClient;
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,phone,default_address")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        if (data.first_name) setFirstName(data.first_name);
        if (data.last_name) setLastName(data.last_name);
        if (data.phone) setPhone(data.phone);
        const a = (data.default_address ?? {}) as Partial<Address>;
        setAddress({
          line1: a.line1 ?? "",
          street: a.street ?? "",
          city: a.city ?? "",
          postcode: a.postcode ?? "",
        });
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  async function handleSave() {
    if (!user) return;
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      setError("Please add your name and phone number.");
      return;
    }
    setSaving(true);
    setError(null);

    const supabase = createClient() as unknown as SupabaseClient;
    const { error: upErr } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        default_address: {
          line1: address.line1.trim(),
          street: address.street.trim(),
          city: address.city.trim(),
          postcode: address.postcode.trim().toUpperCase(),
        },
      },
      { onConflict: "id" },
    );

    if (upErr) {
      setError(upErr.message);
      setSaving(false);
      return;
    }
    router.push(next);
  }

  if (!ready || !user || loading) {
    return (
      <section className="pt-28 sm:pt-36">
        <div className="container flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-wine" />
        </div>
      </section>
    );
  }

  const setAddr = (k: keyof Address, v: string) =>
    setAddress((a) => ({ ...a, [k]: v }));

  return (
    <section className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <div className="pointer-events-none absolute -left-20 top-28 h-64 w-64 rounded-full bg-dustyrose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-dustyrose/25 blur-3xl" />

      <div className="container relative mx-auto max-w-lg">
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-sm font-semibold text-wine-dark transition-colors hover:text-plum"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to account
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 rounded-clay bg-blush-50 p-7 shadow-clay sm:p-9"
        >
          <h1 className="font-display text-2xl font-semibold text-darkberry sm:text-3xl">
            Complete your profile
          </h1>
          <p className="mt-1 text-sm text-darkberry-light">
            Save your details so checkout is one tap next time.
          </p>

          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" autoComplete="given-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" autoComplete="family-name" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07123 456789" autoComplete="tel" />
            </div>

            <div className="pt-2">
              <p className="text-sm font-bold uppercase tracking-wide text-wine-dark">
                Default delivery address
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="line1">House / flat</Label>
              <Input id="line1" value={address.line1} onChange={(e) => setAddr("line1", e.target.value)} placeholder="Flat 2, Rose Court" autoComplete="address-line1" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="street">Street</Label>
              <Input id="street" value={address.street} onChange={(e) => setAddr("street", e.target.value)} placeholder="Baker Street" autoComplete="address-line2" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={address.city} onChange={(e) => setAddr("city", e.target.value)} placeholder="London" autoComplete="address-level2" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postcode">Postcode</Label>
                <Input id="postcode" value={address.postcode} onChange={(e) => setAddr("postcode", e.target.value.toUpperCase())} placeholder="SW1A 1AA" autoComplete="postal-code" />
              </div>
            </div>

            {error && (
              <p className="rounded-2xl bg-wine/10 px-4 py-3 text-sm font-semibold text-wine-dark">
                {error}
              </p>
            )}

            <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Saving…" : "Save profile"}
            </Button>

            <button
              type="button"
              onClick={skip}
              className="w-full text-center text-sm font-semibold text-darkberry-light transition-colors hover:text-wine-dark"
            >
              Skip for now
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
