import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { formatPriceExact } from "@/lib/format";
import { FEE_SCHEDULE_ROWS, PRICING_NOTE, FEE_MODEL_NOTE, feePerSide } from "@/lib/fees";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta(
    { ar: "الرسوم", en: "Fees" },
    {
      ar: "رسوم إدارية ثابتة ومعلنة. مفيش عمولة على سعر الوحدة ولا رسوم مخفية.",
      en: "Flat, published admin fees. No commission on the price of the unit and no hidden charges.",
    },
  );
}

export const revalidate = 3600;

/**
 * The public pricing page (Section 3: "fees are published on a public pricing page").
 * It is linked from the footer of every screen and states the no-commission promise
 * as a concrete number comparison, not a slogan.
 *
 * Layout (2026-10-26): a document, not a landing page. A narrow label column on the
 * start side and the content beside it, separated by ink rules, so the page reads like
 * a printed rate card.
 */
export default async function PricingPage() {
  const locale = await getLocale();
  const ar = locale === "ar";
  const fees = await prisma.feeConfig.findMany({ orderBy: { amount: "asc" } });

  const fee = (key: string) => fees.find((f) => f.key === key);
  const photo = fee("photo_package");

  /*
    Two fees, and that is the whole model (owner, 2026-09-19).

    Listing is free: no listing fee, no featured-placement fee, no membership. The
    platform earns nothing until a deal completes, which is the strongest thing this page
    has to say, so it leads.
  */
  const rows = [
    {
      title: ar ? "عرض الوحدة" : "Listing a property",
      who: ar ? "المالك" : "Owner",
      amount: 0,
      note: ar
        ? "مجاناً ومن غير مدة. مفيش رسم إعلان ولا اشتراك ولا رسوم عشان إعلانك يظهر أعلى."
        : "Free, with no time limit. No listing fee, no subscription, and nothing to pay for better placement.",
    },
    {
      title: ar ? "رسم النجاح" : "Success fee",
      who: ar ? "المشتري والبائع، كل واحد كامل" : "Buyer and seller, each in full",
      amount: null as number | null,
      note: ar
        ? "بيتحصّل بس لما الصفقة تتم. ثابت حسب نوع الوحدة، وكل طرف بيدفعه كامل مش نصه. المبالغ في الجدول اللي تحت."
        : "Charged only when a deal completes. Fixed by unit type, and each side pays it in full rather than half. Amounts are in the table below.",
    },
    {
      // Same booking and fee as before (photo_package); sold as what the buyer sees.
      title: ar ? "جولة افتراضية 360 (اختيارية)" : "360° virtual tour (optional)",
      who: ar ? "المالك" : "Owner",
      amount: photo?.amount,
      note: ar
        ? "مصورنا بيصوّر وحدتك جولة 360 المشتري يتمشى فيها من موبايله، وبتظهر على إعلانك. لو صوّرت بنفسك من التطبيق مش هتدفع حاجة."
        : "Our photographer shoots your home as a 360° tour buyers can walk through on their phone, shown on your listing. Shoot it yourself in the app and you pay nothing.",
      tour: true,
    },
  ];

  /*
    Rent was removed from the product (owner, 2026-10-12): every public listing is a sale.
    The rent tiers stay in fees.ts (the API and tests still use them) but are not quoted
    here, since nobody can list or find a rental.
  */
  const scheduleRows = FEE_SCHEDULE_ROWS.filter((r) => !r.key.startsWith("rent_"));

  // The headline comparison: what a normal brokerage would take vs what we take.
  const examplePrice = 10_000_000;
  const brokerLow = examplePrice * 0.015;
  const brokerHigh = examplePrice * 0.025;
  /*
    Listing is free, so on this example the entire cost is the success fee.

    The fee is ONLY ever shown per side, never as one whole-deal figure (owner,
    2026-09-27). Each side sees what it pays; nothing on this page adds the two together.
  */
  const ourPerSide = feePerSide({ purpose: "sale", unitType: "apartment", amount: examplePrice });

  const label = "text-[13px] font-semibold text-ink-900 md:pt-1";
  const row = "ruled mt-12 grid gap-5 md:grid-cols-[200px_1fr] md:gap-10";

  return (
    <div className="container-page pb-6 pt-10 md:pt-16">
      <header className="max-w-3xl">
        <h1 className="display">
          {ar ? "مفيش عمولة. رسم ثابت بس لما الوحدة تتباع." : "No commission. A fixed fee, only when the unit sells."}
        </h1>
        <p className="lede mt-4">{FEE_MODEL_NOTE[locale]}</p>
      </header>

      {/* --- Worked example ------------------------------------------------ */}
      <section className={row}>
        <h2 className={label}>{ar ? "مثال: شقة بـ 10 مليون جنيه" : "Example: a 10 million EGP apartment"}</h2>
        <dl className="grid gap-8 sm:grid-cols-2">
          <div>
            <dt className="text-[13px] muted">{ar ? "سمسار عادي (1.5–2.5%)" : "A typical broker (1.5–2.5%)"}</dt>
            <dd className="tnum mt-1 text-[24px] font-bold leading-tight text-ink-500">
              {formatPriceExact(brokerLow, locale)} – {formatPriceExact(brokerHigh, locale)}
            </dd>
            <dd className="mt-1 text-[13px] muted">{ar ? "وبتزيد كل ما سعر الوحدة يزيد." : "And it rises with the price of the unit."}</dd>
          </div>
          <div>
            <dt className="text-[13px] muted">{ar ? "بروب شوب، على كل طرف" : "PropShop, per side"}</dt>
            <dd className="tnum mt-1 text-[24px] font-bold leading-tight text-brand-500">
              {formatPriceExact(ourPerSide, locale)}
            </dd>
            <dd className="mt-1 text-[13px] muted">
              {ar
                ? "رسم النجاح بس، وكل طرف بيدفعه لوحده. العرض مجاني."
                : "The success fee only, paid by each side separately. Listing is free."}
            </dd>
          </div>
        </dl>
      </section>

      {/* --- What there is to pay ------------------------------------------ */}
      <section className={row}>
        <h2 className={label}>{ar ? "الرسوم كلها" : "Every fee"}</h2>
        {/* A table on wide screens; on a phone each fee stacks, rather than a 560px table
            scrolling sideways inside the page. */}
        <div>
          <div className="hidden border-b border-[var(--border)] pb-2 text-[12px] muted md:grid md:grid-cols-[1.1fr_1fr_0.8fr_2fr] md:gap-4">
            <span>{ar ? "الرسم" : "Fee"}</span>
            <span>{ar ? "بيدفعه" : "Paid by"}</span>
            <span>{ar ? "القيمة" : "Amount"}</span>
            <span>{ar ? "التفاصيل" : "Details"}</span>
          </div>
          {rows.map((r) => (
            <div key={r.title} className="grid gap-1 border-b border-[var(--border)] py-3.5 text-[14px] last:border-0 md:grid-cols-[1.1fr_1fr_0.8fr_2fr] md:gap-4">
              <div className="flex items-baseline justify-between gap-3 md:contents">
                <span className="font-semibold text-ink-900">{r.title}</span>
                <span className="tnum whitespace-nowrap font-semibold text-ink-900 md:order-3">
                  {r.amount === 0
                    ? ar ? "مجاناً" : "Free"
                    : r.amount
                      ? formatPriceExact(r.amount, locale)
                      : ar ? "حسب النوع" : "By type"}
                </span>
              </div>
              <span className="text-[13px] text-ink-700 md:order-2">
                <span className="md:hidden">{ar ? "بيدفعه: " : "Paid by: "}</span>
                {r.who}
              </span>
              <p className="text-[13px] leading-relaxed text-ink-700 md:order-4">
                {r.note}
                {"tour" in r && (
                  <>
                    {" "}
                    <Link href="/virtual-tour" className="font-semibold text-brand-500 underline underline-offset-4">
                      {ar ? "التفاصيل والحجز" : "Details and booking"}
                    </Link>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* --- The success fee schedule ---------------------------------------
          Published in full: by unit type for a sale, by the unit received for a trade.
          Per side, like every fee on the site. */}
      <section id="success-fee" className={row}>
        <h2 className={label}>{ar ? "رسم النجاح حسب نوع الوحدة" : "Success fee by unit type"}</h2>
        <div className="max-w-2xl">
          <p className="text-[14px] leading-relaxed text-ink-700">{PRICING_NOTE[locale]}</p>
          <table className="mt-5 w-full text-[14px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-[12px] muted">
                <th className="pb-2 text-start font-medium">{ar ? "الصفقة" : "Transaction"}</th>
                <th className="pb-2 text-end font-medium">{ar ? "على كل طرف" : "Per side"}</th>
              </tr>
            </thead>
            <tbody>
              {scheduleRows.map((r) => (
                <tr key={r.key} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-3 pe-4 text-ink-900">{ar ? r.ar : r.en}</td>
                  <td className="tnum whitespace-nowrap py-3 text-end font-semibold text-ink-900">
                    {r.fee === null ? (ar ? "حسب النوع" : "By type") : formatPriceExact(r.fee, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-[13px] leading-relaxed muted">
            {ar
              ? "الرسم مش بيتغير بتغير السعر: فيلا بـ 5 مليون وفيلا بـ 60 مليون بيدفعوا نفس الرسم. والمشتري والبائع بيدفعوا نفس المبلغ بالظبط. في المقايضة، كل طرف بيدفع حسب نوع الوحدة اللي بياخدها."
              : "The fee does not change with the price: a 5M villa and a 60M villa pay the same. Buyer and seller pay exactly the same amount. In a trade, each side pays by the type of unit it receives."}
          </p>
        </div>
      </section>

      {/* --- What we never charge ------------------------------------------ */}
      <section className={row}>
        <h2 className={label}>{ar ? "حاجات مش بنحاسب عليها" : "What we never charge"}</h2>
        <p className="max-w-2xl text-[14px] leading-relaxed text-ink-700">
          {ar
            ? "مفيش نسبة من سعر البيع، ولا رسم على المشتري عشان يعاين، ولا رسوم تجديد، ولا رسم عشان رقمك يظهر."
            : "No percentage of the sale price, no fee for a buyer to view a unit, no renewal fees, and no fee to reveal your number."}
        </p>
      </section>

      <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-6">
        <Link href="/list" className="btn btn-primary">
          {t("nav_sell", locale)}
        </Link>
        <Link href="/how-it-works" className="btn btn-ghost">
          {t("nav_how", locale)}
        </Link>
      </div>

      <p className="mt-8 max-w-3xl text-[12px] leading-relaxed muted">
        {ar
          ? "كل الرسوم بالجنيه المصري وشاملة الضرايب. أي تغيير في الرسوم بيتنشر على الصفحة دي قبل ما يسري، والإعلانات النشطة بتكمل بالسعر اللي اتدفع."
          : "All fees are in Egyptian pounds and include applicable taxes. Any change is published on this page before it takes effect, and active listings continue at the price already paid."}
      </p>
    </div>
  );
}
