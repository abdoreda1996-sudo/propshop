import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { formatPriceExact, formatDate } from "@/lib/format";

import { canAccessAdminSection } from "@/lib/permissions";
import { effectiveStatus } from "@/lib/offers";
import { offerTabWhere, OfferTab } from "@/lib/offerTracking";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, oneOf, keepParams, SearchParams } from "@/lib/adminList";

import { AdminTitle, AdminTabs, AdminEmpty } from "@/components/admin/AdminUi";
import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "العروض", en: "Offers" });
}
export const dynamic = "force-dynamic";

const TABS: { key: OfferTab; ar: string; en: string }[] = [
  { key: "live", ar: "شغّالة", en: "Live" },
  { key: "accepted", ar: "اتقبلت", en: "Accepted" },
  { key: "closed", ar: "انتهت", en: "Ended" },
  { key: "all", ar: "الكل", en: "All" },
];

const STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  pending: { ar: "مستني رد", en: "Awaiting reply", tone: "badge-neutral" },
  accepted: { ar: "اتقبل", en: "Accepted", tone: "badge-verified" },
  rejected: { ar: "اترفض", en: "Rejected", tone: "badge-above" },
  withdrawn: { ar: "اتسحب", en: "Withdrawn", tone: "badge-neutral" },
  countered: { ar: "اترد عليه بعرض مقابل", en: "Countered", tone: "badge-neutral" },
  expired: { ar: "انتهت مدته", en: "Expired", tone: "badge-neutral" },
};

/**
 * Every offer and counteroffer on the platform — read-only tracking.
 *
 * Staff watch negotiations here; they do not make or answer offers for anyone. The
 * parties decide their own price — the whole product rests on there being no broker in
 * the middle of it.
 */
export default async function AdminOffersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session || !canAccessAdminSection(session.role, "offers")) notFound();

  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const tab = (TABS.find((t) => t.key === param(sp, "tab"))?.key ?? "live") as OfferTab;
  const now = new Date();
  const { page, skip, take, pageSize } = pageOf(sp);
  const q = param(sp, "q");
  const direction = oneOf(param(sp, "direction"), ["buyer", "seller"] as const);
  const filter = {
    ...(q ? { listing: { reference: { contains: q } } } : {}),
    ...(direction ? { direction } : {}),
  };

  const [counts, offers, total] = await Promise.all([
    Promise.all(TABS.map((t) => prisma.offer.count({ where: offerTabWhere(t.key, now) }))),
    prisma.offer.findMany({
      where: { AND: [offerTabWhere(tab, now), filter] },
      include: {
        listing: { select: { id: true, reference: true, price: true, currency: true, titleAr: true, titleEn: true } },
        buyer: { select: { fullName: true, publicRef: true } },
        seller: { select: { fullName: true, publicRef: true } },
        deals: { select: { reference: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.offer.count({ where: { AND: [offerTabWhere(tab, now), filter] } }),
  ]);

  return (
    <>
      <AdminTitle
        title={ar ? "العروض" : "Offers"}
        intro={ar
          ? "كل العروض والعروض المقابلة على المنصة، للمتابعة بس. الطرفين هما اللي بيحددوا السعر."
          : "Every offer and counteroffer on the platform, for tracking only. The two sides set the price themselves."}
      />

      <AdminTabs
        locale={locale}
        tabs={TABS.map((t, i) => ({ href: `/admin/offers?tab=${t.key}`, label: ar ? t.ar : t.en, count: counts[i], active: tab === t.key }))}
      />

      <FilterBar
        basePath="/admin/offers"
        locale={locale}
        keep={{ tab }}
        values={{ q, direction }}
        fields={[
          { kind: "search", name: "q", placeholder: ar ? "رقم الإعلان" : "Listing reference" },
          { kind: "select", name: "direction", label: ar ? "من" : "From", options: [{ value: "buyer", label: ar ? "المشتري" : "Buyer" }, { value: "seller", label: ar ? "المالك (عرض مقابل)" : "Owner (counter)" }] },
        ]}
      />

      {offers.length === 0 ? (
        <AdminEmpty>{ar ? "مافيش عروض هنا." : "No offers here."}</AdminEmpty>
      ) : (
        <div className="card mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-[13px]">
              <thead>
                <tr className="border-b border-ink-900 text-[12px] text-ink-500">
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "الوحدة" : "Unit"}</th>
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "مين قدّم" : "From"}</th>
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "المبلغ" : "Amount"}</th>
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "مقابل المطلوب" : "Vs asking"}</th>
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "المشتري" : "Buyer"}</th>
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "المالك" : "Owner"}</th>
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "الحالة" : "Status"}</th>
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "ينتهي" : "Expires"}</th>
                  <th className="px-3 py-2 font-semibold text-start">{ar ? "اتقدّم" : "Made"}</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => {
                  const s = effectiveStatus(o, now);
                  const st = STATUS[s] ?? { ar: s, en: s, tone: "badge-neutral" };
                  const gap = o.listing.price ? Math.round(((o.amount - o.listing.price) / o.listing.price) * 1000) / 10 : null;
                  return (
                    <tr key={o.id} className="border-b border-[var(--border)] align-top last:border-0">
                      <td className="px-3 py-2.5">
                        <Link href={`/admin/listings/${o.listing.id}`} className="tnum font-semibold text-ink-900 underline underline-offset-4">
                          {o.listing.reference}
                        </Link>
                        <div className="max-w-[200px] truncate text-[12px] muted">{(ar ? o.listing.titleAr : o.listing.titleEn) || ""}</div>
                      </td>
                      <td className="px-3 py-2.5 muted">
                        {o.direction === "seller" ? (ar ? "المالك (عرض مقابل)" : "Owner (counter)") : ar ? "المشتري" : "Buyer"}
                      </td>
                      <td className="tnum px-3 py-2.5 font-semibold text-ink-900">{formatPriceExact(o.amount, locale, o.currency)}</td>
                      <td className={`tnum px-3 py-2.5 font-semibold ${gap !== null && gap < 0 ? "text-danger-700" : "text-ok-700"}`}>
                        {gap === null ? "—" : `${gap > 0 ? "+" : ""}${gap}%`}
                      </td>
                      <td className="px-3 py-2.5">
                        {o.buyer.fullName} <span className="tnum muted">#{o.buyer.publicRef ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {o.seller.fullName} <span className="tnum muted">#{o.seller.publicRef ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`badge ${st.tone}`}>{st[locale]}</span>
                        {o.deals[0] && <div className="tnum mt-1 text-[12px] muted">{o.deals[0].reference}</div>}
                      </td>
                      <td className="px-3 py-2.5 muted">{o.expiresAt ? formatDate(o.expiresAt, locale) : "—"}</td>
                      <td className="px-3 py-2.5 muted">{formatDate(o.createdAt, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pager basePath="/admin/offers" params={keepParams(sp)} page={page} total={total} pageSize={pageSize} locale={locale} />
    </>
  );
}
