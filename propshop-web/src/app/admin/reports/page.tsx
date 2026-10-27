import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { formatDate } from "@/lib/format";
import ReportActions from "@/components/admin/ReportActions";
import { canAccessAdminSection } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { BulkProvider, BulkCheckbox, BulkSelectAll, BulkBar } from "@/components/admin/Bulk";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, oneOf, keepParams, SearchParams } from "@/lib/adminList";
import { canResolveReports } from "@/lib/permissions";

import { AdminTitle, AdminEmpty } from "@/components/admin/AdminUi";
import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "البلاغات", en: "Reports" });
}
export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, { ar: string; en: string }> = {
  contacted_by_broker: { ar: "اتصل بيا سمسار", en: "Contacted by a broker" },
  fake_photos: { ar: "صور مش للوحدة", en: "Photos not of this unit" },
  duplicate: { ar: "إعلان مكرر", en: "Duplicate listing" },
  wrong_price: { ar: "السعر مش حقيقي", en: "Price is not real" },
  unreachable: { ar: "مش بيرد", en: "Unreachable" },
  other: { ar: "سبب آخر", en: "Other" },
};

/**
 * Reports feed the strike system (Section 5), but only after a human upholds them —
 * reporting alone never strikes an owner, or the system becomes a weapon.
 */
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Guarded here as well as in the layout: a layout hides the nav link, it does not
  // stop a direct URL. This page renders the data, so it decides who may see it.
  const guardSession = await getSession();
  if (!guardSession || !canAccessAdminSection(guardSession.role, "reports")) notFound();

  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const { page, skip, take, pageSize } = pageOf(sp);
  // Open reports by default — that is the work. "All" shows history too.
  const statusParam = param(sp, "status");
  const status = statusParam === "all" ? undefined : oneOf(statusParam, ["open", "upheld", "dismissed"] as const) ?? "open";
  const reason = oneOf(param(sp, "reason"), Object.keys(REASON_LABELS));
  const where = { ...(status ? { status } : {}), ...(reason ? { reason } : {}) };
  const total = await prisma.report.count({ where });

  const reports = await prisma.report.findMany({
    where,
    include: {
      reporter: { select: { fullName: true, phone: true } },
      targetUser: { select: { id: true, fullName: true, strikes: true, isBlocked: true } },
      listing: { select: { reference: true, titleAr: true, titleEn: true, status: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    skip,
    take,
  });
  const canResolve = canResolveReports(guardSession.role);
  const openIds = reports.filter((r) => r.status === "open").map((r) => r.id);

  return (
    <>
      <AdminTitle
        title={ar ? "البلاغات" : "Reports"}
        intro={ar
          ? "البلاغ لوحده مابيوقعش إنذار. لازم مراجع بشري يأكده، وتلات إنذارات مؤكدة بتوقف الحساب."
          : "A report alone never issues a strike. A human must uphold it, and three upheld strikes suspend the account."}
      />

      <FilterBar
        basePath="/admin/reports"
        locale={locale}
        values={{ status: statusParam, reason }}
        fields={[
          {
            kind: "select",
            name: "status",
            label: ar ? "الحالة" : "Status",
            options: [
              { value: "open", label: ar ? "مفتوح (افتراضي)" : "Open (default)" },
              { value: "upheld", label: ar ? "مؤكد" : "Upheld" },
              { value: "dismissed", label: ar ? "مرفوض" : "Dismissed" },
              { value: "all", label: ar ? "الكل" : "Everything" },
            ],
          },
          { kind: "select", name: "reason", label: ar ? "السبب" : "Reason", options: Object.entries(REASON_LABELS).map(([k, v]) => ({ value: k, label: v[locale] })) },
        ]}
      />

      {reports.length === 0 ? (
        <AdminEmpty>{ar ? "مافيش بلاغات." : "No reports."}</AdminEmpty>
      ) : (
        <BulkProvider ids={openIds}>
        {canResolve && openIds.length > 0 && (
          <>
            <div className="mt-5"><BulkSelectAll locale={locale} /></div>
            <BulkBar
              entity="report"
              locale={locale}
              actions={[
                { key: "uphold", label: ar ? "أكّد (إنذار)" : "Uphold (strike)", danger: true },
                { key: "dismiss", label: ar ? "ارفض البلاغ" : "Dismiss" },
              ]}
            />
          </>
        )}
        <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {reports.map((r) => (
            <li key={r.id} className={`py-4 ${r.status === "open" ? "" : "opacity-70"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canResolve && r.status === "open" && <BulkCheckbox id={r.id} />}
                    <span className="badge badge-above">{REASON_LABELS[r.reason]?.[locale] ?? r.reason}</span>
                    <span className="badge badge-neutral">
                      {r.status === "open"
                        ? ar
                          ? "مفتوح"
                          : "Open"
                        : r.status === "upheld"
                          ? ar
                            ? "مؤكد"
                            : "Upheld"
                          : ar
                            ? "مرفوض"
                            : "Dismissed"}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] muted">
                    {ar ? "المبلّغ" : "Reporter"}: {r.reporter.fullName} · {formatDate(r.createdAt, locale)}
                  </p>
                  {r.targetUser && (
                    <p className="text-[13px] muted">
                      {ar ? "ضد" : "Against"}: {r.targetUser.fullName} ·{" "}
                      <span className="tnum">
                        {r.targetUser.strikes} {ar ? "إنذار" : "strikes"}
                      </span>
                      {r.targetUser.isBlocked && (
                        <span className="badge badge-above ms-2">{ar ? "موقوف" : "Suspended"}</span>
                      )}
                    </p>
                  )}
                  {r.listing && (
                    <p className="mt-1 text-[13px]">
                      <Link href={`/listing/${r.listing.reference}`} className="font-semibold text-ink-900 underline underline-offset-4">
                        {(ar ? r.listing.titleAr : r.listing.titleEn) || r.listing.reference}
                      </Link>
                    </p>
                  )}
                </div>
              </div>

              {r.detail && <p className="mt-2 border-s-2 border-ink-200 ps-3 text-[13px] text-ink-900">{r.detail}</p>}

              {r.status === "open" && <ReportActions reportId={r.id} locale={locale} />}
            </li>
          ))}
        </ul>
        </BulkProvider>
      )}
      <Pager basePath="/admin/reports" params={keepParams(sp)} page={page} total={total} pageSize={pageSize} locale={locale} />
    </>
  );
}
