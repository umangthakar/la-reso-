// ============================================================
// Le Rasa — Cookie Policy (/cookie-policy)
//
// Deliberately a mirror of app/privacy-policy/page.tsx: same server-rendered
// structure, same PageHero + Reveal + card, same shared table of contents and
// block renderer. If you change one of these pages' layout, change both.
//
// A SERVER component: this is a page search engines and customers link to
// directly (the Privacy Policy points here twice), so the full text has to be in
// the HTML rather than fetched on the client. The only client island is the
// sticky table of contents, which needs a scroll observer.
//
// The text itself lives in lib/cookie-policy.ts — edit it there, not here.
// Anchors and the table of contents are derived from that array, so adding or
// reordering a section needs no change in this file. Section headings are used
// verbatim, so this page adds no numbering of its own (Termly's Cookie Policy
// headings are unnumbered, unlike the Privacy Policy's).
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/motion";
import { PolicyContent } from "@/components/policy-content";
import { LegalPolicyBlocks } from "@/components/legal-policy-blocks";
import { LegalPolicyToc } from "@/components/legal-policy-toc";
import { getPublicSettings } from "@/lib/site-settings-server";
import { unfilledSections } from "@/lib/legal-policy";
import {
  COOKIE_POLICY_ENTITY,
  COOKIE_POLICY_INTRO,
  COOKIE_POLICY_LAST_UPDATED,
  COOKIE_POLICY_SECTIONS,
} from "@/lib/cookie-policy";

// Branding is read no-store, so an admin edit to the brand name shows up in
// this page's <title> on the next request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getPublicSettings();

  const title = `Cookie Policy — ${branding.name}`;
  const description =
    `How ${COOKIE_POLICY_ENTITY} uses cookies and similar tracking technologies on ` +
    `${branding.name}, what each one is for, and how you can control or refuse them.`;

  // Read at call time, never at module scope — a top-level throw on a missing
  // env var breaks the production build. Absolute URLs are only emitted when
  // the site URL is actually configured, which also keeps Next from warning
  // about a relative canonical with no metadataBase.
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").replace(
    /\/$/,
    "",
  );
  const path = "/cookie-policy";

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

export default async function CookiePolicyPage() {
  const tocItems = COOKIE_POLICY_SECTIONS.map(({ id, heading }) => ({ id, heading }));
  const unfilled = unfilledSections(COOKIE_POLICY_SECTIONS).length;

  return (
    <>
      <PageHero
        eyebrow="Legal"
        title="Cookie Policy"
        description={`How ${COOKIE_POLICY_ENTITY} uses cookies and similar technologies, and how you can control them.`}
      />

      <section className="section-padding pt-2">
        <div className="container">
          {/* id="toc" is the target of any "table of contents" cross-reference in
              the notice. It sits on the wrapper so the jump lands on the sidebar
              on desktop and on the article's collapsed list on mobile — never on
              an element that is hidden at that breakpoint. */}
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
                    {COOKIE_POLICY_ENTITY}
                  </p>
                  {COOKIE_POLICY_LAST_UPDATED && (
                    <p className="mt-1 text-sm text-darkberry-light">
                      Last updated{" "}
                      <span className="font-semibold text-darkberry">
                        {COOKIE_POLICY_LAST_UPDATED}
                      </span>
                    </p>
                  )}
                </header>

                {/* Guard rail while the Termly export is still pending: makes an
                    unfinished legal page impossible to miss instead of letting
                    empty sections look intentional. Disappears once every
                    section has text. */}
                {unfilled > 0 && (
                  <p
                    role="status"
                    className="mt-6 rounded-2xl border border-dustyrose-dark/40 bg-blush-100 px-4 py-3 text-sm leading-relaxed text-darkberry"
                  >
                    <strong className="font-semibold">This policy is being updated.</strong>{" "}
                    {unfilled} of {COOKIE_POLICY_SECTIONS.length} sections are awaiting their
                    final wording. In the meantime, our{" "}
                    <Link
                      href="/privacy-policy"
                      className="font-medium text-wine underline hover:text-darkberry"
                    >
                      Privacy Policy
                    </Link>{" "}
                    explains how we handle your data.
                  </p>
                )}

                {COOKIE_POLICY_INTRO.trim() && (
                  <div className="mt-6">
                    <PolicyContent content={COOKIE_POLICY_INTRO} />
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

                {COOKIE_POLICY_SECTIONS.map((s) => (
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
