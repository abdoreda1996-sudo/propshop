import { NextRequest } from "next/server";
import { ok, requireUser } from "@/lib/api";
import { matchesForUser } from "@/lib/tradeService";

/** GET /api/trade/matches — trade listings the signed-in user's units fit; perfect two-way swaps first. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const rows = await matchesForUser(auth.user.id);
  return ok({
    matches: rows.map((m) => ({
      perfect: m.perfect,
      listing: {
        id: m.listing.id,
        reference: m.listing.reference,
        titleAr: m.listing.titleAr ?? "",
        titleEn: m.listing.titleEn ?? "",
        price: m.listing.price,
        currency: m.listing.currency,
        photo: m.listing.media[0]?.thumbKey ?? m.listing.media[0]?.fileKey ?? null,
      },
      myUnit: { id: m.myUnit.id, reference: m.myUnit.reference, titleAr: m.myUnit.titleAr ?? "", titleEn: m.myUnit.titleEn ?? "" },
    })),
  });
}
