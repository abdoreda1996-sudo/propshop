import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { formatPriceExact, formatNumber, formatDate } from "@/lib/format";
import { MAX_ACTIVE_LISTINGS_PER_IDENTITY } from "@/lib/enums";
import { parseJson } from "@/lib/json";
import { COVER_FIRST } from "@/lib/cover";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "إعلاناتي", en: "My listings" });
}
export const dynamic = "force-dynamic";

type Check = { code: string; messageAr: string; messageEn: string; field: string | null };

export default async function MyListingsPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";

  const listings = await prisma.listing.findMany({
    where: { unit: { ownerId: session.id } },
    include: {
      unit: { include: { compound: true, area: true } },
      media: { take: 1, orderBy: COVER_FIRST },
      _count: { select: { requests: true, savedBy: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const active = listings.filter((l) => ["live", "pending_review", "paused"].includes(l.status)).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900">{ar ? "إعلاناتي" : "My listings"}</h1>
          <p className="tnum mt-1 text-[13px] muted">
            {ar
              ? `${active} من ${MAX_ACTIVE_LISTINGS_PER_IDENTITY} إعلانات نشطة`
              : `${active} of ${MAX_ACTIVE_LISTINGS_PER_IDENTITY} active listings`}
          </p>
        </div>
        {active < MAX_ACTIVE_LISTINGS_PER_IDENTITY && (
          <Link href="/dashboard/listings/new" className="btn btn-primary text-[13px]">
            {t("list_unit", locale)}
          </Link>
        )}
      </div>

      {listings.length === 0 ? (
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-[14px] muted">
          {ar ? "لسه ماعرضتش أي وحدة. " : "You have not listed a unit yet. "}
          <Link href="/dashboard/listings/new" className="font-semibold text-brand-500 hover:underline">
            {t("list_unit", locale)}
          </Link>
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {listings.map((l) => {
            const validation = parseJson<{ blocks?: Check[] } | null>(l.validationJson, null);
            const blocks = validation?.blocks ?? [];
            const place = ar ? (l.unit.compound?.nameAr ?? l.unit.area.nameAr) : (l.unit.compound?.nameEn ?? l.unit.area.nameEn);
            const action = "text-[13px] font-semibold text-brand-500 hover:underline";

            return (
              <li key={l.id} className="py-4">
                <div className="flex gap-4">
                  <div className="media-frame h-[72px] w-24 shrink-0 rounded sm:h-20 sm:w-28">
                    {l.media[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.media[0].thumbKey ?? l.media[0].fileKey} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tnum text-[12.5px] font-semibold text-ink-500">{l.reference}</span>
                      <span
                        className={`badge ${
                          l.status === "live"
                            ? "badge-verified"
                            : l.status === "rejected"
                              ? "badge-above"
                              : "badge-neutral"
                        }`}
                      >
                        {t(`status_${l.status}`, locale)}
                      </span>
                      {l.openToTrade && (
                        <span className="text-[12px] font-semibold text-ink-500">{ar ? "· متاحة للمقايضة" : "· open to trade"}</span>
                      )}
                    </div>

                    <p className="mt-1 truncate text-[15px] font-semibold text-ink-900">
                      {(ar ? l.titleAr : l.titleEn) || place}
                    </p>
                    <p className="tnum mt-0.5 text-[13px] text-ink-700">
                      {formatPriceExact(l.price, locale, l.currency)} <span className="muted">· {place}</span>
                    </p>

                    <p className="tnum mt-1.5 text-[12px] muted">
                      {formatNumber(l.views, locale)} {ar ? "مشاهدة" : "views"} · {formatNumber(l._count.requests, locale)}{" "}
                      {ar ? "طلب" : "requests"} · {formatNumber(l._count.savedBy, locale)} {ar ? "حفظ" : "saves"}
                      {l.expiresAt && l.status === "live" && (
                        <>
                          {" "}· {ar ? "ينتهي" : "expires"} {formatDate(l.expiresAt, locale)}
                        </>
                      )}
                    </p>

                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                      {["draft", "rejected"].includes(l.status) && (
                        <Link href={`/dashboard/listings/${l.id}`} className={action}>
                          {ar ? "أكمل الإعلان" : "Continue"}
                        </Link>
                      )}
                      {l.status === "live" && (
                        <Link href={`/listing/${l.reference}`} className={action}>
                          {ar ? "اعرض الإعلان" : "View listing"}
                        </Link>
                      )}
                      {!["sold", "closed"].includes(l.status) && (
                        <Link href={`/dashboard/listings/${l.id}/tour`} className={action}>
                          {l.tourCount > 0
                            ? ar
                              ? `الجولات (${formatNumber(l.tourCount, locale)})`
                              : `Tours (${formatNumber(l.tourCount, locale)})`
                            : ar
                              ? "أضف جولة فيديو"
                              : "Add video tour"}
                        </Link>
                      )}
                      {!["sold", "closed", "reserved"].includes(l.status) && (
                        // Not yet trading: wanting to trade starts with the trade request form
                        // ("the unit I want in exchange"), which opens the unit on save.
                        <Link
                          href={l.openToTrade ? `/dashboard/listings/${l.id}/trade` : `/dashboard/trades/request/new?listing=${l.id}`}
                          className={action}
                        >
                          {l.openToTrade ? (ar ? "إعدادات المقايضة" : "Trade settings") : ar ? "افتحها للمقايضة" : "Open to trade"}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {l.status === "rejected" && l.rejectReason && (
                  <p className="mt-3 border-s-2 border-danger-600 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
                    <strong>{ar ? "سبب الرفض: " : "Rejected: "}</strong>
                    {l.rejectReason}
                  </p>
                )}

                {/* Blocking checks, with the exact field to fix. */}
                {["draft", "rejected"].includes(l.status) && blocks.length > 0 && (
                  <div className="mt-3 text-[12.5px] text-ink-900">
                    <p className="font-semibold">{t("cannot_publish", locale)}</p>
                    <ul className="mt-1 list-disc space-y-0.5 ps-5 text-ink-700">
                      {blocks.slice(0, 4).map((b) => (
                        <li key={b.code}>{ar ? b.messageAr : b.messageEn}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
