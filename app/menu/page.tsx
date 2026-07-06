import { Suspense } from "react";
import type { Metadata } from "next";
import { MenuGrid } from "@/components/menu-grid";
import { TrustBar } from "@/components/trust-bar";
import { OrderCTA } from "@/components/order-cta";
import { getPublicSettings } from "@/lib/site-settings-server";

// Never statically cache the menu — hero banner + products must reflect admin
// edits on the next request (no redeploy).
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Menu — Le Rasa Bakery",
  description:
    "Browse our full menu of 100% eggless cakes, cupcakes, brownies, cookies and gift boxes. Filter by category and order your favourites.",
};

export default async function MenuPage() {
  // Fetched no-store (getPublicSettings) so admin edits reflect immediately;
  // the page is force-dynamic so this re-runs on every request.
  const { whatsapp_bar, contact } = await getPublicSettings();
  // Number comes solely from the unified Contact Details (contact.whatsapp),
  // digits only — never a hardcoded fallback.
  const waNumber = contact.whatsapp.replace(/[^0-9]/g, "");

  return (
    <>
      {/* WhatsApp bar — admin-managed (Content & Settings → WhatsApp Bar).
          Only shown when enabled AND a number is set in the database.
          Same dark-rose styling as the previous promo bar. */}
      {whatsapp_bar.enabled && waNumber && (
        <div className="block w-full bg-[#873853] text-white transition-colors hover:bg-[#743249]">
          <div className="container flex flex-col items-center justify-center gap-1 py-3 text-center text-sm font-medium sm:flex-row sm:justify-center sm:gap-2">
            <span>
              {whatsapp_bar.text}{" "}
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline underline-offset-2 hover:opacity-90"
              >
                Click here
              </a>
            </span>
          </div>
        </div>
      )}

      <section className="pb-24">
        <div className="container">
          <Suspense fallback={<div className="py-20 text-center text-darkberry-light">Loading menu…</div>}>
            <MenuGrid />
          </Suspense>
        </div>
      </section>

      {/* Everything that used to live on the homepage now lives below the grid */}
      <TrustBar />
      <OrderCTA />
    </>
  );
}
