"use client";

// ============================================================
// Le Rasa Bakery — storefront Ingredient icon row.
// ------------------------------------------------------------
// Renders the product's selected ingredient icons as a clean, minimal row of
// small MONOCHROME OUTLINE icons (Lucide) + labels — an elegant, artisan look
// (no emoji, no pills, no chips, no shadows, transparent background).
//
// Presentation only: the icon KEYS + labels still come from the shared
// registry (lib/ingredient-icons) that the admin panel edits; this component
// just maps each key to a tasteful outline glyph for display. Adding a new
// registry key without a mapping here simply falls back to the leaf glyph.
// ============================================================

import type { LucideIcon } from "lucide-react";
import {
  Milk,
  Wheat,
  Bean,
  Cookie,
  Dessert,
  IceCreamCone,
  Coffee,
  Nut,
  Cherry,
  Apple,
  Banana,
  Citrus,
  Grape,
  Flower,
  Flower2,
  Leaf,
  Droplet,
  Candy,
} from "lucide-react";

// key → outline glyph. Where Lucide has no exact ingredient, the closest
// tasteful match is used (all nuts → Nut, citrus fruit → Citrus, herbs/spices
// → Leaf, etc.) so the row stays visually consistent and understated.
const ICON_BY_KEY: Record<string, LucideIcon> = {
  milk: Milk,
  wheat: Wheat,
  soya: Bean,
  chocolate: Cookie,
  butter: Dessert,
  cream: IceCreamCone,
  vanilla: Flower2,
  coffee: Coffee,
  coconut: Nut,
  strawberry: Cherry,
  cherry: Cherry,
  mango: Apple,
  banana: Banana,
  lemon: Citrus,
  orange: Citrus,
  blueberry: Grape,
  pistachio: Nut,
  almond: Nut,
  hazelnut: Nut,
  cashew: Nut,
  honey: Droplet,
  caramel: Candy,
  cinnamon: Leaf,
  mint: Leaf,
  rose: Flower,
  saffron: Flower2,
  cardamom: Leaf,
  sugar: Dessert,
};

type Props = {
  icons: { key: string; label: string }[];
};

export default function IngredientIconList({ icons }: Props) {
  if (!icons || icons.length === 0) return null;

  return (
    // Inline on desktop, wrapping naturally on mobile with equal spacing
    // (20px column gap desktop / 24px on ≥sm; 8px row gap when wrapped).
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:gap-x-6">
      {icons.map(({ key, label }) => {
        const Glyph = ICON_BY_KEY[key] ?? Leaf;
        return (
          <li
            key={key}
            className="inline-flex items-center gap-1.5 text-[14px] font-medium text-darkberry-light transition-colors duration-200 hover:text-wine-dark sm:text-[15px]"
          >
            <Glyph className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
