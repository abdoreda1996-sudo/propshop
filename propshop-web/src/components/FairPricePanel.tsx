import Link from "next/link";
import { Locale, t } from "@/lib/i18n";
import { formatNumber, formatPriceExact } from "@/lib/format";
import { PriceVerdict } from "@/lib/fairPrice";
import { parseJson } from "@/lib/json";
import { ComparableScope, SCOPE_LABELS } from "@/lib/fairPriceService";

/**
 * The three numbers the brief requires on every listing (Section 6b-A): asking price,
 * PropShop fair price, and developer price today. Shown as a range with a confidence
 * label and an explicit disclaimer — never a single false-precise figure.
 */
export default function FairPricePanel({
  locale,
  askingPrice,
  currency,
  fair,
  developer,
  verdict,
  developerGap,
  compoundSlug,
}: {
  locale: Locale;
  askingPrice: number;
  currency: string;
  fair: { low: number; mid: number; high: number; confidence: string; sampleSize: number; factorsJson: string | null } | null;
  developer: { price: number; source: string; effectiveDate: Date; isAvailable: boolean } | null;
  verdict: PriceVerdict;
  developerGap: number | null;
  compoundSlug: string | null;
}) {
  const ar = locale === "ar";
  const scope = parseJson<{ scope?: ComparableScope }>(fair?.factorsJson ?? null, {}).scope ?? "compound_type";

  const confidenceLabel =
    fair?.confidence === "high"
      ? t("confidence_high", locale)
      : fair?.confidence === "medium"
        ? t("confidence_medium", locale)
        : t("confidence_low", locale);

  // Position of the asking price along the fair band, for the marker.
  const markerPct = fair
    ? Math.min(100, Math.max(0, ((askingPrice - fair.low) / Math.max(1, fair.high - fair.low)) * 100))
    : 50;

  return (
    <section className="mt-8 px-1 lg:px-0">
      <h2 className="text-[15px] font-bold text-ink-900">{ar ? "السعر ده مقارنةً بالسوق" : "How this price compares"}</h2>

      <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
        <Row label={t("asking_price", locale)} value={formatPriceExact(askingPrice, locale, currency)} strong />

        {fair ? (
          <>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] muted">{t("fair_price", locale)}</span>
                {/* The currency is written once: repeating it lets "ج.م" wrap onto its
                    own line and break the range apart. */}
                <span className="tnum whitespace-nowrap text-[15px] font-bold text-ok-700">
                  {formatNumber(Math.round(fair.low), locale)} – {formatPriceExact(fair.high, locale, currency)}
                </span>
              </div>

              {/* Band with the asking price marked on it. */}
              <div className="relative mt-3 h-1 bg-ok-50">
                <span
                  className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 bg-ink-900"
                  style={{ insetInlineStart: `${markerPct}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px] muted">
                <span>
                  {t("confidence", locale)}: {confidenceLabel}
                </span>
                <span className="tnum">
                  {ar ? "بناءً على" : "based on"} {fair.sampleSize} {SCOPE_LABELS[scope][locale]}
                </span>
              </div>
            </div>
          </>
        ) : (
          <Row label={t("fair_price", locale)} value={t("insufficient_data", locale)} muted />
        )}

        {developer ? (
          <div>
            <Row
              label={t("developer_price", locale)}
              value={formatPriceExact(developer.price, locale, currency)}
              muted={!developer.isAvailable}
            />
            <p className="mt-1 text-[12px] muted">
              {developer.isAvailable
                ? ar
                  ? "متاح من المطور"
                  : "Available from the developer"
                : ar
                  ? "غير متاح حالياً من المطور"
                  : "No longer available from the developer"}
              {" · "}
              {sourceText(developer.source, ar)}
            </p>
          </div>
        ) : (
          <Row label={t("developer_price", locale)} value={ar ? "غير متاح" : "Not available"} muted />
        )}
      </div>

      {verdict !== "unknown" && (
        <p
          className={`mt-4 text-[13px] font-semibold ${verdict === "below" ? "text-ok-700" : verdict === "above" ? "text-danger-700" : "text-ink-700"}`}
        >
          {t(verdict === "below" ? "below_fair" : verdict === "above" ? "above_fair" : "within_fair", locale)}
        </p>
      )}

      <p className="mt-3 border-t border-[var(--border)] pt-3 text-[12px] leading-relaxed muted">
        {t("fair_price_disclaimer", locale)}
      </p>
    </section>
  );
}

/** Price-sheet sources are stored in English ("Palm Hills price sheet (ZONE)"); say it in Arabic. */
function sourceText(source: string, ar: boolean): string {
  if (!ar) return source;
  const m = source.match(/^(.*?) price sheet(?: \((.*)\))?$/i);
  return m ? `قائمة أسعار ${m[1]}${m[2] ? ` (${m[2]})` : ""}` : source;
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] muted">{label}</span>
      <span
        className={`tnum ${strong ? "text-[16px] font-bold text-ink-900" : muted ? "text-[14px] font-semibold text-[var(--text-muted)]" : "text-[15px] font-bold text-ink-900"}`}
      >
        {value}
      </span>
    </div>
  );
}
