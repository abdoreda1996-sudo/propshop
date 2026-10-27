import { prisma } from "./prisma";
import { PUBLIC_LISTING_WHERE } from "./listings";
import { COVER_FIRST } from "./cover";
import { parseJson } from "./json";
import { notify } from "./notifications";
import { setTradeSettings, toPreference } from "./tradeService";
import {
  TradeRequestSpec,
  EMPTY_TRADE_REQUEST,
  matchTradeRequest,
  preferenceFromRequest,
  tradeMatchKey,
  releasedListingId,
  shouldCloseReleasedListing,
} from "./tradeRequest";
import { invalidateTradeMarket } from "./cache";
import { UNIT_TYPE_LABELS, UnitType } from "./enums";
import { baseFacets, BEDROOM_OPTIONS, BATHROOM_OPTIONS } from "./facets";

/**
 * Trade requests — persistence, matching against the market, and match notifications.
 * Rules live in tradeRequest.ts.
 *
 * Candidates follow the trade market's semantics (tradeService): publicly visible (live,
 * verified) listings whose owner opened them to trade, never the requester's own.
 */

type Fail = { ok: false; reason: string };

type SpecRow = {
  typesJson: string;
  areaIdsJson: string;
  compoundIdsJson: string;
  bedroomsJson: string;
  bathroomsJson: string;
  paymentJson: string;
  minPrice: number | null | { toString(): string };
  maxPrice: number | null | { toString(): string };
  description: string | null;
};

export function toSpec(row: SpecRow | null): TradeRequestSpec {
  if (!row) return EMPTY_TRADE_REQUEST;
  return {
    types: parseJson<string[]>(row.typesJson, []),
    areaIds: parseJson<string[]>(row.areaIdsJson, []),
    compoundIds: parseJson<string[]>(row.compoundIdsJson, []),
    bedrooms: parseJson<string[]>(row.bedroomsJson, []),
    bathrooms: parseJson<string[]>(row.bathroomsJson, []),
    payment: parseJson<string[]>(row.paymentJson, []),
    minPrice: row.minPrice === null ? null : Number(row.minPrice),
    maxPrice: row.maxPrice === null ? null : Number(row.maxPrice),
    description: row.description,
  };
}

const specData = (s: TradeRequestSpec) => ({
  typesJson: JSON.stringify(s.types),
  areaIdsJson: JSON.stringify(s.areaIds),
  compoundIdsJson: JSON.stringify(s.compoundIds),
  bedroomsJson: JSON.stringify(s.bedrooms),
  bathroomsJson: JSON.stringify(s.bathrooms),
  paymentJson: JSON.stringify(s.payment),
  minPrice: s.minPrice,
  maxPrice: s.maxPrice,
  description: s.description,
});

/** Areas and compounds for the location picker (and for validating ids on save). */
export async function locationOptions() {
  const [areas, compounds] = await Promise.all([
    prisma.area.findMany({ select: { id: true, nameAr: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    prisma.compound.findMany({ select: { id: true, nameAr: true, nameEn: true, areaId: true }, orderBy: { nameEn: "asc" } }),
  ]);
  return { areas, compounds };
}

/** The requester's listings they could put up in exchange: anything not already gone. */
export function offerableListings(userId: string) {
  return prisma.listing.findMany({
    where: { unit: { ownerId: userId }, status: { notIn: ["sold", "closed", "reserved"] } },
    select: { id: true, reference: true, titleAr: true, titleEn: true, status: true, openToTrade: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Creates (id null) or updates one of the user's trade requests.
 *
 * When the request names the listing the user gives in exchange, that listing is opened
 * to trade and its TradePreference is set from the request, so the trade market shows the
 * same wants — the request IS how a lister opens a unit to trade. Owners already looking
 * for what that listing is are then notified, exactly as if it had just gone live.
 * Switching the request to another unit (or dropping its unit) releases the previous one.
 */
export async function saveTradeRequest(
  userId: string,
  id: string | null,
  spec: TradeRequestSpec,
  listingId: string | null,
): Promise<{ ok: true; id: string } | Fail> {
  let previousListingId: string | null = null;
  if (id) {
    const own = await prisma.tradeRequest.findFirst({ where: { id, userId }, select: { id: true, listingId: true } });
    if (!own) return { ok: false, reason: "not_found" };
    previousListingId = own.listingId;
  }
  if (listingId) {
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, unit: { ownerId: userId } },
      select: { status: true, tradePreference: true },
    });
    if (!listing) return { ok: false, reason: "listing_not_found" };
    const compoundAreas = spec.compoundIds.length
      ? (await prisma.compound.findMany({ where: { id: { in: spec.compoundIds } }, select: { areaId: true } })).map((c) => c.areaId)
      : [];
    const r = await setTradeSettings(
      userId,
      listingId,
      true,
      preferenceFromRequest(spec, compoundAreas, toPreference(listing.tradePreference)),
      "request",
    );
    if (!r.ok) return r;
  }

  const data = { ...specData(spec), listingId };
  const saved = id
    ? await prisma.tradeRequest.update({ where: { id }, data: { ...data, active: true }, select: { id: true } })
    : await prisma.tradeRequest.create({ data: { userId, ...data }, select: { id: true } });

  const released = releasedListingId(previousListingId, listingId);
  if (released) await releaseOfferedListing(userId, released);
  if (listingId) await notifyTradeRequestMatches(listingId).catch(() => 0);
  return { ok: true, id: saved.id };
}

/**
 * A request stopped offering `listingId` (deleted, or switched to another unit): close the
 * listing to trade again if the request flow is what opened it and no other active request
 * of this user still offers it. A listing the owner opened from its own trade settings is
 * never touched. Call AFTER the request row changed, so it is not counted.
 */
export async function releaseOfferedListing(userId: string, listingId: string): Promise<boolean> {
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, unit: { ownerId: userId } },
    select: { openToTrade: true, tradePreference: { select: { openedByRequest: true } } },
  });
  if (!listing) return false;
  const others = await prisma.tradeRequest.count({ where: { userId, listingId, active: true } });
  if (!shouldCloseReleasedListing({ openToTrade: listing.openToTrade, openedByRequest: listing.tradePreference?.openedByRequest ?? false }, others)) {
    return false;
  }
  await prisma.$transaction([
    prisma.listing.update({ where: { id: listingId }, data: { openToTrade: false } }),
    prisma.tradePreference.update({ where: { listingId }, data: { openedByRequest: false } }),
  ]);
  invalidateTradeMarket();
  return true;
}

export function loadTradeRequest(userId: string, id: string) {
  return prisma.tradeRequest.findFirst({
    where: { id, userId },
    include: { listing: { select: { id: true, reference: true, titleAr: true, titleEn: true } } },
  });
}

export function tradeRequestsFor(userId: string) {
  return prisma.tradeRequest.findMany({
    where: { userId },
    include: { listing: { select: { id: true, reference: true, titleAr: true, titleEn: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  }).catch(() => []); // TradeRequest table not migrated yet: the trades page still renders.
}

const CANDIDATE_SELECT = {
  id: true,
  reference: true,
  price: true,
  currency: true,
  titleAr: true,
  titleEn: true,
  paymentType: true,
  unit: {
    select: {
      ownerId: true,
      type: true,
      areaId: true,
      compoundId: true,
      bedrooms: true,
      bathrooms: true,
      sizeSqm: true,
      area: { select: { nameAr: true, nameEn: true } },
      compound: { select: { nameAr: true, nameEn: true } },
    },
  },
  media: { orderBy: COVER_FIRST, take: 1, select: { thumbKey: true, fileKey: true } },
} as const;

const asCandidate = (l: { price: number | { toString(): string }; paymentType: string; unit: { type: string; areaId: string; compoundId: string | null; bedrooms: number; bathrooms: number } }) => ({
  type: l.unit.type,
  areaId: l.unit.areaId,
  compoundId: l.unit.compoundId,
  bedrooms: l.unit.bedrooms,
  bathrooms: l.unit.bathrooms,
  paymentType: l.paymentType,
  price: l.price,
});

/**
 * Every live, verified listing open to trade that fits the request, newest first.
 *
 * Scans at most 500 trade listings in memory, like matchesForUser: the matcher stays the
 * single definition of "fits" for both this list and the notifications. At scale this
 * becomes a SQL predicate built from the same spec.
 */
export async function tradeRequestMatches(userId: string, spec: TradeRequestSpec, take = 60) {
  const rows = await prisma.listing.findMany({
    where: { ...PUBLIC_LISTING_WHERE, status: "live", openToTrade: true, unit: { ownerId: { not: userId } } },
    select: CANDIDATE_SELECT,
    orderBy: { publishedAt: "desc" },
    take: 500,
  });
  return rows.filter((l) => matchTradeRequest(spec, asCandidate(l)).matches).slice(0, take);
}

/**
 * A listing just became findable in the trade market (approved while open to trade, or
 * opened to trade while live): notify every OTHER user whose active request it fits.
 * Deduped per (request, listing), so re-approvals and re-saves never notify twice.
 * Never throws into the caller — a publish must not fail because a notification did.
 */
export async function notifyTradeRequestMatches(listingId: string): Promise<number> {
  try {
    const listing = await prisma.listing.findFirst({
      where: { id: listingId, ...PUBLIC_LISTING_WHERE, status: "live", openToTrade: true },
      select: CANDIDATE_SELECT,
    });
    if (!listing) return 0;
    const requests = await prisma.tradeRequest.findMany({
      where: { active: true, userId: { not: listing.unit.ownerId } },
      select: {
        id: true,
        userId: true,
        typesJson: true,
        areaIdsJson: true,
        compoundIdsJson: true,
        bedroomsJson: true,
        bathroomsJson: true,
        paymentJson: true,
        minPrice: true,
        maxPrice: true,
        description: true,
      },
    });
    const c = asCandidate(listing);
    const type = UNIT_TYPE_LABELS[listing.unit.type as UnitType];
    const placeAr = listing.unit.compound?.nameAr ?? listing.unit.area.nameAr;
    const placeEn = listing.unit.compound?.nameEn ?? listing.unit.area.nameEn;
    let sent = 0;
    // One notification per user per listing, even when two of their requests fit it.
    const notified = new Set<string>();
    for (const r of requests) {
      if (notified.has(r.userId) || !matchTradeRequest(toSpec(r), c).matches) continue;
      notified.add(r.userId);
      const created = await notify({
        userId: r.userId,
        kind: "trade_match",
        titleAr: "وحدة جديدة للمقايضة بتناسب طلبك",
        titleEn: "A new unit open to trade fits your request",
        bodyAr: `${type?.ar ?? listing.unit.type} · ${listing.unit.bedrooms} غرف · ${placeAr} · ${listing.reference}`,
        bodyEn: `${type?.en ?? listing.unit.type} · ${listing.unit.bedrooms} bed · ${placeEn} · ${listing.reference}`,
        href: `/listing/${listing.reference}`,
        dedupeKey: tradeMatchKey(listing.id),
      });
      if (created) sent++;
    }
    return sent;
  } catch {
    return 0;
  }
}

/** Everything the trade request form needs besides the request itself. */
export async function tradeRequestFormData(userId: string) {
  const [{ areas, compounds }, listings] = await Promise.all([locationOptions(), offerableListings(userId)]);
  const payment = baseFacets().find((f) => f.key === "payment")?.options ?? [];
  return { areas, compounds, listings, bedroomOptions: BEDROOM_OPTIONS, bathroomOptions: BATHROOM_OPTIONS, paymentOptions: payment };
}
