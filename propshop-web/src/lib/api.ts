import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, SessionUser, isStaff } from "./auth";
import { Role } from "./enums";
import { prisma } from "./prisma";
import { incrementWindow, redisConfigured, redisHealthy } from "./redis";

/** Uniform JSON envelopes, so the Flutter client sees one shape everywhere. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Requires a signed-in user; optionally restricts to specific roles. */
export async function requireUser(
  req: NextRequest,
  roles?: Role[],
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionFromRequest(req);
  if (!user) return { response: fail("unauthorized", 401) };
  if (roles && !roles.includes(user.role)) return { response: fail("forbidden", 403) };
  return { user };
}

export async function requireStaff(req: NextRequest): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionFromRequest(req);
  if (!user) return { response: fail("unauthorized", 401) };
  if (!isStaff(user.role)) return { response: fail("forbidden", 403) };
  return { user };
}

/**
 * Fixed-window rate limiter.
 *
 * Shared across instances when REDIS_URL is set, per-process otherwise.
 *
 * Why that distinction is not cosmetic: behind a load balancer with N instances, a
 * per-process limiter allows N x the configured limit, and every deploy resets all
 * counters. For OTP that is an SMS bill and an abuse vector.
 *
 * ASYNC ON PURPOSE. It was synchronous, which made a shared store impossible — the whole
 * reason it could not scale. Nine call sites now await it.
 *
 * FAILS OPEN. If Redis is unreachable this falls back to the local bucket rather than
 * rejecting: a limiter that blocks everything because a cache blipped turns a dependency
 * problem into an outage.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Bounded so a flood of unique keys cannot exhaust memory. */
const MAX_BUCKETS = 50_000;

export type RateLimitMode = "memory" | "redis";

export function rateLimitMode(): RateLimitMode {
  return redisConfigured() ? "redis" : "memory";
}

function localRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) {
      if (v.resetAt < now) buckets.delete(k);
    }
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** True when the caller may proceed. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const count = await incrementWindow(`rl:${key}`, windowMs);
  // null means Redis is absent or unreachable — fall back to the local bucket.
  if (count === null) return localRateLimit(key, limit, windowMs);
  return count <= limit;
}

/** Diagnostics for the health endpoint. */
export function rateLimitStats(): { mode: RateLimitMode; buckets: number; shared: boolean; redisHealthy: boolean } {
  const mode = rateLimitMode();
  return { mode, buckets: buckets.size, shared: mode === "redis" && redisHealthy(), redisHealthy: redisHealthy() };
}

/**
 * The caller's IP, for rate limiting and the audit log.
 *
 * X-Forwarded-For is a list the CLIENT can start: "evil, 1.2.3.4" is easy to send. Each
 * proxy in front of us appends the address it saw, so only the entries added by our own
 * proxies can be trusted — counted from the RIGHT. Taking the leftmost entry (as this
 * used to) let anyone mint a fresh IP per request and walk straight past every per-IP
 * limit (login, OTP).
 *
 * TRUSTED_PROXY_HOPS = how many proxies sit in front of the app (default 1: Vercel, or
 * nginx/IIS in front of `next start`). Vercel replaces the header with the real client
 * address, so 1 is right there too. Set 0 only if the app is exposed with no proxy at
 * all; the header is then ignored entirely, since nothing trustworthy wrote it.
 */
export function clientIp(req: NextRequest): string {
  const hops = Math.max(0, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 0);
  if (hops === 0) return "direct";
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim(); // set by Vercel's edge, not the client
  const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - hops] ?? chain[0] ?? req.headers.get("x-real-ip") ?? "unknown";
}

/** Sequential human-facing references (AQ-100001, RQ-…, DL-…, TR-…, TB-… for tour bookings). */
export async function nextReference(prefix: "AQ" | "RQ" | "DL" | "TR" | "TB"): Promise<string> {
  const table =
    prefix === "AQ" ? prisma.listing
    : prefix === "RQ" ? prisma.request
    : prefix === "DL" ? prisma.deal
    : prefix === "TB" ? prisma.photoBooking
    : prisma.tradeOffer;
  // @ts-expect-error — the delegates share the `reference` field but not a type.
  const last = await table.findFirst({ orderBy: { reference: "desc" }, select: { reference: true } });
  const lastNum = last?.reference ? Number(String(last.reference).split("-")[1]) : 100000;
  return `${prefix}-${(Number.isFinite(lastNum) ? lastNum : 100000) + 1}`;
}

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId?: string,
  meta?: unknown,
  ip?: string,
) {
  await prisma.auditLog
    .create({
      data: {
        actorId,
        action,
        entity,
        entityId,
        metaJson: meta ? JSON.stringify(meta) : null,
        ip,
      },
    })
    .catch(() => {});
}
