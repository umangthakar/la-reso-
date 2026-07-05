"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/lib/use-auth";

/**
 * Shared frame for every /account/* leaf page: enforces the demo login guard,
 * shows a back link to the profile, and centres the content card.
 */
export function AccountSubPage({
  title,
  icon: Icon,
  headline,
  sub,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  sub: string;
}) {
  const router = useRouter();
  const { user, ready } = useAuth();

  useEffect(() => {
    if (ready && !user) router.replace("/account/login");
  }, [ready, user, router]);

  if (!ready || !user) {
    return (
      <section className="pt-28 sm:pt-36">
        <div className="container flex min-h-[40vh] items-center justify-center">
          <p className="text-darkberry-light">Loading…</p>
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
          {title}
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 flex flex-col items-center rounded-clay bg-blush-50 px-6 py-14 text-center shadow-clay"
        >
          <span className="grid h-20 w-20 place-items-center rounded-full bg-dustyrose-light text-wine-dark">
            <Icon className="h-9 w-9" />
          </span>
          <h2 className="mt-5 font-display text-xl font-semibold text-darkberry">
            {headline}
          </h2>
          <p className="mt-2 max-w-xs text-sm text-darkberry-light">{sub}</p>
        </motion.div>
      </div>
    </section>
  );
}
