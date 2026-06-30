import { Truck, Leaf, Gift, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const badges: { icon: LucideIcon; label: string }[] = [
  { icon: Truck, label: "Nationwide Delivery" },
  { icon: Leaf, label: "100% Eggless" },
  { icon: Gift, label: "Letterbox Friendly" },
];

export function TrustBadges({
  className,
  variant = "light",
}: {
  className?: string;
  /** "light" = on blush bg, "onDark" = on wine/dark bg */
  variant?: "light" | "onDark";
}) {
  const onDark = variant === "onDark";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-5 gap-y-2",
        className
      )}
    >
      {badges.map(({ icon: Icon, label }) => (
        <span
          key={label}
          className={cn(
            "inline-flex items-center gap-2 text-sm font-semibold",
            onDark ? "text-blush-100/90" : "text-darkberry-light"
          )}
        >
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full",
              onDark
                ? "bg-blush-50/15 text-blush-50"
                : "bg-dustyrose-light text-wine-dark"
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          {label}
        </span>
      ))}
    </div>
  );
}
