import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { tradeRequestFormData } from "@/lib/tradeRequestService";
import { EMPTY_TRADE_REQUEST } from "@/lib/tradeRequest";
import TradeRequestForm from "@/components/TradeRequestForm";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "طلب مقايضة", en: "Trade request" });
}
export const dynamic = "force-dynamic";

/**
 * Where a lister who wants to trade lands: "the unit I want in exchange", asked with the
 * browse filters. `?listing=<id>` preselects the unit they give; when that unit already
 * has a request, they are sent to edit it rather than starting a duplicate.
 */
export default async function NewTradeRequestPage({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  const [session, locale, sp] = await Promise.all([getSession(), getLocale(), searchParams]);
  if (!session) return null;
  const ar = locale === "ar";

  const data = await tradeRequestFormData(session.id);
  const preselected = data.listings.find((l) => l.id === sp.listing || l.reference === sp.listing)?.id ?? null;
  if (preselected) {
    const existing = await prisma.tradeRequest.findFirst({ where: { userId: session.id, listingId: preselected }, select: { id: true } });
    if (existing) redirect(`/dashboard/trades/request/${existing.id}/edit`);
  }

  return (
    <>
      <Link href="/dashboard/trades" className="text-[13px] muted hover:underline">
        {ar ? "رجوع للمقايضة" : "Back to trades"}
      </Link>
      <h1 className="mt-2 text-[24px] font-bold text-ink-900">{ar ? "طلب مقايضة" : "Trade request"}</h1>
      <p className="mt-1 text-[14px] muted">
        {ar ? "قول عايز تقايض وحدتك بإيه، وإحنا نوريك كل الوحدات المناسبة ونبلغك بالجديد." : "Say what you want for your unit; we show every unit that fits and tell you about new ones."}
      </p>
      <div className="mt-6">
        <TradeRequestForm initial={EMPTY_TRADE_REQUEST} initialListingId={preselected} locale={locale} {...data} />
      </div>
    </>
  );
}
