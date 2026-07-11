// ============================================================
// Le Rasa Bakery — a single policy (/policies/[slug])
//
// A SERVER component, unlike /menu/[slug]: policy pages are the ones search
// engines and customers link to directly, so the content must be in the HTML
// and the <title>/description must come from the policy itself. Rendering it
// client-side would ship an empty shell to crawlers.
//
// The slug is a real stored column, so this is a direct lookup — no
// re-slugifying titles to find a match, and renaming a policy's title can
// never break a bookmarked URL.
// ============================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/motion";
import { PolicyContent } from "@/components/policy-content";
import { getPolicy } from "@/lib/policies-server";

// The content is read no-store so an admin edit is live on the next request.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const policy = await getPolicy(params.slug);
  if (!policy) return { title: "Policy — Le Rasa Bakery" };
  return {
    title: `${policy.title} — Le Rasa Bakery`,
    description: policy.short_description || undefined,
  };
}

export default async function PolicyPage({ params }: { params: { slug: string } }) {
  const policy = await getPolicy(params.slug);

  // null  = no such published policy -> a real 404.
  // undefined = the database was unreachable, so we don't KNOW. Throwing shows
  // the error boundary; calling notFound() here would tell crawlers a live
  // policy is permanently gone because of a transient outage.
  if (policy === null) notFound();
  if (!policy) throw new Error("Policies are temporarily unavailable");

  return (
    <>
      <PageHero
        eyebrow="Policies"
        title={policy.title}
        description={policy.short_description}
      />

      <section className="section-padding pt-2">
        <div className="container">
          <Reveal>
            <article className="mx-auto max-w-3xl rounded-clay bg-white p-6 shadow-clay sm:p-10">
              {policy.content.trim() ? (
                <PolicyContent content={policy.content} />
              ) : (
                <p className="leading-relaxed text-darkberry-light">
                  This policy hasn’t been written yet. Please check back soon.
                </p>
              )}
            </article>
          </Reveal>
        </div>
      </section>
    </>
  );
}
