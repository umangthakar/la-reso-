// ============================================================
// Le Rasa Bakery — renders a policy's Markdown body.
//
// react-markdown produces React ELEMENTS and does not execute raw HTML, so a
// policy pasted in from a Word doc that happens to contain markup (or a
// <script> tag) renders as visible text and can never run. That property is
// the whole reason `content` is stored as Markdown rather than HTML — do not
// swap this for dangerouslySetInnerHTML.
//
// The project has no @tailwindcss/typography plugin, and Tailwind's reset
// strips headings and lists back to plain text, so each element is mapped to
// the site's existing type scale and colour tokens explicitly. No new styling
// primitives — these are the same classes the rest of the storefront uses.
// ============================================================

import Link from "next/link";
import ReactMarkdown from "react-markdown";

export function PolicyContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h2 className="mb-4 mt-10 font-display text-2xl font-semibold text-darkberry first:mt-0 sm:text-3xl">
            {children}
          </h2>
        ),
        h2: ({ children }) => (
          <h2 className="mb-3 mt-9 font-display text-xl font-semibold text-darkberry first:mt-0 sm:text-2xl">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-7 font-display text-lg font-semibold text-darkberry first:mt-0">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mb-4 leading-relaxed text-darkberry-light">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-4 list-disc space-y-1.5 pl-6 text-darkberry-light">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-4 list-decimal space-y-1.5 pl-6 text-darkberry-light">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold text-darkberry">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="mb-4 border-l-4 border-dustyrose/50 pl-4 italic text-darkberry-light">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded bg-blush-100 px-1.5 py-0.5 text-[0.9em] text-darkberry">
            {children}
          </code>
        ),
        hr: () => <hr className="my-8 border-darkberry/10" />,
        table: ({ children }) => (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-darkberry-light">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-darkberry/15 px-3 py-2 font-semibold text-darkberry">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-darkberry/10 px-3 py-2">{children}</td>
        ),
        a: ({ href, children }) => {
          const to = href ?? "";
          // Internal links go through next/link so they don't full-page reload;
          // anything else is treated as external and opened safely (noreferrer
          // strips the referrer, and target=_blank keeps the bakery's tab).
          if (to.startsWith("/")) {
            return (
              <Link href={to} className="font-medium text-wine underline hover:text-darkberry">
                {children}
              </Link>
            );
          }
          return (
            <a
              href={to}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-wine underline hover:text-darkberry"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
