/**
 * Read-through cache with a Redis-shaped interface.
 *
 * Today this is an in-process LRU, which is enough for a single instance and costs
 * nothing to run. The interface is deliberately the subset Redis provides (get / set with
 * TTL / delete by prefix) so moving to a shared cache is a change to this file only —
 * no call site changes.
 *
 * Why it matters here: the discover payload is identical for every signed-out visitor and
 * changes only when a listing publishes. Measured at 20k listings, building it costs
 * ~250ms of database time, most of it in one query that cannot use an index. Serving it
 * from cache turns the busiest page on the site from a database query into a memory read.
 *
 * WHAT NOT TO CACHE: anything scoped to a user. Every key here must be derivable from
 * public inputs only. A cached payload that contains one user's offers and is then served
 * to another is the worst bug this file could produce, so the key helpers below take
 * explicit public arguments rather than a session.
 */

import { withRedis, redisHealthy, redisConfigured } from "./redis";
import { clearResponseCache } from "./responseCache";

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

/** Bounded so a long-running process cannot grow without limit. */
const MAX_ENTRIES = 1000;

function evictIfNeeded() {
  if (store.size < MAX_ENTRIES) return;
  // Drop the oldest quarter. Map preserves insertion order, so the head is the oldest.
  const drop = Math.ceil(MAX_ENTRIES / 4);
  let i = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++i >= drop) break;
  }
}

export function cacheGet<T>(key: string): T | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function cacheSet<T>(key: string, value: T, ttlSeconds: number): void {
  evictIfNeeded();
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Invalidate by prefix — the operation that keeps cached data honest.
 *
 * With Redis this becomes SCAN + DEL, or better, key tagging. The prefix convention in
 * CACHE_KEYS exists so that stays a one-line change.
 */
export function cacheInvalidate(prefix: string): number {
  let n = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      n++;
    }
  }

  // And the shared copy, or other instances keep serving the stale payload until TTL.
  // SCAN rather than KEYS: KEYS blocks the whole Redis server, which on a shared
  // instance means blocking every other app using it.
  void withRedis(async (r) => {
    let cursor = "0";
    do {
      const [next, found] = await r.scan(cursor, "MATCH", `c:${prefix}*`, "COUNT", 200);
      cursor = next;
      if (found.length > 0) await r.del(...found);
    } while (cursor !== "0");
    return true;
  });

  return n;
}

/**
 * Read through the cache.
 *
 * A miss computes and stores. Failures are NOT cached: caching an error turns a blip
 * into an outage for the length of the TTL.
 */
export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  // Shared cache first. A hit here is what lets every instance benefit from one
  // computation instead of each warming its own copy.
  const shared = await withRedis(async (r) => {
    const raw = await r.get(`c:${key}`);
    return raw ? (JSON.parse(raw) as T) : null;
  });
  if (shared !== null) return shared;

  const local = cacheGet<T>(key);
  if (local !== null) return local;

  const value = await compute();

  cacheSet(key, value, ttlSeconds);
  // Best-effort: a failed write means the next request recomputes, which is fine.
  await withRedis((r) => r.set(`c:${key}`, JSON.stringify(value), "EX", ttlSeconds));

  return value;
}

/**
 * Key prefixes. Grouped so invalidation can take out a whole family at once, and so no
 * two features can collide on a key name.
 */
export const CACHE_KEYS = {
  /** The discover payload — identical for everyone, changes when a listing publishes. */
  home: (locale: string) => `home:${locale}`,
  homePrefix: "home:",

  /** Search result pages. Keyed by the full public query, never by user. */
  search: (query: string) => `search:${query}`,
  searchPrefix: "search:",

  /** The curated taxonomy. Changes when an admin edits it, which is rare. */
  taxonomy: () => "taxonomy:compounds",
  taxonomyPrefix: "taxonomy:",

  /** The trade market — public rows only; per-viewer "fits you" flags are computed after. */
  tradeMarket: (query: string) => `trade:market:${query}`,
  tradeCandidates: () => "trade:candidates",
  tradePrefix: "trade:",
} as const;

/** TTLs in seconds. Short enough to feel live, long enough to absorb a traffic spike. */
export const TTL = {
  /** Discover: a new listing appearing a minute late is invisible to a user. */
  home: 60,
  /** Search: the same query from many users in a burst is the case this exists for. */
  search: 30,
  /** Taxonomy: compounds and areas change on the order of weeks. */
  taxonomy: 600,
  /** Trade market: invalidated on every trade-settings change, so the TTL is a backstop. */
  trade: 60,
} as const;

/**
 * Called when a listing becomes visible or stops being visible.
 *
 * Anything that changes what the public can see must call this, or the site will serve a
 * stale catalogue for up to a TTL. It is cheap, so call it liberally.
 */
export function invalidatePublicCatalogue(): void {
  cacheInvalidate(CACHE_KEYS.homePrefix);
  cacheInvalidate(CACHE_KEYS.searchPrefix);
  // A unit that goes live, gets reserved or sold also enters/leaves the trade market.
  cacheInvalidate(CACHE_KEYS.tradePrefix);
  // And the rendered anonymous pages built from them (other instances: within their TTL).
  clearResponseCache();
}

/** A listing was opened/closed to trade or its requirements changed. */
export function invalidateTradeMarket(): void {
  cacheInvalidate(CACHE_KEYS.tradePrefix);
  clearResponseCache();
}

/** Diagnostics for the health endpoint. */
export function cacheStats(): {
  entries: number;
  maxEntries: number;
  shared: boolean;
  redisConfigured: boolean;
} {
  return {
    entries: store.size,
    maxEntries: MAX_ENTRIES,
    shared: redisConfigured() && redisHealthy(),
    redisConfigured: redisConfigured(),
  };
}
