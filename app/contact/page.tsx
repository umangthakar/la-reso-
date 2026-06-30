import type { Metadata } from "next";
import { MapPin, Phone, Mail, Clock, Instagram } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ContactForm } from "@/components/contact-form";
import { Reveal } from "@/components/motion";

export const metadata: Metadata = {
  title: "Order & Contact — Le Rasa Bakery",
  description:
    "Start your custom eggless cake order or get in touch with Le Rasa Bakery. We reply within 24 hours.",
};

const info = [
  {
    icon: MapPin,
    label: "Visit us",
    value: "14 Honey Lane, London, E1 6AN",
  },
  { icon: Phone, label: "Call us", value: "+44 1234 567 890" },
  { icon: Mail, label: "Email", value: "hello@lerasabakery.com" },
  { icon: Clock, label: "Hours", value: "Tue–Sun · 9am – 7pm" },
];

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

export default function ContactPage() {
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
              <div className="overflow-hidden rounded-clay bg-gradient-to-br from-wine to-darkberry p-7 text-blush-50 shadow-clay-sm">
                <Instagram className="h-7 w-7" />
                <h3 className="mt-3 font-display text-xl font-semibold">
                  Prefer to DM us?
                </h3>
                <p className="mt-1.5 text-sm text-blush-100/85">
                  Slide into our inbox @lerasabakery for quick questions and a
                  daily dose of fresh bakes.
                </p>
              </div>
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

          {/* Form column */}
          <Reveal delay={0.1}>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
