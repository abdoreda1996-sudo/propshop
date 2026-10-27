import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, rateLimitStats } from "@/lib/api";
import { cacheStats } from "@/lib/cache";
import { responseCacheStats } from "@/lib/responseCache";
import { storageStats } from "@/lib/storage";
import { pendingViewCount } from "@/lib/viewCounter";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness, plus the configuration facts that decide whether this
 * instance can actually take traffic.
 *
 * The checks are chosen so that a deploy which LOOKS fine but will fall over under load
 * reports `degraded` rather than `ok`. Each one has burned somebody:
 *
 *   - SQLite in production   — one writer for the whole database; measured p95 of 7s at
 *                              200 concurrent mixed operations
 *   - in-memory rate limits  — N instances means N x the limit, and OTP is an SMS bill
 *   - local storage driver   — media bytes through the app server
 *
 * Point the load balancer at this. It returns 200 while the process can serve, so a
 * degraded-but-working instance is not killed mid-incident; read `status` for the detail.
 */
export async function GET(req: NextRequest) {
  const started = Date.now();

  let dbOk = false;
  let dbLatencyMs = -1;
  let dbProvider = "unknown";
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
    dbProvider = (process.env.DATABASE_URL ?? "").startsWith("postgres") ? "postgresql" : "sqlite";
  } catch {
    dbOk = false;
  }

  const rate = rateLimitStats();
  const store = storageStats();
  const isProd = process.env.NODE_ENV === "production";

  // Things that are fine locally and unacceptable under real traffic.
  const warnings: string[] = [];
  if (isProd && dbProvider === "sqlite") {
    warnings.push("database is SQLite — single-writer, will serialise all writes under load");
  }
  if (process.env.PROPSHOP_LOAD_TEST === "1") {
    warnings.push("PROPSHOP_LOAD_TEST=1 — production safety checks are waived; this must never be set on a real deployment");
  }
  if (isProd && !rate.shared) {
    warnings.push("rate limiting is per-process — set REDIS_URL so limits are shared across instances");
  }
  if (isProd && !store.productionReady) {
    warnings.push("object storage is not configured — media would be served by the app server");
  }
  if (isProd && !process.env.JWT_SECRET?.length) {
    warnings.push("JWT_SECRET is not set");
  }

  const status = !dbOk ? "unhealthy" : warnings.length > 0 ? "degraded" : "ok";

  return ok(
    {
      status,
      uptimeSeconds: Math.round(process.uptime()),
      checkMs: Date.now() - started,
      database: { ok: dbOk, provider: dbProvider, latencyMs: dbLatencyMs },
      rateLimit: rate,
      cache: cacheStats(),
      responseCache: responseCacheStats(),
      pid: process.pid,
      storage: store,
      // Buffered view counts not yet written — see src/lib/viewCounter.ts.
      viewBuffer: pendingViewCount(),
      warnings,
    },
    // 503 only when the process genuinely cannot serve. A degraded instance still
    // answers requests, and removing it from the pool would make an incident worse.
    { status: dbOk ? 200 : 503 },
  );
  void req;
}
