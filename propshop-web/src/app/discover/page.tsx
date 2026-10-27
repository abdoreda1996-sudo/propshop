import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t, cityName, unitsLabel } from "@/lib/i18n";
import { getHomeData } from "@/lib/home";
import { formatNumber } from "@/lib/format";
import { localMeta } from "@/lib/seo";
import ListingCard from "@/components/ListingCard";
import SectionHead from "@/components/SectionHead";

export const revalidate = 300;

export async function generateMetadata() {
  return localMeta({ ar: "المناطق والأسعار", en: "Areas and prices" });
}

/**
 * The market overview: areas, compounds, newest listings and how the fair price works.
 *
 * This was the landing page until the results screen moved to `/` (owner, 2026-09-22).
 * Rewritten 2026-10-26 as a plain overview: no hero photo with a scrim, no promise cards.
 * The pictures on this page are the listings' and compounds' own covers.
 */
export default async function DiscoverPage() {
  const locale = await getLocale();
  const ar = locale === "ar";

  const { liveCount, compoundCount, closedCount, newest, topCompounds, areas } = await getHomeData();

  return (
    <div className="container-page">
      {/* --- Intro ------------------------------------------------------------ */}
      <section className="grid gap-6 pb-10 pt-10 md:grid-cols-[1.3fr_1fr] md:items-end md:pt-14">
        <div>
          <h1 className="display">{ar ? "المناطق والكمبوندات والأسعار" : "Areas, compounds and prices"}</h1>
          <p className="lede mt-4">
            {ar
              ? "نظرة على السوق من الإعلانات اللي عندنا: فين الوحدات المعروضة، أنهي كمبوندات فيها أكتر عرض، وإزاي بنحسب السعر العادل لكل وحدة."
              : "The market as our listings show it: where the homes for sale are, which compounds have the most on offer, and how we work out a fair price for each one."}
          </p>
        </div>
        <dl className="grid grid-cols-3 border-y border-[var(--border)] py-4">
          {[
            { value: liveCount, label: ar ? "وحدة معروضة" : "homes listed" },
            { value: compoundCount, label: ar ? "كمبوند" : "compounds" },
            { value: closedCount, label: ar ? "صفقة اتقفلت" : "deals closed" },
          ].map((s) => (
            <div key={s.label} className="border-s border-[var(--border)] ps-4 first:border-0 first:ps-0">
              <dd className="tnum text-[24px] font-semibold leading-none text-ink-900">{formatNumber(s.value, locale)}</dd>
              <dt className="mt-1.5 text-[12.5px] text-ink-500">{s.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* --- Areas: a dense index rather than a wall of round thumbnails ------- */}
      <section className="ruled pb-12">
        <SectionHead
          title={ar ? "المناطق" : "Areas"}
          count={ar ? `${formatNumber(areas.length, locale)} منطقة` : `${formatNumber(areas.length, locale)} areas`}
          locale={locale}
        />
        <ul className="mt-5 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((a) => (
            <li key={a.id} className="border-b border-[var(--border)]">
              <Link href={`/?area=${a.slug}`} className="group flex items-center gap-3 py-2.5">
                <span className="h-11 w-14 shrink-0 overflow-hidden rounded-sm bg-ink-100">
                  {a.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold text-ink-900 group-hover:underline">
                    {ar ? a.nameAr : a.nameEn}
                  </span>
                  <span className="block text-[12.5px] text-ink-500">{cityName(a.city, locale)}</span>
                </span>
                <span className="tnum shrink-0 text-[13px] text-ink-700">
                  {formatNumber(a.units, locale)} {unitsLabel(a.units, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* --- Compounds ---------------------------------------------------------- */}
      {topCompounds.length > 0 && (
        <section className="ruled pb-12">
          <SectionHead
            title={ar ? "كمبوندات فيها عرض كتير" : "Compounds with the most listings"}
            count={ar ? `من ${formatNumber(compoundCount, locale)} كمبوند` : `of ${formatNumber(compoundCount, locale)} compounds`}
            href="/compounds"
            linkLabel={ar ? "كل الكمبوندات" : "All compounds"}
            locale={locale}
          />
          <div className="rail mt-5">
            {topCompounds.map((c) => (
              <Link key={c.id} href={`/?compound=${c.slug}`} className="group block w-[220px] sm:w-[250px]">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-ink-100">
                  {c.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.cover} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                  ) : null}
                </div>
                <div className="mt-2 truncate text-[14.5px] font-semibold text-ink-900 group-hover:underline">{ar ? c.nameAr : c.nameEn}</div>
                <div className="truncate text-[12.5px] text-ink-500">
                  {ar ? `${c.areaAr}، ${c.developer}` : `${c.areaEn}, ${c.developer}`}
                </div>
                <div className="tnum text-[12.5px] text-ink-700">
                  {formatNumber(c.units, locale)} {unitsLabel(c.units, locale)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* --- How the fair price works ----------------------------------------------- */}
      <section className="ruled grid gap-8 pb-12 md:grid-cols-[1fr_1fr] md:gap-14">
        <div>
          <h2 className="section-title">{ar ? "تلات أرقام على كل وحدة" : "Three numbers on every unit"}</h2>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-ink-700">
            {ar
              ? "جنب السعر المطلوب بنكتب سعر عادل تقديري محسوب من وحدات شبهها في نفس الكمبوند، وسعر المطور النهارده لو لسه بيبيع نفس النوع. كده تعرف السعر ده في محله ولا لأ قبل ما تكلم حد."
              : "Next to the asking price we show an estimated fair price, worked out from similar units in the same compound, and what the developer charges today if it still sells the same type. You can tell whether a price is reasonable before you talk to anyone."}
          </p>
          <ul className="mt-5 max-w-[58ch] divide-y divide-[var(--border)] border-y border-[var(--border)] text-[14px] text-ink-700">
            <li className="py-2.5">
              {ar ? "السعر العادل نطاق ومعاه درجة ثقة، مش رقم واحد." : "The fair price is a range with a confidence level, not a single figure."}
            </li>
            <li className="py-2.5">
              {ar ? "قوائم أسعار المطورين بتتحدث كل شهر، وكل سطر عليه مصدره وتاريخه." : "Developer price lists are updated monthly, each line with its source and date."}
            </li>
            <li className="py-2.5">
              {ar ? "الصور متصورة من التطبيق، مش منقولة من موقع تاني." : "Photos are taken in the app, not copied from another site."}
            </li>
          </ul>
        </div>

        <figure className="self-start">
          <figcaption className="text-[13px] font-semibold text-ink-900">
            {ar ? "مثال: شقة 165 م² في ميفيدا" : "Example: a 165 m² apartment in Mivida"}
          </figcaption>
          <dl className="facts mt-2 border-t border-ink-900 text-[14px]">
            {[
              { label: t("asking_price", locale), value: ar ? "9.8 مليون" : "9.8M", tone: "text-ink-900" },
              { label: t("fair_price", locale), value: ar ? "10.1 – 11.0 مليون" : "10.1M – 11.0M", tone: "text-ok-700" },
              { label: t("developer_price", locale), value: ar ? "12.4 مليون" : "12.4M", tone: "text-ink-500" },
            ].map((r) => (
              <div key={r.label}>
                <dt className="text-ink-500">{r.label}</dt>
                <dd className={`tnum font-semibold ${r.tone}`}>{r.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[13px] font-semibold text-ok-700">{t("below_fair", locale)}</p>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-400">{t("fair_price_disclaimer", locale)}</p>
        </figure>
      </section>

      {/* --- Newest listings ----------------------------------------------------- */}
      <section className="ruled pb-12">
        <SectionHead
          title={ar ? "آخر الوحدات اللي نزلت" : "Latest listings"}
          href="/"
          linkLabel={ar ? "كل الوحدات" : "All homes"}
          locale={locale}
        />
        <div className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {newest.map((vm) => (
            <ListingCard key={vm.id} vm={vm} locale={locale} layout="grid" />
          ))}
        </div>
      </section>

      {/* --- For owners ------------------------------------------------------------ */}
      <section className="ruled grid gap-4 pb-4 md:grid-cols-[1fr_auto] md:items-end md:gap-10">
        <div>
          <h2 className="section-title">{ar ? "لو عندك وحدة عايز تبيعها" : "If you are selling"}</h2>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-700">
            {ar
              ? "وثّق بطاقتك ومستند الملكية وصوّر الوحدة من التطبيق. نشر الإعلان مجاني، ورقمك مش بيظهر لحد. الرسم الثابت بيتدفع بس لو البيعة تمت."
              : "Verify your ID and ownership document and photograph the unit in the app. Listing is free and your number is never shown. The flat fee is paid only if the sale goes through."}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/list" className="btn btn-primary">
            {t("nav_sell", locale)}
          </Link>
          <Link href="/pricing" className="btn btn-ghost">
            {ar ? "الرسوم" : "Fees"}
          </Link>
        </div>
      </section>
    </div>
  );
}
