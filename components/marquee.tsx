import { Cake } from "lucide-react";

const items = [
  "Eggless & Proud",
  "Baked Fresh Daily",
  "Custom Celebration Cakes",
  "Vegetarian Friendly",
  "Single-Origin Chocolate",
  "Made With Love",
  "Same-Day Gift Boxes",
];

export function Marquee() {
  const loop = [...items, ...items];
  return (
    <div className="relative -rotate-1 overflow-hidden border-y border-wine/15 bg-wine py-4 text-blush-50">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
        {loop.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-8 font-display text-lg font-medium tracking-wide sm:text-xl"
          >
            {item}
            <Cake className="h-4 w-4 shrink-0 opacity-70" />
          </span>
        ))}
      </div>
    </div>
  );
}
