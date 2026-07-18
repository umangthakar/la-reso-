// ============================================================
// Le Rasa Bakery — Custom Cakes helpers (shared, client-safe)
// ------------------------------------------------------------
// One place for "is this a Custom Cake?" and the WhatsApp enquiry link, so the
// product card and the product detail page stay in sync and there is a single
// WhatsApp implementation. The number is always the admin-configured contact
// WhatsApp (digits only) — never hardcoded here.
// ============================================================

/** True for products in the "Custom Cakes" category (case-insensitive, trimmed).
 *  These are enquiry-only: no Add to Cart / Buy Now, WhatsApp instead. */
export function isCustomCakeCategory(category: string | null | undefined): boolean {
  return (category ?? "").trim().toLowerCase() === "custom cakes";
}

/** Build the WhatsApp enquiry link for a custom cake. `whatsappNumber` comes
 *  from the admin-configured contact WhatsApp; it is reduced to digits and the
 *  same pre-filled message is used everywhere it's shown. Opens the customer's
 *  WhatsApp with the cake name and the details the bakery needs to discuss. */
export function customCakeWhatsappHref(
  whatsappNumber: string | null | undefined,
  productName: string,
): string {
  const digits = (whatsappNumber ?? "").replace(/[^0-9]/g, "");
  const message =
    `Hello Le Rasa,\n\n` +
    `I would like to order a custom cake.\n\n` +
    `Product:\n${productName}\n\n` +
    `Please help me with:\n\n` +
    `• Design\n` +
    `• Size\n` +
    `• Flavour\n` +
    `• Number of servings\n` +
    `• Delivery date\n` +
    `• Budget\n\n` +
    `Thank you.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
