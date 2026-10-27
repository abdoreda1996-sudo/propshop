import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { MIN_PUBLIC_TRUST } from "@/lib/enums";
import { toPreference } from "@/lib/tradeService";
import TradeSettingsForm from "@/components/TradeSettingsForm";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "إعدادات المقايضة", en: "Trade settings" });
}
export const dynamic = "force-dynamic";

/** The owner opens one of their listings to trade and says what they want in return. */
export default async function ListingTradeSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, locale, { id }] = await Promise.all([getSession(), getLocale(), params]);
  if (!session) return null;
  const ar = locale === "ar";

  const listing = await prisma.listing.findFirst({
    where: { OR: [{ id }, { reference: id }], unit: { ownerId: session.id } },
    select: { id: true, reference: true, titleAr: true, titleEn: true, status: true, trustLevel: true, openToTrade: true, tradePreference: true },
  });
  // Someone else's listing is a 404, not a 403: do not confirm it exists.
  if (!listing) notFound();
  const [areas, request] = await Promise.all([
    prisma.area.findMany({ select: { id: true, nameAr: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    prisma.tradeRequest.findFirst({ where: { userId: session.id, listingId: listing.id }, select: { id: true } }).catch(() => null),
  ]);

  return (
    <>
      <Link href="/dashboard/listings" className="text-[13px] muted hover:underline">
        {ar ? "رجوع لإعلاناتي" : "Back to my listings"}
      </Link>
      <h1 className="mt-2 text-[24px] font-bold text-ink-900">{ar ? "المقايضة" : "Trading"}</h1>
      <p className="tnum mt-1 text-[14px] muted">
        {listing.reference} · {(ar ? listing.titleAr : listing.titleEn) || ""}
      </p>
      {/* The trade request is the main way to say what you want: the browse filters, the
          matching units straight away, and notifications for new ones. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-[var(--border)] py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink-900">
            {request ? (ar ? "طلب المقايضة بتاع الوحدة دي" : "This unit's trade request") : ar ? "حدد الوحدة اللي عايزها مقابلها" : "Choose the unit you want for it"}
          </p>
          <p className="mt-0.5 text-[13px] muted">
            {ar
              ? "بنفس فلاتر البحث. هنوريك الوحدات المناسبة ونبلغك بأي وحدة جديدة زيها."
              : "Using the search filters. We show the units that fit and notify you of new ones."}
          </p>
        </div>
        <Link
          href={request ? `/dashboard/trades/request/${request.id}` : `/dashboard/trades/request/new?listing=${listing.id}`}
          className="btn btn-primary text-[13px]"
        >
          {request ? (ar ? "افتح الطلب" : "Open request") : ar ? "اعمل طلب مقايضة" : "Create a trade request"}
        </Link>
      </div>

      <div className="mt-6">
        <TradeSettingsForm
          listingId={listing.id}
          initialOpen={listing.openToTrade}
          initial={toPreference(listing.tradePreference)}
          areas={areas}
          canOpen={listing.status === "live" && listing.trustLevel >= MIN_PUBLIC_TRUST}
          locale={locale}
        />
      </div>
    </>
  );
}
