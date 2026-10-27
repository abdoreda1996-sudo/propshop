import Link from "next/link";
import { Camera } from "lucide-react";
import { ListingCardVM } from "@/lib/listings";
import SaveButton from "./SaveButton";
import CardPhotos from "./CardPhotos";
import { Locale } from "@/lib/i18n";
import { formatPriceExact, formatNumber } from "@/lib/format";

/**
 * The browse result row: photo at the start, the detail that helps you choose in the
 * middle, and the price ruled off at the end above its action.
 *
 * WHY THE PRICE IS IN ITS OWN COLUMN
 * Scanning a long list, people compare one number down the column. Ruling it off gives that
 * number a fixed edge to sit against, so the eye tracks straight down instead of
 * re-finding the price inside each row's text.
 *
 * Every listing on the site is verified, so the row does not repeat a "Verified" badge;
 * it only marks what differs between rows (without over, the fair-price verdict).
 *
 * DIRECTION: logical properties throughout, so the row mirrors with the page.
 */
export default function BrowseCard({ vm, locale }: { vm: ListingCardVM; locale: Locale }) {
  const ar = locale === "ar";
  const title = ar ? vm.titleAr : vm.titleEn;
  const compound = ar ? vm.compoundAr : vm.compoundEn;
  const area = ar ? vm.areaAr : vm.areaEn;
  const isRent = vm.purpose === "rent";
  // A rent listing's "price" is already the monthly figure, so a payment plan on one would
  // be two competing monthly numbers in the same box.
  const plan = isRent ? null : vm.installment;

  const verdict =
    vm.verdict === "below"
      ? { cls: "text-ok-700", ar: "أقل من السعر العادل", en: "Below fair price" }
      : vm.verdict === "above"
        ? { cls: "text-danger-700", ar: "أعلى من السعر العادل", en: "Above fair price" }
        : vm.verdict === "fair"
          ? { cls: "text-ink-500", ar: "في حدود السعر العادل", en: "Within fair price" }
          : null;

  const specs = [
    vm.bedrooms === 0
      ? ar ? "استوديو" : "Studio"
      : `${formatNumber(vm.bedrooms, locale)} ${ar ? "غرف" : vm.bedrooms === 1 ? "bed" : "beds"}`,
    `${formatNumber(vm.bathrooms, locale)} ${ar ? "حمام" : vm.bathrooms === 1 ? "bath" : "baths"}`,
    `${formatNumber(vm.sizeSqm, locale)} ${ar ? "م²" : "m²"}`,
    ar ? finishingAr(vm.finishing) : finishingEn(vm.finishing),
    vm.deliveryStatus === "ready" ? (ar ? "استلام فوري" : "Ready to move") : ar ? "تحت الإنشاء" : "Under construction",
  ];

  return (
    <article className="row-card relative flex flex-col overflow-hidden sm:flex-row">
      {/* Outside the photo link: a button nested in a link is invalid and unreliable. */}
      <SaveButton listingId={vm.id} className="absolute start-2 top-2 z-10 bg-white" />
      {/* Phones: the photo spans the card on top. From sm up: a column on the side. */}
      <CardPhotos
        photos={vm.photos}
        href={vm.href}
        alt={title}
        ar={ar}
        className="aspect-[16/10] w-full shrink-0 sm:aspect-auto sm:min-h-[156px] sm:w-[230px] sm:self-stretch"
      >
        {vm.photoCount > 1 && (
          <span className="tnum pointer-events-none absolute bottom-2 start-2 z-[2] flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[12px] font-semibold text-white">
            <Camera size={11} />
            {formatNumber(vm.photoCount, locale)}
          </span>
        )}
        {vm.tourCount > 0 && (
          <span className="pointer-events-none absolute bottom-2 end-2 z-[2] rounded bg-white px-1.5 py-0.5 text-[12px] font-semibold text-ink-900">
            {ar ? "فيها جولة" : "Has a tour"}
          </span>
        )}
      </CardPhotos>

      {/* --- Detail --------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3.5 sm:p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[15.5px] font-semibold leading-snug text-ink-900">
            <Link href={vm.href} className="hover:underline">
              {title}
            </Link>
          </h3>

          <p className="mt-1 truncate text-[13px] text-ink-500">{compound ? `${compound}${ar ? "،" : ","} ${area}` : area}</p>

          <p className="tnum mt-2.5 text-[13px] leading-relaxed text-ink-700">
            {specs.map((spec, i) => (
              <span key={i} className="whitespace-nowrap">
                {i > 0 && <span className="mx-1.5 text-ink-200">|</span>}
                {spec}
              </span>
            ))}
          </p>
        </div>

        {(verdict || vm.withoutOver) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-semibold">
            {vm.withoutOver && (
              <span className="rounded-sm border border-accent-500 px-1.5 py-px text-accent-600">
                {ar ? "بدون أوفر" : "Without over"}
              </span>
            )}
            {verdict && <span className={verdict.cls}>{ar ? verdict.ar : verdict.en}</span>}
          </div>
        )}
      </div>

      {/* --- Price, ruled off ------------------------------------------------
          When the owner has declared a plan, the DOWN PAYMENT is the headline and the
          total price and instalment sit under it: the figure someone has to find this month
          decides whether they can act at all.

          A cash listing keeps the total as its headline, because it has no down payment
          and inventing one from a percentage would put a figure in front of a buyer that
          no owner ever agreed to. Same rule as the true-cost sheet: a number we do not
          have is omitted, never guessed. */}
      <div className="flex w-full shrink-0 flex-col justify-center gap-2 border-t border-[var(--border)] p-3.5 sm:w-[200px] sm:border-s sm:border-t-0">
        {plan ? (
          <>
            <div>
              <div className="text-[12px] text-ink-500">{ar ? "المقدم" : "Down payment"}</div>
              <div className="tnum text-[19px] font-semibold leading-tight text-ink-900">
                {formatPriceExact(plan.downPayment, locale, vm.currency)}
              </div>
            </div>
            <div className="tnum text-[12.5px] leading-relaxed text-ink-700">
              <div>
                <span className="font-semibold text-ink-900">{formatPriceExact(plan.monthly, locale, vm.currency)}</span>{" "}
                {ar
                  ? `في الشهر على ${formatNumber(plan.years, locale)} سنين`
                  : `a month over ${formatNumber(plan.years, locale)} years`}
              </div>
              <div>
                {ar ? "الإجمالي " : "Total "}
                <span className="font-semibold text-ink-900">{formatPriceExact(vm.price, locale, vm.currency)}</span>
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="text-[12px] text-ink-500">
              {isRent ? (ar ? "في الشهر" : "Per month") : ar ? "كاش" : "Cash"}
            </div>
            <div className="tnum text-[19px] font-semibold leading-tight text-ink-900">
              {formatPriceExact(vm.price, locale, vm.currency)}
            </div>
          </div>
        )}

        <Link href={vm.href} className="btn btn-primary w-full py-1.5 text-[13px]">
          {ar ? "التفاصيل" : "Details"}
        </Link>

        <div className="tnum text-[12px] text-ink-500">
          {vm.daysOnMarket === 0
            ? ar ? "نازلة النهاردة" : "Listed today"
            : ar
              ? `من ${formatNumber(vm.daysOnMarket, locale)} يوم`
              : `${formatNumber(vm.daysOnMarket, locale)} ${vm.daysOnMarket === 1 ? "day" : "days"} ago`}
        </div>
      </div>
    </article>
  );
}

function finishingAr(f: string) {
  return (
    { core_shell: "على المحارة", semi_finished: "نصف تشطيب", fully_finished: "تشطيب كامل", furnished: "مفروشة" }[f] ??
    f
  );
}
function finishingEn(f: string) {
  return (
    {
      core_shell: "Core & shell",
      semi_finished: "Semi-finished",
      fully_finished: "Fully finished",
      furnished: "Furnished",
    }[f] ?? f
  );
}
