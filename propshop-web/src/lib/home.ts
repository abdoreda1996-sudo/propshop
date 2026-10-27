/**
 * The home / discover read model.
 *
 * Both clients render this: the website's home page imports it directly, and the Flutter
 * app gets the same object over /api/home. That is deliberate — the counters are public
 * claims about the marketplace ("257 verified listings, 0 EGP commission"), and a website
 * and an app disagreeing about them is worse than either being slightly stale.
 */

import { prisma } from "./prisma";
import { cached, CACHE_KEYS, TTL } from "./cache";
import { COVER_FIRST } from "./cover";
import { PUBLIC_LISTING_WHERE, LISTING_CARD_INCLUDE, toCardVM, ListingCardVM } from "./listings";

/** A unit row carrying just enough to reach its listing's cover photo. */
type UnitWithCover = {
  listings: { media: { fileKey: string; thumbKey: string | null }[] }[];
};

/**
 * The first verified cover photo inside a compound or an area.
 *
 * Browse tiles are illustrated with a real photo from a real verified unit rather than
 * stock: on a marketplace whose entire pitch is "these photos were captured in-app and
 * checked", a stock skyline on the compound tile undercuts the product.
 */
function coverFrom(units: UnitWithCover[]): string | null {
  const media = units[0]?.listings[0]?.media[0];
  return media?.thumbKey ?? media?.fileKey ?? null;
}

/** Nested select that reaches one live listing's cover from a compound or area. */
const COVER_VIA_UNITS = {
  where: { listings: { some: PUBLIC_LISTING_WHERE } },
  take: 1,
  select: {
    listings: {
      where: PUBLIC_LISTING_WHERE,
      take: 1,
      orderBy: { publishedAt: "desc" as const },
      select: { media: { orderBy: COVER_FIRST, take: 1, select: { fileKey: true, thumbKey: true } } },
    },
  },
};

export type HomeCompound = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  developer: string;
  areaAr: string;
  areaEn: string;
  units: number;
  cover: string | null;
};

export type HomeArea = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  city: string;
  units: number;
  cover: string | null;
};

export type HomeData = {
  liveCount: number;
  compoundCount: number;
  closedCount: number;
  newest: ListingCardVM[];
  topCompounds: HomeCompound[];
  areas: HomeArea[];
};

/**
 * The discover payload, cached.
 *
 * Identical for every visitor and changes only when a listing's visibility changes, so
 * it is the single highest-value thing to cache: measured at ~250ms of database work per
 * call, on the page every session starts at.
 *
 * Invalidated by invalidatePublicCatalogue() rather than left to expire, so a newly
 * published listing appears immediately rather than up to a TTL later.
 */
export function getHomeData(): Promise<HomeData> {
  return cached(CACHE_KEYS.home("public"), TTL.home, buildHomeData);
}

async function buildHomeData(): Promise<HomeData> {
  const [newestRows, liveCount, compoundCount, closedCount, compoundRows, areaRows] = await Promise.all([
    prisma.listing.findMany({
      where: PUBLIC_LISTING_WHERE,
      include: LISTING_CARD_INCLUDE,
      orderBy: [{ publishedAt: "desc" }],
      take: 8,
    }),
    prisma.listing.count({ where: PUBLIC_LISTING_WHERE }),
    prisma.compound.count(),
    prisma.listing.count({ where: { status: "closed" } }),
    // Only compounds that actually have something to show. A tile leading to an empty
    // result page is worse than no tile.
    prisma.compound.findMany({
      // Ordered by the denormalised counter, not a relation aggregate. The `gt: 0`
      // predicate replaces the correlated `some listings` subquery, so this is now an
      // index scan instead of a three-table aggregate (251ms -> see prisma/bench.ts).
      where: { liveListingCount: { gt: 0 } },
      orderBy: { liveListingCount: "desc" },
      take: 10,
      select: {
        id: true,
        slug: true,
        nameAr: true,
        nameEn: true,
        developer: true,
        area: { select: { nameAr: true, nameEn: true } },
        _count: { select: { units: true } },
        units: COVER_VIA_UNITS,
      },
    }),
    prisma.area.findMany({
      orderBy: { nameEn: "asc" },
      select: {
        id: true,
        slug: true,
        nameAr: true,
        nameEn: true,
        city: true,
        _count: { select: { units: true } },
        units: COVER_VIA_UNITS,
      },
    }),
  ]);

  return {
    liveCount,
    compoundCount,
    closedCount,
    newest: newestRows.map(toCardVM),
    topCompounds: compoundRows.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      developer: c.developer,
      areaAr: c.area.nameAr,
      areaEn: c.area.nameEn,
      units: c._count.units,
      cover: coverFrom(c.units),
    })),
    areas: areaRows.map((a) => ({
      id: a.id,
      slug: a.slug,
      nameAr: a.nameAr,
      nameEn: a.nameEn,
      city: a.city,
      units: a._count.units,
      cover: coverFrom(a.units),
    })),
  };
}
