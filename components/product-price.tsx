// ============================================================
// Le Rasa Bakery — <PriceText />
// Renders ONLY the inner price content (no wrapper), so it drops straight in
// where a `£{product.price.toFixed(2)}` text node lived, inheriting each call
// site's existing font/color classes unchanged. When an active offer discounts
// the product it shows the original struck through + the discounted price
// (and, with `badge`, a small "% OFF" chip). Backed by the single shared
// resolveProductPrice() in lib/offers.ts.
// ============================================================

import { resolveProductPrice } from "@/lib/offers";
import type { ActiveOffers } from "@/lib/use-active-offer";

export function PriceText({
  product,
  offers,
  badge = false,
}: {
  product: { id: string; category?: string | null; price: number };
  offers: ActiveOffers;
  badge?: boolean;
}) {
  const view = resolveProductPrice(product, offers);

  if (!view.hasDiscount) {
    return <>£{view.originalPrice.toFixed(2)}</>;
  }

  return (
    <>
      <span style={{ textDecoration: "line-through", opacity: 0.55, fontWeight: 400, marginRight: "0.4em" }}>
        £{view.originalPrice.toFixed(2)}
      </span>
      £{view.discountedPrice.toFixed(2)}
      {badge && (
        <span
          style={{
            marginLeft: "0.5em",
            borderRadius: 999,
            background: "#d9534f",
            color: "white",
            fontSize: "0.7em",
            fontWeight: 700,
            padding: "0.1em 0.5em",
            whiteSpace: "nowrap",
            verticalAlign: "middle",
          }}
        >
          {view.badgeText}
        </span>
      )}
    </>
  );
}
