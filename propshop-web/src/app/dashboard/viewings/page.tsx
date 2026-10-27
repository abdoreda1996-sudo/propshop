import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { viewingsOfUserWhere } from "@/lib/viewingQueries";
import { LIST_PAGE } from "@/lib/enums";
import { parseJson } from "@/lib/json";
import ViewingCard, { Viewing } from "@/components/ViewingCard";
import { Locale } from "@/lib/i18n";

import { localMeta } from "@/lib/seo";
function Section({ title, items, locale }: { title: string; items: Viewing[]; locale: Locale }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">
        {title} <span className="tnum font-medium muted">{items.length}</span>
      </h2>
      <div className="divide-y divide-[var(--border)]">
        {items.map((v) => (
          <ViewingCard key={v.id} viewing={v} locale={locale} />
        ))}
      </div>
    </section>
  );
}

export async function generateMetadata() {
  return localMeta({ ar: "المعاينات", en: "Viewings" });
}
export const dynamic = "force-dynamic";

/**
 * The user's viewings, buying and selling, in one place.
 *
 * Moved out of the Offers page into its own tab (owner, 2026-10-01). Split by whose move it
 * is, like offers: what needs this user's answer first, then what is booked, then history.
 */
export default async function ViewingsPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";
  const me = session.id;

  const rows = await prisma.viewingRequest.findMany({
    where: await viewingsOfUserWhere(me),
    include: { listing: { select: { reference: true, titleAr: true, titleEn: true } } },
    orderBy: { createdAt: "desc" },
    take: LIST_PAGE,
  });

  const viewings: (Viewing & { awaitingMe: boolean })[] = rows.map((v) => {
    const role = v.buyerId === me ? "buyer" : "seller";
    return {
      id: v.id,
      reference: v.listing.reference,
      title: (ar ? v.listing.titleAr : v.listing.titleEn) || v.listing.reference,
      role,
      status: v.status,
      slots: parseJson<string[]>(v.slotsJson, []),
      proposedAt: v.proposedAt?.toISOString() ?? null,
      scheduledAt: v.scheduledAt?.toISOString() ?? null,
      // The owner answers a request; the buyer answers a proposal.
      awaitingMe: (role === "seller" && v.status === "requested") || (role === "buyer" && v.status === "proposed"),
    };
  });

  const closed = ["declined", "cancelled", "completed"];
  const needsMe = viewings.filter((v) => v.awaitingMe);
  const booked = viewings.filter((v) => !v.awaitingMe && !closed.includes(v.status));
  const history = viewings.filter((v) => closed.includes(v.status));

  return (
    <>
      <h1 className="text-[24px] font-bold text-ink-900">{ar ? "المعاينات" : "Viewings"}</h1>
      <p className="mt-1.5 text-[14px] muted">
        {ar
          ? "كل معاينة أنت طرف فيها، سواء بتشتري أو بتبيع. الأسماء والأرقام بتظهر بس بعد تأكيد الميعاد."
          : "Every viewing you are part of, buying or selling. Names and numbers appear only once a time is confirmed."}
      </p>

      {viewings.length === 0 ? (
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-[14px] muted">
          {ar ? "مفيش معاينات لسه. بتطلب معاينة من صفحة الوحدة. " : "No viewings yet. You request one from a unit's page. "}
          <Link href="/" className="font-semibold text-brand-500 hover:underline">
            {ar ? "تصفح الوحدات" : "Browse units"}
          </Link>
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          <Section title={ar ? "محتاجة ردك" : "Needs your reply"} items={needsMe} locale={locale} />
          <Section title={ar ? "متأكدة أو مستنية" : "Booked or pending"} items={booked} locale={locale} />
          <Section title={ar ? "اللي فاتت" : "Past"} items={history} locale={locale} />
        </div>
      )}
    </>
  );
}
