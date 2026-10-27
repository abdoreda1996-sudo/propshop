import { Locale, t } from "@/lib/i18n";
import { PriceVerdict } from "@/lib/fairPrice";

/**
 * The core buyer-side hook (Section 6b-A). Deliberately understated: a factual
 * comparison against our own estimate, not a "DEAL!" flash.
 */
export default function PriceVerdictBadge({
  verdict,
  locale,
  className = "",
}: {
  verdict: PriceVerdict;
  locale: Locale;
  className?: string;
}) {
  if (verdict === "unknown") return null;

  const map = {
    below: { cls: "badge-below", key: "below_fair" },
    above: { cls: "badge-above", key: "above_fair" },
    fair: { cls: "badge-neutral", key: "within_fair" },
  } as const;

  const { cls, key } = map[verdict];

  return <span className={`badge ${cls} ${className}`}>{t(key, locale)}</span>;
}
