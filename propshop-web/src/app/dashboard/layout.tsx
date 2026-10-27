import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { awaitingViewingsCount } from "@/lib/viewingQueries";
import { TRUST, TRUST_LABELS } from "@/lib/enums";
import { awaitingWhere } from "@/lib/offers";
import { OPEN_REQUEST_STATUSES } from "@/lib/sla";
import { unreadNotificationCount } from "@/lib/notifications";
import DashboardTabs, { DashboardSideNav } from "@/components/DashboardTabs";

/** Tabs whose count is something waiting on this user; their numbers show in rust. */
const URGENT = ["/dashboard/offers", "/dashboard/viewings", "/dashboard/trades", "/dashboard/notifications"];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect("/login?next=/dashboard");
  const ar = locale === "ar";

  /*
    Navigation (Section 26): five destinations, and the two that carry a live obligation
    are counted. "Needs your reply" is the only number that should ever pull a user in,
    so offers counts only the chains actually waiting on them — a badge that counts
    everything is a badge people learn to ignore.
  */
  // Captured once per request, before any rendering. Reading Date.now() inside the render
  // body is flagged by react-hooks/purity and would be genuinely wrong in a client
  // component; taking it here keeps the count stable for the whole render.
  const requestTime = new Date();

  const [listingCount, savedCount, dealCount, awaitingMe, unreadCount, openRequestCount, viewingsAwaitingMe, tradesAwaitingMe, unreadNotifications] = await Promise.all([
    prisma.listing.count({ where: { unit: { ownerId: session.id } } }),
    prisma.savedListing.count({ where: { userId: session.id } }),
    prisma.deal.count({
      where: { OR: [{ buyerId: session.id }, { sellerId: session.id }], stage: { notIn: ["completed", "cancelled", "closed"] } /* "closed" is the legacy name for completed */ },
    }),
    // A COUNT, not a load-and-filter: this runs on every dashboard page render.
    prisma.offer.count({ where: awaitingWhere(session.id, requestTime) }),
    prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: session.id },
        conversation: { OR: [{ ownerId: session.id }, { buyerId: session.id }] },
      },
    }),
    // Requests still being worked — closed or cancelled ones are history, not a count.
    prisma.request.count({ where: { buyerId: session.id, status: { in: OPEN_REQUEST_STATUSES } } }),
    // Only viewings waiting on THIS user: an owner answers a request, a buyer a proposal.
    awaitingViewingsCount(session.id),
    // Live trade offers waiting on this user's answer (same liveness rule as trade.ts).
    prisma.tradeOffer.count({ where: { recipientId: session.id, status: "pending", expiresAt: { gt: requestTime } } }),
    // Unread in-app notifications (new units that fit a trade request, …).
    unreadNotificationCount(session.id),
  ]);

  const nav = [
    { href: "/dashboard", label: ar ? "نظرة عامة" : "Overview", count: null },
    { href: "/dashboard/notifications", label: ar ? "الإشعارات" : "Notifications", count: unreadNotifications },
    { href: "/dashboard/offers", label: ar ? "العروض" : "Offers", count: awaitingMe },
    { href: "/dashboard/viewings", label: ar ? "المعاينات" : "Viewings", count: viewingsAwaitingMe },
    { href: "/dashboard/trades", label: ar ? "المقايضة" : "Trades", count: tradesAwaitingMe },
    { href: "/dashboard/messages", label: ar ? "الرسايل" : "Messages", count: unreadCount },
    { href: "/dashboard/requests", label: ar ? "طلباتي" : "My requests", count: openRequestCount },
    { href: "/dashboard/deals", label: ar ? "الصفقات" : "Deals", count: dealCount },
    { href: "/dashboard/listings", label: ar ? "إعلاناتي" : "My listings", count: listingCount },
    { href: "/dashboard/saved", label: ar ? "المحفوظة" : "Saved", count: savedCount },
    { href: "/dashboard/settings", label: ar ? "الإعدادات" : "Settings", count: null },
  ];

  return (
    <div className="container-page py-5 lg:py-8">
      {/* Phones: a swipeable tab row, plus the verify prompt that the sidebar carries. */}
      <div className="mb-5 space-y-3 lg:hidden">
        {session.trustLevel < TRUST.IDENTITY && (
          <Link href="/dashboard/verify" className="btn btn-primary w-full text-[14px]">
            {t("step_identity", locale)}
          </Link>
        )}
        <DashboardTabs
          items={nav.map(({ href, label, count }) => ({ href, label, count, urgent: URGENT.includes(href) }))}
          logoutLabel={t("nav_logout", locale)}
        />
      </div>

      <div className="grid gap-10 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <div className="border-b border-[var(--border)] pb-4">
            <div className="text-[15px] font-bold text-ink-900">{session.fullName}</div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-accent-600">{TRUST_LABELS[session.trustLevel]?.[locale]}</div>
            {session.trustLevel < TRUST.IDENTITY && (
              <Link href="/dashboard/verify" className="btn btn-primary mt-3 w-full text-[13px]">
                {t("step_identity", locale)}
              </Link>
            )}
          </div>

          <div className="mt-3">
            <DashboardSideNav
              items={nav.map(({ href, label, count }) => ({ href, label, count, urgent: URGENT.includes(href) }))}
            />
          </div>

          <form action="/api/auth/logout" method="post" className="mt-4 border-t border-[var(--border)] pt-3">
            <button type="submit" className="ps-3.5 text-[13px] font-medium text-ink-500 hover:text-ink-900">
              {t("nav_logout", locale)}
            </button>
          </form>
        </aside>

        {/* min-w-0: a grid item defaults to min-width:auto, so a wide child (a long
            reference, an event line) would stretch the track past the viewport. */}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
