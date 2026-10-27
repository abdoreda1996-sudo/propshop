import Link from "next/link";
import { Camera } from "lucide-react";
import SaveButton from "./SaveButton";
import CardPhotos from "./CardPhotos";
import { Locale, t } from "@/lib/i18n";
import { ListingCardVM } from "@/lib/listings";
import { formatPriceExact, formatNumber } from "@/lib/format";
import { FINISHING_LABELS, UNIT_TYPE_LABELS, Finishing, UnitType } from "@/lib/enums";

/**
 * "6 days ago", with correct Arabic plurals: Arabic marks 1, 2, 3-10 and 11+ differently,
 * and "من 3 يوم" reads as broken Arabic to a native speaker.
 */
function relativeDays(days: number, locale: Locale): string {
  if (locale !== "ar") {
    if (days <= 0) return "today";
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  if (days <= 0) return "النهارده";
  if (days === 1) return "امبارح";
  if (days === 2) return "من يومين";
  if (days <= 10) return `من ${days} أيام`;
  return `من ${days} يوم`;
}

const VERDICT = {
  below: { cls: "text-ok-700", key: "below_fair" },
  above: { cls: "text-danger-700", key: "above_fair" },
  fair: { cls: "text-ink-500", key: "within_fair" },
} as const;

/**
 * A listing as a photo with its facts underneath (grid) or beside it (row). Used on the
 * market overview and in saved homes.
 *
 * The card is NOT one big link: the heart is a button, and a button inside a link is
 * invalid HTML that some browsers resolve by navigating. The photo and the title are the
 * links; the heart sits over the photo, outside both.
 *
 * Every listing on the site is verified, so there is no "Verified" badge on each photo.
 */
export default function ListingCard({
  vm,
  locale,
  layout = "row",
}: {
  vm: ListingCardVM;
  locale: Locale;
  layout?: "row" | "grid";
}) {
  const ar = locale === "ar";
  const place = ar ? (vm.compoundAr ?? vm.areaAr) : (vm.compoundEn ?? vm.areaEn);
  const area = ar ? vm.areaAr : vm.areaEn;
  const title = (ar ? vm.titleAr : vm.titleEn) || place;
  const verdict = vm.verdict !== "unknown" ? VERDICT[vm.verdict] : null;

  const specs = [
    UNIT_TYPE_LABELS[vm.type as UnitType]?.[locale] ?? vm.type,
    vm.bedrooms > 0 ? `${formatNumber(vm.bedrooms, locale)} ${ar ? "غرف" : vm.bedrooms === 1 ? "bed" : "beds"}` : null,
    `${formatNumber(vm.sizeSqm, locale)} ${t("sqm", locale)}`,
    layout === "row" ? FINISHING_LABELS[vm.finishing as Finishing]?.[locale] ?? vm.finishing : null,
    layout === "row" ? (vm.deliveryStatus === "ready" ? t("ready_to_move", locale) : t("under_construction", locale)) : null,
  ].filter(Boolean) as string[];

  const photo = (
    <div className="relative shrink-0">
      <CardPhotos
        photos={vm.photos}
        href={vm.href}
        alt={title}
        ar={ar}
        className={`media-frame rounded-md ${layout === "row" ? "aspect-[4/3] w-full sm:h-[170px] sm:w-[230px]" : "aspect-[4/3] w-full"}`}
      >
        {vm.photoCount > 1 && (
          <span
            dir="ltr"
            className="pointer-events-none absolute bottom-2 end-2 z-[2] flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[12px] font-semibold text-white"
          >
            <Camera size={11} />
            <span className="tnum">{formatNumber(vm.photoCount, locale)}</span>
          </span>
        )}
        {vm.tourCount > 0 && (
          <span className="pointer-events-none absolute bottom-2 start-2 z-[2] rounded bg-white px-1.5 py-0.5 text-[12px] font-semibold text-ink-900">
            {ar ? "فيها جولة" : "Has a tour"}
          </span>
        )}
      </CardPhotos>
      <SaveButton listingId={vm.id} className="absolute end-2 top-2 z-10 bg-white" />
    </div>
  );

  const body = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="tnum text-[18px] font-semibold leading-tight text-ink-900">
        {formatPriceExact(vm.price, locale, vm.currency)}
        {vm.purpose === "rent" && <span className="ms-1 text-[12px] font-normal text-ink-500">{ar ? "في الشهر" : "a month"}</span>}
      </div>
      <h3 className="line-clamp-2 text-[14px] font-medium leading-snug text-ink-900">
        <Link href={vm.href} className="hover:underline">
          {title}
        </Link>
      </h3>
      <p className="tnum text-[13px] text-ink-700">{specs.join(" · ")}</p>
      {(verdict || vm.withoutOver) && (
        <p className="flex flex-wrap gap-x-3 text-[12.5px] font-semibold">
          {vm.withoutOver && <span className="text-accent-600">{ar ? "بدون أوفر" : "Without over"}</span>}
          {verdict && <span className={verdict.cls}>{t(verdict.key, locale)}</span>}
        </p>
      )}
      <p className="mt-auto truncate pt-1 text-[12.5px] text-ink-500">
        {place}
        {vm.compoundAr || vm.compoundEn ? `${ar ? "،" : ","} ${area}` : ""}
        <span className="tnum"> · {relativeDays(vm.daysOnMarket, locale)}</span>
      </p>
    </div>
  );

  if (layout === "grid") {
    return (
      <article className="flex min-w-0 flex-col gap-2.5">
        {photo}
        {body}
      </article>
    );
  }

  return (
    <article className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:gap-5">
      {photo}
      {body}
    </article>
  );
}
