import { Locale } from "@/lib/i18n";
import { formatPriceExact } from "@/lib/format";
import { UNIT_TYPE_LABELS, UnitType } from "@/lib/enums";
import { Preference } from "@/lib/trade";

export const CASH_PREF_LABELS: Record<string, { ar: string; en: string }> = {
  i_pay: { ar: "المالك ممكن يدفع فرق", en: "Owner can pay a difference" },
  i_receive: { ar: "المالك عايز ياخد فرق", en: "Owner wants to receive a difference" },
  either: { ar: "فرق فلوس في أي اتجاه", en: "Cash either way" },
  none: { ar: "من غير فلوس", en: "No cash" },
};

/** What a listing's owner wants in exchange — read-only summary for the listing page and the trade market. */
export function TradeWants({
  pref,
  areaNames,
  locale,
  currency = "EGP",
}: {
  pref: Preference;
  areaNames: string[];
  locale: Locale;
  currency?: string;
}) {
  const ar = locale === "ar";
  const chips: string[] = [];
  if (pref.types.length) chips.push(pref.types.map((t) => UNIT_TYPE_LABELS[t as UnitType]?.[locale] ?? t).join(" / "));
  if (areaNames.length) chips.push(areaNames.join(" / "));
  if (pref.minBedrooms !== null) chips.push(ar ? `${pref.minBedrooms}+ غرف` : `${pref.minBedrooms}+ bed`);
  if (pref.minSizeSqm !== null) chips.push(ar ? `${pref.minSizeSqm}+ م²` : `${pref.minSizeSqm}+ sqm`);
  if (pref.minValue !== null || pref.maxValue !== null) {
    const lo = pref.minValue !== null ? formatPriceExact(pref.minValue, locale, currency) : "…";
    const hi = pref.maxValue !== null ? formatPriceExact(pref.maxValue, locale, currency) : "…";
    chips.push(`${lo} – ${hi}`);
  }
  chips.push(CASH_PREF_LABELS[pref.cash]?.[locale] ?? pref.cash);

  const open = !pref.types.length && !areaNames.length && pref.minBedrooms === null && pref.minSizeSqm === null;

  return (
    <div>
      <p className="tnum text-[13px] leading-relaxed text-ink-700">
        {open && <span>{ar ? "مفتوح لأي عرض" : "Open to any offer"} · </span>}
        {chips.join(" · ")}
      </p>
      {pref.note && <p className="mt-2 text-[13px] leading-relaxed text-ink-900">{pref.note}</p>}
    </div>
  );
}

export function TradeBadge({ locale }: { locale: Locale }) {
  return (
    <span className="badge badge-accent">
      {locale === "ar" ? "متاح للمقايضة" : "Open to trade"}
    </span>
  );
}
