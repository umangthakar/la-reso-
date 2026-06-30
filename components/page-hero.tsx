import { Reveal } from "@/components/motion";
import { Badge } from "@/components/ui/badge";

export function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="relative overflow-hidden pb-10 pt-28 sm:pt-36 md:pt-44">
      <div className="pointer-events-none absolute -left-20 top-28 h-64 w-64 rounded-full bg-dustyrose/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-dustyrose/25 blur-3xl" />
      <div className="container relative text-center">
        <Reveal>
          <Badge variant="soft" className="mb-4">
            {eyebrow}
          </Badge>
          <h1 className="font-display text-3xl font-semibold leading-tight text-darkberry text-balance sm:text-5xl md:text-6xl">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-darkberry-light text-balance md:text-lg">
            {description}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
