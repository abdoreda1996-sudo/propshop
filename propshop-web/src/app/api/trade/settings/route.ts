import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { MIN_PUBLIC_TRUST } from "@/lib/enums";
import { toPreference } from "@/lib/tradeService";

/**
 * GET /api/trade/settings — the signed-in owner's listings with their trade switch and
 * requirements, plus every area (for the requirements picker). Save with
 * PUT /api/listings/[id]/trade.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const [listings, areas] = await Promise.all([
    prisma.listing.findMany({
      where: { unit: { ownerId: auth.user.id }, status: { notIn: ["sold", "closed"] } },
      select: { id: true, reference: true, titleAr: true, titleEn: true, status: true, trustLevel: true, openToTrade: true, tradePreference: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.area.findMany({ select: { id: true, nameAr: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
  ]);
  return ok({
    listings: listings.map((l) => ({
      id: l.id,
      reference: l.reference,
      titleAr: l.titleAr ?? "",
      titleEn: l.titleEn ?? "",
      status: l.status,
      // Opening to trade only takes effect for a live, verified listing.
      visible: l.status === "live" && l.trustLevel >= MIN_PUBLIC_TRUST,
      openToTrade: l.openToTrade,
      preference: toPreference(l.tradePreference),
    })),
    areas,
  });
}
