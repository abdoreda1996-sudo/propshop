import Redis from "ioredis";

/**
 * Shared Redis connection.
 *
 * Optional by design: with no REDIS_URL the app runs exactly as before on in-process
 * state, which keeps local development free of a dependency. In production the health
 * endpoint reports the absence as `degraded`, because per-process rate limits behind a
 * load balancer mean N instances allow N times the configured limit.
 *
 * DEGRADATION RULE: every caller treats Redis as best-effort. If it is unreachable the
 * app falls back to local state rather than failing the request. A cache or a counter
 * that takes the site down when it is unavailable is worse than not having it — the
 * outage it causes is larger than the problem it solves.
 */

let client: Redis | null = null;
let attempted = false;
let healthy = false;

export function redis(): Redis | null {
  if (attempted) return client;
  attempted = true;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    client = new Redis(url, {
      // Fail fast and fall back rather than queueing requests behind a dead connection.
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      // Without this, commands issued while disconnected queue forever and every
      // request that touches the cache hangs until the socket recovers.
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    client.on("ready", () => {
      healthy = true;
    });
    client.on("error", () => {
      // Logged by ioredis; swallow so an unreachable cache cannot crash the process.
      healthy = false;
    });
    client.on("end", () => {
      healthy = false;
    });
  } catch {
    client = null;
  }

  return client;
}

export function redisHealthy(): boolean {
  return healthy;
}

export function redisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** Run a Redis operation, returning null on any failure. Never throws. */
export async function withRedis<T>(fn: (r: Redis) => Promise<T>): Promise<T | null> {
  const r = redis();
  if (!r || !healthy) return null;
  try {
    return await fn(r);
  } catch {
    return null;
  }
}

/**
 * Atomic fixed-window counter.
 *
 * INCR then EXPIRE on first write, in one round trip. Using a pipeline rather than two
 * calls matters: between a separate INCR and EXPIRE a crash would leave a key with no
 * TTL, and that key would block the user forever.
 */
export async function incrementWindow(key: string, windowMs: number): Promise<number | null> {
  return withRedis(async (r) => {
    const pipeline = r.pipeline();
    pipeline.incr(key);
    pipeline.pexpire(key, windowMs, "NX"); // NX: only set a TTL if the key has none
    const results = await pipeline.exec();
    const count = results?.[0]?.[1];
    return typeof count === "number" ? count : Number(count ?? 0);
  });
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
    attempted = false;
    healthy = false;
  }
}
