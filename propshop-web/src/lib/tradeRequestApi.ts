import { parseTradeRequest } from "./tradeRequest";
import { locationOptions, tradeRequestMatches, toSpec } from "./tradeRequestService";

/**
 * Shared by the /api/trade/requests routes: body parsing against the live location
 * taxonomy, and the JSON shape of a request and of its matches.
 */

export async function parseTradeRequestBody(body: unknown) {
  const { areas, compounds } = await locationOptions();
  return parseTradeRequest(body, { areaIds: areas.map((a) => a.id), compoundIds: compounds.map((c) => c.id) });
}

export function listingIdFrom(body: unknown): string | null {
  const v = (body as Record<string, unknown> | null)?.listingId;
  return typeof v === "string" && v ? v : null;
}

type Match = Awaited<ReturnType<typeof tradeRequestMatches>>[number];

export function matchView(m: Match) {
  return {
    id: m.id,
    reference: m.reference,
    titleAr: m.titleAr ?? "",
    titleEn: m.titleEn ?? "",
    price: Number(m.price),
    currency: m.currency,
    paymentType: m.paymentType,
    type: m.unit.type,
    bedrooms: m.unit.bedrooms,
    bathrooms: m.unit.bathrooms,
    sizeSqm: m.unit.sizeSqm,
    area: m.unit.area,
    compound: m.unit.compound,
    photo: m.media[0]?.thumbKey ?? m.media[0]?.fileKey ?? null,
  };
}

type RequestRow = NonNullable<Parameters<typeof toSpec>[0]> & {
  id: string;
  active: boolean;
  listingId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function requestView(r: RequestRow) {
  return { id: r.id, active: r.active, listingId: r.listingId, createdAt: r.createdAt, updatedAt: r.updatedAt, ...toSpec(r) };
}
