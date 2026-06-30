import type { Metadata } from "next";
import Image from "next/image";
import { Heart, Sparkles, Leaf, Award, Users, Cake } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { SectionHeading } from "@/components/section-heading";
import { Reveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { OrderCTA } from "@/components/order-cta";

export const metadata: Metadata = {
  title: "About — Le Rasa Bakery",
  description:
    "Our story: how Le Rasa Bakery became the house of eggless desserts, baking inclusive, premium treats everyone can share.",
};

const stats = [
  { value: "2,400+", label: "Celebrations baked", icon: Cake },
  { value: "100%", label: "Eggless recipes", icon: Leaf },
  { value: "4.9★", label: "Average rating", icon: Award },
  { value: "12", label: "Pastry artisans", icon: Users },
];

const values = [
  {
    icon: Leaf,
    title: "Eggless, never less",
    body: "Every recipe is built egg-free from day one — so taste, texture and beauty are never an afterthought.",
  },
  {
    icon: Heart,
    title: "A seat for everyone",
    body: "Vegetarian families, allergy-conscious guests and curious foodies all share the same cake. That's the point.",
  },
  {
    icon: Sparkles,
    title: "Crafted, not churned",
    body: "We bake in small batches and hand-finish each order. No factory lines, just real pastry chefs.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Our Story"
        title="Born from a simple wish — cake for all"
        description="Le Rasa began in a tiny home kitchen with one stubborn belief: no one should sit out the celebration because of an egg."
      />

      {/* Story */}
      <section className="section-padding pt-6">
        <div className="container grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <div className="relative aspect-[4/5] w-full max-w-md overflow-hidden rounded-clay shadow-clay">
              <Image
                src="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80"
                alt="Baker decorating a cake"
                fill
                sizes="(max-width: 1024px) 90vw, 40vw"
                className="object-cover"
              />
            </div>
          </Reveal>
          <div>
            <SectionHeading
              align="left"
              eyebrow="Est. with love"
              title="From one home oven to a house of desserts"
            />
            <div className="mt-6 space-y-4 text-darkberry-light">
              <p>
                It started when our founder, Rasa, kept getting asked the same
                question at family gatherings: &ldquo;Is there anything I can
                actually eat?&rdquo; Vegetarian relatives, friends with egg
                allergies, little ones — too many people were left watching
                others enjoy dessert.
              </p>
              <p>
                So she set out to prove that eggless could be every bit as soft,
                rich and indulgent as the classics. After hundreds of test
                bakes, the recipes were undeniable. Word spread, the orders
                poured in, and Le Rasa Bakery was born.
              </p>
              <p>
                Today our team of pastry artisans bakes thousands of
                celebrations a year — and every single one is still 100%
                eggless, still made by hand, still rooted in that first simple
                wish: cake for all.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="pb-4">
        <div className="container">
          <StaggerGroup className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((s) => (
              <StaggerItem key={s.label}>
                <div className="rounded-clay bg-blush-50 p-6 text-center shadow-clay-sm">
                  <s.icon className="mx-auto h-7 w-7 text-wine" />
                  <p className="mt-3 font-display text-3xl font-semibold text-darkberry">
                    {s.value}
                  </p>
                  <p className="text-sm text-darkberry-light">{s.label}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      {/* Values */}
      <section className="section-padding">
        <div className="container">
          <SectionHeading
            eyebrow="What we believe"
            title="The values baked into every box"
          />
          <StaggerGroup className="mt-12 grid gap-6 md:grid-cols-3">
            {values.map((v) => (
              <StaggerItem key={v.title}>
                <div className="h-full rounded-clay bg-blush-50 p-7 shadow-clay-sm transition-shadow hover:shadow-clay">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-dustyrose-light text-wine-dark">
                    <v.icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 font-display text-xl font-semibold text-darkberry">
                    {v.title}
                  </h3>
                  <p className="mt-2 text-sm text-darkberry-light">{v.body}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </section>

      <OrderCTA />
    </>
  );
}
