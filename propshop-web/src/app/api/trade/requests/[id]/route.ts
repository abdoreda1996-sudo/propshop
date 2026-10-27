import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { saveTradeRequest, loadTradeRequest, tradeRequestMatches, toSpec, releaseOfferedListing } from "@/lib/tradeRequestService";
import { parseTradeRequestBody, listingIdFrom, matchView, requestView } from "@/lib/tradeRequestApi";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/trade/requests/[id] — one of the user's requests with the listings that fit it. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const r = await loadTradeRequest(auth.user.id, id);
  if (!r) return fail("not_found", 404);
  const matches = await tradeRequestMatches(auth.user.id, toSpec(r));
  return ok({ request: requestView(r), matches: matches.map(matchView) });
}

/** PUT /api/trade/requests/[id] — replace the request's criteria (same body as POST). */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const parsed = await parseTradeRequestBody(b);
  if (!parsed.ok) return fail("invalid_fields", 422, { errors: parsed.errors });

  const r = await saveTradeRequest(auth.user.id, id, parsed.spec, listingIdFrom(b));
  if (!r.ok) return fail(r.reason, r.reason.endsWith("not_found") ? 404 : 409);
  await audit(auth.user.id, "trade_request_saved", "trade_request", id, null, clientIp(req));
  const matches = await tradeRequestMatches(auth.user.id, parsed.spec);
  return ok({ id, matches: matches.map(matchView) });
}

/** PATCH /api/trade/requests/[id] — `{ active: boolean }`: pause or resume match notifications. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  if (typeof b.active !== "boolean") return fail("invalid_fields", 422);
  const r = await prisma.tradeRequest.updateMany({ where: { id, userId: auth.user.id }, data: { active: b.active } });
  if (!r.count) return fail("not_found", 404);
  return ok({ id, active: b.active });
}

/**
 * DELETE /api/trade/requests/[id] — the listing it named is closed to trade again if this
 * request is what opened it and no other active request of the user still offers it; a
 * listing the owner opened from its own trade settings stays open.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const own = await prisma.tradeRequest.findFirst({ where: { id, userId: auth.user.id }, select: { listingId: true } });
  if (!own) return fail("not_found", 404);
  const r = await prisma.tradeRequest.deleteMany({ where: { id, userId: auth.user.id } });
  if (!r.count) return fail("not_found", 404);
  if (own.listingId) await releaseOfferedListing(auth.user.id, own.listingId);
  await audit(auth.user.id, "trade_request_deleted", "trade_request", id, null, clientIp(req));
  return ok({ deleted: true });
}
