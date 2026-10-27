import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { parseJson } from "@/lib/json";

import { canAccessAdminSection, VIEWING_ASSIGNABLE_ROLES } from "@/lib/permissions";
import { bucketWhere, ViewingBucket } from "@/lib/viewingArrange";
import { maskPhone } from "@/lib/antiBroker";
import { BulkProvider, BulkCheckbox, BulkSelectAll, BulkBar } from "@/components/admin/Bulk";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, assigneeWhere, keepParams, SearchParams } from "@/lib/adminList";

import AdminViewingCard, { AdminViewing } from "@/components/admin/AdminViewingCard";

import { AdminTitle, AdminTabs, AdminEmpty } from "@/components/admin/AdminUi";
import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "طلبات المعاينة", en: "Viewing requests" });
}
export const dynamic = "force-dynamic";

const TABS: { key: ViewingBucket | "mine"; ar: string; en: string }[] = [
  { key: "needs_action", ar: "محتاجة ترتيب", en: "Needs arranging" },
  { key: "upcoming", ar: "القادمة", en: "Upcoming" },
  { key: "unrecorded", ar: "عدّت ومش متسجلة", en: "Passed, not recorded" },
  { key: "mine", ar: "المسندة ليّا", en: "Assigned to me" },
  { key: "closed", ar: "المقفولة", en: "Closed" },
];

/**
 * Viewing requests across the whole platform — tracked and arranged by staff.
 *
 * Buckets come from viewingArrange.bucketWhere, the same function the counts use, so a
 * tab can never claim 3 and show 2. "Passed, not recorded" is the one that matters most
 * day to day: a confirmed viewing whose time has gone by with nobody saying what happened.
 */
export default async function AdminViewingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session || !canAccessAdminSection(session.role, "viewings")) notFound();

  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const tab = (TABS.find((t) => t.key === param(sp, "tab"))?.key ?? "needs_action") as ViewingBucket | "mine";
  const now = new Date();
  const { page, skip, take, pageSize } = pageOf(sp);
  const q = param(sp, "q");
  const assignee = param(sp, "assignee");
  // Filters narrow WITHIN the tab; the tab counts stay unfiltered so they still read as the queue sizes.
  const filter = {
    ...assigneeWhere("assignedStaffId", assignee, session.id),
    ...(q ? { listing: { reference: { contains: q } } } : {}),
  };

  const whereFor = (k: ViewingBucket | "mine") =>
    k === "mine" ? { assignedStaffId: session.id, status: { notIn: ["declined", "cancelled", "completed"] } } : bucketWhere(k, now);

  const [counts, rows, staff, total] = await Promise.all([
    Promise.all(TABS.map((t) => prisma.viewingRequest.count({ where: whereFor(t.key) }))),
    prisma.viewingRequest.findMany({
      where: { AND: [whereFor(tab), filter] },
      include: {
        listing: {
          select: {
            id: true,
            reference: true,
            titleAr: true,
            titleEn: true,
            unit: { select: { owner: { select: { fullName: true, phone: true } }, compound: { select: { nameAr: true, nameEn: true } } } },
          },
        },
        buyer: { select: { fullName: true, phone: true, publicRef: true } },
        assignedStaff: { select: { id: true, fullName: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 20, include: { author: { select: { fullName: true } } } },
      },
      // Soonest first for anything with a time; oldest request first for the rest, so
      // nothing waits at the bottom of the pile.
      orderBy: tab === "closed" ? [{ createdAt: "desc" }] : [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      skip,
      take,
    }),
    prisma.user.findMany({
      where: { role: { in: [...VIEWING_ASSIGNABLE_ROLES] }, isBlocked: false },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.viewingRequest.count({ where: { AND: [whereFor(tab), filter] } }),
  ]);

  // Same rule as the advisor queue: numbers stay masked until someone takes the work.
  // Here "taking it" is being the assigned staff member — assigning yourself reveals them.
  const viewings: AdminViewing[] = rows.map((v) => {
    const mine = v.assignedStaffId === session.id;
    const phone = (p: string) => (mine ? p : maskPhone(p));
    return {
    id: v.id,
    listingId: v.listing.id,
    reference: v.listing.reference,
    title: (ar ? v.listing.titleAr : v.listing.titleEn) || v.listing.reference,
    compound: (ar ? v.listing.unit.compound?.nameAr : v.listing.unit.compound?.nameEn) ?? null,
    buyer: { name: v.buyer.fullName, phone: phone(v.buyer.phone), ref: v.buyer.publicRef },
    owner: { name: v.listing.unit.owner.fullName, phone: phone(v.listing.unit.owner.phone) },
    phonesVisible: mine,
    status: v.status,
    slots: parseJson<string[]>(v.slotsJson, []),
    proposedAt: v.proposedAt?.toISOString() ?? null,
    scheduledAt: v.scheduledAt?.toISOString() ?? null,
    contactUnlocked: !!v.contactUnlockedAt,
    outcome: v.outcome,
    buyerNote: v.note,
    assignedStaffId: v.assignedStaff?.id ?? null,
    createdAt: v.createdAt.toISOString(),
    notes: v.notes.map((n) => ({ id: n.id, body: n.body, author: n.author.fullName, createdAt: n.createdAt.toISOString() })),
    };
  });

  return (
    <>
      <AdminTitle
        title={ar ? "طلبات المعاينة" : "Viewing requests"}
        intro={ar
          ? "كل طلبات المعاينة على المنصة. أكّد أو غيّر الميعاد، أسند لحد من الفريق، سجّل اللي حصل، وسيب ملاحظات داخلية."
          : "Every viewing request on the platform. Confirm or move the time, assign someone, record what happened, and keep internal notes."}
      />

      <AdminTabs
        locale={locale}
        tabs={TABS.map((t, i) => ({ href: `/admin/viewings?tab=${t.key}`, label: ar ? t.ar : t.en, count: counts[i], active: tab === t.key }))}
      />

      <FilterBar
        basePath="/admin/viewings"
        locale={locale}
        keep={{ tab }}
        values={{ q, assignee }}
        fields={[
          { kind: "search", name: "q", placeholder: ar ? "رقم الإعلان" : "Listing reference" },
          {
            kind: "select",
            name: "assignee",
            label: ar ? "مسندة لـ" : "Assigned to",
            options: [{ value: "me", label: ar ? "أنا" : "Me" }, { value: "none", label: ar ? "مش مسندة" : "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.fullName }))],
          },
        ]}
      />

      {viewings.length === 0 ? (
        <AdminEmpty>{ar ? "مافيش معاينات هنا." : "No viewings here."}</AdminEmpty>
      ) : (
        <BulkProvider ids={viewings.map((v) => v.id)}>
          <div className="mt-5"><BulkSelectAll locale={locale} /></div>
          <BulkBar entity="viewing" locale={locale} actions={[{ key: "complete_attended", label: ar ? "حضر" : "Attended" }, { key: "complete_no_show", label: ar ? "محضرش" : "No-show" }, { key: "cancel", label: ar ? "إلغاء" : "Cancel", danger: true }]} staff={staff} assignLabel={ar ? "أسند لـ…" : "Assign to…"} />
          <ul className="mt-4 space-y-4">
            {viewings.map((v) => (
              <li key={v.id} className="flex items-start gap-3">
                <div className="pt-6"><BulkCheckbox id={v.id} label={v.reference} /></div>
                <div className="min-w-0 flex-1">
                  <AdminViewingCard viewing={v} staff={staff} locale={locale} nowIso={now.toISOString()} />
                </div>
              </li>
            ))}
          </ul>
        </BulkProvider>
      )}
      <Pager basePath="/admin/viewings" params={keepParams(sp)} page={page} total={total} pageSize={pageSize} locale={locale} />
    </>
  );
}
