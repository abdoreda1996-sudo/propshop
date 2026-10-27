import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { formatPriceExact } from "@/lib/format";
import { PHOTOGRAPHY_FEE } from "@/lib/fees";
import { VIEWING_WINDOWS } from "@/lib/viewingSlots";
import { isImmersive } from "@/lib/tours";
import { getHomeData } from "@/lib/home";
import VirtualTours, { PublicTour } from "@/components/VirtualTours";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta(
    { ar: "جولة افتراضية 360 لبيتك", en: "Virtual 360 home tour" },
    {
      ar: "مصور بروب شوب بيصوّر وحدتك جولة 360 يتمشى فيها المشتري من موبايله. السعر وطريقة الحجز.",
      en: "A PropShop photographer shoots your home as a 360° tour buyers walk through on their phone. The price and how to book.",
    },
  );
}
export const dynamic = "force-dynamic";

/** Listings an owner can still book a shoot for. Mirrors BOOKABLE_LISTING in tourBooking.ts. */
const BOOKABLE = ["draft", "pending_review", "live", "paused", "rejected"];

/**
 * The 360° virtual home tour, as a product page (owner, 2026-10-24): what it looks like,
 * what it costs, and how to schedule it. Linked from the pricing page.
 *
 * It sells the existing photo_package booking (src/lib/tourBooking.ts). The shoot is
 * booked per listing on /dashboard/listings/[id]/tour, so "book" here means choosing which
 * of your listings it is for.
 *
 * The sample is a real approved tour from a live listing, preferring an immersive (3D/360)
 * one. With no tour in the catalogue yet, a real listing's cover photo stands in, with a
 * caption saying so, rather than an illustration.
 */
export default async function VirtualTourPage() {
  const [locale, session] = await Promise.all([getLocale(), getSession()]);
  const ar = locale === "ar";

  const [feeRow, samples, myListings, home] = await Promise.all([
    prisma.feeConfig.findFirst({ where: { key: "photo_package" }, select: { amount: true } }),
    prisma.listingTour.findMany({
      where: { status: "approved", listing: { status: "live" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, kind: true, provider: true, url: true, posterUrl: true, title: true, listing: { select: { reference: true } } },
    }),
    session
      ? prisma.listing.findMany({
          where: { unit: { ownerId: session.id }, status: { in: BOOKABLE } },
          orderBy: { updatedAt: "desc" },
          select: { id: true, reference: true, titleAr: true, titleEn: true, status: true },
        })
      : Promise.resolve([]),
    getHomeData(),
  ]);

  const price = feeRow?.amount ?? PHOTOGRAPHY_FEE;
  const sample = samples.find((t) => isImmersive(t.provider as never)) ?? samples[0] ?? null;
  const sampleTour: PublicTour | null = sample
    ? { id: sample.id, kind: sample.kind, provider: sample.provider, url: sample.url, posterUrl: sample.posterUrl, title: sample.title }
    : null;
  const photoUnit = home.newest.find((n) => n.photo) ?? null;

  const steps = [
    {
      title: ar ? "اختار يوم وفترة" : "Pick a day and a time window",
      text: ar
        ? `من صفحة الوحدة في حسابك. الفترات المتاحة: ${VIEWING_WINDOWS.map((w) => w.ar).join("، ")}.`
        : `From the unit's page in your account. Windows: ${VIEWING_WINDOWS.map((w) => w.en).join(", ")}.`,
    },
    {
      title: ar ? "بنكلمك نأكد الميعاد" : "We call to confirm",
      text: ar ? "المصور بييجي في الميعاد، والتصوير بياخد حوالي ساعة." : "The photographer comes at that time. The shoot takes about an hour.",
    },
    {
      title: ar ? "الجولة بتنزل على إعلانك" : "The tour goes on your listing",
      text: ar
        ? "بعد ما فريقنا يراجعها بتظهر للمشترين جنب الصور."
        : "Once our team has reviewed it, buyers see it next to the photos.",
    },
  ];

  return (
    <div className="container-page pb-6 pt-10 md:pt-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
        {/* --- Text column ---------------------------------------------------- */}
        <div className="max-w-xl">
          <h1 className="display">{ar ? "جولة افتراضية 360 لبيتك" : "A 360° tour of your home"}</h1>
          <p className="lede mt-4">
            {ar
              ? "المشتري يتمشى في وحدتك من موبايله قبل ما ييجي يعاين. اللي بييجي بعدها بيبقى شاف الوحدة كلها وعارف هو عايز إيه."
              : "Buyers walk through your home on their phone before they come to see it. The ones who still book a viewing have already seen every room."}
          </p>

          {/* Price as a plain line, not a box. */}
          <div className="mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-[var(--border)] py-4">
            <span className="tnum text-[26px] font-bold text-ink-900">{formatPriceExact(price, locale)}</span>
            <span className="text-[14px] text-ink-700">{ar ? "مرة واحدة لكل وحدة" : "once, per home"}</span>
            <span className="w-full text-[13px] muted">
              {ar
                ? "بيشمل الجولة الـ360 أوضة أوضة، صور احترافية للإعلان، ورسم مساحي للوحدة. لو صوّرت بنفسك من التطبيق مش هتدفع حاجة."
                : "Includes the 360° tour room by room, professional photos for the listing, and a floor sketch. Shoot it yourself in the app and it costs nothing."}
            </span>
          </div>

          <h2 className="mt-10 text-[15px] font-semibold text-ink-900">{ar ? "الحجز بيمشي إزاي" : "How booking works"}</h2>
          <ol className="mt-3 border-t border-[var(--border)]">
            {steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[28px_1fr] gap-x-2 border-b border-[var(--border)] py-3.5">
                <span className="tnum text-[14px] font-semibold text-accent-500">{i + 1}</span>
                <div>
                  <div className="text-[14px] font-semibold text-ink-900">{s.title}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-700">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          {/* --- Book ------------------------------------------------------- */}
          <div id="book" className="mt-10 scroll-mt-24">
            <h2 className="text-[15px] font-semibold text-ink-900">{ar ? "احجز ميعاد" : "Book a shoot"}</h2>
            {!session ? (
              <>
                <p className="mt-1.5 text-[14px] text-ink-700">
                  {ar ? "سجّل دخولك واختار الوحدة اللي عايز تصوّرها." : "Sign in and choose the home you want shot."}
                </p>
                <Link href="/login?next=/virtual-tour" className="btn btn-primary mt-4">
                  {ar ? "سجّل دخول للحجز" : "Sign in to book"}
                </Link>
              </>
            ) : myListings.length === 0 ? (
              <>
                <p className="mt-1.5 text-[14px] text-ink-700">
                  {ar
                    ? "الجولة بتتحجز لوحدة معروضة. اعرض وحدتك الأول (مجاناً)، وبعدها احجز التصوير من صفحتها."
                    : "A tour is booked for a listed home. List yours first (it is free), then book the shoot from its page."}
                </p>
                <Link href="/list" className="btn btn-primary mt-4">
                  {ar ? "اعرض وحدتك" : "List your property"}
                </Link>
              </>
            ) : (
              <>
                <p className="mt-1.5 text-[14px] text-ink-700">{ar ? "اختار الوحدة:" : "Choose the home:"}</p>
                <ul className="mt-3 border-t border-[var(--border)]">
                  {myListings.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-ink-900">{(ar ? l.titleAr : l.titleEn) || l.reference}</div>
                        <div className="tnum text-[12px] muted">{l.reference}</div>
                      </div>
                      <Link href={`/dashboard/listings/${l.id}/tour`} className="btn btn-ghost px-3 py-1.5 text-[13px]">
                        {ar ? "احجز للوحدة دي" : "Book for this home"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* --- Sample --------------------------------------------------------- */}
        <div className="lg:pt-2">
          {sampleTour ? (
            <>
              <VirtualTours tours={[sampleTour]} fallbackPoster={null} locale={locale} />
              {sample?.listing.reference && (
                <Link href={`/listing/${sample.listing.reference}`} className="mt-2 inline-block text-[13px] font-semibold text-brand-500 hover:underline">
                  {ar ? "شوف الوحدة دي" : "See this unit"}
                </Link>
              )}
            </>
          ) : photoUnit?.photo ? (
            <figure>
              <Link href={photoUnit.href} className="media-frame block aspect-[4/3] rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUnit.photo} alt={ar ? photoUnit.titleAr : photoUnit.titleEn} className="h-full w-full object-cover" />
              </Link>
              <figcaption className="mt-2 text-[12px] leading-relaxed muted">
                {ar
                  ? `وحدة معروضة دلوقتي في ${photoUnit.compoundAr ?? photoUnit.areaAr}. الجولة بتفتح على أي موبايل أو كمبيوتر من غير تطبيق، والمشتري بيتنقل فيها من أوضة لأوضة.`
                  : `A unit listed now in ${photoUnit.compoundEn ?? photoUnit.areaEn}. A tour opens on any phone or computer without an app, and buyers move through it room by room.`}
              </figcaption>
            </figure>
          ) : null}
        </div>
      </div>
    </div>
  );
}
