"use client";

// ============================================================
// Le Rasa — sticky desktop table of contents for the legal pages
// (/privacy-policy, /cookie-policy).
//
// The links are plain #anchors, so they work with JavaScript disabled and the
// smooth-scroll / scroll-margin rules already in globals.css. The only thing
// this component adds on top is highlighting whichever section you're reading,
// which is why it's the one client island on otherwise server-rendered pages.
//
// Rendered by each page inside a `hidden lg:block` aside — the mobile view gets
// a collapsible list instead, so this never has to be responsive itself.
// ============================================================

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type TocItem = { id: string; heading: string };

export function LegalPolicyToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? "");

  // `items` comes from a server component, so it's a fresh array on every
  // render — key the effect on the ids themselves rather than the array.
  const ids = items.map((i) => i.id).join(",");

  useEffect(() => {
    const elements = ids
      .split(",")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Of everything currently inside the band, the highest one on screen
        // is what the reader is actually on.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Top offset clears the sticky header; the large negative bottom keeps
      // only sections in the upper part of the viewport eligible, so the
      // highlight tracks reading position instead of jumping to the last
      // section that happens to be partly visible.
      { rootMargin: "-120px 0px -65% 0px" },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return (
    <nav
      aria-labelledby="legal-toc-heading"
      className="sticky top-28 max-h-[calc(100vh-9rem)] overflow-y-auto rounded-clay bg-white/70 p-5 shadow-clay-sm"
    >
      <p
        id="legal-toc-heading"
        className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-mauve-dark"
      >
        On this page
      </p>
      <ol className="space-y-1 text-sm">
        {items.map((item, i) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex gap-2 rounded-md px-2 py-1.5 leading-snug transition-colors",
                  isActive
                    ? "bg-blush-100 font-semibold text-wine"
                    : "text-darkberry-light hover:bg-blush-100/60 hover:text-darkberry",
                )}
              >
                <span aria-hidden="true" className="shrink-0 tabular-nums opacity-60">
                  {i + 1}.
                </span>
                <span>{item.heading}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
