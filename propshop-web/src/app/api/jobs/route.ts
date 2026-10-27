import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { runSlaEscalation } from "@/lib/requests";
import { recomputeAllFairPrices } from "@/lib/fairPriceService";
import {
  runFrequentJobs,
  runNightlyJobs,
  expireOffers,
  expireListings,
  releaseLapsedReservations,
} from "@/lib/jobs";

/**
 * POST /api/jobs?job=<name> — scheduled work, until BullMQ lands (Section 8).
 *
 * Protected by a shared secret rather than a session, so a cron runner can call it:
 *   curl -X POST "$SITE/api/jobs?job=sla_escalation" -H "x-job-secret: $JOB_SECRET"
 *
 * Recommended cadence:
 *   frequent            every 5 minutes  (expiring offers, lapsed reservations)
 *   sla_escalation      every 15 minutes
 *   nightly             once a day       (listing expiry, token pruning, counter repair)
 *   recompute_fair_prices  nightly
 */
export async function POST(req: NextRequest) {
  const secret = process.env.JOB_SECRET;
  // Fail closed: without a configured secret the endpoint is unavailable, never open.
  if (!secret) return fail("jobs_not_configured", 503);
  if (req.headers.get("x-job-secret") !== secret) return fail("unauthorized", 401);

  const job = req.nextUrl.searchParams.get("job");

  switch (job) {
    case "sla_escalation": {
      // Flags every request past its 24-hour window, escalates it and queues an apology.
      const result = await runSlaEscalation();
      return ok({ job, ...result });
    }

    case "expire_listings": {
      // Now bounded and cache-invalidating — see src/lib/jobs.ts. The previous inline
      // updateMany had no limit and left the discover cache stale.
      return ok({ job, expired: await expireListings() });
    }

    case "recompute_fair_prices": {
      // Each new live listing changes its neighbours' comparable pool.
      const result = await recomputeAllFairPrices();
      return ok({ job, ...result });
    }

    /*
      The two grouped sweeps. A cron runner should call these rather than the individual
      jobs — one entry each instead of one per job, and new jobs get scheduled
      automatically when they are added to the group.

        every 5 minutes   frequent
        nightly           nightly
    */
    case "frequent":
      return ok({ job, results: await runFrequentJobs() });

    case "nightly":
      return ok({ job, results: await runNightlyJobs() });

    case "expire_offers":
      return ok({ job, expired: await expireOffers() });

    case "release_reservations":
      return ok({ job, released: await releaseLapsedReservations() });

    default:
      return fail("unknown_job", 422, {
        available: [
          "frequent",
          "nightly",
          "sla_escalation",
          "expire_listings",
          "expire_offers",
          "release_reservations",
          "recompute_fair_prices",
        ],
      });
  }
}
