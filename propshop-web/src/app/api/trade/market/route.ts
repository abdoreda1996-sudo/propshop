import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { UNIT_TYPES } from "@/lib/enums";
import { tradeMarketCards } from "@/lib/tradeService";

/**
 * GET /api/trade/market?type=&area=<slug> — units open to trade, as search cards plus each
 * owner's wants. Public; a signed-in viewer also gets `youHaveAMatch` per card.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = UNIT_TYPES.includes(sp.get("type") as never) ? (sp.get("type") as string) : undefined;
  const slug = sp.get("area");
  const area = slug ? await prisma.area.findUnique({ where: { slug }, select: { id: true } }) : null;
  const viewer = await getSessionFromRequest(req);
  const items = await tradeMarketCards({ type, areaId: area?.id, viewerId: viewer?.id ?? null });
  return ok({ items });
}
