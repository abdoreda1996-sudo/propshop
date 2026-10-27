/**
 * Search and listing read model. Used by the SSR pages and by /api/listings, so the
 * Flutter app and the web site can never drift apart.
 *
 * The public visibility rule lives here and nowhere else: status "live" AND
 * trustLevel >= 2. Nothing at draft or pending_review is ever returned (Section 6c).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { PUBLIC_TOUR_SELECT } from "./tours";
import { MIN_PUBLIC_TRUST, SEARCHABLE_STATUSES, VIEWABLE_STATUSES } from "./enums";
import { isSegment, segmentUnitWhere } from "./segments";
import { COVER_FIRST } from "./cover";
import { PUBLIC_IDENTITY_SELECT } from "./identity";
import { recordView } from "./viewCounter";
import { developerGapPct, verdictFor, FairPriceResult, PriceVerdict } from "./fairPrice";
import { getDeveloperPrice } from "./fairPriceService";
import { cached, CACHE_KEYS, TTL } from "./cache";

/**
 * The two clauses that enforce "no unverified listing is ever visible to buyers".
 *
 * They differ only in status, and the distinction matters:
 *   PUBLIC_LISTING_WHERE   — what can be FOUND: search, home, counters, market data.
 *                            Only "live", because everything here is offered for sale.
 *   VIEWABLE_LISTING_WHERE — what can be OPENED: the listing page, a conversation, a
 *                            deal. Also reserved and sold, so an existing link keeps
 *                            working and shows 🔒 محجوزة rather than a 404.
 *
 * Both require trustLevel >= 2. Nothing at draft or pending_review is ever returned by
 * either (Section 6c).
 */
export const PUBLIC_LISTING_WHERE: Prisma.ListingWhereInput = {
  status: { in: SEARCHABLE_STATUSES },
  trustLevel: { gte: MIN_PUBLIC_TRUST },
  // Rent was removed from the marketplace (owner, 2026-10-11). Existing rent rows stay
  // in the database (and openable by direct link) but are never found or counted.
  purpose: "sale",
};

export const VIEWABLE_LISTING_WHERE: Prisma.ListingWhereInput = {
  status: { in: VIEWABLE_STATUSES },
  trustLevel: { gte: MIN_PUBLIC_TRUST },
};

export type SearchParams = {
  purpose?: string;
  /** Only units whose owner opened them to trade (any purpose) — the app's "Trade" switch. */
  openToTrade?: boolean;
  /** Only "بدون أوفر" units: offered at the original contract price. */
  withoutOver?: boolean;
  /** residential | commercial | coastal — the top-level tabs. See ./segments. */
  segment?: string;
  areaSlug?: string;
  compoundSlug?: string;
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  finishing?: string;
  deliveryStatus?: string;
  paymentType?: string;
  q?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "best_value";
  page?: number;
  perPage?: number;
  /**
   * An extra predicate ANDed onto the built query.
   *
   * /browse's faceted rail composes multi-select groups (see ./facets), which do not fit
   * the single-value shape of the fields above. Rather than growing this type a parallel
   * array field for every facet — and keeping two filter paths in step forever — the
   * facet module owns its own predicate and hands it in here.
   *
   * It narrows and can never widen: PUBLIC_LISTING_WHERE is still spread first, and
   * `AND` cannot re-admit a draft or an unverified listing.
   */
  extraWhere?: Prisma.ListingWhereInput;
};

/** Photos a result card can page through before "open the listing for the rest". */
export const CARD_PHOTO_LIMIT = 8;

export const LISTING_CARD_INCLUDE = {
  unit: { include: { compound: true, area: true } },
  // Cover first, then a few more so the card can be browsed without opening the listing
  // (owner, 2026-10-24). Capped: `_count` still carries the real total.
  media: { orderBy: COVER_FIRST, take: CARD_PHOTO_LIMIT, select: { fileKey: true, thumbKey: true } },
  fairPrice: { orderBy: { computedAt: "desc" }, take: 1 },
  _count: { select: { media: true } },
} satisfies Prisma.ListingInclude;

// From the EXTENDED client (src/lib/prisma.ts), not Prisma.ListingGetPayload: the base
// payload types money as Decimal on Postgres, while the client actually returns numbers.
export type ListingCardRow = Prisma.Result<typeof prisma.listing, { include: typeof LISTING_CARD_INCLUDE }, "findFirstOrThrow">;

export function buildWhere(p: SearchParams): Prisma.ListingWhereInput {
  const unit: Prisma.UnitWhereInput = {};

  /*
    The area predicate is assembled in its own object because two independent filters
    write to it: the segment contributes `isCoastal`, and areaSlug contributes `slug`.
    Assigning `unit.area` twice would drop whichever ran second — picking a coastal area
    while the residential tab was active would then silently return coastal results.
  */
  const area: Prisma.AreaWhereInput = {};

  // Segment first, so the explicit filters below can narrow it.
  if (isSegment(p.segment)) {
    const seg = segmentUnitWhere(p.segment);
    if (seg.area) Object.assign(area, seg.area);
    if (seg.type) unit.type = seg.type;
  }
  if (p.areaSlug) area.slug = p.areaSlug;
  if (Object.keys(area).length > 0) unit.area = area;

  const compound: Prisma.CompoundWhereInput = {};
  if (p.compoundSlug) compound.slug = p.compoundSlug;
  if (Object.keys(compound).length > 0) unit.compound = compound;
  // A concrete type wins over the segment's type set — it is strictly narrower, and the
  // caller asked for it by name.
  if (p.type) unit.type = p.type;
  if (p.bedrooms) unit.bedrooms = { gte: p.bedrooms };
  if (p.finishing) unit.finishing = p.finishing;
  if (p.deliveryStatus) unit.deliveryStatus = p.deliveryStatus;

  const where: Prisma.ListingWhereInput = { ...PUBLIC_LISTING_WHERE };
  // No purpose override: PUBLIC_LISTING_WHERE pins "sale" since rent was removed, and a
  // ?purpose=rent from an old client must not bring rent listings back.
  if (p.openToTrade) where.openToTrade = true;
  if (p.withoutOver) where.withoutOver = true;
  if (p.paymentType) where.paymentType = p.paymentType;
  if (p.minPrice || p.maxPrice) {
    where.price = {};
    if (p.minPrice) where.price.gte = p.minPrice;
    if (p.maxPrice) where.price.lte = p.maxPrice;
  }
  if (Object.keys(unit).length > 0) where.unit = unit;

  // Facet groups, ANDed on. Applied before the free-text branch so a text search inside a
  // faceted view stays inside it.
  if (p.extraWhere && Object.keys(p.extraWhere).length > 0) {
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), p.extraWhere];
  }

  /*
    Free text searches the curated taxonomy first (compound / area names), then titles.

    Both taxonomy arms spread the constraints the caller already set alongside the name
    match, rather than replacing `unit.area` / `unit.compound`. Replacing dropped those
    constraints, so a text search inside one area or compound quietly searched all of them
    — and once segments existed, a text search inside the residential tab also returned
    coastal units.
  */
  if (p.q?.trim()) {
    const q = p.q.trim();
    const nameMatch = [{ nameAr: { contains: q } }, { nameEn: { contains: q } }];
    where.OR = [
      { unit: { ...unit, compound: { ...compound, OR: nameMatch } } },
      { unit: { ...unit, area: { ...area, OR: nameMatch } } },
      { titleAr: { contains: q } },
      { titleEn: { contains: q } },
      { reference: { contains: q } },
    ];
  }

  return where;
}

function orderFor(sort: SearchParams["sort"]): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "price_asc":
      return [{ price: "asc" }];
    case "price_desc":
      return [{ price: "desc" }];
    case "best_value":
      /*
        A real ORDER BY on the denormalised gap (Listing.valueGapPct), ascending, so the
        furthest below its own fair price comes first.

        This used to sort in memory AFTER pagination, which reordered only the 24 rows of
        the current page — so "best value" never meant best across the catalogue. Sorting
        in the database is both correct and cheap, because the column is indexed.

        nulls last: a listing with no fair-price estimate is an unknown, not a bargain.
      */
      return [{ valueGapPct: { sort: "asc", nulls: "last" } }, { publishedAt: "desc" }];
    default:
      // Newest first, with no promoted slots: nothing can buy its way up this list.
      return [{ publishedAt: "desc" }];
  }
}

/**
 * Search, as finished cards, through the shared cache.
 *
 * CACHE_KEYS.search and TTL.search were defined and documented from the start, but nothing
 * used them: every search ran a COUNT and a page query, on the single most frequent
 * request in the product. The key is the full public query (filters + facets + page),
 * never the user. Cards (not rows) are cached because the cache is JSON — a row's Dates
 * would come back as strings.
 */
export async function searchListingCards(p: SearchParams) {
  const { extraWhere, ...rest } = p;
  const key = CACHE_KEYS.search(JSON.stringify([rest, extraWhere ?? null]));
  return cached(key, TTL.search, async () => {
    const r = await searchListings(p);
    return { items: r.items.map(toCardVM), total: r.total, page: r.page, perPage: r.perPage, pages: r.pages };
  });
}

export async function searchListings(p: SearchParams) {
  const page = Math.max(1, p.page ?? 1);
  const perPage = Math.min(60, Math.max(1, p.perPage ?? 24));
  const where = buildWhere(p);

  const [total, rows] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      include: LISTING_CARD_INCLUDE,
      orderBy: orderFor(p.sort),
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  // No in-memory re-sort: every ordering is now done by the database, so page N is
  // genuinely the Nth page of the whole result set.
  return { items: rows, total, page, perPage, pages: Math.ceil(total / perPage) };
}

/** Card-level view model, so the card component holds no business logic. */
export type ListingCardVM = {
  withoutOver: boolean;
  id: string;
  reference: string;
  href: string;
  titleAr: string;
  titleEn: string;
  price: number;
  currency: string;
  purpose: string;
  paymentType: string;
  /** The cover photo (src/lib/cover.ts), not simply the first one captured. */
  photo: string | null;
  /** Total photos on the listing, for the "+N" affordance on the card. */
  photoCount: number;
  /** Cover first, up to CARD_PHOTO_LIMIT, for the card's photo carousel. */
  photos: string[];
  /** Approved virtual tours — the card shows a "video tour" badge when > 0. */
  tourCount: number;
  compoundAr: string | null;
  compoundEn: string | null;
  areaAr: string;
  areaEn: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  finishing: string;
  deliveryStatus: string;
  trustLevel: number;
  /** live|reserved|sold — the card and the app disable actions on anything but live. */
  status: string;
  daysOnMarket: number;
  fair: { low: number; mid: number; high: number; confidence: string } | null;
  verdict: PriceVerdict;
  /**
   * The owner's declared payment plan, when the listing has one.
   *
   * NULL for a cash listing, and null is meaningful: it means there is no plan, not that
   * we failed to load one. Nothing derives a plan from the price — a down payment the
   * owner never stated is a number a buyer would budget against, and inventing it is the
   * one thing this product cannot do.
   */
  installment: { downPayment: number; monthly: number; years: number } | null;
  /**
   * The unit's pin, for the map view — its COMPOUND's location.
   *
   * Every unit's location is its compound's (see locationCheck.ts), so the pin is taken
   * from the compound first and the unit row only as a fallback for legacy data. Null
   * when neither has coordinates: a map that assumes otherwise drops a pin at 0°,0° in
   * the Gulf of Guinea rather than failing visibly.
   */
  geo: { lat: number; lng: number } | null;
};

/**
 * Read a listing's plan, keeping only a complete one.
 *
 * A partial plan is discarded rather than shown with gaps: "EGP 1,200,000 down, then —
 * monthly" invites the reader to fill the blank themselves.
 */
function installmentFrom(raw: string | null): ListingCardVM["installment"] {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const down = Number(p.downPayment);
    const monthly = Number(p.monthly);
    const years = Number(p.years);
    if (![down, monthly, years].every((n) => Number.isFinite(n) && n > 0)) return null;
    return { downPayment: down, monthly, years };
  } catch {
    // Hand-edited or legacy rows must not take a results page down.
    return null;
  }
}

export function toCardVM(l: ListingCardRow): ListingCardVM {
  const fp = l.fairPrice[0] ?? null;
  const fair = fp ? { low: fp.low, mid: fp.mid, high: fp.high, confidence: fp.confidence } : null;
  const verdict: PriceVerdict = fair
    ? verdictFor(l.price, { ...fair, method: "rules_v1", sampleSize: fp!.sampleSize, factors: {}, insufficientData: false } as FairPriceResult)
    : "unknown";

  return {
    installment: installmentFrom(l.installmentJson),
    geo:
      typeof l.unit.compound?.centerLat === "number" && typeof l.unit.compound?.centerLng === "number"
        ? { lat: l.unit.compound.centerLat, lng: l.unit.compound.centerLng }
        : typeof l.unit.lat === "number" && typeof l.unit.lng === "number"
          ? { lat: l.unit.lat, lng: l.unit.lng }
          : null,
    id: l.id,
    reference: l.reference,
    href: `/listing/${l.reference}`,
    withoutOver: l.withoutOver,
    titleAr: l.titleAr ?? "",
    titleEn: l.titleEn ?? "",
    price: l.price,
    currency: l.currency,
    purpose: l.purpose,
    paymentType: l.paymentType,
    photo: l.media[0]?.thumbKey ?? l.media[0]?.fileKey ?? null,
    photoCount: l._count.media,
    photos: l.media.map((m) => m.thumbKey ?? m.fileKey),
    tourCount: l.tourCount,
    compoundAr: l.unit.compound?.nameAr ?? null,
    compoundEn: l.unit.compound?.nameEn ?? null,
    areaAr: l.unit.area.nameAr,
    areaEn: l.unit.area.nameEn,
    type: l.unit.type,
    bedrooms: l.unit.bedrooms,
    bathrooms: l.unit.bathrooms,
    sizeSqm: l.unit.sizeSqm,
    finishing: l.unit.finishing,
    deliveryStatus: l.unit.deliveryStatus,
    trustLevel: l.trustLevel,
    status: l.status,
    daysOnMarket: l.publishedAt ? Math.floor((Date.now() - l.publishedAt.getTime()) / 86400_000) : 0,
    fair,
    verdict,
  };
}

/** Full listing page payload, including the three prices the brief requires. */
export async function getListingByReference(reference: string) {
  const listing = await prisma.listing.findUnique({
    where: { reference },
    include: {
      // The owner is projected pseudonymously: this payload reaches the browser, and a
      // name sitting unused in the props is still a name that leaked (Section 6).
      unit: {
        include: {
          compound: { include: { area: true } },
          area: true,
          owner: { select: { id: true, ...PUBLIC_IDENTITY_SELECT } },
        },
      },
      media: { orderBy: COVER_FIRST },
      // Approved only: an owner's tour is public once staff have reviewed it.
      tours: { where: { status: "approved" }, select: PUBLIC_TOUR_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      priceHistory: { orderBy: { changedAt: "asc" } },
      fairPrice: { orderBy: { computedAt: "desc" }, take: 1 },
    },
  });

  if (!listing) return null;
  // Reserved and sold units stay readable; only unverified or unpublished ones 404.
  if (!VIEWABLE_STATUSES.includes(listing.status as never) || listing.trustLevel < MIN_PUBLIC_TRUST) {
    return null;
  }

  const developer = await getDeveloperPrice(listing.unit.compoundId, listing.unit.type, listing.unit.sizeSqm);
  const fp = listing.fairPrice[0] ?? null;

  return {
    listing,
    developer,
    fair: fp,
    verdict: fp
      ? verdictFor(listing.price, {
          low: fp.low,
          mid: fp.mid,
          high: fp.high,
          confidence: fp.confidence as "low" | "medium" | "high",
          method: "rules_v1",
          sampleSize: fp.sampleSize,
          factors: {},
          insufficientData: false,
        })
      : ("unknown" as PriceVerdict),
    developerGap: developer ? developerGapPct(listing.price, developer.price) : null,
  };
}

/**
 * Count a view.
 *
 * Buffered rather than written immediately — see src/lib/viewCounter.ts for why a write
 * on every page view is the most expensive thing a read path can do.
 */
export function incrementViews(listingId: string) {
  recordView(listingId);
}
