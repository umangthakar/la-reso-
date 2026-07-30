// ============================================================
// Le Rasa — Cookie Policy (/policies/cookie-policy)
//
// A STATIC segment, so it takes precedence over app/policies/[slug]. That is
// deliberate but has a sharp edge worth knowing:
//
//   The `policies` table still holds a `cookie-policy` row. That row is what
//   puts "Cookie Policy" in the footer bar and on the /policies index (both are
//   DB-driven), but its CONTENT is never rendered — this file is. Editing the
//   Cookie Policy in the admin panel therefore has no visible effect. Edit
//   lib/cookie-policy-content.ts instead, regenerated from the Termly export.
//
// Why this route isn't DB-driven like Terms/Delivery/Refund: PolicyContent
// renders Markdown and by design never executes HTML, so it cannot preserve the
// Termly export's tables, anchors and stylesheet. Everything around the document
// — hero, container, card, header, footer — is identical to /policies/[slug], so
// the page still matches its siblings.
// ============================================================

import type { Metadata } from "next";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/motion";
import { getPublicSettings } from "@/lib/site-settings-server";
import {
  COOKIE_POLICY_CSS,
  COOKIE_POLICY_HTML,
} from "@/lib/cookie-policy-content";

// Matches its siblings: branding is read no-store so an admin rename shows up
// in this page's <title> on the next request.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getPublicSettings();

  const title = `Cookie Policy — ${branding.name}`;
  const description =
    "How LE RASA LIMITED uses cookies and similar technologies to recognise you " +
    "when you visit our website, and how you can control them.";

  // Read at call time, never at module scope — a top-level throw on a missing
  // env var breaks the production build.
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").replace(
    /\/$/,
    "",
  );
  const path = "/policies/cookie-policy";

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

export default function CookiePolicyPage() {
  return (
    <>
      <PageHero
        eyebrow="Policies"
        title="Cookie Policy"
        description="How we use cookies and similar technologies, and how you can control them."
      />

      <section className="section-padding pt-2">
        <div className="container">
          <Reveal>
            {/* Same card as app/policies/[slug]/page.tsx — identical radius,
                background, padding and shadow, so this page sits alongside its
                siblings unchanged. */}
            <article className="mx-auto max-w-3xl rounded-clay bg-white p-6 shadow-clay sm:p-10">
              {/* The export's own stylesheet, selectors scoped to .termly-policy
                  (see lib/cookie-policy-content.ts). Rendered before the markup
                  so the document is styled on first paint.

                  dangerouslySetInnerHTML, not a JSX child: React escapes text
                  children, which turns the attribute selectors' quotes into
                  &#x27; and the child combinators into &gt; — invalid CSS that
                  silently fails to apply. */}
              <style dangerouslySetInnerHTML={{ __html: COOKIE_POLICY_CSS }} />

              {/* OUR layer, not Termly's — added after so it wins, and scoped to
                  the same container. The export was written for a full-width
                  page and has no responsive rules of its own; these three keep
                  its fixed-width tables, long cookie values and the logo inside
                  the card on a phone. Nothing Termly declared is overridden. */}
              <style
                dangerouslySetInnerHTML={{
                  __html: `
.termly-policy { overflow-wrap: anywhere; }
.termly-policy img, .termly-policy table, .termly-policy section { max-width: 100%; }
.termly-policy td, .termly-policy th { word-break: break-word; }
`,
                }}
              />

              {/*
                Static, code-reviewed markup straight from the Termly export —
                not user input, and verified free of <script>, <iframe> and
                inline event handlers. `overflow-x-auto` keeps the wide cookie
                tables scrollable inside the card instead of forcing the whole
                page to scroll sideways on a phone.
              */}
              <div
                className="termly-policy overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: COOKIE_POLICY_HTML }}
              />
            </article>
          </Reveal>
        </div>
      </section>
    </>
  );
}
