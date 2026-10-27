import { prisma } from "./prisma";
import { revokeAllRefreshTokens } from "./auth";
import { onListingVisibilityChanged } from "./catalogue";
import { notifyTradeRequestMatches } from "./tradeRequestService";
import { parseJson } from "./json";

/**
 * What "blocked" means — one definition, used by the admin's block button and by the
 * strike threshold in the reports flow.
 *
 * A blocked account:
 *   - cannot sign in (login, OTP verify and refresh all refuse `isBlocked`), and every
 *     session it already has ends — sessionFromToken re-reads the flag on each request,
 *     and the refresh tokens are revoked here so nothing can be renewed;
 *   - has its LIVE listings paused, so its units leave search immediately;
 *   - has its live offers withdrawn, in both directions — a seller must not be able to
 *     accept a blocked buyer's price, and a buyer must not wait on a blocked seller;
 *   - has its open viewings cancelled, so nobody turns up to meet a blocked account.
 *
 * Deals already in progress are NOT touched: money and contracts need a person's
 * judgement, so the count is returned for the admin to follow up.
 *
 * Unblocking restores what blocking took that can safely come back: the listings THIS
 * block paused (read from its audit entry), if still paused and not expired. Offers and
 * viewings stay closed — the other side has moved on, and new ones can be made.
 */

export type BlockEffects = {
  pausedListingIds: string[];
  offersWithdrawn: number;
  viewingsCancelled: number;
  openDeals: number;
};

export async function applyBlock(userId: string): Promise<BlockEffects> {
  const now = new Date();
  const live = await prisma.listing.findMany({
    where: { unit: { ownerId: userId }, status: "live" },
    select: { id: true },
  });
  const pausedListingIds = live.map((l) => l.id);

  const [, , offers, viewings, openDeals] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { isBlocked: true } }),
    prisma.listing.updateMany({ where: { id: { in: pausedListingIds } }, data: { status: "paused" } }),
    prisma.offer.updateMany({
      where: {
        status: "pending",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [{ OR: [{ buyerId: userId }, { sellerId: userId }] }],
      },
      data: { status: "withdrawn", respondedAt: now },
    }),
    prisma.viewingRequest.updateMany({
      where: {
        status: { in: ["requested", "proposed", "accepted"] },
        OR: [{ buyerId: userId }, { listing: { unit: { ownerId: userId } } }],
      },
      data: { status: "cancelled" },
    }),
    prisma.deal.count({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }], stage: { notIn: ["completed", "cancelled"] } },
    }),
  ]);

  await revokeAllRefreshTokens(userId);
  for (const id of pausedListingIds) await onListingVisibilityChanged(id);

  return { pausedListingIds, offersWithdrawn: offers.count, viewingsCancelled: viewings.count, openDeals };
}

export async function applyUnblock(userId: string): Promise<{ restoredListingIds: string[] }> {
  const now = new Date();
  await prisma.user.update({ where: { id: userId }, data: { isBlocked: false } });

  // The listings the most recent block paused — not every paused listing, because an
  // owner may have paused some themselves before the block.
  const lastBlock = await prisma.auditLog.findFirst({
    where: { action: "user_blocked", entity: "user", entityId: userId },
    orderBy: { createdAt: "desc" },
    select: { metaJson: true },
  });
  const ids = parseJson<{ pausedListingIds?: string[] }>(lastBlock?.metaJson ?? null, {}).pausedListingIds ?? [];
  if (!ids.length) return { restoredListingIds: [] };

  const restorable = await prisma.listing.findMany({
    where: { id: { in: ids }, status: "paused", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    select: { id: true },
  });
  const restoredListingIds = restorable.map((l) => l.id);
  await prisma.listing.updateMany({ where: { id: { in: restoredListingIds } }, data: { status: "live" } });
  for (const id of restoredListingIds) {
    await onListingVisibilityChanged(id);
    // Live again: a listing still open to trade reaches matching trade requests (deduped).
    await notifyTradeRequestMatches(id);
  }
  return { restoredListingIds };
}
