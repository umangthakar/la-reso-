import { Egg, Leaf, Sparkles, Sprout, type LucideIcon } from "lucide-react";

const stats: { icon: LucideIcon; label: string }[] = [
  { icon: Egg, label: "0 Eggs, Ever" },
  { icon: Leaf, label: "100% Vegetarian" },
  { icon: Sparkles, label: "Lighter & Moister" },
  { icon: Sprout, label: "Clean Ingredients" },
];

export function TrustBar() {
  return (
    <section className="bg-[#F9EEEA] py-6">
      <div className="container">
        <div className="grid grid-cols-2 items-center justify-items-center gap-x-8 gap-y-4 rounded-clay bg-blush-50 px-4 py-4 shadow-clay-sm sm:px-6 md:flex md:flex-wrap md:justify-center md:gap-x-12">
          {stats.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-2.5 text-sm font-semibold text-darkberry sm:text-base"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-dustyrose-light text-wine-dark">
                <Icon className="h-4 w-4" />
              </span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
