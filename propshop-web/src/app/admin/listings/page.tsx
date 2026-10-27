import Link from "next/link";
import { AdminTitle, AdminTabs } from "@/components/admin/AdminUi";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { formatPriceExact, formatDate } from "@/lib/format";
import { LISTING_STATUSES } from "@/lib/enums";
import { canAccessAdminSection, canEditListings, canDecideVerification } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { LocationBadge, LocationIssues } from "@/components/admin/LocationReview";
import { LOCATION_ISSUE_WHERE } from "@/lib/locationService";
import { BulkProvider, BulkCheckbox, BulkSelectAll, BulkBar } from "@/components/admin/Bulk";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, oneOf, keepParams, SearchParams } from "@/lib/adminList";
import { listingsWhere } from "@/lib/adminQueues";
import { UNIT_TYPES, UNIT_TYPE_LABELS } from "@/lib/enums";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "كل الإعلانات", en: "All listings" });
}
export const dynamic = "force-dynamic";

export default async function AdminListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Guarded here as well as in the layout: a layout hides the nav link, it does not
  // stop a direct URL. This page renders the data, so it decides who may see it.
  const guardSession = await getSession();
  if (!guardSession || !canAccessAdminSection(guardSession.role, "listings")) notFound();

  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const status = oneOf(param(sp, "status"), LISTING_STATUSES);
  const onlyIssues = param(sp, "location") === "issues";
  const { page, skip, take, pageSize } = pageOf(sp);
  const q = param(sp, "q");
  const area = param(sp, "area");
  const type = oneOf(param(sp, "type"), UNIT_TYPES);
  const assignee = param(sp, "assignee");
  const tours = oneOf(param(sp, "tours"), ["pending"] as const);
  // The same filter definition the app's staff panel uses (src/lib/adminQueues.ts).
  const where = listingsWhere(sp, guardSession.id);

  const [listings, counts, issueCount, total, areas, reviewers] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        unit: { include: { compound: true, area: true, owner: { select: { fullName: true, strikes: true } } } },
        _count: { select: { tours: { where: { status: "pending" } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.listing.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.listing.count({ where: LOCATION_ISSUE_WHERE }),
    prisma.listing.count({ where }),
    prisma.area.findMany({ select: { slug: true, nameAr: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["admin", "reviewer"] }, isBlocked: false }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } }),
  ]);
  const canAssign = canDecideVerification(guardSession.role);
  const keepTab = { ...(status ? { status } : {}), ...(onlyIssues ? { location: "issues" } : {}) };

  const canEdit = canEditListings(guardSession.role);
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <>
      <AdminTitle title={ar ? "كل الإعلانات" : "All listings"} />

      <AdminTabs
        locale={locale}
        tabs={[
          { href: "/admin/listings", label: ar ? "الكل" : "All", active: !status && !onlyIssues },
          ...LISTING_STATUSES.map((s) => ({ href: `/admin/listings?status=${s}`, label: t(`status_${s}`, locale), count: countFor(s), active: status === s })),
          { href: "/admin/listings?location=issues", label: ar ? "مشاكل الموقع" : "Location issues", count: issueCount, active: onlyIssues, alert: true },
        ]}
      />

      <FilterBar
        basePath="/admin/listings"
        locale={locale}
        keep={keepTab}
        values={{ q, area, type, assignee, tours }}
        fields={[
          { kind: "search", name: "q", placeholder: ar ? "المرجع أو العنوان أو اسم المالك" : "Reference, title or owner name" },
          { kind: "select", name: "area", label: ar ? "المنطقة" : "Area", options: areas.map((a) => ({ value: a.slug, label: ar ? a.nameAr : a.nameEn })) },
          { kind: "select", name: "type", label: ar ? "النوع" : "Type", options: UNIT_TYPES.map((t) => ({ value: t, label: UNIT_TYPE_LABELS[t][locale] })) },
          {
            kind: "select",
            name: "assignee",
            label: ar ? "المراجع" : "Reviewer",
            options: [{ value: "me", label: ar ? "أنا" : "Me" }, { value: "none", label: ar ? "مش مسند" : "Unassigned" }, ...reviewers.map((r) => ({ value: r.id, label: r.fullName }))],
          },
          { kind: "select", name: "tours", label: ar ? "الجولات" : "Tours", options: [{ value: "pending", label: ar ? "محتاجة مراجعة" : "Awaiting review" }] },
        ]}
      />

      <BulkProvider ids={listings.map((l) => l.id)}>
      {(canEdit || canAssign) && (
        <>
          <div className="mt-4"><BulkSelectAll locale={locale} /></div>
          <BulkBar
            entity="listing"
            locale={locale}
            actions={[
              ...(canEdit ? [{ key: "pause", label: ar ? "إيقاف مؤقت" : "Pause" }, { key: "unpause", label: ar ? "رجّعها منشورة" : "Unpause" }] : []),
              ...(canAssign
                ? [
                    { key: "approve_tours", label: ar ? "وافق على الجولات" : "Approve tours" },
                    { key: "reject_tours", label: ar ? "ارفض الجولات" : "Reject tours", needsReason: true, danger: true },
                  ]
                : []),
            ]}
            staff={canAssign ? reviewers : undefined}
            assignLabel={ar ? "أسند لمراجع…" : "Assign to reviewer…"}
          />
        </>
      )}
      <div className="card mt-5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-ink-900 text-[12px] text-ink-500">
                {(canEdit || canAssign) && <th className="w-8 px-3 py-2" aria-label={ar ? "اختيار" : "Select"} />}
                <th className="px-3 py-2 font-semibold text-start">{ar ? "المرجع" : "Ref"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "الوحدة" : "Unit"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "المالك" : "Owner"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "السعر" : "Price"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "الحالة" : "Status"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "الثقة" : "Trust"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "الموقع" : "Location"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "أُنشئ" : "Created"}</th>
                {canEdit && <th className="px-3 py-2 font-semibold text-start" aria-label={ar ? "تعديل" : "Edit"} />}
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.id} className="border-b border-[var(--border)] align-top text-[13px] last:border-0">
                  {(canEdit || canAssign) && (
                    <td className="px-3 py-2.5">
                      <BulkCheckbox id={l.id} label={l.reference} />
                    </td>
                  )}
                  <td className="tnum px-3 py-2.5 font-semibold text-ink-900">
                    <Link href={`/admin/listings/${l.id}`} className="underline underline-offset-4">
                      {l.reference}
                    </Link>
                    {l._count.tours > 0 && (
                      <Link href={`/admin/listings/${l.id}#tours`} className="badge badge-above ms-2 text-[12px]">
                        {ar ? `جولة للمراجعة ${l._count.tours}` : `Tour to review ${l._count.tours}`}
                      </Link>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2.5 text-ink-900">
                    {(ar ? l.titleAr : l.titleEn) || (ar ? l.unit.area.nameAr : l.unit.area.nameEn)}
                  </td>
                  <td className="px-3 py-2.5 muted">
                    {l.unit.owner.fullName}
                    {l.unit.owner.strikes > 0 && (
                      <span className="badge badge-above ms-2">{l.unit.owner.strikes}</span>
                    )}
                  </td>
                  <td className="tnum px-3 py-2.5 font-semibold text-ink-900">
                    {formatPriceExact(l.price, locale, l.currency)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="badge badge-neutral">{t(`status_${l.status}`, locale)}</span>
                  </td>
                  <td className="tnum px-3 py-2.5 muted">{l.trustLevel}</td>
                  <td className="min-w-[200px] px-3 py-2.5">
                    <LocationBadge status={l.locationStatus} locale={locale} />
                    {onlyIssues && (
                      <div className="mt-2">
                        <LocationIssues issuesJson={l.locationIssuesJson} checkedAt={null} locale={locale} />
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 muted">{formatDate(l.createdAt, locale)}</td>
                  {canEdit && (
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/listings/${l.id}/edit`} className="btn btn-ghost px-2.5 py-1 text-[12px]">
                        {ar ? "تعديل" : "Edit"}
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </BulkProvider>
      <Pager basePath="/admin/listings" params={keepParams(sp)} page={page} total={total} pageSize={pageSize} locale={locale} />
    </>
  );
}
