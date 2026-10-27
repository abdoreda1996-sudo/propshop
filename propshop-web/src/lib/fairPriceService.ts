/**
 * Comparable selection + persistence for the fair price engine.
 *
 * `fairPrice.ts` is a pure estimator; this module decides WHICH comparables it is fed.
 * The ladder mirrors the Index rule in Section 6d-B — use the tightest cell that clears
 * the minimum sample, and fall back to a wider one rather than publishing a number built
 * on two listings. The scope used is recorded so the UI can say what the estimate is
 * based on.
 */

import { prisma } from "./prisma";
import { Comparable, estimateFairPrice, FairPriceResult, MIN_SAMPLE } from "./fairPrice";

export type ComparableScope = "compound_type" | "compound" | "area_type" | "area" | "none";

export const SCOPE_LABELS: Record<ComparableScope, { ar: string; en: string }> = {
  compound_type: { ar: "وحدات مشابهة في نفس الكمبوند", en: "similar units in the same compound" },
  compound: { ar: "وحدات في نفس الكمبوند", en: "units in the same compound" },
  area_type: { ar: "وحدات مشابهة في نفس المنطقة", en: "similar units in the same area" },
  area: { ar: "وحدات في نفس المنطقة", en: "units in the same area" },
  none: { ar: "لا توجد بيانات كافية", en: "not enough data" },
};

type ListingWithUnit = {
  id: string;
  price: number;
  purpose: string;
  publishedAt: Date | null;
  status: string;
  unit: {
    compoundId: string | null;
    areaId: string;
    type: string;
    sizeSqm: number;
    finishing: string;
    deliveryStatus: string;
    floor: number | null;
    view: string | null;
  };
};

function toComparable(l: ListingWithUnit, closedPrice?: number | null): Comparable {
  const price = closedPrice ?? l.price;
  return {
    pricePerSqm: price / l.unit.sizeSqm,
    isClosed: closedPrice != null,
    finishing: l.unit.finishing,
    deliveryStatus: l.unit.deliveryStatus,
    floor: l.unit.floor,
    view: l.unit.view,
    daysOnMarket: l.publishedAt ? Math.floor((Date.now() - l.publishedAt.getTime()) / 86400_000) : null,
  };
}

const SELECT = {
  id: true,
  price: true,
  purpose: true,
  publishedAt: true,
  status: true,
  unit: {
    select: {
      compoundId: true,
      areaId: true,
      type: true,
      sizeSqm: true,
      finishing: true,
      deliveryStatus: true,
      floor: true,
      view: true,
    },
  },
} as const;

/**
 * Walks the ladder until a cell clears MIN_SAMPLE. Closed deals are always included —
 * they are the strongest evidence we have and there are never many of them.
 */
export async function selectComparables(subject: {
  listingId: string;
  compoundId: string | null;
  areaId: string;
  type: string;
  purpose: string;
}): Promise<{ comparables: Comparable[]; scope: ComparableScope; peerIds: string[] }> {
  const base = {
    id: { not: subject.listingId },
    purpose: subject.purpose,
    status: { in: ["live", "closed"] },
  };

  const ladder: { scope: ComparableScope; where: Record<string, unknown> }[] = [];
  if (subject.compoundId) {
    ladder.push({ scope: "compound_type", where: { ...base, unit: { compoundId: subject.compoundId, type: subject.type } } });
    ladder.push({ scope: "compound", where: { ...base, unit: { compoundId: subject.compoundId } } });
  }
  ladder.push({ scope: "area_type", where: { ...base, unit: { areaId: subject.areaId, type: subject.type } } });
  ladder.push({ scope: "area", where: { ...base, unit: { areaId: subject.areaId } } });

  for (const rung of ladder) {
    const rows = (await prisma.listing.findMany({
      where: rung.where,
      select: SELECT,
      take: 200,
    })) as ListingWithUnit[];
    if (rows.length >= MIN_SAMPLE) {
      // A closed listing contributes its realised price, not its last ask.
      const closedIds = rows.filter((r) => r.status === "closed").map((r) => r.id);
      const closedPrices = closedIds.length
        ? await prisma.priceHistory.findMany({
            where: { listingId: { in: closedIds }, kind: "closed" },
            orderBy: { changedAt: "desc" },
          })
        : [];
      const closedByListing = new Map(closedPrices.map((p) => [p.listingId, p.price]));
      return {
        comparables: rows.map((r) => toComparable(r, r.status === "closed" ? (closedByListing.get(r.id) ?? null) : null)),
        scope: rung.scope,
        peerIds: rows.map((r) => r.id),
      };
    }
  }

  return { comparables: [], scope: "none", peerIds: [] };
}

export type FairPriceWithScope = FairPriceResult & { scope: ComparableScope };

/** Computes and persists the estimate for one listing. Safe to re-run. */
export async function computeFairPriceForListing(listingId: string): Promise<FairPriceWithScope | null> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: SELECT });
  if (!listing) return null;
  const l = listing as ListingWithUnit;

  const { comparables, scope } = await selectComparables({
    listingId: l.id,
    compoundId: l.unit.compoundId,
    areaId: l.unit.areaId,
    type: l.unit.type,
    purpose: l.purpose,
  });

  const result = estimateFairPrice(
    {
      sizeSqm: l.unit.sizeSqm,
      type: l.unit.type,
      finishing: l.unit.finishing,
      deliveryStatus: l.unit.deliveryStatus,
      floor: l.unit.floor,
      view: l.unit.view,
    },
    comparables,
  );

  // A wider scope is weaker evidence, so it cannot claim high confidence.
  const confidence =
    scope === "area" || scope === "area_type" ? (result.confidence === "high" ? "medium" : result.confidence) : result.confidence;

  if (result.insufficientData) {
    // No estimate means no value gap. Clearing it keeps the "best value" sort honest:
    // a listing we cannot price is not a bargain, and must not rank as one.
    await prisma.$transaction([
      prisma.fairPriceEstimate.deleteMany({ where: { listingId } }),
      prisma.listing.update({ where: { id: listingId }, data: { valueGapPct: null } }),
    ]);
    return { ...result, confidence, scope };
  }

  // Denormalised so the database can ORDER BY it. See Listing.valueGapPct.
  const valueGapPct = result.mid > 0 ? (l.price - result.mid) / result.mid : null;

  await prisma.$transaction([
    prisma.fairPriceEstimate.deleteMany({ where: { listingId } }),
    prisma.fairPriceEstimate.create({
      data: {
        listingId,
        low: result.low,
        mid: result.mid,
        high: result.high,
        confidence,
        method: result.method,
        sampleSize: result.sampleSize,
        factorsJson: JSON.stringify({ ...result.factors, scope }),
      },
    }),
    prisma.listing.update({ where: { id: listingId }, data: { valueGapPct } }),
  ]);

  return { ...result, confidence, scope };
}

/** Batch recompute — used by the seed and by the nightly job. */
export async function recomputeAllFairPrices(): Promise<{ computed: number; skipped: number }> {
  const ids = await prisma.listing.findMany({ where: { status: "live" }, select: { id: true } });
  let computed = 0;
  let skipped = 0;
  for (const { id } of ids) {
    const r = await computeFairPriceForListing(id);
    if (r && !r.insufficientData) computed += 1;
    else skipped += 1;
  }
  return { computed, skipped };
}

/**
 * "Developer price today" for the same compound + unit type + size band (Section 6b-A).
 * Returns the price for a comparable unit, scaled to the subject's size.
 */
export async function getDeveloperPrice(
  compoundId: string | null,
  unitType: string,
  sizeSqm: number,
): Promise<{ price: number; source: string; effectiveDate: Date; isAvailable: boolean } | null> {
  if (!compoundId) return null;
  const rows = await prisma.developerPriceList.findMany({
    where: { compoundId, unitType },
    orderBy: { effectiveDate: "desc" },
  });
  if (rows.length === 0) return null;

  // Prefer a band that actually contains the subject size; otherwise take the newest row
  // and scale it on a per-sqm basis.
  const exact = rows.find((r) => sizeSqm >= r.sizeMin && sizeSqm <= r.sizeMax);
  const row = exact ?? rows[0];
  const midSize = (row.sizeMin + row.sizeMax) / 2;
  const price = exact ? row.cashPrice : Math.round((row.cashPrice / midSize) * sizeSqm);

  return { price, source: row.source, effectiveDate: row.effectiveDate, isAvailable: row.isAvailable };
}
