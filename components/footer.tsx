import Link from "next/link";
import { Cake, Instagram, Facebook, Twitter, Mail, MapPin, Phone } from "lucide-react";
import { CardCarousel } from "@/components/ui/card-carousel";

export function Footer() {
  return (
    <footer className="relative mt-10">
      {/* Instagram carousel — Swiper coverflow */}
      <section className="bg-[#F9EEEA] py-12">
        <div className="mx-auto max-w-7xl px-4">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#612437]">Follow the sweetness</h2>
              <p className="text-[#9C616D]">@lerasabakery — fresh bakes daily on Instagram</p>
            </div>
            <a
              href="https://instagram.com/lerasabakery"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-full px-5 py-2 font-semibold text-white"
              style={{ background: "#873853" }}
            >
              Follow us
            </a>
          </div>

          {/* Carousel */}
          <CardCarousel
            images={[
              { src: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&q=80", alt: "Chocolate cake" },
              { src: "https://images.unsplash.com/photo-1519869325930-281384150729?w=400&q=80", alt: "Cupcakes" },
              { src: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80", alt: "Pink cupcakes" },
              { src: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400&q=80", alt: "Raspberry cake" },
              { src: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&q=80", alt: "Cookies" },
              { src: "https://images.unsplash.com/photo-1548365328-8c6db3220e4d?w=400&q=80", alt: "Chocolate truffles" },
              { src: "https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=400&q=80", alt: "Birthday cake" },
              { src: "https://images.unsplash.com/photo-1587668178277-295251f900ce?w=400&q=80", alt: "Brownies" },
            ]}
            autoplayDelay={2000}
            showPagination={true}
            showNavigation={false}
          />
        </div>
      </section>

      {/* Main footer */}
      <div className="bg-darkberry text-blush-100">
        <div className="container grid gap-10 py-10 text-center sm:grid-cols-2 sm:py-14 sm:text-left lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center justify-center gap-2.5 sm:justify-start">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-wine text-blush-50">
                <Cake className="h-5 w-5" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="font-display text-lg font-semibold text-blush-50">
                  Le Rasa
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-dustyrose">
                  Eggless Bakery
                </span>
              </span>
            </Link>
            <p className="mx-auto mt-4 max-w-xs text-sm text-blush-100/70 sm:mx-0">
              The house of eggless desserts. Handcrafted cakes & treats baked
              fresh, so everyone gets a slice of the celebration.
            </p>
            <div className="mt-5 flex justify-center gap-3 sm:justify-start">
              {[Instagram, Facebook, Twitter].map((Icon, i) => (
                <Link
                  key={i}
                  href="#"
                  className="grid h-10 w-10 place-items-center rounded-full bg-blush-100/10 text-blush-50 transition-colors hover:bg-wine"
                >
                  <Icon className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-display text-base font-semibold text-blush-50">
              Explore
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-blush-100/70">
              {[
                { href: "/", label: "Home" },
                { href: "/menu", label: "Full Menu" },
                { href: "/about", label: "Our Story" },
                { href: "/contact", label: "Order Now" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-dustyrose">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-base font-semibold text-blush-50">
              Treats
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm text-blush-100/70">
              {[
                "Birthday Cakes",
                "Cupcakes",
                "Custom Cakes",
                "Brownies",
                "Cookies",
                "Gift Boxes",
              ].map((l) => (
                <li key={l}>
                  <Link href="/menu" className="transition-colors hover:text-dustyrose">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-display text-base font-semibold text-blush-50">
              Visit & Order
            </h4>
            <ul className="mt-4 space-y-3 text-sm text-blush-100/70">
              <li className="flex items-start justify-center gap-2.5 sm:justify-start">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-dustyrose" />
                14 Honey Lane, London, E1 6AN
              </li>
              <li className="flex items-center justify-center gap-2.5 sm:justify-start">
                <Phone className="h-4 w-4 shrink-0 text-dustyrose" />
                +44 1234 567 890
              </li>
              <li className="flex items-center justify-center gap-2.5 sm:justify-start">
                <Mail className="h-4 w-4 shrink-0 text-dustyrose" />
                hello@lerasabakery.com
              </li>
            </ul>
            <p className="mt-4 text-xs text-blush-100/60">
              Open Tue–Sun · 9am – 7pm
            </p>
          </div>
        </div>

        <div className="border-t border-blush-100/10">
          <div className="container flex flex-col items-center justify-between gap-3 py-6 text-xs text-blush-100/60 sm:flex-row">
            <p>© {new Date().getFullYear()} Le Rasa Bakery. All rights reserved.</p>
            <p className="flex items-center gap-1.5">
              Baked with <span className="text-wine">♥</span> & zero eggs
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
