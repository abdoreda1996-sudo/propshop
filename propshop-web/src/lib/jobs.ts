/**
 * Scheduled maintenance.
 *
 * Nothing in this product expired until now. At 20k listings that is not a tidiness
 * problem, it is a correctness one:
 *
 *   - a listing past `expiresAt` keeps appearing in search, so a buyer offers on a unit
 *     the owner stopped paying to advertise months ago;
 *   - an offer past `expiresAt` keeps its status of "pending", so the offers inbox shows
 *     a decision that is no longer live. The read paths already treat it as expired
 *     (src/lib/offers.ts evaluates expiry at read time, deliberately), but the stored
 *     status drifting from the truth makes every report and query wrong;
 *   - a reservation past `reservedUntil` holds a unit off the market indefinitely.
 *
 * Each job is idempotent, bounded, and safe to run concurrently with traffic. They are
 * plain functions so they can be driven by a cron route, a queue worker, or a test —
 * nothing here assumes a scheduler.
 */

import { prisma } from "./prisma";
import { invalidatePublicCatalogue } from "./cache";
import { refreshCompoundCounts } from "./catalogue";
import { notifyTradeRequestMatches } from "./tradeRequestService";

export type JobResult = { job: string; affected: number; ms: number; error?: string };

async function run(job: string, fn: () => Promise<number>): Promise<JobResult> {
  const t0 = Date.now();
  try {
    return { job, affected: await fn(), ms: Date.now() - t0 };
  } catch (e) {
    // A failing job must not prevent the others from running.
    return { job, affected: 0, ms: Date.now() - t0, error: (e as Error).message.slice(0, 200) };
  }
}

/**
 * Offers whose deadline has passed.
 *
 * Bounded per run so one sweep cannot lock a large slice of the table. Whatever is left
 * is picked up by the next run.
 */
export async function expireOffers(limit = 1000): Promise<number> {
  const due = await prisma.offer.findMany({
    where: { status: "pending", expiresAt: { lt: new Date() } },
    select: { id: true },
    take: limit,
  });
  if (due.length === 0) return 0;

  const { count } = await prisma.offer.updateMany({
    where: { id: { in: due.map((o) => o.id) }, status: "pending" },
    data: { status: "expired", respondedAt: new Date() },
  });
  return count;
}

/**
 * Listings whose paid visibility window has ended.
 *
 * Only `live` listings expire. A reserved or sold unit is mid-transaction and must not be
 * yanked out from under a deal because its advertising period lapsed.
 */
export async function expireListings(limit = 500): Promise<number> {
  const due = await prisma.listing.findMany({
    where: { status: "live", expiresAt: { lt: new Date() } },
    select: { id: true, unit: { select: { compoundId: true } } },
    take: limit,
  });
  if (due.length === 0) return 0;

  const { count } = await prisma.listing.updateMany({
    where: { id: { in: due.map((l) => l.id) }, status: "live" },
    data: { status: "expired" },
  });

  const compoundIds = [...new Set(due.map((l) => l.unit.compoundId).filter(Boolean))] as string[];
  if (compoundIds.length > 0) await refreshCompoundCounts(compoundIds);
  invalidatePublicCatalogue();

  return count;
}

/**
 * Reservations whose hold has lapsed.
 *
 * The unit returns to market and the deal is cancelled. Deliberately conservative: only
 * deals still at the `reserved` stage are released. Once due diligence has started the
 * parties are engaged and a lapsed timer is a conversation, not an automatic cancellation.
 */
export async function releaseLapsedReservations(limit = 200): Promise<number> {
  const lapsed = await prisma.deal.findMany({
    where: { stage: "reserved", reservedUntil: { lt: new Date() } },
    select: { id: true, listingId: true },
    take: limit,
  });
  if (lapsed.length === 0) return 0;

  for (const deal of lapsed) {
    await prisma.$transaction([
      prisma.deal.update({
        where: { id: deal.id },
        data: { stage: "cancelled", reservedUntil: null, depositStatus: "refunded" },
      }),
      // Back to market, so other buyers can offer again.
      prisma.listing.updateMany({
        where: { id: deal.listingId, status: "reserved" },
        data: { status: "live" },
      }),
      prisma.dealEvent.create({
        data: { dealId: deal.id, event: "cancelled", note: "reservation_lapsed" },
      }),
    ]);
  }

  invalidatePublicCatalogue();
  // Back to market: a unit still open to trade reaches matching trade requests. Deduped,
  // and a no-op for a listing that did not actually return to live.
  for (const deal of lapsed) await notifyTradeRequestMatches(deal.listingId);
  return lapsed.length;
}

/**
 * Sessions that can no longer be used.
 *
 * Refresh tokens accumulate one row per sign-in forever. At 200k users that is the
 * fastest-growing table in the database and none of it is readable after expiry.
 */
export async function pruneExpiredTokens(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

/** Consumed or lapsed OTP codes. Same reasoning as tokens. */
export async function pruneExpiredOtps(): Promise<number> {
  const { count } = await prisma.otpCode.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { not: null } }] },
  });
  return count;
}

/** Repairs any drift in the denormalised compound counters. */
export async function repairCatalogueCounters(): Promise<number> {
  return refreshCompoundCounts();
}

/**
 * The frequent sweep — safe to run every few minutes.
 *
 * These are the jobs where lateness is user-visible: an expired offer still showing as
 * live, or a lapsed reservation still holding a unit off the market.
 */
export async function runFrequentJobs(): Promise<JobResult[]> {
  return [
    await run("expireOffers", () => expireOffers()),
    await run("releaseLapsedReservations", () => releaseLapsedReservations()),
  ];
}

/**
 * The nightly sweep — housekeeping nobody sees, plus counter repair.
 */
export async function runNightlyJobs(): Promise<JobResult[]> {
  return [
    await run("expireListings", () => expireListings()),
    await run("pruneExpiredTokens", () => pruneExpiredTokens()),
    await run("pruneExpiredOtps", () => pruneExpiredOtps()),
    await run("repairCatalogueCounters", () => repairCatalogueCounters()),
  ];
}
