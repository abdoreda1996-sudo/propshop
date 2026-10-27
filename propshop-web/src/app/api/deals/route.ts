import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { STAGE_LABELS, DealStage } from "@/lib/deals";
import { LIST_PAGE } from "@/lib/enums";

/**
 * GET /api/deals — the signed-in user's deals, buying and selling.
 *
 * The website's Deals page reads Prisma directly; this exists so the Flutter client sees
 * exactly the same list rather than a second implementation of "which deals are mine".
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const me = auth.user.id;

  const deals = await prisma.deal.findMany({
    where: { OR: [{ buyerId: me }, { sellerId: me }] },
    include: { listing: { select: { reference: true, titleAr: true, titleEn: true, currency: true } } },
    orderBy: { createdAt: "desc" },
    take: LIST_PAGE,
  });

  return ok({
    deals: deals.map((d) => ({
      reference: d.reference,
      listingReference: d.listing.reference,
      title: d.listing.titleAr ?? d.listing.reference,
      titleEn: d.listing.titleEn,
      currency: d.listing.currency,
      agreedPrice: d.agreedPrice,
      stage: d.stage,
      stageLabelAr: STAGE_LABELS[d.stage as DealStage]?.ar ?? d.stage,
      role: d.buyerId === me ? "buyer" : "seller",
      reservedUntil: d.reservedUntil,
      createdAt: d.createdAt,
    })),
  });
}
