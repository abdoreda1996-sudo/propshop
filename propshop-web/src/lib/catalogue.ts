/**
 * Maintenance of denormalised catalogue counters.
 *
 * `Compound.liveListingCount` exists because ranking compounds by a relation count is a
 * correlated aggregate no index can serve — 251ms on 20k listings, on the busiest page.
 * This module is the only thing allowed to write it, so there is one place to look when
 * a number seems wrong.
 *
 * Correctness model: the counter is a HINT used for ordering only. Visibility itself is
 * always re-derived from PUBLIC_LISTING_WHERE at query time, so a stale counter can
 * reorder a rail but can never reveal a listing that should be hidden.
 */

import { prisma } from "./prisma";
import { SEARCHABLE_STATUSES, MIN_PUBLIC_TRUST } from "./enums";
import { invalidatePublicCatalogue } from "./cache";

/**
 * Recompute the counter for specific compounds, or all of them.
 *
 * Call with the affected compound after a publish, unpublish, reserve or sale. Call with
 * no argument from a nightly job, which repairs any drift from a crash mid-write.
 */
export async function refreshCompoundCounts(compoundIds?: string[]): Promise<number> {
  const grouped = await prisma.unit.groupBy({
    by: ["compoundId"],
    where: {
      ...(compoundIds?.length ? { compoundId: { in: compoundIds } } : {}),
      compoundId: compoundIds?.length ? { in: compoundIds } : { not: null },
      listings: {
        some: { status: { in: SEARCHABLE_STATUSES }, trustLevel: { gte: MIN_PUBLIC_TRUST } },
      },
    },
    _count: { _all: true },
  });

  const counts = new Map(grouped.filter((g) => g.compoundId).map((g) => [g.compoundId!, g._count._all]));

  // Compounds in scope that matched nothing must be reset to zero, or a compound that
  // sells out keeps its old rank forever.
  const scope = compoundIds?.length
    ? compoundIds
    : (await prisma.compound.findMany({ select: { id: true } })).map((c) => c.id);

  await prisma.$transaction(
    scope.map((id) =>
      prisma.compound.update({ where: { id }, data: { liveListingCount: counts.get(id) ?? 0 } }),
    ),
  );

  invalidatePublicCatalogue();
  return scope.length;
}

/**
 * Called whenever one listing's public visibility changes.
 *
 * Resolves the listing's compound itself so callers do not have to, and never throws:
 * a counter refresh must not be able to fail a publish.
 */
export async function onListingVisibilityChanged(listingId: string): Promise<void> {
  try {
    const row = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { unit: { select: { compoundId: true } } },
    });
    const compoundId = row?.unit.compoundId;
    if (compoundId) await refreshCompoundCounts([compoundId]);
    else invalidatePublicCatalogue();
  } catch {
    // A drifted counter is repaired by the nightly full refresh. Failing the publish
    // because a cache hint could not be updated would be far worse.
    invalidatePublicCatalogue();
  }
}
