/**
 * View counting, buffered.
 *
 * Every listing page view used to issue its own UPDATE. That makes a read path into a
 * write path, and writes are the scarce resource: measured at 20k listings and 200
 * concurrent operations, mixed read+write reached a p95 of 7 seconds, against 160ms for
 * reads alone. A popular listing is the worst case, because every viewer contends for
 * the same row.
 *
 * Instead we accumulate counts in memory and flush them periodically as one UPDATE per
 * listing. A thousand views of one listing becomes one write instead of a thousand.
 *
 * The trade, stated plainly: counts buffered since the last flush are lost if the process
 * dies, and with several instances each keeps its own buffer until it flushes. For a
 * "1,284 views" vanity number that is the right trade. Never use this for anything that
 * has to be exact — money, offers, audit records. Those write immediately.
 */

import { prisma } from "./prisma";

const pending = new Map<string, number>();

/** How often buffered counts are written. Short enough that the page feels live. */
const FLUSH_MS = 30_000;

/** Flush early if a burst arrives, so memory cannot grow without bound. */
const MAX_PENDING_KEYS = 500;

let timer: NodeJS.Timeout | null = null;

export function recordView(listingId: string): void {
  pending.set(listingId, (pending.get(listingId) ?? 0) + 1);

  if (pending.size >= MAX_PENDING_KEYS) {
    void flushViews();
    return;
  }

  if (!timer) {
    timer = setTimeout(() => {
      timer = null;
      void flushViews();
    }, FLUSH_MS);
    // Do not hold the process open just to flush a view counter.
    timer.unref?.();
  }
}

/**
 * Write buffered counts. Exported so a graceful shutdown hook, or a test, can force it.
 *
 * Failures are swallowed on purpose: a view counter must never break a page render or
 * take down a request. The counts are simply lost.
 */
export async function flushViews(): Promise<number> {
  if (pending.size === 0) return 0;

  const batch = [...pending.entries()];
  pending.clear();

  try {
    // One statement per listing, inside a single transaction, rather than one round trip
    // per view. Postgres handles this as a single write batch.
    await prisma.$transaction(
      batch.map(([id, count]) =>
        prisma.listing.update({ where: { id }, data: { views: { increment: count } } }),
      ),
    );
    return batch.length;
  } catch {
    return 0;
  }
}

/** Buffered-but-unwritten counts, for diagnostics. */
export function pendingViewCount(): number {
  return pending.size;
}
