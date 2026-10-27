import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { canAccessAdminSection, canArrangeBookings, BOOKING_ASSIGNABLE_ROLES } from "@/lib/permissions";
import { BOOKING_TABS, BookingTab, bookingScope, bookingTabWhere } from "@/lib/tourBooking";
import { TOUR_SELECT } from "@/lib/tourService";
import { BulkProvider, BulkCheckbox, BulkSelectAll, BulkBar } from "@/components/admin/Bulk";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, assigneeWhere, keepParams, SearchParams } from "@/lib/adminList";
import AdminBookingCard, { AdminBooking } from "@/components/admin/AdminBookingCard";

import { AdminTitle, AdminTabs, AdminEmpty } from "@/components/admin/AdminUi";
import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "حجوزات الجولات الافتراضية", en: "Tour bookings" });
}
export const dynamic = "force-dynamic";

/**
 * Professional photography + 360° tour shoots owners have booked — arranged here.
 *
 * Admins and advisors see everything and arrange it; a photographer sees only the shoots
 * assigned to them (bookingScope), records them, and delivers the tour from the card.
 */
export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session || !canAccessAdminSection(session.role, "bookings")) notFound();
  const arranger = canArrangeBookings(session.role);

  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const tabs = arranger ? BOOKING_TABS : BOOKING_TABS.filter((t) => t.key !== "new");
  const tab = (tabs.find((t) => t.key === param(sp, "tab"))?.key ?? (arranger ? "new" : "mine")) as BookingTab;
  const now = new Date();
  const { page, skip, take, pageSize } = pageOf(sp);
  const q = param(sp, "q");
  const assignee = arranger ? param(sp, "assignee") : undefined;
  const scope = bookingScope(session.role, session.id);
  const filter = {
    ...assigneeWhere("photographerId", assignee, session.id),
    ...(q ? { OR: [{ reference: { contains: q } }, { listing: { reference: { contains: q } } }] } : {}),
  };
  const where = { AND: [bookingTabWhere(tab, session.id, now), scope, filter] };

  const [counts, rows, total, staff] = await Promise.all([
    Promise.all(tabs.map((t) => prisma.photoBooking.count({ where: { AND: [bookingTabWhere(t.key, session.id, now), scope] } }))),
    prisma.photoBooking.findMany({
      where,
      include: {
        listing: {
          select: {
            id: true,
            reference: true,
            titleAr: true,
            titleEn: true,
            unit: { select: { owner: { select: { fullName: true, phone: true } }, compound: { select: { nameAr: true, nameEn: true } } } },
            tours: { where: { status: { not: "rejected" } }, select: TOUR_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          },
        },
        photographer: { select: { id: true, fullName: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 20, include: { author: { select: { fullName: true } } } },
      },
      orderBy: tab === "closed" ? [{ updatedAt: "desc" }] : [{ scheduledAt: "asc" }, { preferredAt: "asc" }, { createdAt: "asc" }],
      skip,
      take,
    }),
    prisma.photoBooking.count({ where }),
    prisma.user.findMany({
      where: { role: { in: [...BOOKING_ASSIGNABLE_ROLES] }, isBlocked: false },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const bookings: AdminBooking[] = rows.map((b) => ({
    id: b.id,
    reference: b.reference ?? b.id.slice(0, 8),
    listingId: b.listing.id,
    listingRef: b.listing.reference,
    title: (ar ? b.listing.titleAr : b.listing.titleEn) || b.listing.reference,
    compound: (ar ? b.listing.unit.compound?.nameAr : b.listing.unit.compound?.nameEn) ?? null,
    // The owner booked this shoot and expects PropShop to call: the number is the point.
    owner: { name: b.listing.unit.owner.fullName, phone: b.listing.unit.owner.phone },
    status: b.status,
    preferredAt: b.preferredAt?.toISOString() ?? null,
    scheduledAt: b.scheduledAt?.toISOString() ?? null,
    ownerNote: b.ownerNote,
    cancelReason: b.cancelReason,
    fee: b.feeAmount,
    photographerId: b.photographer?.id ?? null,
    photographerName: b.photographer?.fullName ?? null,
    createdAt: b.createdAt.toISOString(),
    notes: b.notes.map((n) => ({ id: n.id, body: n.body, author: n.author.fullName, createdAt: n.createdAt.toISOString() })),
    tours: b.listing.tours,
  }));

  return (
    <>
      <AdminTitle
        title={ar ? "حجوزات الجولات الافتراضية" : "Virtual tour bookings"}
        intro={arranger
          ? ar
            ? "طلبات التصوير الاحترافي والجولة 360° من الملّاك. حدد الميعاد، ابعت مصوّر، تابع لحد ما الجولة تتسلم على الإعلان."
            : "Professional photography and 360° tour shoots owners have booked. Set the time, send a photographer, and follow through until the tour is on the listing."
          : ar
            ? "التصويرات المسندة ليك. بعد التصوير ارفع الجولة من الكارت، هتظهر على الإعلان والحجز هيتقفل."
            : "Shoots assigned to you. After the shoot, add the tour from the card. It goes live on the listing and the booking closes."}
      />

      <AdminTabs
        locale={locale}
        tabs={tabs.map((t, i) => ({ href: `/admin/bookings?tab=${t.key}`, label: ar ? t.ar : t.en, count: counts[i], active: tab === t.key }))}
      />

      <FilterBar
        basePath="/admin/bookings"
        locale={locale}
        keep={{ tab }}
        values={{ q, assignee }}
        fields={[
          { kind: "search", name: "q", placeholder: ar ? "رقم الحجز أو الإعلان" : "Booking or listing reference" },
          ...(arranger
            ? [
                {
                  kind: "select" as const,
                  name: "assignee",
                  label: ar ? "المصوّر" : "Photographer",
                  options: [{ value: "none", label: ar ? "مش مسند" : "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.fullName }))],
                },
              ]
            : []),
        ]}
      />

      {bookings.length === 0 ? (
        <AdminEmpty>{ar ? "مافيش حجوزات هنا." : "No bookings here."}</AdminEmpty>
      ) : (
        <BulkProvider ids={bookings.map((b) => b.id)}>
          {arranger && (
            <>
              <div className="mt-4">
                <BulkSelectAll locale={locale} />
              </div>
              <BulkBar
                entity="booking"
                locale={locale}
                actions={[
                  { key: "mark_shot", label: ar ? "اتصورت" : "Mark shot" },
                  { key: "mark_delivered", label: ar ? "اتسلمت" : "Mark delivered" },
                  { key: "cancel", label: ar ? "إلغاء" : "Cancel", needsReason: true, danger: true },
                ]}
                staff={staff}
                assignLabel={ar ? "ابعت مصوّر…" : "Send photographer…"}
              />
            </>
          )}
          <ul className="mt-4 space-y-4">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-start gap-3">
                {arranger && (
                  <div className="pt-6">
                    <BulkCheckbox id={b.id} label={b.reference} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <AdminBookingCard booking={b} staff={staff} locale={locale} nowIso={now.toISOString()} canArrange={arranger} isMine={b.photographerId === session.id} />
                </div>
              </li>
            ))}
          </ul>
        </BulkProvider>
      )}
      <Pager basePath="/admin/bookings" params={keepParams(sp)} page={page} total={total} pageSize={pageSize} locale={locale} />
    </>
  );
}
