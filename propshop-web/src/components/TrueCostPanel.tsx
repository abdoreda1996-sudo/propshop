import { Locale } from "@/lib/i18n";
import { formatPriceExact } from "@/lib/format";
import { computeTrueCost, sourceLabel, CostInput } from "@/lib/trueCost";

/**
 * TRUE COST (Section 5).
 *
 * The number a buyer actually pays, not the number in the headline. Every line says
 * where it came from — confirmed, declared by the owner, or estimated — because the
 * difference between those three is exactly what buyers get burned by.
 *
 * Anything we do not know is listed as unknown rather than quietly counted as zero.
 */
export default function TrueCostPanel({
  locale,
  currency,
  ...input
}: CostInput & { locale: Locale; currency: string }) {
  const ar = locale === "ar";
  const cost = computeTrueCost(input);

  return (
    <section className="mt-10">
      <h2 className="text-[17px] font-bold text-ink-900">{ar ? "التكلفة الحقيقية" : "What it actually costs"}</h2>
      <p className="mt-1.5 max-w-[60ch] text-[13.5px] leading-relaxed text-ink-700">
        {ar
          ? "سعر الوحدة مش آخر رقم هتدفعه. ده كل اللي بيتدفع مع الوحدة، وجنب كل بند مصدره."
          : "The asking price is not the last figure you pay. These are the costs that come with the unit, each with where the number comes from."}
      </p>

      <dl className="mt-4 max-w-[44rem] border-t border-[var(--border)]">
        {cost.lines.map((line) => (
          <div key={line.key} className="border-b border-[var(--border)] py-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[14px] text-ink-900">
                {ar ? line.labelAr : line.labelEn}
                <span
                  className={`ms-2 text-[12px] font-semibold ${
                    line.source === "estimate" ? "text-ink-500" : line.source === "owner_declared" ? "text-info-600" : "text-ok-700"
                  }`}
                >
                  {sourceLabel(line.source, locale)}
                </span>
              </dt>
              <dd className="tnum shrink-0 text-[14.5px] font-semibold text-ink-900">
                {formatPriceExact(line.amount, locale, currency)}
              </dd>
            </div>
            {(ar ? line.noteAr : line.noteEn) && (
              <p className="mt-1 text-[12px] leading-relaxed muted">{ar ? line.noteAr : line.noteEn}</p>
            )}
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink-900 py-3">
          <dt className="text-[14px] font-bold text-ink-900">{ar ? "الإجمالي التقديري" : "Estimated total"}</dt>
          <dd className="tnum text-[19px] font-bold text-ink-900">{formatPriceExact(cost.total, locale, currency)}</dd>
        </div>
      </dl>

      {cost.incomplete && (
        <p className="mt-3 max-w-[44rem] text-[12.5px] leading-relaxed text-ink-900">
          <strong className="font-bold">{ar ? "ناقص معلومات:" : "Not yet known:"}</strong>{" "}
          {(ar ? cost.missingAr : cost.missingEn).join(ar ? "، " : ", ")}.{" "}
          <span className="muted">
            {ar
              ? "اسأل المالك قبل ما تقدّم عرض. الأرقام دي بتتأكد وقت مراجعة المستندات."
              : "Ask the owner before you offer. These are confirmed during document review."}
          </span>
        </p>
      )}

      {cost.hasEstimates && (
        <p className="mt-2 max-w-[44rem] text-[12px] leading-relaxed muted">
          {ar
            ? "البنود المكتوب جنبها «تقديري» مش مبالغ نهائية، وبتتأكد مع الجهات المختصة قبل التوقيع."
            : "Lines marked “estimated” are not final; they are confirmed with the relevant authorities before signing."}
        </p>
      )}
    </section>
  );
}
