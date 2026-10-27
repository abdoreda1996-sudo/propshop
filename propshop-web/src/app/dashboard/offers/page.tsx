import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { chainStatus, liveStep } from "@/lib/offerService";
import { effectiveStatus } from "@/lib/offers";
import { publicIdentity, PUBLIC_IDENTITY_SELECT } from "@/lib/identity";
import { MIN_PUBLIC_TRUST, LIST_PAGE } from "@/lib/enums";
import OfferChainCard, { Chain } from "@/components/OfferChainCard";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "العروض", en: "Offers" });
}
export const dynamic = "force-dynamic";

/**
 * Every negotiation this user is in, on both sides of the table.
 *
 * Buying and selling are not separate apps (Section 26): a user who owns one unit and is
 * shopping for another sees both here, split only by whose move it is.
 */
export default async function OffersPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";
  const me = session.id;

  const rows = await prisma.offer.findMany({
    where: { OR: [{ buyerId: me }, { sellerId: me }] },
    include: {
      listing: {
        select: {
          id: true,
          reference: true,
          titleAr: true,
          titleEn: true,
          price: true,
          currency: true,
          status: true,
          trustLevel: true,
        },
      },
      // Only ever the pseudonymous projection — never a name or a phone number.
      buyer: { select: PUBLIC_IDENTITY_SELECT },
      seller: { select: PUBLIC_IDENTITY_SELECT },
    },
    orderBy: { createdAt: "asc" },
    // Capped: chains are grouped in memory below, and an unbounded read here was the
    // heaviest per-user query in the product.
    take: LIST_PAGE * 4,
  });

  const now = new Date();
  const byPair = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.listingId}:${r.buyerId}`;
    byPair.set(key, [...(byPair.get(key) ?? []), r]);
  }

  const chains: Chain[] = [...byPair.values()].map((chain) => {
    const last = chain[chain.length - 1];
    const live = liveStep(chain, now);
    const role = last.buyerId === me ? "buyer" : "seller";

    return {
      listing: {
        id: last.listing.id,
        reference: last.listing.reference,
        titleAr: last.listing.titleAr,
        titleEn: last.listing.titleEn,
        price: last.listing.price,
        currency: last.listing.currency,
        status: last.listing.status,
      },
      role,
      status: chainStatus(chain, now),
      awaiting: live ? (live.direction === "buyer" ? "seller" : "buyer") : null,
      latestAmount: last.amount,
      counterparty:
        role === "buyer"
          ? publicIdentity(last.seller, "seller", {
              ownershipVerified: last.listing.trustLevel >= MIN_PUBLIC_TRUST,
            })
          : publicIdentity(last.buyer, "buyer"),
      steps: chain.map((o) => ({
        id: o.id,
        direction: o.direction === "seller" ? "seller" : "buyer",
        amount: o.amount,
        message: o.message,
        status: effectiveStatus(o, now),
        expiresAt: o.expiresAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  });

  // Anything waiting on this user comes first — that is the only sort that matters.
  const mine = chains.filter((c) => c.awaiting === c.role);
  const waiting = chains.filter((c) => c.awaiting && c.awaiting !== c.role);
  const settled = chains.filter((c) => !c.awaiting);

  return (
    <>
      <h1 className="text-[24px] font-bold text-ink-900">
        {ar ? "العروض" : "Offers"}
      </h1>
      <p className="mt-1.5 text-[14px] muted">
        {ar
          ? "كل تفاوض أنت طرف فيه، سواء بتشتري أو بتبيع. المعاينات ليها تبويب لوحدها."
          : "Every negotiation you are part of, buying or selling. Viewings have their own tab."}
      </p>

      {chains.length === 0 ? (
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-[14px] muted">
          {ar
            ? "مفيش عروض لسه. لما تلاقي وحدة عاجباك، قدّم عرضك من صفحتها على طول، من غير سمسار. "
            : "No offers yet. When you find a unit you like, make an offer from its page, no broker involved. "}
          <Link href="/" className="font-semibold text-brand-500 hover:underline">
            {ar ? "تصفح الوحدات" : "Browse units"}
          </Link>
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {mine.length > 0 && (
            <section>
              <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">
                {ar ? "محتاج ردك" : "Needs your reply"}
                <span className="tnum ms-2 text-[13px] text-accent-600">
                  {mine.length}
                </span>
              </h2>
              <div className="mt-3 space-y-3">
                {mine.map((c) => (
                  <OfferChainCard key={`${c.listing.id}-${c.steps[0].id}`} chain={c} locale={locale} />
                ))}
              </div>
            </section>
          )}

          {waiting.length > 0 && (
            <section>
              <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">
                {ar ? "مستني رد الطرف التاني" : "Waiting on the other side"}
              </h2>
              <div className="mt-3 space-y-3">
                {waiting.map((c) => (
                  <OfferChainCard key={`${c.listing.id}-${c.steps[0].id}`} chain={c} locale={locale} />
                ))}
              </div>
            </section>
          )}

          {settled.length > 0 && (
            <section>
              <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">{ar ? "منتهية" : "Closed"}</h2>
              <div className="mt-3 space-y-3">
                {settled.map((c) => (
                  <OfferChainCard key={`${c.listing.id}-${c.steps[0].id}`} chain={c} locale={locale} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
