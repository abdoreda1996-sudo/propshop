import { prisma } from "./prisma";

/**
 * Viewing lookups by user, shaped for the indexes.
 *
 * "Viewings on listings I own" used to be written as a relation filter inside an OR —
 * `OR: [{ buyerId }, { listing: { unit: { ownerId } } }]`. Postgres cannot use an index
 * for an OR that spans a join, so it scanned every viewing request: ~78 ms per call at
 * 50,000 listings, on /api/auth/me (every app open) and every dashboard render. Resolving
 * the owner's listing ids first (an owner has a handful) turns both branches into plain
 * indexed columns: ~3 ms.
 */

export async function ownedListingIds(userId: string): Promise<string[]> {
  const rows = await prisma.listing.findMany({ where: { unit: { ownerId: userId } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Viewings waiting on THIS user: an owner answers a request, a buyer a proposal. */
export async function awaitingViewingsCount(userId: string): Promise<number> {
  const listingIds = await ownedListingIds(userId);
  return prisma.viewingRequest.count({
    where: {
      OR: [
        ...(listingIds.length ? [{ status: "requested", listingId: { in: listingIds } }] : []),
        { status: "proposed", buyerId: userId },
      ],
    },
  });
}

/** Where-clause for every viewing a user is party to, as buyer or as owner. */
export async function viewingsOfUserWhere(userId: string) {
  const listingIds = await ownedListingIds(userId);
  return { OR: [{ buyerId: userId }, ...(listingIds.length ? [{ listingId: { in: listingIds } }] : [])] };
}
