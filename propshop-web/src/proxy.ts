import { NextRequest, NextResponse } from "next/server";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { retiredSearchTarget } from "@/lib/searchRedirect";
import {
  CachedResponse,
  FRESH_SECONDS,
  NEXT_VARY_HEADERS,
  STALE_SECONDS,
  responseStore,
  storeGet,
  storeSet,
  varyIsCovered,
} from "@/lib/responseCache";

/**
 * Runs before every request. Two jobs:
 *
 * 1. The anonymous response cache (src/lib/responseCache.ts): a signed-out GET to a
 *    public page or public API is answered from memory when a recent render exists, so
 *    page rendering — the first thing to run out under load — happens once per URL every
 *    ~20 seconds instead of once per visitor. A miss is filled by one internal request to
 *    this same server (marked with FILL_HEADER so it passes straight through), and
 *    concurrent misses for the same key share that one request.
 *
 * 2. CORS for the Flutter web build during local development only. On a device the app
 *    is native, so CORS never applies; in production the only browser origin is the site.
 */

const FILL_HEADER = "x-propshop-cache-fill";
const LOCALE_COOKIE = "aq_locale";
const PURPOSE_COOKIE = "aqar_purpose";
const CREDENTIAL_COOKIES = ["aq_at", "aq_rt"];

/** Public, identical for every signed-out visitor. Anything not listed is never cached. */
const CACHEABLE = [
  /^\/$/,
  /^\/listing\/[^/]+$/,
  /^\/trade$/,
  /^\/browse$/,
  /^\/compounds$/,
  /^\/discover$/,
  /^\/how-it-works$/,
  /^\/pricing$/,
  /^\/legal\/[^/]+$/,
  /^\/api\/listings$/,
  /^\/api\/listings\/(?!mine$|draft$)[^/]+$/,
  /^\/api\/home$/,
  /^\/api\/compounds$/,
  /^\/api\/trade\/market$/,
];

const CACHEABLE_TYPES = ["text/html", "application/json", "text/x-component"];

/** Off with RESPONSE_CACHE=0, and in dev (where pages must reflect edits immediately). */
const ENABLED = process.env.RESPONSE_CACHE !== "0" && (process.env.NODE_ENV === "production" || process.env.RESPONSE_CACHE === "1");

const gzipAsync = promisify(gzip);

const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export async function proxy(req: NextRequest) {
  const cors = corsFor(req);
  if (cors && req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });

  // Retired /search: pure URL arithmetic, so answer it here instead of rendering a page
  // just to redirect. In-app (RSC) navigations still go through the page's redirect.
  if (req.nextUrl.pathname === "/search" && !isRsc(req)) {
    const { target, permanent } = retiredSearchTarget(req.nextUrl.searchParams.entries());
    return NextResponse.redirect(new URL(target, req.url), permanent ? 308 : 307);
  }

  const res = cacheable(req) ? await fromCache(req) : null;
  const out = res ?? NextResponse.next();
  if (cors) for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}

function cacheable(req: NextRequest): boolean {
  if (!ENABLED || req.method !== "GET") return false;
  if (req.headers.has(FILL_HEADER)) return false;
  if (req.headers.has("authorization") || req.headers.has("next-action")) return false;
  if (CREDENTIAL_COOKIES.some((c) => req.cookies.has(c))) return false;
  const path = req.nextUrl.pathname;
  return CACHEABLE.some((re) => re.test(path));
}

function keyFor(req: NextRequest): string {
  const parts = [
    req.nextUrl.pathname + req.nextUrl.search,
    req.cookies.get(LOCALE_COOKIE)?.value ?? "",
    req.cookies.get(PURPOSE_COOKIE)?.value ?? "",
    ...NEXT_VARY_HEADERS.map((h) => req.headers.get(h) ?? ""),
  ];
  return parts.join("\u0001");
}

async function fromCache(req: NextRequest): Promise<NextResponse | null> {
  const key = keyFor(req);
  const now = Date.now();
  const found = storeGet(key);
  // Belt and braces: a navigation (RSC) request must never get an HTML page, nor a page
  // load an RSC payload, whatever the key says.
  const hit = found && isRsc(req) === isRscEntry(found) ? found : undefined;

  if (hit && hit.freshUntil > now) {
    responseStore.hits++;
    return toResponse(req, hit, "HIT");
  }
  if (hit) {
    // Stale: answer now, refresh once in the background.
    responseStore.stale++;
    void fill(req, key);
    return toResponse(req, hit, "STALE");
  }

  responseStore.misses++;
  const filled = await fill(req, key);
  // Not cacheable after all (set a cookie, redirected, errored…) → render normally.
  return filled ? toResponse(req, filled, "MISS") : null;
}

function isRsc(req: NextRequest): boolean {
  return req.headers.get("rsc") === "1";
}

function isRscEntry(e: CachedResponse): boolean {
  return (e.headers.find(([k]) => k === "content-type")?.[1] ?? "").startsWith("text/x-component");
}

function fill(req: NextRequest, key: string): Promise<CachedResponse | null> {
  const running = responseStore.inflight.get(key);
  if (running) return running;
  const p = doFill(req, key).finally(() => responseStore.inflight.delete(key));
  responseStore.inflight.set(key, p);
  return p;
}

async function doFill(req: NextRequest, key: string): Promise<CachedResponse | null> {
  try {
    const headers: Record<string, string> = {
      [FILL_HEADER]: "1",
      // Uncompressed: the outer response is compressed once, on the way out.
      "accept-encoding": "identity",
      accept: req.headers.get("accept") ?? "*/*",
    };
    for (const h of NEXT_VARY_HEADERS) {
      const v = req.headers.get(h);
      if (v !== null) headers[h] = v;
    }
    // Only the two preference cookies — the fill must render as a stranger would.
    const cookie = [LOCALE_COOKIE, PURPOSE_COOKIE]
      .map((c) => (req.cookies.has(c) ? `${c}=${req.cookies.get(c)!.value}` : null))
      .filter(Boolean)
      .join("; ");
    if (cookie) headers.cookie = cookie;

    const origin = `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
    const r = await fetch(origin + req.nextUrl.pathname + req.nextUrl.search, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

    const type = r.headers.get("content-type") ?? "";
    if (
      r.status !== 200 ||
      isRsc(req) !== type.startsWith("text/x-component") ||
      r.headers.has("set-cookie") ||
      !varyIsCovered(r.headers.get("vary")) ||
      !CACHEABLE_TYPES.some((t) => type.startsWith(t))
    ) {
      await r.body?.cancel();
      return null;
    }

    const body = await r.arrayBuffer();
    const kept: [string, string][] = [];
    r.headers.forEach((v, k) => {
      // Length/encoding are recomputed for the outgoing response; connection headers are hop-by-hop.
      if (!["content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive", "date"].includes(k)) kept.push([k, v]);
    });
    // Compressed once here instead of on every hit (a 290 KB page costs ~20% of a
    // worker's throughput to gzip per request). Served when the client accepts gzip.
    const gz = body.byteLength > 1024 ? new Uint8Array(await gzipAsync(new Uint8Array(body))) : undefined;
    const now = Date.now();
    const entry: CachedResponse = {
      status: 200,
      headers: kept,
      body,
      gzip: gz?.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer | undefined,
      bytes: body.byteLength + (gz?.byteLength ?? 0) + key.length,
      freshUntil: now + FRESH_SECONDS * 1000,
      staleUntil: now + (FRESH_SECONDS + STALE_SECONDS) * 1000,
    };
    storeSet(key, entry);
    return entry;
  } catch {
    // A failed fill never caches anything; the request renders normally.
    return null;
  }
}

function toResponse(req: NextRequest, e: CachedResponse, state: "HIT" | "STALE" | "MISS"): NextResponse {
  const gz = e.gzip && /gzip/.test(req.headers.get("accept-encoding") ?? "");
  const res = new NextResponse(gz ? e.gzip : e.body, { status: e.status });
  for (const [k, v] of e.headers) res.headers.set(k, v);
  if (gz) {
    // Already encoded, so Next's compression leaves it alone.
    res.headers.set("content-encoding", "gzip");
    if (!/accept-encoding/i.test(res.headers.get("vary") ?? "")) res.headers.append("vary", "Accept-Encoding");
  }
  res.headers.set("x-cache", state);
  return res;
}

function corsFor(req: NextRequest): Record<string, string> | null {
  if (process.env.NODE_ENV === "production") return null;
  if (!req.nextUrl.pathname.startsWith("/api/")) return null;
  const origin = req.headers.get("origin");
  if (!origin || !DEV_ORIGIN.test(origin)) return null;
  return {
    // Echoed, never "*", because credentials are allowed.
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export const config = {
  // Everything except static assets and media files, which never need either job.
  matcher: ["/((?!_next/static|_next/image|media/|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js|woff2?)$).*)"],
};
