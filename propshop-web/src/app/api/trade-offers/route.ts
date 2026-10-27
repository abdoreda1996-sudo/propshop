import { NextRequest } from "next/server";
import { ok, fail, requireUser, rateLimit, audit, clientIp } from "@/lib/api";
import { createTradeOffer, loadTradeOffersFor, tradeOfferView } from "@/lib/tradeService";

/**
 * GET — the signed-in user's trade offers, both directions, with units, cash, stage, and
 * the other owner's contact once accepted (tradeOfferView). POST — make a trade offer.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const now = new Date();
  const rows = await loadTradeOffersFor(auth.user.id);
  return ok({ offers: rows.map((o) => tradeOfferView(o, auth.user.id, now)) });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await rateLimit(`trade:${auth.user.id}`, 20, 60 * 60_000))) return fail("rate_limited", 429);
  const r = await createTradeOffer(auth.user.id, await req.json().catch(() => ({})));
  if (!r.ok) return fail(r.reason, r.reason === "not_found" ? 404 : 422);
  await audit(auth.user.id, "trade.create", "trade", r.id, null, clientIp(req));
  return ok({ id: r.id, reference: r.reference }, { status: 201 });
}
