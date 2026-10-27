import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { loadTradeRequest, toSpec, tradeRequestFormData } from "@/lib/tradeRequestService";
import TradeRequestForm from "@/components/TradeRequestForm";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "تعديل طلب المقايضة", en: "Edit trade request" });
}
export const dynamic = "force-dynamic";

export default async function EditTradeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, locale, { id }] = await Promise.all([getSession(), getLocale(), params]);
  if (!session) return null;
  const ar = locale === "ar";
  const request = await loadTradeRequest(session.id, id);
  if (!request) notFound();
  const data = await tradeRequestFormData(session.id);

  return (
    <>
      <Link href={`/dashboard/trades/request/${id}`} className="text-[13px] muted hover:underline">
        {ar ? "رجوع لطلب المقايضة" : "Back to the trade request"}
      </Link>
      <h1 className="mt-2 text-[24px] font-bold text-ink-900">{ar ? "تعديل طلب المقايضة" : "Edit trade request"}</h1>
      <div className="mt-6">
        <TradeRequestForm requestId={id} initial={toSpec(request)} initialListingId={request.listingId} locale={locale} {...data} />
      </div>
    </>
  );
}
