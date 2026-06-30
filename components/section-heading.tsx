import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className
      )}
    >
      {eyebrow && (
        <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-dustyrose-light/70 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-wine-dark">
          <span className="h-1.5 w-1.5 rounded-full bg-wine" />
          {eyebrow}
        </span>
      )}
      <h2 className="font-display text-3xl font-semibold leading-tight text-darkberry text-balance sm:text-4xl md:text-5xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base text-darkberry-light text-balance md:text-lg">
          {description}
        </p>
      )}
    </Reveal>
  );
}
