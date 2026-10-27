import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatPriceExact } from "@/lib/format";
import { REQUEST_STATUS_LABELS, RequestStatus, TRUST } from "@/lib/enums";
import { slaState, formatCountdown } from "@/lib/sla";
import { awaitingWhere } from "@/lib/offers";
import { awaitingViewingsCount } from "@/lib/viewingQueries";
import { unreadNotificationCount } from "@/lib/notifications";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "حسابي", en: "My account" });
}

type Attention = {
  key: string;
  title: string;
  detail?: string;
  href: string;
  action: string;
  /** Someone is waiting on this user, or a listing is blocked. Marked in rust. */
  urgent: boolean;
};

/**
 * Dashboard home: what needs this user's attention, most urgent first, each with the link
 * that deals with it. The figures and the latest listings sit underneath as a summary.
 */
export default async function DashboardPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";
  const me = session.id;
  const now = new Date();

  const [
    listings,
    requests,
    savedCount,
    totalViews,
    listingCount,
    requestCount,
    rejected,
    drafts,
    underReview,
    offersAwaiting,
    viewingsAwaiting,
    tradesAwaiting,
    unreadMessages,
    unreadNotifications,
  ] = await Promise.all([
    prisma.listing.findMany({
      where: { unit: { ownerId: me } },
      include: { media: { take: 1, orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.request.findMany({
      where: { buyerId: me },
      include: { listing: { select: { reference: true, titleAr: true, titleEn: true } } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.savedListing.count({ where: { userId: me } }),
    prisma.listing.aggregate({ where: { unit: { ownerId: me } }, _sum: { views: true } }),
    // Real totals for the figures row: the two lists above are capped at four.
    prisma.listing.count({ where: { unit: { ownerId: me } } }),
    prisma.request.count({ where: { buyerId: me } }),
    prisma.listing.findMany({
      where: { unit: { ownerId: me }, status: "rejected" },
      select: { id: true, reference: true, titleAr: true, titleEn: true, rejectReason: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.listing.findMany({
      where: { unit: { ownerId: me }, status: "draft" },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.listing.count({ where: { unit: { ownerId: me }, status: "pending_review" } }),
    prisma.offer.count({ where: awaitingWhere(me, now) }),
    awaitingViewingsCount(me),
    prisma.tradeOffer.count({ where: { recipientId: me, status: "pending", expiresAt: { gt: now } } }),
    prisma.message.count({
      where: { readAt: null, senderId: { not: me }, conversation: { OR: [{ ownerId: me }, { buyerId: me }] } },
    }),
    unreadNotificationCount(me),
  ]);

  const n = (v: number) => formatNumber(v, locale);
  const items: Attention[] = [];

  for (const l of rejected) {
    items.push({
      key: `rejected-${l.id}`,
      title: ar
        ? `اترفض: ${(l.titleAr || l.reference)}`
        : `Rejected: ${l.titleEn || l.reference}`,
      detail: l.rejectReason ?? undefined,
      href: `/dashboard/listings/${l.id}`,
      action: ar ? "صلّح الإعلان" : "Fix the listing",
      urgent: true,
    });
  }
  if (offersAwaiting > 0)
    items.push({
      key: "offers",
      title: ar ? `${n(offersAwaiting)} عرض مستني ردك` : `${n(offersAwaiting)} ${offersAwaiting === 1 ? "offer is" : "offers are"} waiting for your reply`,
      detail: ar ? "العرض اللي مالوش رد بينتهي لوحده." : "An offer left unanswered expires on its own.",
      href: "/dashboard/offers",
      action: ar ? "رد على العروض" : "Reply",
      urgent: true,
    });
  if (viewingsAwaiting > 0)
    items.push({
      key: "viewings",
      title: ar ? `${n(viewingsAwaiting)} معاينة محتاجة تأكيد منك` : `${n(viewingsAwaiting)} ${viewingsAwaiting === 1 ? "viewing needs" : "viewings need"} you to confirm a time`,
      href: "/dashboard/viewings",
      action: ar ? "أكّد الميعاد" : "Confirm a time",
      urgent: true,
    });
  if (tradesAwaiting > 0)
    items.push({
      key: "trades",
      title: ar ? `${n(tradesAwaiting)} عرض مقايضة مستني ردك` : `${n(tradesAwaiting)} trade ${tradesAwaiting === 1 ? "offer is" : "offers are"} waiting for your reply`,
      href: "/dashboard/trades",
      action: ar ? "رد على المقايضة" : "Reply",
      urgent: true,
    });
  if (session.trustLevel < TRUST.IDENTITY)
    items.push({
      key: "verify",
      title: ar ? "حسابك لسه مش موثّق" : "Your account is not verified yet",
      detail: ar
        ? "بطاقة الرقم القومي وسيلفي. من غيرهم مينفعش تعرض وحدة."
        : "National ID and a selfie. You cannot list a unit without them.",
      href: "/dashboard/verify",
      action: t("step_identity", locale),
      urgent: false,
    });
  if (drafts.length > 0)
    items.push({
      key: "drafts",
      title: ar ? `${n(drafts.length)} إعلان لسه مسودة` : `${n(drafts.length)} ${drafts.length === 1 ? "listing is" : "listings are"} still a draft`,
      detail: ar ? "المسودة مش ظاهرة لحد لحد ما تكمّلها." : "A draft is not visible to anyone until you finish it.",
      href: drafts.length === 1 ? `/dashboard/listings/${drafts[0].id}` : "/dashboard/listings",
      action: ar ? "كمّل الإعلان" : "Finish it",
      urgent: false,
    });
  if (unreadMessages > 0)
    items.push({
      key: "messages",
      title: ar ? `${n(unreadMessages)} رسالة مش مقروءة` : `${n(unreadMessages)} unread ${unreadMessages === 1 ? "message" : "messages"}`,
      href: "/dashboard/messages",
      action: ar ? "اقرا الرسايل" : "Read",
      urgent: false,
    });
  if (unreadNotifications > 0)
    items.push({
      key: "notifications",
      title: ar ? `${n(unreadNotifications)} إشعار جديد` : `${n(unreadNotifications)} new ${unreadNotifications === 1 ? "notification" : "notifications"}`,
      href: "/dashboard/notifications",
      action: ar ? "شوف الإشعارات" : "View",
      urgent: false,
    });
  if (underReview > 0)
    items.push({
      key: "review",
      title: ar ? `${n(underReview)} إعلان تحت المراجعة` : `${n(underReview)} ${underReview === 1 ? "listing is" : "listings are"} under review`,
      detail: ar ? "مش محتاج منك حاجة. هنبلغك أول ما يتنشر أو لو فيه حاجة ناقصة." : "Nothing to do. We tell you when it goes live or if something is missing.",
      href: "/dashboard/listings",
      action: ar ? "إعلاناتي" : "My listings",
      urgent: false,
    });

  const stats = [
    { label: ar ? "إعلانات" : "Listings", value: listingCount, href: "/dashboard/listings" },
    { label: ar ? "مشاهدات إعلاناتك" : "Views on your listings", value: totalViews._sum.views ?? 0, href: null },
    { label: ar ? "طلبات بعتها" : "Requests sent", value: requestCount, href: "/dashboard/requests" },
    { label: ar ? "وحدات محفوظة" : "Saved units", value: savedCount, href: "/dashboard/saved" },
  ];

  const nothingYet = items.length === 0 && listingCount === 0 && requestCount === 0;
  const link = "font-semibold text-brand-500 underline-offset-2 hover:underline";

  return (
    <>
      <h1 className="text-[24px] font-bold text-ink-900">
        {ar ? `أهلاً، ${session.fullName.split(" ")[0]}` : `Welcome, ${session.fullName.split(" ")[0]}`}
      </h1>

      {/* --- What needs attention ---------------------------------------- */}
      <section className="mt-6" aria-labelledby="attention">
        <h2 id="attention" className="border-b border-ink-900 pb-2 text-[17px] font-bold text-ink-900">
          {ar ? "محتاج منك" : "Needs your attention"}
          {items.some((i) => i.urgent) && (
            <span className="tnum ms-2 text-[14px] text-accent-600">{n(items.filter((i) => i.urgent).length)}</span>
          )}
        </h2>

        {nothingYet ? (
          <p className="mt-3 text-[14px] text-ink-700">
            {ar ? "مفيش حاجة هنا لسه. " : "Nothing here yet. "}
            <Link href="/" className={link}>
              {t("hero_cta_browse", locale)}
            </Link>
            {ar ? " أو " : " or "}
            <Link href="/dashboard/listings/new" className={link}>
              {ar ? "اعرض وحدتك" : "list your unit"}
            </Link>
            .
          </p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-700">{ar ? "مفيش حاجة مستنياك دلوقتي." : "Nothing is waiting on you right now."}</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {items.map((i) => (
              <li key={i.key} className={`flex flex-wrap items-center gap-x-4 gap-y-1 py-3 ${i.urgent ? "border-s-2 border-s-accent-500 ps-3" : "ps-3.5"}`}>
                <div className="min-w-0 flex-1">
                  <p className="tnum text-[14px] font-semibold text-ink-900">{i.title}</p>
                  {i.detail && <p className="mt-0.5 text-[13px] text-ink-500">{i.detail}</p>}
                </div>
                <Link href={i.href} className={`inline-flex min-h-[44px] items-center text-[13.5px] ${link}`}>
                  {i.action}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* --- Figures, one row, ruled apart ---------------------------------- */}
      {!nothingYet && (
        <dl className="mt-9 grid grid-cols-2 border-y border-[var(--border)] sm:grid-cols-4">
          {stats.map((s, i) => {
            const body = (
              <>
                <dt className="order-2 mt-1.5 text-[12px] text-ink-500">{s.label}</dt>
                <dd className="tnum order-1 text-[22px] font-bold leading-none text-ink-900">{n(s.value)}</dd>
              </>
            );
            const cls = [
              "flex flex-col px-4 py-4",
              i % 2 === 1 ? "border-s border-[var(--border)]" : "",
              i === 2 ? "border-t border-[var(--border)] sm:border-s sm:border-t-0" : "",
              i === 3 ? "border-t border-[var(--border)] sm:border-t-0" : "",
            ].join(" ");
            return s.href ? (
              <Link key={s.label} href={s.href} className={`${cls} transition hover:bg-ink-50`}>
                {body}
              </Link>
            ) : (
              <div key={s.label} className={cls}>
                {body}
              </div>
            );
          })}
        </dl>
      )}

      {/* --- Owner listings ---------------------------------------------- */}
      {listingCount > 0 && (
        <section className="mt-9">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-ink-900 pb-2">
            <h2 className="text-[17px] font-bold text-ink-900">
              {ar ? "إعلاناتي" : "My listings"}
              {listingCount > listings.length && (
                <span className="tnum ms-2 text-[13px] font-medium text-ink-500">
                  {ar ? `آخر ${n(listings.length)} من ${n(listingCount)}` : `latest ${listings.length} of ${listingCount}`}
                </span>
              )}
            </h2>
            <div className="flex items-baseline gap-4 text-[13px]">
              <Link href="/dashboard/listings" className={link}>
                {ar ? "كل الإعلانات" : "All listings"}
              </Link>
              <Link href="/dashboard/listings/new" className={link}>
                {t("list_unit", locale)}
              </Link>
            </div>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {listings.map((l) => (
              <li key={l.id}>
                <Link
                  href={
                    // The continue page only takes drafts and rejected listings; anything
                    // else redirected straight back to the list.
                    ["draft", "rejected"].includes(l.status)
                      ? `/dashboard/listings/${l.id}`
                      : l.status === "live"
                        ? `/listing/${l.reference}`
                        : "/dashboard/listings"
                  }
                  className="flex items-center gap-3.5 py-3 transition hover:bg-ink-50"
                >
                  <div className="media-frame h-12 w-16 shrink-0 rounded">
                    {l.media[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.media[0].thumbKey ?? l.media[0].fileKey} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ink-900">{(ar ? l.titleAr : l.titleEn) || l.reference}</p>
                    <p className="tnum mt-0.5 text-[12.5px] text-ink-500">
                      {formatPriceExact(l.price, locale, l.currency)} · {l.reference}
                    </p>
                  </div>
                  <span
                    className={`badge ${l.status === "live" ? "badge-verified" : l.status === "rejected" ? "badge-above" : "badge-neutral"}`}
                  >
                    {t(`status_${l.status}`, locale)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- Requests with their live SLA countdown ---------------------- */}
      {requestCount > 0 && (
        <section className="mt-9">
          <div className="flex items-baseline justify-between gap-3 border-b border-ink-900 pb-2">
            <h2 className="text-[17px] font-bold text-ink-900">{t("my_requests", locale)}</h2>
            <Link href="/dashboard/requests" className={`text-[13px] ${link}`}>
              {ar ? "كل الطلبات" : "All requests"}
            </Link>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {requests.map((r) => {
              const sla = slaState(r.slaDueAt, r.firstResponseAt);
              return (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/requests#${r.reference}`}
                    className="flex min-h-[48px] flex-wrap items-center gap-x-4 gap-y-1 py-3 transition hover:bg-ink-50"
                  >
                    <span className="tnum shrink-0 text-[13px] font-semibold text-ink-900">{r.reference}</span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-700">
                      {r.listing ? (ar ? r.listing.titleAr : r.listing.titleEn) : ar ? "طلب مفتوح" : "Open request"}
                    </span>
                    {/* The countdown the brief requires in the buyer UI. */}
                    {!r.firstResponseAt && !["closed", "cancelled"].includes(r.status) && (
                      <span className={`tnum text-[12px] font-semibold ${sla.breached ? "text-danger-700" : "text-ink-500"}`}>
                        {formatCountdown(sla.remainingMs, locale)}
                      </span>
                    )}
                    <span className="badge badge-neutral">{REQUEST_STATUS_LABELS[r.status as RequestStatus]?.[locale] ?? r.status}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
