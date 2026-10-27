import Link from "next/link";
import { AdminTitle } from "@/components/admin/AdminUi";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessAdminSection, allowedAdminSections } from "@/lib/permissions";
import { formatNumber, formatPriceExact } from "@/lib/format";
import { OPEN_REQUEST_STATUSES } from "@/lib/sla";
import { PUBLIC_LISTING_WHERE } from "@/lib/listings";
import { LOCATION_ISSUE_WHERE } from "@/lib/locationService";
import { manualReviewWhere } from "@/lib/kycService";
import { bucketWhere } from "@/lib/viewingArrange";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "لوحة التحكم", en: "Back office" });
}
export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  // /admin is where every staff link lands. A role without the overview (photographers)
  // goes to the first section it does have, rather than seeing platform-wide numbers.
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!canAccessAdminSection(session.role, "overview")) {
    const first = allowedAdminSections(session.role)[0];
    redirect(first ? `/admin/${first}` : "/dashboard");
  }
  const locale = await getLocale();
  const ar = locale === "ar";
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);

  const [
    liveListings,
    pendingReview,
    openRequests,
    breached,
    openReports,
    owners,
    buyers,
    newListingsThisWeek,
    requestsThisWeek,
    respondedThisWeek,
    feeRevenue,
    locationIssues,
    pendingTours,
  ] = await Promise.all([
    prisma.listing.count({ where: PUBLIC_LISTING_WHERE }),
    prisma.listing.count({ where: { status: "pending_review" } }),
    prisma.request.count({ where: { status: { in: OPEN_REQUEST_STATUSES } } }),
    prisma.request.count({
      where: { firstResponseAt: null, slaDueAt: { lt: now }, status: { in: OPEN_REQUEST_STATUSES } },
    }),
    prisma.report.count({ where: { status: "open" } }),
    prisma.user.count({ where: { role: "owner" } }),
    prisma.user.count({ where: { role: "buyer" } }),
    prisma.listing.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.request.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.request.count({ where: { createdAt: { gte: weekAgo }, firstResponseAt: { not: null } } }),
    prisma.payment.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
    prisma.listing.count({ where: LOCATION_ISSUE_WHERE }),
    // Owner-added virtual tours waiting for a reviewer, counted by listing.
    prisma.listing.count({ where: { tours: { some: { status: "pending" } } } }),
  ]);

  // The queues, oldest first. Each finds its single oldest item so the row can say how long
  // the longest-waiting thing has waited, which is what decides where to start.
  const [oldestReview, idReviews, oldestId, oldestBreach, oldestReport, viewingsToArrange, viewingsUnrecorded, tradesInProgress] = await Promise.all([
    prisma.listing.findFirst({ where: { status: "pending_review" }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
    prisma.kycDocument.count({ where: manualReviewWhere() }),
    prisma.kycDocument.findFirst({ where: manualReviewWhere(), orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.request.findFirst({
      where: { firstResponseAt: null, slaDueAt: { lt: now }, status: { in: OPEN_REQUEST_STATUSES } },
      orderBy: { slaDueAt: "asc" },
      select: { slaDueAt: true },
    }),
    prisma.report.findFirst({ where: { status: "open" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.viewingRequest.count({ where: bucketWhere("needs_action", now) }),
    prisma.viewingRequest.count({ where: bucketWhere("unrecorded", now) }),
    prisma.tradeOffer.count({ where: { status: "accepted", stage: { not: "completed" } } }),
  ]);

  const waited = (d: Date | null | undefined) => {
    if (!d) return "";
    const h = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 3_600_000));
    if (h < 1) return ar ? "أقدم واحد من أقل من ساعة" : "oldest waiting under an hour";
    if (h < 24) return ar ? `أقدم واحد من ${formatNumber(h, locale)} ساعة` : `oldest waiting ${formatNumber(h, locale)}h`;
    const days = Math.floor(h / 24);
    return ar ? `أقدم واحد من ${formatNumber(days, locale)} يوم` : `oldest waiting ${formatNumber(days, locale)} ${days === 1 ? "day" : "days"}`;
  };

  // Most urgent first: promises already broken, then decisions people are blocked on.
  const queues = [
    { section: "requests", href: "/admin/requests?sla=breached", label: ar ? "طلبات عدّت الـ24 ساعة من غير رد" : "Requests past 24 hours without a reply", count: breached, note: waited(oldestBreach?.slaDueAt), urgent: true },
    { section: "verification", href: "/admin/verification", label: ar ? "إعلانات مستنية مراجعة" : "Listings awaiting review", count: pendingReview, note: waited(oldestReview?.updatedAt) },
    { section: "verification", href: "/admin/verification", label: ar ? "هويات محتاجة مراجعة يدوية" : "Identity checks needing a person", count: idReviews, note: waited(oldestId?.createdAt) },
    { section: "viewings", href: "/admin/viewings?tab=unrecorded", label: ar ? "معاينات عدّت ومحدش سجّل اللي حصل" : "Past viewings with no outcome recorded", count: viewingsUnrecorded, urgent: true },
    { section: "viewings", href: "/admin/viewings", label: ar ? "معاينات محتاجة ترتيب" : "Viewings to arrange", count: viewingsToArrange },
    { section: "reports", href: "/admin/reports", label: ar ? "بلاغات مفتوحة" : "Open reports", count: openReports, note: waited(oldestReport?.createdAt) },
    { section: "listings", href: "/admin/listings?location=issues", label: ar ? "مشاكل في الموقع" : "Location issues", count: locationIssues },
    { section: "listings", href: "/admin/listings?tours=pending", label: ar ? "جولات فيديو مستنية مراجعة" : "Video tours awaiting review", count: pendingTours },
    { section: "trades", href: "/admin/trades", label: ar ? "مقايضات اتقبلت ولسه بتتنفذ" : "Accepted trades still in progress", count: tradesInProgress },
  ].filter((q) => canAccessAdminSection(session.role, q.section as Parameters<typeof canAccessAdminSection>[1]));
  const waiting = queues.filter((q) => q.count > 0);

  // North star (Section 12) plus the SLA health number, which is the promise we make.
  const slaHealth = requestsThisWeek > 0 ? Math.round((respondedThisWeek / requestsThisWeek) * 100) : 100;

  const tiles = [
    {
      label: ar ? "وحدات موثقة منشورة" : "Verified live listings",
      value: formatNumber(liveListings, locale),
      note: ar ? "المؤشر الأساسي" : "The main number",
      href: "/admin/listings",
    },
    {
      label: ar ? "طلبات مفتوحة" : "Open requests",
      value: formatNumber(openRequests, locale),
      note: breached > 0 ? (ar ? `${breached} عدّى الـ24 ساعة` : `${breached} past 24 hours`) : ar ? "كلها في المعاد" : "all within 24 hours",
      alert: breached > 0,
      href: "/admin/requests",
    },
    {
      label: ar ? "اتردّ عليها في 24 ساعة" : "Answered within 24 hours",
      value: `${slaHealth}%`,
      note: ar ? "آخر 7 أيام" : "last 7 days",
      alert: slaHealth < 90,
      href: "/admin/requests",
    },
    {
      label: ar ? "مشاكل الموقع" : "Location issues",
      value: formatNumber(locationIssues, locale),
      note: ar ? "صور متصورة بعيد عن الكمبوند أو من غير GPS" : "photos taken away from the compound or without GPS",
      alert: locationIssues > 0,
      href: "/admin/listings?location=issues",
    },
    {
      label: ar ? "بلاغات مفتوحة" : "Open reports",
      value: formatNumber(openReports, locale),
      note: ar ? "بلاغات السماسرة والصور" : "broker and photo reports",
      alert: openReports > 0,
      href: "/admin/reports",
    },
    {
      label: ar ? "ملّاك / مشترين" : "Owners / buyers",
      value: `${formatNumber(owners, locale)} / ${formatNumber(buyers, locale)}`,
      note: ar ? "عدد الحسابات" : "accounts",
      href: "/admin/users",
    },
    {
      label: ar ? "رسوم محصّلة" : "Fees collected",
      value: formatPriceExact(feeRevenue._sum.amount ?? 0, locale),
      note: ar ? "رسوم ثابتة فقط" : "flat fees only",
      href: "/admin/listings",
    },
  ];

  return (
    <>
      <AdminTitle title={ar ? "نظرة عامة" : "Overview"} />

      <h2 className="mt-6 text-[15px] font-semibold text-ink-900">{ar ? "محتاج تتصرف فيه" : "Needs action"}</h2>
      {waiting.length === 0 ? (
        <p className="mt-2 border-y border-[var(--border)] py-4 text-[14px] text-ink-500">
          {ar ? "مفيش حاجة مستنياك دلوقتي." : "Nothing is waiting on you right now."}
        </p>
      ) : (
        <ul className="mt-2 border-t border-ink-900">
          {waiting.map((q) => (
            <li key={q.label} className="border-b border-[var(--border)]">
              <Link
                href={q.href}
                className="grid grid-cols-[3rem_1fr_auto] items-baseline gap-x-3 py-3 transition hover:bg-ink-50 focus-visible:bg-ink-50 sm:px-1"
              >
                <span className={`tnum text-[20px] font-semibold leading-none ${q.urgent ? "text-danger-700" : "text-ink-900"}`}>
                  {formatNumber(q.count, locale)}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] text-ink-900">{q.label}</span>
                  {q.note && <span className="block text-[12px] text-ink-500">{q.note}</span>}
                </span>
                <span className="text-[13px] font-semibold text-brand-500 underline-offset-4">{ar ? "افتح" : "Open"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-10 text-[15px] font-semibold text-ink-900">{ar ? "الأرقام" : "Numbers"}</h2>
      {/* One ruled table of figures rather than a grid of tiles: easier to read down. */}
      <dl className="mt-2 border-t border-ink-900">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-[var(--border)] py-3 transition hover:bg-ink-50 sm:grid-cols-[minmax(0,16rem)_10rem_1fr] sm:px-1"
          >
            <dt className="text-[13.5px] text-ink-700">{tile.label}</dt>
            <dd className="tnum text-end text-[20px] font-semibold leading-none text-ink-900 sm:text-start">{tile.value}</dd>
            <p className={`col-span-2 mt-1 text-[12px] sm:col-span-1 sm:mt-0 ${tile.alert ? "font-semibold text-danger-700" : "text-ink-500"}`}>
              {tile.note}
            </p>
          </Link>
        ))}
      </dl>

      <h2 className="mt-10 text-[15px] font-semibold text-ink-900">{ar ? "آخر 7 أيام" : "Last 7 days"}</h2>
      <dl className="mt-3 flex flex-wrap border-y border-[var(--border)] [&>*+*]:border-s [&>*+*]:border-[var(--border)]">
        {[
          { label: ar ? "إعلانات جديدة" : "New listings", value: newListingsThisWeek },
          { label: ar ? "طلبات جديدة" : "New requests", value: requestsThisWeek },
          { label: ar ? "اتردّ عليها" : "Responded", value: respondedThisWeek },
        ].map((f) => (
          <div key={f.label} className="min-w-[8rem] flex-1 px-4 py-3 first:ps-0">
            <dt className="text-[12px] text-ink-500">{f.label}</dt>
            <dd className="tnum mt-1 text-[20px] font-semibold leading-none text-ink-900">{formatNumber(f.value, locale)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
