// ============================================================
// Le Rasa — Privacy Policy (/privacy-policy)
//
// A SERVER component: this is a page search engines and customers link to
// directly, so the full text has to be in the HTML rather than fetched on the
// client. The only client island is the sticky table of contents, which needs a
// scroll observer to highlight the section being read.
//
// The text itself is the Termly export for LE RASA and lives in
// lib/privacy-policy.ts — edit it there, not here. Anchors and the table of
// contents are derived from that array, so adding or reordering a section needs
// no change in this file. Section headings carry Termly's own numbering, so
// this page deliberately adds none of its own.
//
// Note: the separate admin-managed policy at /policies/[slug] is intentionally
// left alone; this route does not touch it.
// ============================================================

import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/motion";
import { PolicyContent } from "@/components/policy-content";
import { LegalPolicyBlocks } from "@/components/legal-policy-blocks";
import { LegalPolicyToc } from "@/components/legal-policy-toc";
import { getPublicSettings } from "@/lib/site-settings-server";
import {
  PRIVACY_POLICY_ENTITY,
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
} from "@/lib/privacy-policy";

// This page's CONTENT is code-owned (lib/privacy-policy.ts) — the admin panel
// cannot change a word of it. The only dynamic value is the brand name in the
// <title>. So instead of re-rendering ~43 kB of static legal copy on every
// request, it is cached and revalidated every 5 minutes; a brand rename shows
// up within that window, or immediately via revalidateTag("site-settings").
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getPublicSettings({ revalidate: 300 });

  const title = `Privacy Policy — ${branding.name}`;
  const description =
    `How ${PRIVACY_POLICY_ENTITY} collects, uses, shares and protects your personal ` +
    `information when you browse or order from ${branding.name}, and the privacy rights you have.`;

  // Read at call time, never at module scope — a top-level throw on a missing
  // env var breaks the production build. Absolute URLs are only emitted when
  // the site URL is actually configured, which also keeps Next from warning
  // about a relative canonical with no metadataBase.
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").replace(
    /\/$/,
    "",
  );
  const path = "/privacy-policy";

  return {
    title,
    description,
    ...(siteUrl
      ? { metadataBase: new URL(siteUrl), alternates: { canonical: path } }
      : {}),
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "article",
      siteName: branding.name,
      ...(siteUrl ? { url: `${siteUrl}${path}` } : {}),
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function PrivacyPolicyPage() {
  const tocItems = PRIVACY_POLICY_SECTIONS.map(({ id, heading }) => ({ id, heading }));

  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Privacy Policy"
        description={`How ${PRIVACY_POLICY_ENTITY} collects, uses and protects your personal information.`}
      />

      <section className="section-padding pt-2">
        <div className="container">
          {/* id="toc" is the target of the notice's own "table of contents"
              cross-references. It sits on the wrapper so the jump lands on the
              sidebar on desktop and on the article's collapsed list on mobile —
              never on an element that is hidden at that breakpoint. */}
          <div
            id="toc"
            className="mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12"
          >
            {/* Desktop table of contents */}
            <aside className="hidden lg:block">
              <LegalPolicyToc items={tocItems} />
            </aside>

            <Reveal>
              <article className="rounded-clay bg-white p-6 shadow-clay sm:p-10">
                <header className="border-b border-darkberry/10 pb-6">
                  <p className="font-display text-lg font-semibold text-darkberry">
                    {PRIVACY_POLICY_ENTITY}
                  </p>
                  {PRIVACY_POLICY_LAST_UPDATED && (
                    <p className="mt-1 text-sm text-darkberry-light">
                      Last updated{" "}
                      <span className="font-semibold text-darkberry">
                        {PRIVACY_POLICY_LAST_UPDATED}
                      </span>
                    </p>
                  )}
                </header>

                {PRIVACY_POLICY_INTRO.trim() && (
                  <div className="mt-6">
                    <PolicyContent content={PRIVACY_POLICY_INTRO} />
                  </div>
                )}

                {/* Mobile / tablet: the desktop sidebar is hidden, so the same
                    anchors are offered as a collapsed list. */}
                <details className="mt-6 rounded-2xl bg-blush-100/70 px-4 py-3 lg:hidden">
                  <summary className="cursor-pointer text-sm font-semibold text-darkberry">
                    Jump to a section
                  </summary>
                  <ol className="mt-3 space-y-1.5 pl-1 text-sm">
                    {tocItems.map((item) => (
                      <li key={item.id} className="leading-snug">
                        <a href={`#${item.id}`} className="text-wine underline">
                          {item.heading}
                        </a>
                      </li>
                    ))}
                  </ol>
                </details>

                {PRIVACY_POLICY_SECTIONS.map((s) => (
                  <section key={s.id} id={s.id} className="mt-10 scroll-mt-28">
                    <h2 className="mb-3 font-display text-xl font-semibold text-darkberry sm:text-2xl">
                      {s.heading}
                    </h2>
                    <LegalPolicyBlocks blocks={s.blocks} />
                  </section>
                ))}
              </article>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
