import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { Locale } from "@/lib/i18n";
import { formatPriceExact, formatNumber } from "@/lib/format";
import { UNIT_TYPE_LABELS, UnitType } from "@/lib/enums";
import { TradeRequestSpec } from "@/lib/tradeRequest";
import { loadTradeRequest, toSpec, tradeRequestMatches, tradeRequestFormData } from "@/lib/tradeRequestService";
import TradeRequestActions from "@/components/TradeRequestActions";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "طلب المقايضة", en: "Trade request" });
}
export const dynamic = "force-dynamic";

type Lookups = Awaited<ReturnType<typeof tradeRequestFormData>>;

/** The request read back as the chips a filter bar would show. */
function specChips(s: TradeRequestSpec, l: Lookups, locale: Locale): string[] {
  const ar = locale === "ar";
  const nm = (x: { nameAr: string; nameEn: string } | undefined) => (x ? (ar ? x.nameAr : x.nameEn) : "");
  const opt = (opts: { value: string; ar: string; en: string }[], v: string) => {
    const o = opts.find((x) => x.value === v);
    return o ? (ar ? o.ar : o.en) : v;
  };
  const out: string[] = [];
  out.push(...s.compoundIds.map((id) => nm(l.compounds.find((c) => c.id === id))).filter(Boolean));
  out.push(...s.areaIds.map((id) => nm(l.areas.find((a) => a.id === id))).filter(Boolean));
  out.push(...s.types.map((t) => UNIT_TYPE_LABELS[t as UnitType]?.[locale] ?? t));
  out.push(...s.bedrooms.map((v) => opt(l.bedroomOptions, v)));
  out.push(...s.bathrooms.map((v) => opt(l.bathroomOptions, v)));
  if (s.minPrice !== null && s.maxPrice !== null) out.push(`${formatPriceExact(s.minPrice, locale)} – ${formatPriceExact(s.maxPrice, locale)}`);
  else if (s.maxPrice !== null) out.push(`${ar ? "لحد" : "Up to"} ${formatPriceExact(s.maxPrice, locale)}`);
  else if (s.minPrice !== null) out.push(`${ar ? "من" : "From"} ${formatPriceExact(s.minPrice, locale)}`);
  out.push(...s.payment.map((v) => opt(l.paymentOptions, v)));
  return out;
}

/**
 * A saved trade request: what the lister asked for, and — straight after saving — every
 * live unit open to trade that fits it. New ones arrive as notifications.
 */
export default async function TradeRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [session, locale, { id }, sp] = await Promise.all([getSession(), getLocale(), params, searchParams]);
  if (!session) return null;
  const ar = locale === "ar";
  const request = await loadTradeRequest(session.id, id);
  if (!request) notFound();
  const spec = toSpec(request);
  const [matches, lookups] = await Promise.all([tradeRequestMatches(session.id, spec), tradeRequestFormData(session.id)]);
  const chips = specChips(spec, lookups, locale);

  return (
    <>
      <Link href="/dashboard/trades" className="text-[13px] muted hover:underline">
        {ar ? "رجوع للمقايضة" : "Back to trades"}
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold text-ink-900">{ar ? "طلب المقايضة" : "Trade request"}</h1>
        <TradeRequestActions id={request.id} active={request.active} locale={locale} />
      </div>

      {sp.saved && (
        <p className="mt-3 border-s-2 border-ok-700 ps-3 text-[13px] font-semibold text-ok-700">
          {ar ? "اتحفظ. دي الوحدات اللي بتناسب طلبك دلوقتي." : "Saved. These are the units that fit your request right now."}
        </p>
      )}

      <dl className="facts mt-5 max-w-2xl text-[13.5px]">
        <div>
          <dt className="shrink-0 muted">{ar ? "عايز" : "You want"}</dt>
          <dd className="text-end font-semibold text-ink-900">{chips.length ? chips.join("، ") : ar ? "أي وحدة" : "Any unit"}</dd>
        </div>
        {request.listing && (
          <div>
            <dt className="muted">{ar ? "هتقايض بـ" : "Trading"}</dt>
            <dd>
              <Link href={`/dashboard/listings/${request.listing.id}/trade`} className="tnum font-semibold text-brand-500 hover:underline">
                {request.listing.reference}
              </Link>
            </dd>
          </div>
        )}
        <div>
          <dt className="muted">{ar ? "الإشعارات" : "Notifications"}</dt>
          <dd className="text-end text-ink-900">
            {request.active
              ? ar ? "شغالة: هنبلغك بأي وحدة جديدة بتناسب الطلب" : "On: you hear about every new unit that fits"
              : ar ? "واقفة" : "Paused"}
          </dd>
        </div>
      </dl>
      {spec.description && <p className="mt-3 max-w-2xl whitespace-pre-line text-[13.5px] text-ink-900">{spec.description}</p>}
      <Link href={`/dashboard/trades/request/${request.id}/edit`} className="mt-3 inline-block text-[13px] font-semibold text-brand-500 hover:underline">
        {ar ? "عدّل الطلب" : "Edit request"}
      </Link>

      <h2 className="mt-9 border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">
        {ar ? "وحدات متاحة للمقايضة بتناسبك" : "Units open to trade that fit"}{" "}
        <span className="tnum font-medium muted">{formatNumber(matches.length, locale)}</span>
      </h2>
      {matches.length === 0 ? (
        <p className="mt-3 text-[14px] muted">
          {ar ? "مفيش وحدة بتناسب طلبك دلوقتي. أول ما تنزل واحدة هتلاقيها في الإشعارات. " : "Nothing fits yet. When one is listed, it shows up in your notifications. "}
          <Link href="/trade" className="font-semibold text-brand-500 hover:underline">
            {ar ? "تصفح سوق المقايضة" : "Browse the trade market"}
          </Link>
        </p>
      ) : (
        <ul className="mt-4 grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((l) => {
            const img = l.media[0]?.thumbKey ?? l.media[0]?.fileKey;
            return (
              <li key={l.id}>
                <Link href={`/listing/${l.reference}`} className="group block">
                  <div className="media-frame aspect-[16/10] rounded-md">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {img && <img src={img} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="pt-2.5">
                    <div className="tnum text-[16px] font-bold text-ink-900">{formatPriceExact(Number(l.price), locale, l.currency)}</div>
                    <div className="mt-0.5 truncate text-[14px] font-semibold text-ink-900 group-hover:underline">{(ar ? l.titleAr : l.titleEn) || l.reference}</div>
                    <div className="tnum text-[12.5px] muted">
                      {UNIT_TYPE_LABELS[l.unit.type as UnitType]?.[locale]} · {l.unit.bedrooms} {ar ? "غرف" : "bed"} · {l.unit.bathrooms} {ar ? "حمام" : "bath"} ·{" "}
                      {(ar ? l.unit.compound?.nameAr : l.unit.compound?.nameEn) ?? (ar ? l.unit.area.nameAr : l.unit.area.nameEn)}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
