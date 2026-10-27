import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPriceExact, formatNumber } from "@/lib/format";
import { UNIT_TYPES, UNIT_TYPE_LABELS, UnitType } from "@/lib/enums";
import { tradeListings, toPreference, eligibleUnitsFor } from "@/lib/tradeService";
import { matchPreference } from "@/lib/trade";
import { TradeWants } from "@/components/TradePanel";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta(
    { ar: "سوق المقايضة", en: "Trade market" },
    {
      ar: "بدّل وحدتك بوحدة تانية مباشرة مع صاحبها. وحدات موثّقة، من غير سمسار، وفرق السعر بيتدفع كاش لو محتاج.",
      en: "Swap your unit for another directly with its owner: verified units, no broker, and a cash difference if you need one.",
    },
  );
}
export const dynamic = "force-dynamic";

/**
 * The trade market: every live, verified unit whose owner opened it to trade, with what
 * they want in return. A signed-in owner sees which listings their own units fit.
 */
export default async function TradeMarketPage({ searchParams }: { searchParams: Promise<{ type?: string; area?: string }> }) {
  const [locale, session, sp] = await Promise.all([getLocale(), getSession(), searchParams]);
  const ar = locale === "ar";
  const type = UNIT_TYPES.includes(sp.type as UnitType) ? sp.type : undefined;
  const areas = await prisma.area.findMany({ select: { id: true, slug: true, nameAr: true, nameEn: true }, orderBy: { nameEn: "asc" } });
  const area = areas.find((a) => a.slug === sp.area);
  const areaName = new Map(areas.map((a) => [a.id, ar ? a.nameAr : a.nameEn]));

  const [listings, mine] = await Promise.all([
    tradeListings({ type, areaId: area?.id, take: 60 }),
    session ? eligibleUnitsFor(session.id) : Promise.resolve([]),
  ]);

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { type, area: area?.slug, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/trade?${s}` : "/trade";
  };
  // A lister who wants to trade starts with a trade request: what they want in exchange.
  const requestHref = session ? "/dashboard/trades/request/new" : "/login?next=/dashboard/trades/request/new";

  const chip = (on: boolean) =>
    `whitespace-nowrap rounded-md border px-3 py-1.5 text-[13px] font-semibold transition ${on ? "border-accent-500 bg-accent-50 text-accent-600" : "border-[var(--border)] bg-white text-ink-700 hover:border-navy-300"}`;

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display">{ar ? "سوق المقايضة" : "Trade market"}</h1>
          <p className="lede mt-3">
            {ar
              ? "بدّل وحدتك بوحدة تانية مباشرة مع صاحبها. كل الوحدات هنا موثّقة، وفرق السعر بيتدفع كاش لو الطرفين اتفقوا. لو عايز تقايض، قول عايز إيه بنفس فلاتر البحث، وهنوريك الوحدات اللي تناسبك ونبلغك بأي وحدة جديدة."
              : "Swap your unit for another, owner to owner. Every unit here is verified, and any price gap is paid in cash if both sides agree. To trade, describe what you want with the search filters; we show what fits now and tell you about new units."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session && (
            <Link href="/dashboard/trades" className="btn btn-ghost">
              {ar ? "مقايضاتي" : "My trades"}
            </Link>
          )}
          <Link href={requestHref} className="btn btn-primary">
            {ar ? "عايز أقايض وحدتي" : "Trade my unit"}
          </Link>
        </div>
      </div>


      <div className="mt-8 flex gap-2 overflow-x-auto border-t border-[var(--border)] pb-1 pt-5">
        <Link href={qs({ type: undefined })} className={chip(!type)}>{ar ? "كل الأنواع" : "All types"}</Link>
        {UNIT_TYPES.map((t) => (
          <Link key={t} href={qs({ type: t })} className={chip(type === t)}>
            {UNIT_TYPE_LABELS[t][locale]}
          </Link>
        ))}
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <Link href={qs({ area: undefined })} className={chip(!area)}>{ar ? "كل المناطق" : "All areas"}</Link>
        {areas.map((a) => (
          <Link key={a.id} href={qs({ area: a.slug })} className={chip(area?.id === a.id)}>
            {ar ? a.nameAr : a.nameEn}
          </Link>
        ))}
      </div>

      <p className="tnum mt-5 text-[13px] muted">
        {formatNumber(listings.length, locale)} {ar ? "وحدة متاحة للمقايضة" : "units open to trade"}
      </p>

      {listings.length === 0 ? (
        <div className="mt-4 border-y border-[var(--border)] py-10">
          <p className="text-[15px] text-ink-700">{ar ? "مفيش وحدات متاحة للمقايضة بالفلتر ده دلوقتي." : "No units open to trade with these filters yet."}</p>
          <Link href={requestHref} className="btn btn-primary mt-5">
            {ar ? "اعمل طلب مقايضة" : "Make a trade request"}
          </Link>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => {
            const pref = toPreference(l.tradePreference);
            const isMine = !!session && l.unit.ownerId === session.id;
            const fits = !isMine && mine.some((m) =>
              matchPreference(pref, [{ type: m.unit.type, areaId: m.unit.areaId, bedrooms: m.unit.bedrooms, sizeSqm: m.unit.sizeSqm, price: m.price }]).matches,
            );
            const img = l.media[0]?.thumbKey ?? l.media[0]?.fileKey;
            return (
              <li key={l.id} className="card overflow-hidden">
                <Link href={`/listing/${l.reference}`} className="block">
                  <div className="media-frame aspect-[16/10]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img && <img src={img} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="p-4">
                    <div className="tnum text-[17px] font-bold text-ink-900">{formatPriceExact(l.price, locale, l.currency)}</div>
                    <div className="mt-0.5 truncate text-[14px] font-semibold text-ink-900">{(ar ? l.titleAr : l.titleEn) || l.reference}</div>
                    <div className="text-[12.5px] muted">
                      {UNIT_TYPE_LABELS[l.unit.type as UnitType]?.[locale]} · {formatNumber(l.unit.bedrooms, locale)} {ar ? "غرف" : l.unit.bedrooms === 1 ? "bed" : "beds"} ·{" "}
                      {(ar ? l.unit.compound?.nameAr : l.unit.compound?.nameEn) ?? (ar ? l.unit.area.nameAr : l.unit.area.nameEn)}
                    </div>
                  </div>
                </Link>
                <div className="border-t border-[var(--border)] p-4 pt-3">
                  <div className="mb-1.5 text-[12px] font-semibold text-ink-700">{ar ? "عايز يقايض بـ" : "Would trade for"}</div>
                  <TradeWants pref={pref} areaNames={pref.areaIds.map((id) => areaName.get(id) ?? "").filter(Boolean)} locale={locale} currency={l.currency} />
                  {fits && <p className="mt-2 text-[12.5px] font-semibold text-ok-700">{ar ? "عندك وحدة بتناسب طلبه" : "You have a unit that fits"}</p>}
                  {isMine && <p className="mt-2 text-[12px] muted">{ar ? "دي وحدتك" : "This is your unit"}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
