import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser } from "@/lib/api";
import { matchPreference } from "@/lib/trade";
import { eligibleUnitsFor, toPreference } from "@/lib/tradeService";

/**
 * GET /api/trade/units?target=<listingId> — the signed-in user's units that can be offered
 * in a trade (live + verified), each flagged if it fits the target owner's requirements,
 * plus the target's cash term so the client only offers allowed directions.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const target = req.nextUrl.searchParams.get("target");
  if (!target) return fail("target_required", 422);
  const t = await prisma.listing.findUnique({
    where: { id: target },
    select: { price: true, currency: true, openToTrade: true, tradePreference: true, unit: { select: { ownerId: true } } },
  });
  if (!t) return fail("not_found", 404);
  if (t.unit.ownerId === auth.user.id) return fail("own_listing", 422);
  const pref = toPreference(t.tradePreference);
  const units = await eligibleUnitsFor(auth.user.id);
  return ok({
    target: { price: t.price, currency: t.currency, openToTrade: t.openToTrade, cash: pref.cash },
    units: units.map((u) => ({
      id: u.id,
      reference: u.reference,
      titleAr: u.titleAr ?? "",
      titleEn: u.titleEn ?? "",
      price: u.price,
      currency: u.currency,
      photo: u.media[0]?.thumbKey ?? u.media[0]?.fileKey ?? null,
      matches: matchPreference(pref, [
        { type: u.unit.type, areaId: u.unit.areaId, bedrooms: u.unit.bedrooms, sizeSqm: u.unit.sizeSqm, price: u.price },
      ]).matches,
    })),
  });
}
