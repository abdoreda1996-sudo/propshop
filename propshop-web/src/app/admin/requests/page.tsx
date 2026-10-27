import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { advisorQueue, advisorQueueWhere } from "@/lib/requests";
import { prisma } from "@/lib/prisma";
import { slaState, formatCountdown } from "@/lib/sla";
import { parseJson } from "@/lib/json";
import { formatPriceExact, formatDate } from "@/lib/format";
import {
  REQUEST_STATUS_LABELS,
  RequestStatus,
  PAYMENT_TYPE_LABELS,
  PURPOSE_LABELS,
  TIMELINE_LABELS,
} from "@/lib/enums";
import { maskPhone } from "@/lib/antiBroker";
import RequestActions from "@/components/admin/RequestActions";
import { canAccessAdminSection } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { BulkProvider, BulkCheckbox, BulkSelectAll, BulkBar } from "@/components/admin/Bulk";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, assigneeWhere, oneOf, keepParams, SearchParams } from "@/lib/adminList";
import { OPEN_REQUEST_STATUSES } from "@/lib/sla";

import { AdminEmpty } from "@/components/admin/AdminUi";
import { AdminTitle, AdminTabs, AdminNotice } from "@/components/admin/AdminUi";
import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "طابور المستشارين", en: "Advisor queue" });
}
export const dynamic = "force-dynamic";

/**
 * The advisor queue, sorted by sla_due_at (Section 6c). Breached requests surface first
 * with an escalation flag. The buyer's phone is masked until the advisor takes the
 * request — the no-cold-call rule applies to our own staff too.
 */
export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Guarded here as well as in the layout: a layout hides the nav link, it does not
  // stop a direct URL. This page renders the data, so it decides who may see it.
  const guardSession = await getSession();
  if (!guardSession || !canAccessAdminSection(guardSession.role, "requests")) notFound();

  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const { page, skip, take, pageSize } = pageOf(sp);
  // "Mine" stays as a shortcut; it is the assignee filter set to me.
  const assignee = param(sp, "mine") === "1" ? "me" : param(sp, "assignee");
  const mineOnly = assignee === "me";
  const status = oneOf(param(sp, "status"), OPEN_REQUEST_STATUSES);
  const kind = oneOf(param(sp, "kind"), ["unit", "open"] as const);
  const sla = oneOf(param(sp, "sla"), ["breached"] as const);
  const q = param(sp, "q");
  const now = new Date();
  const extra = {
    ...assigneeWhere("assignedAdvisorId", assignee, guardSession.id),
    ...(status ? { status } : {}),
    ...(kind ? { type: kind } : {}),
    ...(sla ? { firstResponseAt: null, slaDueAt: { lt: now } } : {}),
    ...(q ? { reference: { contains: q } } : {}),
  };
  const [requests, total, advisors, breachedCount] = await Promise.all([
    advisorQueue({ where: extra, skip, take }),
    prisma.request.count({ where: advisorQueueWhere(extra) }),
    prisma.user.findMany({ where: { role: { in: ["admin", "advisor"] }, isBlocked: false }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } }),
    prisma.request.count({ where: advisorQueueWhere({ firstResponseAt: null, slaDueAt: { lt: now } }) }),
  ]);
  const breached = { length: breachedCount };

  return (
    <>
      <AdminTitle
        title={ar ? "طابور المستشارين" : "Advisor queue"}
        intro={
          ar
            ? "مرتب حسب آخر معاد للرد (24 ساعة). كل طلب لازم حد من الفريق يرد عليه بنفسه."
            : "Sorted by the 24-hour reply deadline. Every request needs a reply from a person."
        }
      />
      <AdminTabs
        locale={locale}
        tabs={[
          { href: "/admin/requests", label: ar ? "الكل" : "All", active: !mineOnly },
          { href: "/admin/requests?mine=1", label: ar ? "طلباتي" : "Mine", active: mineOnly },
        ]}
      />

      {breached.length > 0 && (
        <AdminNotice tone="danger">
          <strong className="font-semibold">
            {ar
              ? `${breached.length} طلب عدّى الـ24 ساعة من غير رد. `
              : `${breached.length} request${breached.length > 1 ? "s" : ""} past 24 hours without a reply. `}
          </strong>
          {ar
            ? "اتصعّدوا للمدير واتبعت للمشتري اعتذار تلقائي. كلّمهم دلوقتي."
            : "They were escalated to a manager and the buyer got an automatic apology. Call them now."}
        </AdminNotice>
      )}

      <FilterBar
        basePath="/admin/requests"
        locale={locale}
        values={{ q, status, kind, sla, assignee: param(sp, "mine") === "1" ? "me" : param(sp, "assignee") }}
        fields={[
          { kind: "search", name: "q", placeholder: ar ? "رقم الطلب" : "Request reference" },
          { kind: "select", name: "status", label: ar ? "الحالة" : "Status", options: OPEN_REQUEST_STATUSES.map((st) => ({ value: st, label: REQUEST_STATUS_LABELS[st as RequestStatus]?.[locale] ?? st })) },
          { kind: "select", name: "kind", label: ar ? "النوع" : "Type", options: [{ value: "unit", label: ar ? "طلب وحدة" : "Unit request" }, { value: "open", label: ar ? "طلب مفتوح" : "Open request" }] },
          { kind: "select", name: "sla", label: ar ? "الـ24 ساعة" : "24-hour SLA", options: [{ value: "breached", label: ar ? "اتخطت" : "Breached" }] },
          {
            kind: "select",
            name: "assignee",
            label: ar ? "المستشار" : "Advisor",
            options: [{ value: "me", label: ar ? "أنا" : "Me" }, { value: "none", label: ar ? "مش مسند" : "Unassigned" }, ...advisors.map((a) => ({ value: a.id, label: a.fullName }))],
          },
        ]}
      />

      {requests.length === 0 ? (
        <AdminEmpty>{ar ? "الطابور فاضي." : "The queue is empty."}</AdminEmpty>
      ) : (
        <BulkProvider ids={requests.map((r) => r.id)}>
        <div className="mt-5"><BulkSelectAll locale={locale} /></div>
        <BulkBar entity="request" locale={locale} actions={[{ key: "respond", label: ar ? "سجّل أول رد" : "Log first response" }]} staff={advisors} assignLabel={ar ? "أسند لمستشار…" : "Assign to advisor…"} />
        <ul className="mt-4 space-y-4">
          {requests.map((r) => {
            const sla = slaState(r.slaDueAt, r.firstResponseAt);
            const profile = parseJson<{
              budgetMin?: number;
              budgetMax?: number;
              purpose?: string;
              bedrooms?: number;
              paymentType?: string;
              downPayment?: number;
              monthlyInstallment?: number;
              timeline?: string;
              preferredSlots?: string[];
              note?: string;
            }>(r.profileJson, {});
            const isDiaspora = r.buyer.countryOfResidence !== "EG";

            return (
              <li key={r.id} className={`card p-4 sm:p-5 ${sla.breached && !r.firstResponseAt ? "border-danger-100" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BulkCheckbox id={r.id} label={r.reference} />
                      <span className="tnum text-[15px] font-bold text-ink-900">{r.reference}</span>
                      <span className="badge badge-neutral">
                        {r.type === "unit" ? (ar ? "طلب وحدة" : "Unit request") : ar ? "طلب مفتوح" : "Open request"}
                      </span>
                      <span className="badge badge-owner">
                        {REQUEST_STATUS_LABELS[r.status as RequestStatus]?.[locale] ?? r.status}
                      </span>
                      {isDiaspora && (
                        <span className="badge badge-verified">
                          {ar ? "مقيم في " : "Lives in "}
                          {r.buyer.countryOfResidence}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-[14px] font-semibold text-ink-900">{r.buyer.fullName}</p>
                    <p className="tnum text-[13px] muted" dir="ltr">
                      {/* Masked until the advisor takes the request. */}
                      {r.firstResponseAt ? r.buyer.phone : maskPhone(r.buyer.phone)}
                      {r.buyer.preferredChannel === "whatsapp" && (
                        <span className="ms-2 badge badge-neutral">
                          {ar ? "واتساب" : "WhatsApp"}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Countdown */}
                  <div className="text-end">
                    {r.firstResponseAt ? (
                      <span className="badge badge-verified">
                        {ar ? "اتردّ عليه" : "Replied"} {formatDate(r.firstResponseAt, locale)}
                      </span>
                    ) : (
                      <span className={`badge ${sla.breached ? "badge-above" : sla.urgent ? "badge-neutral" : "badge-verified"}`}>
                        {formatCountdown(sla.remainingMs, locale)}
                      </span>
                    )}
                    <p className="mt-1.5 text-[12px] muted">
                      {ar ? "المستشار" : "Advisor"}: {r.assignedAdvisor?.fullName ?? (ar ? "غير معيّن" : "unassigned")}
                    </p>
                  </div>
                </div>

                {/* What the buyer asked for */}
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 text-[13px] sm:grid-cols-4">
                  {r.listing && (
                    <div className="col-span-2">
                      <dt className="muted">{ar ? "الوحدة" : "Unit"}</dt>
                      <dd className="mt-0.5 font-semibold text-ink-900">
                        <Link href={`/listing/${r.listing.reference}`} className="underline underline-offset-4">
                          {(ar ? r.listing.titleAr : r.listing.titleEn) || r.listing.reference}
                        </Link>
                        <span className="tnum ms-2 muted">
                          {formatPriceExact(r.listing.price, locale, r.listing.currency)}
                        </span>
                      </dd>
                    </div>
                  )}
                  {profile.budgetMax ? (
                    <div>
                      <dt className="muted">{ar ? "الميزانية لحد" : "Budget up to"}</dt>
                      <dd className="tnum mt-0.5 font-semibold text-ink-900">
                        {formatPriceExact(profile.budgetMax, locale)}
                      </dd>
                    </div>
                  ) : null}
                  {profile.paymentType && (
                    <div>
                      <dt className="muted">{ar ? "الدفع" : "Payment"}</dt>
                      <dd className="mt-0.5 font-semibold text-ink-900">
                        {PAYMENT_TYPE_LABELS[profile.paymentType]?.[locale] ?? profile.paymentType}
                      </dd>
                    </div>
                  )}
                  {profile.downPayment ? (
                    <div>
                      <dt className="muted">{ar ? "المقدّم" : "Down payment"}</dt>
                      <dd className="tnum mt-0.5 font-semibold text-ink-900">{formatPriceExact(profile.downPayment, locale)}</dd>
                    </div>
                  ) : null}
                  {profile.monthlyInstallment ? (
                    <div>
                      <dt className="muted">{ar ? "القسط الشهري" : "Monthly installment"}</dt>
                      <dd className="tnum mt-0.5 font-semibold text-ink-900">{formatPriceExact(profile.monthlyInstallment, locale)}</dd>
                    </div>
                  ) : null}
                  {profile.purpose && (
                    <div>
                      <dt className="muted">{ar ? "الغرض" : "Purpose"}</dt>
                      <dd className="mt-0.5 font-semibold text-ink-900">
                        {PURPOSE_LABELS[profile.purpose]?.[locale] ?? profile.purpose}
                      </dd>
                    </div>
                  )}
                  {profile.timeline && (
                    <div>
                      <dt className="muted">{ar ? "التوقيت" : "Timeline"}</dt>
                      <dd className="mt-0.5 font-semibold text-ink-900">
                        {TIMELINE_LABELS[profile.timeline]?.[locale] ?? profile.timeline}
                      </dd>
                    </div>
                  )}
                </dl>

                {profile.note && (
                  <p className="mt-3 border-s-2 border-ink-200 ps-3 text-[13px] text-ink-900">{profile.note}</p>
                )}

                <RequestActions
                  requestId={r.id}
                  locale={locale}
                  status={r.status}
                  hasResponded={!!r.firstResponseAt}
                />
              </li>
            );
          })}
        </ul>
        </BulkProvider>
      )}

      <Pager basePath="/admin/requests" params={keepParams(sp)} page={page} total={total} pageSize={pageSize} locale={locale} />
    </>
  );
}
