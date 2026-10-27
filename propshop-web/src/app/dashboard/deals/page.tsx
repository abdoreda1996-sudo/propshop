import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { formatPriceExact } from "@/lib/format";
import { STAGE_LABELS, DealStage, stageProgress, countdown } from "@/lib/deals";
import { LIST_PAGE } from "@/lib/enums";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "الصفقات", en: "Deals" });
}
export const dynamic = "force-dynamic";

/** Every deal this user is part of, buying or selling. */
const LEGACY_STAGE: Record<string, DealStage> = { deposit_held: "reserved", balance_handover: "transfer", closed: "completed" };

export default async function DealsPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";
  const me = session.id;

  const deals = await prisma.deal.findMany({
    where: { OR: [{ buyerId: me }, { sellerId: me }] },
    include: {
      listing: { select: { reference: true, titleAr: true, titleEn: true, currency: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_PAGE,
  });

  return (
    <>
      <h1 className="text-[24px] font-bold text-ink-900">{ar ? "الصفقات" : "Deals"}</h1>
      <p className="mt-1.5 text-[14px] muted">
        {ar
          ? "كل صفقة بدأت بعرض اتقبل. اضغط عشان تشوف المستندات والخطوة الجاية."
          : "Every deal that began with an accepted offer. Open one for documents and next steps."}
      </p>

      {deals.length === 0 ? (
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-[14px] muted">
          {ar
            ? "مفيش صفقات لسه. أول ما عرض يتقبل، غرفة الصفقة بتظهر هنا بخطواتها ومستنداتها. "
            : "No deals yet. Once an offer is accepted, its deal room appears here with its steps and documents. "}
          <Link href="/dashboard/offers" className="font-semibold text-brand-500 hover:underline">
            {ar ? "شوف العروض" : "View offers"}
          </Link>
        </p>
      ) : (
        <div className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {deals.map((d) => {
            // Seeded/older deals carry the previous stage names; read them as the new ones
            // (same mapping as the deal room) so the label and progress are not blank.
            const stage = (LEGACY_STAGE[d.stage] ?? d.stage) as DealStage;
            const progress = stageProgress(stage);
            const hold = countdown(d.reservedUntil);
            const title = (ar ? d.listing.titleAr : d.listing.titleEn) || d.listing.reference;

            return (
              <Link key={d.id} href={`/deal/${d.reference}`} className="block py-4 transition hover:bg-ink-50">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-ink-900">{title}</div>
                    <div className="mt-1 text-[13px] muted">
                      <span className="tnum">{d.reference}</span>
                      {" · "}
                      {d.buyerId === me ? (ar ? "بتشتري" : "Buying") : ar ? "بتبيع" : "Selling"}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="tnum text-[18px] font-bold text-ink-900">
                      {formatPriceExact(d.agreedPrice, locale, d.listing.currency)}
                    </div>
                    <div className="mt-1 text-[12px] font-semibold text-ink-500">
                      {(ar ? STAGE_LABELS[stage]?.ar : STAGE_LABELS[stage]?.en) ?? stage}
                    </div>
                  </div>
                </div>

                {/* Position, not a percentage — the buyer wants to know which step. */}
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden bg-ink-100">
                    <div
                      className="h-full bg-ok-700"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                  <span className="tnum text-[12px] muted">
                    {progress.done}/{progress.total}
                  </span>
                </div>

                {hold && !hold.expired && (
                  <p className="mt-2 text-[12px] font-semibold text-brand-600">
                    {ar ? "محجوزة، فاضل" : "Held for another"}{" "}
                    <span className="tnum" dir="ltr">
                      {String(hold.hours).padStart(2, "0")}:{String(hold.minutes).padStart(2, "0")}
                    </span>
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
