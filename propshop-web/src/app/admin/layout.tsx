import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessAdminSection, hasAnyAdminAccess, AdminSection } from "@/lib/permissions";
import AdminNav, { AdminNavIcon } from "@/components/admin/AdminNav";
import { roleLabel } from "@/components/admin/labels";
import { bookingTabWhere, bookingScope } from "@/lib/tourBooking";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { OPEN_REQUEST_STATUSES } from "@/lib/sla";
import { LOCATION_ISSUE_WHERE } from "@/lib/locationService";
import { bucketWhere } from "@/lib/viewingArrange";
import { LIVE_OFFER_WHERE } from "@/lib/offerTracking";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect("/login?next=/admin");
  // Section-level, not "is this person staff". A photographer is staff and has no
  // business in any of these screens — see src/lib/permissions.ts.
  if (!hasAnyAdminAccess(session.role)) redirect("/dashboard");
  const ar = locale === "ar";

  const now = new Date();
  const [pendingReview, openRequests, openReports, breached, locationIssues, viewingsToArrange, viewingsUnrecorded, liveOffers, tradesInProgress, tradesPending, bookingsNew, bookingsToDeliver] = await Promise.all([
    prisma.listing.count({ where: { status: "pending_review" } }),
    prisma.request.count({ where: { status: { in: OPEN_REQUEST_STATUSES } } }),
    prisma.report.count({ where: { status: "open" } }),
    prisma.request.count({ where: { firstResponseAt: null, slaDueAt: { lt: new Date() }, status: { in: OPEN_REQUEST_STATUSES } } }),
    prisma.listing.count({ where: LOCATION_ISSUE_WHERE }),
    prisma.viewingRequest.count({ where: bucketWhere("needs_action", now) }),
    prisma.viewingRequest.count({ where: bucketWhere("unrecorded", now) }),
    prisma.offer.count({ where: LIVE_OFFER_WHERE(now) }),
    // Accepted trades still being carried out — the work this tab exists for.
    prisma.tradeOffer.count({ where: { status: "accepted", stage: { not: "completed" } } }),
    prisma.tradeOffer.count({ where: { status: "pending", expiresAt: { gt: now } } }),
    // Tour shoots: new requests to arrange, and shoots past their time with no delivery.
    prisma.photoBooking.count({ where: { AND: [bookingTabWhere("new", session.id, now), bookingScope(session.role, session.id)] } }),
    prisma.photoBooking.count({ where: { AND: [bookingTabWhere("delivery", session.id, now), bookingScope(session.role, session.id)] } }),
  ]);

  // Filtered by role. A reviewer never sees the Users link; an advisor never sees the
  // verification queue. Each page also guards itself — this only keeps the sidebar honest.
  const nav = (
    [
      { section: "overview", href: "/admin", icon: "LayoutDashboard", label: ar ? "نظرة عامة" : "Overview", count: null },
      { section: "verification", href: "/admin/verification", icon: "ShieldCheck", label: ar ? "طابور التوثيق" : "Verification queue", count: pendingReview },
      { section: "requests", href: "/admin/requests", icon: "Inbox", label: ar ? "طابور المستشارين" : "Advisor queue", count: openRequests, alert: breached },
      // Grey = waiting to be arranged; red = happened and nobody recorded the outcome.
      { section: "viewings", href: "/admin/viewings", icon: "CalendarDays", label: ar ? "طلبات المعاينة" : "Viewing requests", count: viewingsToArrange, alert: viewingsUnrecorded },
      { section: "bookings", href: "/admin/bookings", icon: "Camera", label: ar ? "حجوزات الجولات" : "Tour bookings", count: bookingsNew, alert: bookingsToDeliver },
      { section: "offers", href: "/admin/offers", icon: "Handshake", label: ar ? "العروض" : "Offers", count: liveOffers },
      // Red = accepted trades in progress (needs arranging); grey = offers awaiting owners.
      { section: "trades", href: "/admin/trades", icon: "Repeat", label: ar ? "المقايضات" : "Trades", count: tradesPending, alert: tradesInProgress },
      { section: "reports", href: "/admin/reports", icon: "Flag", label: ar ? "البلاغات" : "Reports", count: openReports },
      { section: "listings", href: "/admin/listings", icon: "Building2", label: ar ? "كل الإعلانات" : "All listings", count: null },
      // Red count: listings the automatic location check flagged. Links straight to them.
      { section: "listings", href: "/admin/listings?location=issues", icon: "MapPinOff", label: ar ? "مشاكل الموقع" : "Location issues", count: null, alert: locationIssues },
      { section: "users", href: "/admin/users", icon: "Users", label: ar ? "المستخدمون" : "Users", count: null },
      { section: "site", href: "/admin/hero", icon: "ImageIcon", label: ar ? "غلاف الصفحة الرئيسية" : "Home cover", count: null },
    ] satisfies { section: AdminSection; href: string; icon: AdminNavIcon; label: string; count: number | null; alert?: number }[]
  ).filter((item) => canAccessAdminSection(session.role, item.section));

  return (
    <div className="container-page py-6 lg:py-8">
      <div className="grid gap-5 lg:grid-cols-[220px_1fr] lg:gap-8">
        <aside className="min-w-0 lg:border-e lg:border-[var(--border)] lg:pe-4">
          <div className="mb-3 flex items-baseline gap-2 px-0.5 lg:block lg:px-2.5">
            <div className="text-[14px] font-semibold text-ink-900">{session.fullName}</div>
            <div className="text-[12px] text-ink-500">
              {roleLabel(session.role, locale)} · {ar ? "لوحة التحكم" : "Back office"}
            </div>
          </div>
          <AdminNav items={nav.map(({ href, icon, label, count, alert }) => ({ href, icon, label, count, alert }))} />
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
