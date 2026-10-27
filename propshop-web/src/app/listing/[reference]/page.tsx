import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { getListingByReference, incrementViews } from "@/lib/listings";
import { listingAcceptsOffers } from "@/lib/offers";
import { getSession } from "@/lib/auth";
import { canEditListings } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toPreference, eligibleUnitsFor } from "@/lib/tradeService";
import { matchPreference } from "@/lib/trade";
import TradeOfferButton from "@/components/TradeOfferButton";
import { TradeWants } from "@/components/TradePanel";
import { formatPriceExact, formatNumber, formatDate, daysBetween, pricePerSqm } from "@/lib/format";
import {
  FINISHING_LABELS,
  PAYMENT_TYPE_LABELS,
  UNIT_TYPE_LABELS,
  Finishing,
  UnitType,
} from "@/lib/enums";
import { parseJson } from "@/lib/json";
import TrustBadge from "@/components/TrustBadge";
import PriceVerdictBadge from "@/components/PriceVerdictBadge";
import Gallery from "@/components/Gallery";
import VirtualTours from "@/components/VirtualTours";
import FairPricePanel from "@/components/FairPricePanel";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import MakeOfferButton from "@/components/MakeOfferButton";
import RequestViewingButton from "@/components/RequestViewingButton";
import TrueCostPanel from "@/components/TrueCostPanel";
import ReportListingButton from "@/components/ReportListingButton";
import SaveButton from "@/components/SaveButton";

type Props = { params: Promise<{ reference: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reference } = await params;
  const data = await getListingByReference(reference);
  if (!data) return { title: "غير متاح" };
  const { listing } = data;
  const place = listing.unit.compound?.nameAr ?? listing.unit.area.nameAr;
  return {
    title: listing.titleAr ?? place,
    description: listing.descriptionAr?.slice(0, 160) ?? undefined,
    alternates: { canonical: `/listing/${listing.reference}` },
    openGraph: {
      title: listing.titleAr ?? place,
      description: listing.descriptionAr?.slice(0, 200) ?? undefined,
      images: listing.media[0] ? [listing.media[0].fileKey] : [],
    },
  };
}

export default async function ListingPage({ params }: Props) {
  const { reference } = await params;
  const [locale, data, session] = await Promise.all([getLocale(), getListingByReference(reference), getSession()]);
  if (!data) notFound();

  const { listing, fair, developer, verdict, developerGap } = data;
  const ar = locale === "ar";
  const unit = listing.unit;
  void incrementViews(listing.id);

  const place = ar ? (unit.compound?.nameAr ?? unit.area.nameAr) : (unit.compound?.nameEn ?? unit.area.nameEn);

  // A reserved or sold unit stays readable, but every action on it is closed.
  const acceptsOffers = listingAcceptsOffers(listing.status);

  // Trading: shown only while the listing is live and its owner has opened it to trade.
  const isOwnerViewing = !!session && session.id === unit.ownerId;
  const tradeOpen = listing.openToTrade && acceptsOffers;
  const tradePrefRow = tradeOpen ? await prisma.tradePreference.findUnique({ where: { listingId: listing.id } }) : null;
  const tradePref = toPreference(tradePrefRow);
  const tradeAreaNames = tradeOpen && tradePref.areaIds.length
    ? (await prisma.area.findMany({ where: { id: { in: tradePref.areaIds } }, select: { nameAr: true, nameEn: true } })).map((a) => (ar ? a.nameAr : a.nameEn))
    : [];
  const myTradeUnits =
    tradeOpen && session && !isOwnerViewing
      ? (await eligibleUnitsFor(session.id)).map((u) => ({
          id: u.id,
          reference: u.reference,
          title: (ar ? u.titleAr : u.titleEn) || u.reference,
          price: u.price,
          currency: u.currency,
          thumb: u.media[0]?.thumbKey ?? u.media[0]?.fileKey ?? null,
          matches: matchPreference(tradePref, [
            { type: u.unit.type, areaId: u.unit.areaId, bedrooms: u.unit.bedrooms, sizeSqm: u.unit.sizeSqm, price: u.price },
          ]).matches,
        }))
      : [];
  const areaName = ar ? unit.area.nameAr : unit.area.nameEn;
  const title = (ar ? listing.titleAr : listing.titleEn) || place;
  const description = (ar ? listing.descriptionAr : listing.descriptionEn) ?? "";
  const dom = listing.publishedAt ? daysBetween(listing.publishedAt) : 0;
  const installments = parseJson<{
    downPayment?: number;
    monthly?: number;
    years?: number;
    remainingToDeveloper?: number;
  } | null>(listing.installmentJson, null);

  // JSON-LD so listing pages are indexable as real estate, per the SEO strategy.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: title,
    description,
    url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/listing/${listing.reference}`,
    datePosted: listing.publishedAt?.toISOString(),
    image: listing.media.slice(0, 6).map((m) => m.fileKey),
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: listing.currency,
      availability: "https://schema.org/InStock",
    },
    about: {
      "@type": unit.type === "villa" || unit.type === "townhouse" ? "House" : "Apartment",
      numberOfRooms: unit.bedrooms,
      numberOfBathroomsTotal: unit.bathrooms,
      floorSize: { "@type": "QuantitativeValue", value: unit.sizeSqm, unitCode: "MTK" },
      address: {
        "@type": "PostalAddress",
        addressLocality: unit.area.nameEn,
        addressRegion: unit.area.city,
        addressCountry: "EG",
      },
    },
  };

  const specs = [
    { label: t("bedrooms", locale), value: unit.bedrooms > 0 ? formatNumber(unit.bedrooms, locale) : ar ? "استوديو" : "Studio" },
    { label: t("bathrooms", locale), value: formatNumber(unit.bathrooms, locale) },
    { label: t("size", locale), value: `${formatNumber(unit.sizeSqm, locale)} ${t("sqm", locale)}` },
    { label: t("floor", locale), value: unit.floor === null ? "—" : unit.floor === 0 ? (ar ? "أرضي" : "Ground") : formatNumber(unit.floor, locale) },
    { label: t("finishing", locale), value: FINISHING_LABELS[unit.finishing as Finishing]?.[locale] ?? unit.finishing },
    {
      label: t("delivery", locale),
      value: unit.deliveryStatus === "ready" ? t("ready_to_move", locale) : t("under_construction", locale),
    },
  ];

  const plan =
    installments && (installments.monthly ?? 0) > 0
      ? [
          { label: ar ? "المقدم" : "Down payment", value: installments.downPayment ? formatPriceExact(installments.downPayment, locale, listing.currency) : null },
          { label: ar ? "القسط الشهري" : "Monthly", value: installments.monthly ? formatPriceExact(installments.monthly, locale, listing.currency) : null },
          { label: ar ? "مدة التقسيط" : "Term", value: installments.years ? `${formatNumber(installments.years, locale)} ${ar ? "سنين" : "years"}` : null },
          {
            label: ar ? "متبقي للمطور" : "Remaining to developer",
            value: installments.remainingToDeveloper ? formatPriceExact(installments.remainingToDeveloper, locale, listing.currency) : null,
          },
        ].filter((r) => r.value)
      : [];

  // Secondary facts read as one quiet line under the badges rather than a row of pills.
  const notes = [
    listing.locationStatus === "verified" ? (ar ? "الموقع متأكد منه تلقائي" : "Location checked automatically") : null,
    tradeOpen ? (ar ? "المالك قابل مقايضة" : "Owner open to a trade") : null,
  ].filter(Boolean) as string[];

  const verifiedLines = [
    ar ? "بطاقة الرقم القومي للمالك، ومطابقة للاسم اللي في المستند" : "The owner's national ID, matching the name on the document",
    ar
      ? "مستند الملكية (عقد أو خطاب تخصيص)، ومطابق لبيانات الوحدة"
      : "The ownership document (contract or allocation letter), matching the unit details",
    listing.trustLevel >= 3
      ? ar
        ? "الصور متصورة من داخل التطبيق، ومعاها الموقع والتوقيت"
        : "Photos taken in the app, with location and time attached"
      : ar
        ? "الصور اتراجعت يدوي"
        : "Photos reviewed by hand",
    ar
      ? "الموقع جوه حدود الكمبوند، والمساحة في الحدود المعروفة للنوع ده"
      : "Location inside the compound, and the size within the usual range for this type",
    ar ? "إعلان واحد بس للوحدة دي على الموقع" : "One listing only for this unit on the site",
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="container-page py-5 sm:py-6">
        <nav className="flex flex-wrap items-center gap-1.5 text-[13px] muted">
          <Link href="/" className="hover:text-ink-900">
            {ar ? "الوحدات" : "Homes"}
          </Link>
          <span aria-hidden>/</span>
          <Link href={`/?area=${unit.area.slug}`} className="hover:text-ink-900">
            {areaName}
          </Link>
          {unit.compound && (
            <>
              <span aria-hidden>/</span>
              <Link href={`/?compound=${unit.compound.slug}`} className="hover:text-ink-900">
                {ar ? unit.compound.nameAr : unit.compound.nameEn}
              </Link>
            </>
          )}
          <span className="tnum ms-auto">{listing.reference}</span>
        </nav>

        <Gallery media={listing.media} title={title} locale={locale} />
        {listing.tours.length > 0 && (
          <a href="#tour" className="link mt-3 inline-block text-[13.5px] font-semibold">
            {ar ? "شوف الجولة الافتراضية" : "Watch the virtual tour"}
            {listing.tours.length > 1 && <span className="tnum"> ({formatNumber(listing.tours.length, locale)})</span>}
          </a>
        )}

        <div className="mt-7 grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-12">
          {/* --- Main column ------------------------------------------- */}
          <div className="min-w-0">
            {/* The trust level leads (Section 11). Every unit is direct from its owner, so
                that is not a label (owner, 2026-10-24). One trust marker and the verdict;
                the secondary facts sit on a plain line under them. */}
            <div className="flex flex-wrap items-center gap-2">
              <TrustBadge level={listing.trustLevel} locale={locale} />
              {listing.withoutOver && (
                <span className="badge badge-accent">{ar ? "بدون أوفر · بسعر التعاقد الأصلي" : "No over · original contract price"}</span>
              )}
              <PriceVerdictBadge verdict={verdict} locale={locale} />
            </div>
            {notes.length > 0 && <p className="mt-2 text-[12.5px] muted">{notes.join(" · ")}</p>}

            {/* Staff shortcut. Rendered only for a role that may edit; buyers never see it. */}
            {session && canEditListings(session.role) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-navy-300 px-3 py-2 text-[13px]">
                <span className="font-semibold text-ink-700">{ar ? "أدمن" : "Admin"}</span>
                <Link href={`/admin/listings/${listing.id}/edit`} className="btn btn-primary px-3 py-1 text-[12.5px]">
                  {ar ? "تعديل الوحدة والصور" : "Edit unit & photos"}
                </Link>
                <Link href={`/admin/listings/${listing.id}`} className="btn btn-ghost px-3 py-1 text-[12.5px]">
                  {ar ? "تفاصيل الإدارة" : "Back-office detail"}
                </Link>
              </div>
            )}

            <div className="mt-4 flex items-start gap-3">
              <h1 className="flex-1 text-[24px] font-bold leading-[1.25] tracking-[-0.01em] text-ink-900 sm:text-[30px]">{title}</h1>
              <SaveButton listingId={listing.id} className="mt-1 border border-[var(--border)] p-2" />
            </div>
            <p className="mt-2 text-[15px] text-ink-700">
              {place}
              {unit.compound ? ` · ${areaName}` : ""}
              {unit.building ? ` · ${unit.building}` : ""}
            </p>

            {/* The six numbers people compare, as one ruled row rather than six boxes. */}
            <dl className="mt-4 grid grid-cols-3 border-y border-[var(--border)] sm:grid-cols-6">
              {specs.map((s, i) => (
                <div
                  key={s.label}
                  className={[
                    "py-3.5",
                    i % 3 === 0 ? "pe-3" : "border-s border-[var(--border)] px-3",
                    i >= 3 ? "border-t border-[var(--border)] sm:border-t-0" : "",
                    i === 3 ? "sm:border-s sm:px-3" : "",
                  ].join(" ")}
                >
                  <dt className="text-[12px] muted">{s.label}</dt>
                  <dd className="tnum mt-1 text-[15px] font-semibold leading-snug text-ink-900">{s.value}</dd>
                </div>
              ))}
            </dl>

            <p className="tnum mt-3 text-[12.5px] muted">
              {dom === 0
                ? ar
                  ? "اتنشرت النهاردة"
                  : "Listed today"
                : ar
                  ? `في السوق من ${formatNumber(dom, locale)} يوم`
                  : `${formatNumber(dom, locale)} ${dom === 1 ? "day" : "days"} on the market`}
              {" · "}
              {formatNumber(listing.views, locale)} {ar ? "مشاهدة" : "views"}
              {listing.publishedAt && (
                <>
                  {" · "}
                  {ar ? "اتوثقت" : "verified"} {formatDate(listing.publishedAt, locale)}
                </>
              )}
            </p>

            <VirtualTours tours={listing.tours} fallbackPoster={listing.media[0]?.fileKey ?? null} locale={locale} />

            {description && (
              <section className="mt-10">
                <h2 className="text-[17px] font-bold text-ink-900">{t("unit_details", locale)}</h2>
                <p className="mt-3 max-w-[68ch] whitespace-pre-line text-[15px] leading-[1.85] text-ink-900">{description}</p>
              </section>
            )}

            {plan.length > 0 && (
              <section className="mt-10">
                <h2 className="text-[17px] font-bold text-ink-900">{PAYMENT_TYPE_LABELS[listing.paymentType][locale]}</h2>
                <dl className="facts mt-2 max-w-[34rem] text-[14px]">
                  {plan.map((r) => (
                    <div key={r.label}>
                      <dt className="muted">{r.label}</dt>
                      <dd className="tnum font-semibold text-ink-900">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {listing.priceHistory.length > 1 && (
              <section className="mt-10">
                <h2 className="text-[17px] font-bold text-ink-900">{t("price_history", locale)}</h2>
                <PriceHistoryChart
                  points={listing.priceHistory.map((p) => ({
                    price: p.price,
                    at: p.changedAt.toISOString(),
                    kind: p.kind,
                  }))}
                  locale={locale}
                  currency={listing.currency}
                />
              </section>
            )}

            {/* Verification provenance: what we actually checked, stated plainly. */}
            <section className="mt-10">
              <h2 className="text-[17px] font-bold text-ink-900">{ar ? "اتحققنا من إيه" : "What we checked"}</h2>
              <ul className="mt-2 max-w-[44rem] divide-y divide-[var(--border)] text-[14px] text-ink-900">
                {verifiedLines.map((line) => (
                  <li key={line} className="py-2.5">
                    {line}
                  </li>
                ))}
              </ul>
              <ReportListingButton listingId={listing.id} locale={locale} signedIn={!!session} />
            </section>

            {/*
              True cost (Section 5). Placed after the unit details and before the action
              rail on mobile, because it is the last thing a buyer needs before deciding
              what to offer.
            */}
            <TrueCostPanel
              locale={locale}
              currency={listing.currency}
              price={listing.price}
              unitType={unit.type}
              purpose={listing.purpose}
              remainingInstallments={listing.remainingToDeveloper}
              maintenanceDue={listing.maintenanceDue}
              installmentsKnown={listing.obligationsDeclaredAt !== null}
              maintenanceKnown={listing.obligationsDeclaredAt !== null}
            />
          </div>

          {/* --- Sticky action rail ------------------------------------- */}
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div id="actions" className="card scroll-mt-20 p-5">
              <div className="text-[12px] muted">{t("asking_price", locale)}</div>
              <div className="tnum mt-1 text-[28px] font-bold leading-tight tracking-[-0.01em] text-ink-900">
                {formatPriceExact(listing.price, locale, listing.currency)}
              </div>
              <div className="tnum mt-1 text-[13px] muted">
                {formatPriceExact(pricePerSqm(listing.price, unit.sizeSqm), locale, listing.currency)} {t("per_sqm", locale)}
                {" · "}
                {UNIT_TYPE_LABELS[unit.type as UnitType]?.[locale] ?? unit.type}
                {" · "}
                {PAYMENT_TYPE_LABELS[listing.paymentType][locale]}
              </div>

              {/*
                Two actions, both of them concrete: make an offer, or book a viewing.

                The free-text "ask the owner" thread was REMOVED from this page (owner,
                2026-09-22). What is left are the two things that actually move a sale
                forward, and neither is a conversation that can drift for a fortnight
                without either side committing to anything.

                Existing threads are untouched and still reachable from the dashboard and
                the deal room; this closes the front door to starting one from a listing,
                it does not delete anyone's messages.
              */}
              <div className="mt-5 space-y-2">
                <MakeOfferButton
                  listingId={listing.id}
                  price={listing.price}
                  currency={listing.currency}
                  locale={locale}
                  signedIn={!!session}
                  disabled={!acceptsOffers}
                />

                <RequestViewingButton listingId={listing.id} locale={locale} signedIn={!!session} />

                {tradeOpen && !isOwnerViewing && (
                  <TradeOfferButton
                    targetListingId={listing.id}
                    targetPrice={listing.price}
                    currency={listing.currency}
                    cashPref={tradePref.cash}
                    myUnits={myTradeUnits}
                    signedIn={!!session}
                    locale={locale}
                  />
                )}
              </div>

              {tradeOpen && (
                <div className="mt-5 border-t border-[var(--border)] pt-4">
                  <div className="mb-1.5 text-[12.5px] font-semibold text-ink-900">
                    {ar ? "المالك عايز يقايض بـ" : "The owner would trade for"}
                  </div>
                  <TradeWants pref={tradePref} areaNames={tradeAreaNames} locale={locale} currency={listing.currency} />
                  {myTradeUnits.some((u) => u.matches) && (
                    <p className="mt-2 text-[12.5px] font-semibold text-ok-700">
                      {ar ? "عندك وحدة مناسبة لطلبه." : "One of your units fits what they want."}
                    </p>
                  )}
                </div>
              )}
              {isOwnerViewing && (
                <a href={`/dashboard/listings/${listing.id}/trade`} className="btn btn-ghost mt-3 w-full text-[13px]">
                  {listing.openToTrade ? (ar ? "إعدادات المقايضة" : "Trade settings") : ar ? "افتح الوحدة للمقايضة" : "Open this unit to trade"}
                </a>
              )}

              {/* The contact rule, stated where the buyer acts. */}
              <p className="mt-5 border-t border-[var(--border)] pt-4 text-[12.5px] leading-relaxed text-ink-700">
                {ar
                  ? "الوحدة دي معروضة من صاحبها. الأسماء والأرقام مش بتظهر لأي طرف غير بعد تأكيد المعاينة."
                  : "This unit is listed by its owner. Neither side sees names or phone numbers until a viewing is confirmed."}
              </p>
            </div>

            <FairPricePanel
              locale={locale}
              askingPrice={listing.price}
              currency={listing.currency}
              fair={fair ? { low: fair.low, mid: fair.mid, high: fair.high, confidence: fair.confidence, sampleSize: fair.sampleSize, factorsJson: fair.factorsJson } : null}
              developer={developer}
              verdict={verdict}
              developerGap={developerGap}
              compoundSlug={unit.compound?.slug ?? null}
            />
          </aside>
        </div>
      </div>

      {/*
        Phones (mobile pass, 2026-10-20): the action rail sits below the whole description,
        several screens down. This bar keeps the price and the way to act in reach from the
        first photo onward; the button jumps to the rail, which holds the real forms.
        globals.css pads the body while it is present, so it never covers the footer.
      */}
      {!isOwnerViewing && (
        <div id="mobile-action-bar" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white px-4 py-2.5 lg:hidden">
          <div className="mx-auto flex max-w-[640px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] muted">{t("asking_price", locale)}</div>
              <div className="tnum truncate text-[17px] font-bold text-ink-900">
                {formatPriceExact(listing.price, locale, listing.currency)}
              </div>
            </div>
            <a href="#actions" className="btn btn-primary h-11 shrink-0 px-4 text-[14px]">
              {acceptsOffers ? (ar ? "عرض أو معاينة" : "Offer or viewing") : ar ? "اطلب معاينة" : "Book a viewing"}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
