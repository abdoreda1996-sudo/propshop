/**
 * Anonymous response cache — the micro-cache in front of rendering.
 *
 * Why: every page reads cookies (language, buy/rent, session), so Next renders each one
 * per request. For a signed-out visitor the output depends ONLY on the URL, the language
 * cookie, the buy/rent cookie and Next's own navigation headers — so one render can serve
 * every anonymous visitor for a few seconds. Public browsing is ~65% of traffic and page
 * rendering is what runs out first (SCALING.md §8), which makes this the biggest lever.
 *
 * Correct by construction, not by allowlisting what pages do:
 *   - only requests with NO credentials (no Authorization header, no session cookies);
 *   - the key holds every input the response can depend on (URL, the two preference
 *     cookies, and the request headers Next lists in `Vary`);
 *   - a response whose `Vary` names anything else, that sets a cookie, or that is not a
 *     200 HTML / JSON / RSC payload is never stored.
 *
 * The store lives on globalThis: the proxy and the route handlers are separate bundles
 * in the same process, and both need it (the proxy serves, a catalogue change clears).
 * Each instance has its own copy; across instances the short TTL bounds staleness.
 */

export type CachedResponse = {
  status: number;
  headers: [string, string][];
  body: ArrayBuffer;
  /** The body gzipped once at store time, for clients that accept it. */
  gzip?: ArrayBuffer;
  bytes: number;
  freshUntil: number;
  staleUntil: number;
};

type Store = {
  entries: Map<string, CachedResponse>;
  bytes: number;
  inflight: Map<string, Promise<CachedResponse | null>>;
  hits: number;
  misses: number;
  stale: number;
};

/** Seconds a stored response is served as-is. */
export const FRESH_SECONDS = 20;
/** Further seconds it may be served while one background request refreshes it. */
export const STALE_SECONDS = 60;
const MAX_ENTRIES = 2000;
const MAX_BYTES = 96 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

const g = globalThis as typeof globalThis & { __propshopResponseCache?: Store };
export const responseStore: Store = (g.__propshopResponseCache ??= {
  entries: new Map(),
  bytes: 0,
  inflight: new Map(),
  hits: 0,
  misses: 0,
  stale: 0,
});

/** Request headers Next varies RSC / prefetch responses on. They go into the key. */
export const NEXT_VARY_HEADERS = [
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-url",
] as const;

/** Anything a response may vary on that we account for. Anything else → not stored. */
const KNOWN_VARY = new Set<string>([...NEXT_VARY_HEADERS, "accept-encoding", "origin"]);

export function varyIsCovered(vary: string | null): boolean {
  if (!vary) return true;
  return vary
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .every((v) => KNOWN_VARY.has(v));
}

export function storeGet(key: string): CachedResponse | undefined {
  const e = responseStore.entries.get(key);
  if (!e) return undefined;
  if (e.staleUntil <= Date.now()) {
    drop(key, e);
    return undefined;
  }
  // Re-insert so Map order approximates recency (LRU eviction from the head).
  responseStore.entries.delete(key);
  responseStore.entries.set(key, e);
  return e;
}

export function storeSet(key: string, e: CachedResponse): void {
  const old = responseStore.entries.get(key);
  if (old) drop(key, old);
  if (e.bytes > MAX_ENTRY_BYTES) return;
  while (responseStore.entries.size >= MAX_ENTRIES || responseStore.bytes + e.bytes > MAX_BYTES) {
    const head = responseStore.entries.keys().next();
    if (head.done) break;
    drop(head.value, responseStore.entries.get(head.value)!);
  }
  responseStore.entries.set(key, e);
  responseStore.bytes += e.bytes;
}

function drop(key: string, e: CachedResponse) {
  responseStore.entries.delete(key);
  responseStore.bytes -= e.bytes;
}

/** Clears every stored response on this instance. Called when the public catalogue changes. */
export function clearResponseCache(): number {
  const n = responseStore.entries.size;
  responseStore.entries.clear();
  responseStore.bytes = 0;
  return n;
}

export function responseCacheStats() {
  const s = responseStore;
  const total = s.hits + s.misses + s.stale;
  return {
    entries: s.entries.size,
    megabytes: Math.round((s.bytes / 1024 / 1024) * 10) / 10,
    hits: s.hits,
    staleHits: s.stale,
    misses: s.misses,
    hitRate: total ? Math.round(((s.hits + s.stale) / total) * 1000) / 10 : 0,
  };
}
