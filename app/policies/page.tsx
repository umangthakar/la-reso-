// ============================================================
// Le Rasa Bakery — policy index (/policies)
//
// One card per enabled policy, in the admin's order. This is where
// `short_description` and `read_more_text` are actually used — the footer only
// has room for titles, so without this page those two admin fields would have
// nowhere to appear.
//
// The list is read from the database and nothing else: no fallback array, so a
// policy the admin adds shows up here with no code change, and one they
// disable disappears.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { getPolicies } from "@/lib/policies-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Policies — Le Rasa Bakery",
  description:
    "Our privacy, delivery, refund and terms policies — everything you agree to when ordering from Le Rasa Bakery.",
};

export default async function PoliciesPage() {
  const policies = await getPolicies();

  return (
    <>
      <PageHero
        eyebrow="Policies"
        title="The small print, in plain English"
        description="How we handle your data, deliver your order, and put things right when something goes wrong."
      />

      <section className="section-padding pt-2">
        <div className="container">
          {policies.length === 0 ? (
            <Reveal>
              <p className="mx-auto max-w-2xl text-center text-darkberry-light">
                Our policies are being updated. Please check back soon.
              </p>
            </Reveal>
          ) : (
            <StaggerGroup className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
              {policies.map((p) => (
                <StaggerItem key={p.id}>
                  <Link
                    href={`/policies/${p.slug}`}
                    className="group flex h-full flex-col rounded-clay bg-white p-6 shadow-clay transition-shadow hover:shadow-lg sm:p-8"
                  >
                    <h2 className="font-display text-xl font-semibold text-darkberry">
                      {p.title}
                    </h2>
                    {p.short_description && (
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-darkberry-light">
                        {p.short_description}
                      </p>
                    )}
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-wine">
                      {p.read_more_text || "Read More"}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerGroup>
          )}
        </div>
      </section>
    </>
  );
}
