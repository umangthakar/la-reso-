import { Cake } from "lucide-react";

/**
 * The logo container (navbar + footer). One definition so both places stay
 * visually identical. The uploaded logo (site_settings.logo) sits INSIDE the
 * fixed-size container; the wordmark beside it always stays visible.
 */
export function LogoMark({ logo }: { logo?: string | null }) {
  return (
    <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-2xl border-2 border-white/90 bg-[#F8F2EE] p-0.5 text-wine-dark shadow-[0_10px_30px_rgba(107,31,58,0.15)]">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="Le Rasa" className="h-full w-full object-contain" />
      ) : (
        <Cake className="h-5 w-5" />
      )}
    </span>
  );
}
