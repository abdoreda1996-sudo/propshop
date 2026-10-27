import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { parsePreference } from "@/lib/trade";
import { setTradeSettings } from "@/lib/tradeService";
import { notifyTradeRequestMatches } from "@/lib/tradeRequestService";

/**
 * PUT /api/listings/[id]/trade — the owner opens/closes a listing to trade and sets what
 * they want in return. Body: `{ openToTrade: boolean, preference: {...} }`.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));

  const areas = await prisma.area.findMany({ select: { id: true } });
  const parsed = parsePreference(b.preference ?? {}, areas.map((a) => a.id));
  if (!parsed.ok) return fail("invalid_fields", 422, { errors: parsed.errors });

  const r = await setTradeSettings(auth.user.id, id, b.openToTrade === true, parsed.pref);
  if (!r.ok) return fail(r.reason, r.reason === "not_found" ? 404 : r.reason === "forbidden" ? 403 : 409);
  // Opening a live listing to trade puts it in the market: tell owners whose trade request
  // it fits (deduped, so re-saving the settings never notifies twice).
  if (b.openToTrade === true) await notifyTradeRequestMatches(id);
  await audit(auth.user.id, "listing_trade_settings", "listing", id, { openToTrade: b.openToTrade === true }, clientIp(req));
  return ok({ openToTrade: b.openToTrade === true });
}
