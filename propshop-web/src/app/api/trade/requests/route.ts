import { NextRequest } from "next/server";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { saveTradeRequest, tradeRequestsFor, tradeRequestMatches } from "@/lib/tradeRequestService";
import { parseTradeRequestBody, listingIdFrom, matchView, requestView } from "@/lib/tradeRequestApi";

/** GET /api/trade/requests — the signed-in user's trade requests ("the unit I want in exchange"). */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const rows = await tradeRequestsFor(auth.user.id);
  return ok({ requests: rows.map(requestView) });
}

/**
 * POST /api/trade/requests — save what the user wants in exchange. Body: the filter
 * fields (types, areaIds, compoundIds, bedrooms, bathrooms, payment, minPrice, maxPrice),
 * an optional description and an optional `listingId` (their unit to give, which is then
 * opened to trade). Answers with every listing open to trade that already fits.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const b = await req.json().catch(() => ({}));
  const parsed = await parseTradeRequestBody(b);
  if (!parsed.ok) return fail("invalid_fields", 422, { errors: parsed.errors });

  const r = await saveTradeRequest(auth.user.id, null, parsed.spec, listingIdFrom(b));
  if (!r.ok) return fail(r.reason, r.reason.endsWith("not_found") ? 404 : 409);
  await audit(auth.user.id, "trade_request_saved", "trade_request", r.id, null, clientIp(req));
  const matches = await tradeRequestMatches(auth.user.id, parsed.spec);
  return ok({ id: r.id, matches: matches.map(matchView) }, { status: 201 });
}
