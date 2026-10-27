import { prisma } from "./prisma";
import { nextReference } from "./api";
import { PUBLIC_LISTING_WHERE, LISTING_CARD_INCLUDE, toCardVM } from "./listings";
import { COVER_FIRST } from "./cover";
import { parseJson } from "./json";
import { onListingVisibilityChanged } from "./catalogue";
import { tradeFeeForReceived } from "./fees";
import { cached, CACHE_KEYS, TTL, invalidateTradeMarket } from "./cache";
import { openedByRequestAfter, TradeOpenSource } from "./tradeRequest";
import {
  Preference,
  EMPTY_PREFERENCE,
  TradeCash,
  TRADE_EXPIRY_DAYS,
  matchPreference,
  validateTradeOffer,
  isTradeLive,
  liveTradeWhere,
  canMoveStage,
  canCancelTrade,
  TradeStage,
} from "./trade";

/**
 * Unit trading — persistence. Rules live in trade.ts.
 *
 * Eligibility everywhere is "a listing that is publicly visible": live and verified
 * (PUBLIC_LISTING_WHERE). That is what "verified units only" means, for the unit being
 * traded for AND every unit being offered.
 */

type Fail = { ok: false; reason: string };

export function toPreference(row: {
  typesJson: string;
  areaIdsJson: string;
  minBedrooms: number | null;
  minSizeSqm: number | null;
  minValue: number | null;
  maxValue: number | null;
  cash: string;
  note: string | null;
} | null): Preference {
  if (!row) return EMPTY_PREFERENCE;
  return {
    types: parseJson<string[]>(row.typesJson, []),
    areaIds: parseJson<string[]>(row.areaIdsJson, []),
    minBedrooms: row.minBedrooms,
    minSizeSqm: row.minSizeSqm,
    minValue: row.minValue,
    maxValue: row.maxValue,
    cash: row.cash as TradeCash,
    note: row.note,
  };
}

/**
 * An owner turns trading on/off for one of their listings and sets what they want.
 *
 * `source` records who opened it: "owner" from the listing's own trade settings, or
 * "request" when a trade request offered the unit. Only a request-opened listing is
 * closed again when that request goes away (see openedByRequestAfter).
 */
export async function setTradeSettings(
  ownerId: string,
  listingId: string,
  openToTrade: boolean,
  pref: Preference,
  source: TradeOpenSource = "owner",
) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { unit: { select: { ownerId: true } }, status: true, openToTrade: true, tradePreference: { select: { openedByRequest: true } } },
  });
  if (!listing) return { ok: false, reason: "not_found" } as Fail;
  if (listing.unit.ownerId !== ownerId) return { ok: false, reason: "forbidden" } as Fail;
  if (["sold", "closed", "reserved"].includes(listing.status) && openToTrade) return { ok: false, reason: "listing_closed" } as Fail;

  const openedByRequest = openedByRequestAfter(
    { open: listing.openToTrade, byRequest: listing.tradePreference?.openedByRequest ?? false },
    source,
    openToTrade,
  );
  const data = {
    typesJson: JSON.stringify(pref.types),
    areaIdsJson: JSON.stringify(pref.areaIds),
    minBedrooms: pref.minBedrooms,
    minSizeSqm: pref.minSizeSqm,
    minValue: pref.minValue,
    maxValue: pref.maxValue,
    cash: pref.cash,
    note: pref.note,
    openedByRequest,
  };
  await prisma.$transaction([
    prisma.listing.update({ where: { id: listingId }, data: { openToTrade } }),
    prisma.tradePreference.upsert({ where: { listingId }, create: { listingId, ...data }, update: data }),
  ]);
  invalidateTradeMarket();
  return { ok: true as const };
}

const UNIT_SELECT = {
  id: true,
  reference: true,
  price: true,
  currency: true,
  titleAr: true,
  titleEn: true,
  status: true,
  openToTrade: true,
  unit: {
    select: {
      ownerId: true,
      type: true,
      areaId: true,
      bedrooms: true,
      sizeSqm: true,
      area: { select: { nameAr: true, nameEn: true } },
      compound: { select: { nameAr: true, nameEn: true } },
    },
  },
  media: { orderBy: COVER_FIRST, take: 1, select: { thumbKey: true, fileKey: true } },
} as const;

/** The user's units that can be offered in a trade: their own public (live, verified) listings. */
export async function eligibleUnitsFor(userId: string) {
  return prisma.listing.findMany({
    where: { ...PUBLIC_LISTING_WHERE, status: "live", unit: { ownerId: userId } },
    select: UNIT_SELECT,
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
}

const asCandidate = (l: { price: number; unit: { type: string; areaId: string; bedrooms: number; sizeSqm: number } }) => ({
  type: l.unit.type,
  areaId: l.unit.areaId,
  bedrooms: l.unit.bedrooms,
  sizeSqm: l.unit.sizeSqm,
  price: l.price,
});

/** The public trade marketplace: live, verified listings whose owners opened them to trade. */
export async function tradeListings(opts: { type?: string; areaId?: string; take?: number } = {}) {
  return prisma.listing.findMany({
    where: {
      ...PUBLIC_LISTING_WHERE,
      status: "live",
      openToTrade: true,
      ...(opts.type || opts.areaId ? { unit: { ...(opts.type ? { type: opts.type } : {}), ...(opts.areaId ? { areaId: opts.areaId } : {}) } } : {}),
    },
    select: { ...UNIT_SELECT, tradePreference: true },
    orderBy: { publishedAt: "desc" },
    take: opts.take ?? 60,
  });
}

/**
 * "Your unit fits this owner's requirements" — for every trade listing that is not the
 * user's own, which of the user's units match its preference. A pair is PERFECT when it
 * also works the other way: the user's unit is open to trade and the other unit fits ITS
 * preference — both owners get what they asked for.
 *
 * Scans at most 500 trade listings in memory. Fine at launch volumes; at scale this
 * becomes a precomputed match table refreshed when a preference or listing changes.
 */
export async function matchesForUser(userId: string) {
  const mine = await prisma.listing.findMany({
    where: { ...PUBLIC_LISTING_WHERE, status: "live", unit: { ownerId: userId } },
    select: { ...UNIT_SELECT, tradePreference: true },
    take: 50,
  });
  if (!mine.length) return [];
  // Every open-to-trade listing is the same for every user, so it is read once per TTL and
  // shared; only the matching against THIS user's units is per request. Before this, each
  // visit to the Trades tab re-read up to 500 listings with their preferences.
  const all = await cached(CACHE_KEYS.tradeCandidates(), TTL.trade, () =>
    prisma.listing.findMany({
      where: { ...PUBLIC_LISTING_WHERE, status: "live", openToTrade: true },
      select: { ...UNIT_SELECT, tradePreference: true },
      orderBy: { publishedAt: "desc" },
      take: 500,
    }),
  );
  const others = all.filter((l) => l.unit.ownerId !== userId);

  const out: { listing: (typeof others)[number]; myUnit: (typeof mine)[number]; perfect: boolean }[] = [];
  for (const other of others) {
    const theirPref = toPreference(other.tradePreference);
    for (const my of mine) {
      if (!matchPreference(theirPref, [asCandidate(my)]).matches) continue;
      const perfect = my.openToTrade && matchPreference(toPreference(my.tradePreference), [asCandidate(other)]).matches;
      out.push({ listing: other, myUnit: my, perfect });
    }
  }
  // Perfect swaps first, then newest.
  return out.sort((a, b) => Number(b.perfect) - Number(a.perfect)).slice(0, 60);
}

/** For a listing page: which of the viewer's units fit this listing's trade preference. */
export async function viewerMatchesFor(viewerId: string, listingId: string) {
  const target = await prisma.listing.findUnique({ where: { id: listingId }, select: { tradePreference: true, unit: { select: { ownerId: true } } } });
  if (!target || target.unit.ownerId === viewerId) return [];
  const pref = toPreference(target.tradePreference);
  const mine = await eligibleUnitsFor(viewerId);
  return mine.filter((m) => matchPreference(pref, [asCandidate(m)]).matches).map((m) => m.id);
}

export async function createTradeOffer(proposerId: string, body: unknown): Promise<{ ok: true; id: string; reference: string } | Fail> {
  const targetId = (body as Record<string, unknown> | null)?.targetListingId;
  if (typeof targetId !== "string") return { ok: false, reason: "not_found" };

  const target = await prisma.listing.findFirst({
    where: { id: targetId, ...PUBLIC_LISTING_WHERE, status: "live" },
    select: { id: true, openToTrade: true, tradePreference: true, unit: { select: { ownerId: true } } },
  });
  if (!target) return { ok: false, reason: "not_found" };
  if (!target.openToTrade) return { ok: false, reason: "not_open_to_trade" };
  if (target.unit.ownerId === proposerId) return { ok: false, reason: "own_listing" };

  const v = validateTradeOffer(body, toPreference(target.tradePreference).cash);
  if (!v.ok) return { ok: false, reason: v.error };

  // Every offered unit: the proposer's own, live and verified.
  const units = await prisma.listing.findMany({
    where: { id: { in: v.value.unitListingIds }, ...PUBLIC_LISTING_WHERE, status: "live", unit: { ownerId: proposerId } },
    select: { id: true },
  });
  if (units.length !== v.value.unitListingIds.length) return { ok: false, reason: "unit_not_eligible" };

  const now = new Date();
  const existing = await prisma.tradeOffer.findFirst({
    where: { targetListingId: target.id, proposerId, ...liveTradeWhere(now) },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "already_offered" };

  const reference = await nextReference("TR");
  const created = await prisma.tradeOffer.create({
    data: {
      reference,
      targetListingId: target.id,
      proposerId,
      recipientId: target.unit.ownerId,
      cashAmount: v.value.cashAmount,
      cashPayer: v.value.cashPayer,
      expiresAt: new Date(now.getTime() + TRADE_EXPIRY_DAYS * 86_400_000),
      units: { create: v.value.unitListingIds.map((listingId) => ({ listingId })) },
    },
    select: { id: true, reference: true },
  });
  return { ok: true, ...created };
}

/**
 * accept (recipient) | reject (recipient) | withdraw (proposer).
 *
 * Accepting is one transaction, mirroring acceptOffer for sales: re-read every unit inside
 * it (another accept may have taken one), mark accepted, kill every other live trade
 * offer AND sale offer touching any involved unit, reserve all involved units and take
 * them off the trade market. Names and numbers are released to the two owners from here.
 */
export async function respondTradeOffer(actorId: string, id: string, action: string): Promise<{ ok: true; status: string } | Fail> {
  const offer = await prisma.tradeOffer.findUnique({
    where: { id },
    include: {
      units: { select: { listingId: true, listing: { select: { unit: { select: { type: true } } } } } },
      targetListing: { select: { unit: { select: { type: true } } } },
    },
  });
  if (!offer) return { ok: false, reason: "not_found" };
  const now = new Date();
  if (!isTradeLive(offer, now)) return { ok: false, reason: "not_live" };

  if (action === "withdraw") {
    if (offer.proposerId !== actorId) return { ok: false, reason: "forbidden" };
    await prisma.tradeOffer.update({ where: { id }, data: { status: "withdrawn", respondedAt: now } });
    return { ok: true, status: "withdrawn" };
  }
  if (offer.recipientId !== actorId) return { ok: false, reason: "forbidden" };
  if (action === "reject") {
    await prisma.tradeOffer.update({ where: { id }, data: { status: "rejected", respondedAt: now } });
    return { ok: true, status: "rejected" };
  }
  if (action !== "accept") return { ok: false, reason: "forbidden" };

  const involved = [offer.targetListingId, ...offer.units.map((u) => u.listingId)];
  const done = await prisma.$transaction(async (tx) => {
    const fresh = await tx.listing.findMany({ where: { id: { in: involved } }, select: { status: true } });
    if (fresh.length !== involved.length || fresh.some((l) => l.status !== "live")) return false;

    // Fees fixed now, from the schedule in force at acceptance: each owner pays by the type
    // of unit they RECEIVE — the proposer receives the target, the recipient the offered units.
    await tx.tradeOffer.update({
      where: { id },
      data: {
        status: "accepted",
        respondedAt: now,
        stage: "agreed",
        stageUpdatedAt: now,
        proposerFee: tradeFeeForReceived([offer.targetListing.unit.type]),
        recipientFee: tradeFeeForReceived(offer.units.map((u) => u.listing.unit.type)),
      },
    });
    await tx.tradeOffer.updateMany({
      where: {
        id: { not: id },
        status: "pending",
        OR: [{ targetListingId: { in: involved } }, { units: { some: { listingId: { in: involved } } } }],
      },
      data: { status: "rejected", respondedAt: now },
    });
    await tx.offer.updateMany({ where: { listingId: { in: involved }, status: "pending" }, data: { status: "rejected", respondedAt: now } });
    await tx.listing.updateMany({ where: { id: { in: involved } }, data: { status: "reserved", openToTrade: false } });
    return true;
  });
  if (!done) return { ok: false, reason: "units_unavailable" };
  for (const lid of involved) await onListingVisibilityChanged(lid);
  return { ok: true, status: "accepted" };
}

/**
 * Staff move an accepted trade along, or cancel it. Completing marks every unit sold
 * (closeReason "traded"); cancelling returns them to the market if their listing period
 * has not run out.
 */
export async function arrangeTrade(id: string, action: "stage" | "cancel", input: { stage?: string; reason?: string }) {
  const offer = await prisma.tradeOffer.findUnique({ where: { id }, include: { units: { select: { listingId: true } } } });
  if (!offer) return { ok: false, reason: "not_found" } as Fail;
  const involved = [offer.targetListingId, ...offer.units.map((u) => u.listingId)];
  const now = new Date();

  if (action === "stage") {
    if (offer.status !== "accepted" || !input.stage || !canMoveStage(offer.stage, input.stage)) return { ok: false, reason: "stage_invalid" } as Fail;
    const completing = input.stage === ("completed" satisfies TradeStage);
    await prisma.$transaction([
      prisma.tradeOffer.update({ where: { id }, data: { stage: input.stage, stageUpdatedAt: now } }),
      ...(completing
        ? [prisma.listing.updateMany({ where: { id: { in: involved } }, data: { status: "sold", closedAt: now, closeReason: "traded" } })]
        : []),
    ]);
    if (completing) for (const lid of involved) await onListingVisibilityChanged(lid);
    return { ok: true as const, from: offer.stage, to: input.stage };
  }

  if (!canCancelTrade(offer)) return { ok: false, reason: "cannot_cancel" } as Fail;
  const reason = (input.reason ?? "").trim().slice(0, 500);
  if (!reason) return { ok: false, reason: "reason_required" } as Fail;
  const back = await prisma.listing.findMany({
    where: { id: { in: involved }, status: "reserved", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.tradeOffer.update({ where: { id }, data: { status: "cancelled", stage: null, stageUpdatedAt: now, cancelReason: reason } }),
    prisma.listing.updateMany({ where: { id: { in: back.map((b) => b.id) } }, data: { status: "live" } }),
  ]);
  // No trade-request notification here: accepting the trade closed every involved unit to
  // trade (openToTrade false), so a restored unit is live but not in the trade market.
  for (const lid of involved) await onListingVisibilityChanged(lid);
  return { ok: true as const, restored: back.length };
}


// ---------------------------------------------------------------------------
// Payloads for the mobile app (/api/trade/*). The web renders from the same functions.
// ---------------------------------------------------------------------------

/** A preference with area ids resolved to names, so clients need no second lookup. */
export async function preferenceView(pref: Preference) {
  const areas = pref.areaIds.length
    ? await prisma.area.findMany({ where: { id: { in: pref.areaIds } }, select: { id: true, nameAr: true, nameEn: true } })
    : [];
  return { ...pref, areas };
}

/**
 * The trade market as listing cards (same JSON as search) plus each owner's wants.
 *
 * The rows are public and cached per filter; area names are resolved in ONE query for the
 * whole page (this used to issue one query per card). The per-viewer flags — "this is
 * yours", "you have a unit that fits" — are computed after the cache, never stored in it.
 */
export async function tradeMarketCards(opts: { type?: string; areaId?: string; viewerId?: string | null }) {
  const rows = await cached(CACHE_KEYS.tradeMarket(`${opts.type ?? ""}|${opts.areaId ?? ""}`), TTL.trade, async () => {
    const listings = await prisma.listing.findMany({
      where: {
        ...PUBLIC_LISTING_WHERE,
        status: "live",
        openToTrade: true,
        ...(opts.type || opts.areaId ? { unit: { ...(opts.type ? { type: opts.type } : {}), ...(opts.areaId ? { areaId: opts.areaId } : {}) } } : {}),
      },
      include: { ...LISTING_CARD_INCLUDE, tradePreference: true },
      orderBy: { publishedAt: "desc" },
      take: 60,
    });
    const prefs = listings.map((r) => toPreference(r.tradePreference));
    const areaIds = [...new Set(prefs.flatMap((p) => p.areaIds))];
    const areas = areaIds.length
      ? await prisma.area.findMany({ where: { id: { in: areaIds } }, select: { id: true, nameAr: true, nameEn: true } })
      : [];
    const byId = new Map(areas.map((a) => [a.id, a]));
    return listings.map((r, i) => ({
      card: toCardVM(r),
      wants: { ...prefs[i], areas: prefs[i].areaIds.map((id) => byId.get(id)).filter(Boolean) },
      ownerId: r.unit.ownerId,
    }));
  });

  const mine = opts.viewerId ? await eligibleUnitsFor(opts.viewerId) : [];
  return rows.map(({ ownerId, ...r }) => {
    const isMine = !!opts.viewerId && ownerId === opts.viewerId;
    return {
      ...r,
      isMine,
      youHaveAMatch: !isMine && mine.some((m) => matchPreference(r.wants as Preference, [asCandidate(m)]).matches),
    };
  });
}

/** One trade offer, from `me`'s side. Contacts appear only once the trade is accepted. */
export function tradeOfferView(
  o: Awaited<ReturnType<typeof loadTradeOffersFor>>[number],
  me: string,
  now: Date,
) {
  const role = o.proposerId === me ? "proposer" : "recipient";
  const other = role === "proposer" ? o.recipient : o.proposer;
  const unitView = (l: { id: string; reference: string; titleAr: string | null; titleEn: string | null; price: number; currency: string; media: { thumbKey: string | null; fileKey: string }[] }) => ({
    id: l.id,
    reference: l.reference,
    titleAr: l.titleAr ?? "",
    titleEn: l.titleEn ?? "",
    price: l.price,
    currency: l.currency,
    photo: l.media[0]?.thumbKey ?? l.media[0]?.fileKey ?? null,
  });
  return {
    id: o.id,
    reference: o.reference,
    role,
    status: o.status === "pending" && o.expiresAt.getTime() <= now.getTime() ? "expired" : o.status,
    live: isTradeLive(o, now),
    stage: o.stage,
    cancelReason: o.cancelReason,
    cashAmount: o.cashAmount,
    cashPayer: o.cashPayer,
    expiresAt: o.expiresAt,
    createdAt: o.createdAt,
    target: unitView(o.targetListing),
    units: o.units.map((u) => unitView(u.listing)),
    counterparty: o.status === "accepted" ? { name: other.fullName, phone: other.phone } : null,
    // My own success fee only — per side, never the pair (display rule, fees.ts).
    myFee: role === "proposer" ? o.proposerFee : o.recipientFee,
  };
}

export function loadTradeOffersFor(me: string) {
  const L = { select: { id: true, reference: true, titleAr: true, titleEn: true, price: true, currency: true, media: { orderBy: COVER_FIRST, take: 1, select: { thumbKey: true, fileKey: true } } } } as const;
  return prisma.tradeOffer.findMany({
    where: { OR: [{ proposerId: me }, { recipientId: me }] },
    include: {
      targetListing: L,
      units: { include: { listing: L } },
      proposer: { select: { fullName: true, phone: true } },
      recipient: { select: { fullName: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
}
