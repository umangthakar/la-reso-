import type { Metadata } from "next";
import { MapPin, Phone, Mail, Clock, Instagram } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ContactForm } from "@/components/contact-form";
import { Reveal } from "@/components/motion";
import { getPublicSettings } from "@/lib/site-settings-server";
import { instagramUrl, instagramHandle } from "@/lib/site-settings";

// Re-fetch settings server-side on every request (getPublicSettings is
// no-store) so the contact phone always reflects the admin value.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order & Contact — Le Rasa Bakery",
  description:
    "Start your custom eggless cake order or get in touch with Le Rasa Bakery. We reply within 24 hours.",
};

const faqs = [
  {
    q: "How far in advance should I order?",
    a: "For custom cakes we recommend 5–7 days. Smaller treats and gift boxes can often be arranged within 48 hours.",
  },
  {
    q: "Is everything really eggless?",
    a: "Yes — 100% of our menu is egg-free and vegetarian. We bake in an egg-free kitchen.",
  },
  {
    q: "Do you deliver?",
    a: "We deliver across London and offer nationwide shipping on selected gift boxes and brownies.",
  },
  {
    q: "Can you cater to other allergies?",
    a: "Absolutely — note any requirements in your inquiry and we'll do our best to accommodate.",
  },
];

export default async function ContactPage() {
  const settings = await getPublicSettings();
  const { contact } = settings;
  const phone = contact.phone.trim();
  const email = contact.email.trim();
  const address = contact.address.trim();
  // Instagram from the single source (settings.instagram_url) → link + @handle.
  const igUrl = instagramUrl(settings.instagram_url);
  const igHandle = instagramHandle(settings.instagram_url);

  // All contact info comes from the unified Contact Details (site_settings.contact).
  // Each row only appears when its value is set — no hardcoded contact info.
  const info = [
    ...(address ? [{ icon: MapPin, label: "Visit us", value: address }] : []),
    ...(phone ? [{ icon: Phone, label: "Call us", value: phone }] : []),
    ...(email ? [{ icon: Mail, label: "Email", value: email }] : []),
    { icon: Clock, label: "Hours", value: "Tue–Sun · 9am – 7pm" },
  ];

  return (
    <>
      <PageHero
        eyebrow="Let's Bake Together"
        title="Start your order"
        description="Tell us about your celebration and we'll craft a one-of-a-kind eggless treat. Fill in the form — we reply within 24 hours."
      />

      <section className="pb-24">
        <div className="container grid gap-10 lg:grid-cols-[1fr,1.2fr] lg:gap-12">
          {/* Info column */}
          <div className="space-y-6">
            <Reveal>
              <div className="grid gap-4 sm:grid-cols-2">
                {info.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-clay bg-blush-50 p-5 shadow-clay-sm"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-dustyrose-light text-wine-dark">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-xs font-bold uppercase tracking-wider text-wine-dark">
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-darkberry">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <a
                href={igUrl || undefined}
                target={igUrl ? "_blank" : undefined}
                rel={igUrl ? "noreferrer" : undefined}
                className="block overflow-hidden rounded-clay bg-gradient-to-br from-wine to-darkberry p-7 text-blush-50 shadow-clay-sm transition-transform hover:-translate-y-0.5"
              >
                <Instagram className="h-7 w-7" />
                <h3 className="mt-3 font-display text-xl font-semibold">
                  Prefer to DM us?
                </h3>
                <p className="mt-1.5 text-sm text-blush-100/85">
                  Slide into our inbox {igHandle || "on Instagram"} for quick
                  questions and a daily dose of fresh bakes.
                </p>
              </a>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="rounded-clay bg-blush-50 p-6 shadow-clay-sm">
                <h3 className="font-display text-lg font-semibold text-darkberry">
                  Frequently asked
                </h3>
                <div className="mt-4 space-y-4">
                  {faqs.map((f) => (
                    <div key={f.q} className="border-b border-wine/10 pb-4 last:border-0 last:pb-0">
                      <p className="font-semibold text-darkberry">{f.q}</p>
                      <p className="mt-1 text-sm text-darkberry-light">{f.a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Form column — Custom Cake Inquiry. The header "Contact for Custom
              Order" button scrolls here (#inquiry); scroll-mt clears the sticky
              header. */}
          <div id="inquiry" className="scroll-mt-28">
            <Reveal delay={0.1}>
              <ContactForm />
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
