import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, RequestStatus, LIST_PAGE } from "@/lib/enums";
import { slaState, formatCountdown } from "@/lib/sla";
import { formatDate, formatPriceExact } from "@/lib/format";
import { parseJson } from "@/lib/json";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "طلباتي", en: "My requests" });
}
export const dynamic = "force-dynamic";

/** The buyer's view of their requests, with the visible SLA countdown (Section 6c). */
export default async function MyRequestsPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";

  const requests = await prisma.request.findMany({
    where: { buyerId: session.id },
    include: {
      listing: { select: { reference: true, titleAr: true, titleEn: true, price: true, currency: true } },
      assignedAdvisor: { select: { fullName: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_PAGE,
  });

  if (requests.length === 0) {
    return (
      <>
        <h1 className="text-[24px] font-bold text-ink-900">{t("my_requests", locale)}</h1>
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-[14px] muted">
          {ar ? "لسه مابعتش أي طلب. " : "You have not sent a request yet. "}
          <Link href="/" className="font-semibold text-brand-500 hover:underline">
            {t("hero_cta_browse", locale)}
          </Link>
          {ar ? " أو " : " or "}
          <Link href="/request" className="font-semibold text-brand-500 hover:underline">
            {ar ? "قولنا انت عايز إيه" : "tell us what you are looking for"}
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      {/* "New request" lives here as well as in the header: below sm the header button is
          hidden for space, and this is where a phone user looks for it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold text-ink-900">{t("my_requests", locale)}</h1>
        <Link href="/request" className="btn btn-primary text-[13px]">
          {ar ? "اطلب وحدة" : "Request a unit"}
        </Link>
      </div>

      <ul className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {requests.map((r) => {
          const sla = slaState(r.slaDueAt, r.firstResponseAt);
          const profile = parseJson<{ budgetMax?: number; note?: string }>(r.profileJson, {});
          const stageIndex = REQUEST_STATUSES.indexOf(r.status as RequestStatus);

          return (
            <li key={r.id} id={r.reference} className="scroll-mt-20 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tnum text-[15px] font-bold text-ink-900">{r.reference}</span>
                    <span className="badge badge-neutral">
                      {r.type === "unit" ? (ar ? "طلب وحدة" : "Unit request") : ar ? "طلب مفتوح" : "Open request"}
                    </span>
                  </div>
                  <p className="mt-2 text-[14px] font-semibold text-ink-900">
                    {r.listing ? (
                      <Link href={`/listing/${r.listing.reference}`} className="underline underline-offset-4">
                        {(ar ? r.listing.titleAr : r.listing.titleEn) || r.listing.reference}
                      </Link>
                    ) : profile.budgetMax ? (
                      `${ar ? "ميزانية حتى" : "Budget up to"} ${formatPriceExact(profile.budgetMax, locale)}`
                    ) : (
                      ar ? "طلب مفتوح" : "Open brief"
                    )}
                  </p>
                  <p className="mt-1 text-[12px] muted">
                    {ar ? "اتبعت" : "Sent"} {formatDate(r.createdAt, locale)}
                    {r.assignedAdvisor && ` · ${ar ? "المستشار" : "Advisor"}: ${r.assignedAdvisor.fullName}`}
                  </p>
                </div>

                {/* The promise, made visible. */}
                {r.firstResponseAt ? (
                  <span className="badge badge-verified">
                    {ar ? "تم الرد" : "Responded"} {formatDate(r.firstResponseAt, locale)}
                  </span>
                ) : r.status === "cancelled" || r.status === "closed" ? null : (
                  <div className="text-end">
                    <span className={`badge ${sla.breached ? "badge-above" : sla.urgent ? "badge-neutral" : "badge-verified"}`}>
                      {formatCountdown(sla.remainingMs, locale)}
                    </span>
                    <p className="mt-1 text-[12px] muted">{ar ? "وعد الرد خلال 24 ساعة" : "24-hour response promise"}</p>
                  </div>
                )}
              </div>

              {r.slaBreachedAt && !r.firstResponseAt && (
                <p className="mt-4 border-s-2 border-danger-600 bg-danger-50 px-3 py-2 text-[13px] leading-relaxed text-danger-700">
                  {ar
                    ? "اعتذار منّنا: تأخرنا عن وعد الـ24 ساعة. تم تصعيد طلبك لمدير الفريق وهيتم التواصل معاك في أقرب وقت."
                    : "Our apology: we missed the 24-hour promise. Your request has been escalated to a team manager and you will be contacted shortly."}
                </p>
              )}

              {/* Status trail the buyer can see (Section 6c). */}
              <ol className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
                {REQUEST_STATUSES.filter((s) => s !== "cancelled").map((s, i) => {
                  const reached = stageIndex >= i && r.status !== "cancelled";
                  const current = reached && stageIndex === i;
                  return (
                    <li key={s} className="flex items-center gap-1.5">
                      {i > 0 && <span aria-hidden className="text-ink-200">/</span>}
                      <span
                        aria-current={current ? "step" : undefined}
                        className={current ? "font-bold text-ink-900" : reached ? "font-medium text-ok-700" : "text-ink-500"}
                      >
                        {REQUEST_STATUS_LABELS[s][locale]}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {r.events.length > 0 && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-[13px] font-semibold muted">
                    {ar ? "سجل الطلب" : "Request history"}
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {r.events.map((e) => (
                      <li key={e.id} className="flex gap-3 text-[12px] muted">
                        <span className="tnum shrink-0">{formatDate(e.createdAt, locale)}</span>
                        <span>
                          {eventLabel(e.event, locale)}
                          {/* Only an advisor's contact note is written for the buyer; the
                              other notes are internal or English-only. */}
                          {e.event === "contacted" && e.note ? `: ${e.note}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The request history was printing raw event codes ("created", "status:offer"). */
function eventLabel(event: string, locale: "ar" | "en"): string {
  const ar = locale === "ar";
  if (event.startsWith("status:")) {
    const status = event.slice("status:".length) as RequestStatus;
    const label = REQUEST_STATUS_LABELS[status]?.[locale] ?? status;
    return ar ? `الحالة: ${label}` : `Status: ${label}`;
  }
  const map: Record<string, { ar: string; en: string }> = {
    created: { ar: "الطلب اتبعت", en: "Request sent" },
    assigned: { ar: "اتعيّن مستشار", en: "Advisor assigned" },
    contacted: { ar: "المستشار تواصل معاك", en: "Advisor contacted you" },
    sla_breached: { ar: "عدّى وقت الرد واتصعّد الطلب", en: "Response time missed, escalated" },
  };
  return map[event]?.[locale] ?? event;
}
