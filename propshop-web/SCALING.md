# Scaling to 200k users / 20k listings

Target from the brief: **200,000+ registered users**, **~2,000 active users per hour**
across web and app, **~20,000 listings in month one** with photos, documents and video.

This document records what was measured, what was changed, and what still has to happen
before that load is survivable. Every number below came from
`prisma/bench.ts` and `prisma/concurrency.ts` on this machine — re-run them, do not
trust the numbers on faith.

---

## 1. What was measured

Baseline at the seeded size (306 listings) showed nothing: every query under 25 ms. That
is exactly why it was misleading. Grown to the month-one target:

```
npx tsx prisma/bench.ts --grow 20000
```

| Query | 306 listings | 20,000 listings | Degradation |
|---|---|---|---|
| Search page 1 | 24 ms | 101 ms | 4.2× |
| Deep page (offset 2400) | 7 ms | 112 ms | 16× |
| Free-text search (`contains`) | 14 ms | 156 ms | 11× |
| **Discover: top compounds** | 16 ms | **251 ms** | **15×** |
| Listing detail | 8 ms | 10 ms | — |

Then concurrency, which is what "crash" actually means:

```
npx tsx prisma/concurrency.ts 200
```

| Operation (200 concurrent) | p50 | p95 |
|---|---|---|
| Search page 1 | 1,006 ms | 1,756 ms |
| Writes (view counter) | 1,879 ms | 3,321 ms |
| **Mixed read + write** | **3,819 ms** | **7,071 ms** |

**A p95 of 7 seconds is the failure.** Nothing errored — SQLite queues instead of
rejecting — but requests pile up until the Node process has no free workers, and then the
instance stops answering. That is the crash, and it arrives at 200 concurrent operations,
which a single marketing push will produce.

---

## 2. What was changed

### 2.1 The view counter stopped being a write on every read

`incrementViews` issued an `UPDATE` on every listing page view, turning the most-read path
into a write path. On a popular listing every viewer contended for the same row.

Now buffered in memory and flushed periodically (`src/lib/viewCounter.ts`). Measured:

```
5,000 views buffered in 0.7 ms → 1 UPDATE instead of 5,000 (count exact)
```

**Trade, stated plainly:** counts buffered since the last flush are lost if the process
dies, and each instance buffers separately. Correct for a vanity counter. Never use this
module for offers, payments or audit records — those write immediately.

### 2.2 Indexes matched to the measured queries

Composite indexes leading with the visibility predicate every public query starts with
(`status = 'live' AND trustLevel >= 2`), plus the `(listingId, isCover, sortOrder)` index
the cover lookup needs on every card. Search page 1 went 101 ms → 51 ms.

### 2.3 The discover query stopped being an aggregate

Ranking compounds by `orderBy: { units: { _count: "desc" } }` is a correlated aggregate
across three tables that **no index can serve** — the slowest query in the product, on the
page every session starts at.

Replaced with a denormalised `Compound.liveListingCount`, maintained by
`src/lib/catalogue.ts` on publish, reserve and sale, with a nightly full refresh to repair
drift. Measured **248 ms → 66 ms (3.8×)**, and it is now cached on top of that.

The counter is a ranking hint only. Visibility is still derived from
`PUBLIC_LISTING_WHERE` at query time, so a stale counter can reorder a rail but can never
reveal a listing that should be hidden.

### 2.4 Read-through cache

`src/lib/cache.ts` — in-process now, Redis-shaped interface so moving to a shared cache is
a change to that one file. The discover payload is identical for every visitor and costs
~250 ms of database work; it is now served from memory and invalidated on publish rather
than left to expire.

**Rule enforced by the key helpers: nothing user-scoped is ever cached.** A cached payload
containing one user's offers served to another is the worst bug this file could produce.

### 2.5 Rate limiter made shareable

`rateLimit()` was per-process. Behind a load balancer with N instances the effective limit
becomes **N × the configured limit**, and every deploy resets all counters. For OTP that is
an SMS bill and an abuse vector, not a performance detail.

It is now **async and Redis-backed** (round 2), atomic via `INCR` + `PEXPIRE NX` in one
round trip — a separate INCR and EXPIRE could crash between them and leave a key with no
TTL, blocking that user forever. Falls back to per-process when Redis is absent, and fails
open if it is unreachable.

### 2.6 Postgres schema generated, not hand-maintained

`node prisma/generate-postgres-schema.mjs` derives `schema.postgres.prisma` from the dev
schema and applies what Postgres needs:

- 15 money columns `Float` → `Decimal(14,2)` — binary floating point cannot represent 0.01,
  and these columns hold offers and agreed prices
- 23 long-text columns → `@db.Text`
- `directUrl` for migrations separate from the pooled application connection

`prisma/migrations/postgres-init.sql` adds 13 objects Prisma cannot express:

- **pg_trgm GIN indexes** — this is what makes `contains` stop being a sequential scan, and
  it gives fuzzy matching so "Mivida" / "Mevida" / "ميفيدا" reach the same compound
- **partial indexes** on `status='live' AND trustLevel>=2`, so the hot index stays small as
  drafts, rejected and sold rows accumulate (they will outnumber live ones)
- **two unique constraints** the application already enforces — one cover photo per
  listing, one live offer per (listing, buyer) — so a race becomes impossible rather than
  unlikely

### 2.7 Media architecture

`src/lib/storage.ts`. Sizing month one honestly: ~650 GB (360 GB photo originals, 90 GB
renditions, 40 GB documents, 160 GB video).

Two rules the module exists to enforce:

1. **Bytes never touch the app.** Clients upload directly to object storage with a
   presigned URL and download from a CDN. A 3 MB upload proxied through Node occupies a
   request worker for tens of seconds on a mobile connection.
2. **Originals are private.** Ownership documents are contracts containing national ID
   numbers. Only derived, watermarked renditions are public.

`LocalDriver` works in development. `S3Driver` is **fully implemented** (round 2) against
the AWS SDK and works with S3, R2 or B2. `assertProductionStorage()` fails the boot if
production is still on the local driver — half-configured storage that silently falls back
is how uploads end up on an ephemeral container disk and vanish on the next deploy.

### 2.8 Health endpoint

`/api/health` reports `ok` / `degraded` / `unhealthy` and names the misconfigurations that
look fine locally and fall over under load: SQLite in production, per-process rate limits,
unconfigured storage, missing JWT secret. Returns 200 while the process can serve, so a
degraded instance is not killed mid-incident.

---

## 3. Result so far, and what remains

After the code changes, at 200 concurrent on SQLite:

| | Before | After | |
|---|---|---|---|
| Search page 1 (p95) | 1,756 ms | 1,165 ms | −34% |
| Listing detail (p95) | 159 ms | 78 ms | −51% |
| Mixed read+write (p95) | 7,071 ms | 3,632 ms | −49% |

**This is still not good enough, and no further application change will fix it.**

SQLite permits one writer for the entire database file. Every offer, message, view flush
and verification queues behind a single lock. The remaining work is infrastructure:

### Fixed since (round 2)

| Item | State |
|---|---|
| **Money precision** | Postgres stores money as `Decimal(14,2)`. Prisma returns those as Decimal objects, which would have broken every price in production while working in SQLite dev — the worst class of bug this project could ship. `src/lib/prisma.ts` normalises at the client boundary; 9 tests pin it, including "a Date must not be rebuilt as `{}`" and "serialises to JSON as a number". |
| **`best_value` was wrong** | It sorted 24 rows in memory *after* pagination, so it never meant best across the catalogue. Now a real `ORDER BY` on the denormalised `Listing.valueGapPct` (indexed, nulls last — an unknown is not a bargain). Verified: page 1 = −40%…−30%, page 2 = −26%…−25%, ordering holds across pages. |
| **Shared rate limiting** | `rateLimit()` is now async and Redis-backed (`src/lib/redis.ts`), atomic via `INCR` + `PEXPIRE NX` in one round trip. Falls back to per-process when Redis is absent, and **fails open** if it is unreachable. 9 call sites updated. |
| **Shared cache** | Same store. Invalidation uses `SCAN`, never `KEYS` — `KEYS` blocks the whole Redis server. |
| **Object storage** | `S3Driver` fully implemented (S3 / R2 / B2). Presigned PUT signs `ContentLength`, so the size caps are enforced rather than advisory. `deletePrefix` paginates and clears both buckets. Requires credentials to exercise. |
| **Nothing expired** | `src/lib/jobs.ts`: expiring offers, lapsed reservations (unit returns to market, deposit marked refunded), expired listings, token/OTP pruning, counter repair. Bounded per run, idempotent, grouped as `frequent` (5 min) and `nightly`. Verified against real rows. |

### Blocking — must happen before launch

| # | Item | Why |
|---|---|---|
| 1 | **Move to Postgres** | The single-writer lock is the crash. Everything else is tuning. Apply `schema.postgres.prisma` + `postgres-init.sql`, then re-run both benchmarks against it — SQLite's planner is not Postgres's and **these numbers will not transfer**. |
| 2 | **Provision Redis** | Code is done; set `REDIS_URL`. Without it, limits still multiply by instance count. |
| 3 | **Provision storage** | Code is done; set `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `CDN_BASE_URL`. `assertProductionStorage()` fails the boot if production is still on the local driver. |
| 4 | **Connection pooling** | PgBouncer in transaction mode or a managed pooler. `directUrl` is already wired so migrations bypass it. |
| 5 | **SMS provider** | Unrelated to scale, still the hard blocker to any real user signing in. |
| 6 | **Schedule the jobs** | `POST /api/jobs?job=frequent` every 5 min and `?job=nightly` daily, with `x-job-secret`. Until then nothing expires. |
| ~~7~~ | ~~Dependency audit~~ | **Done** — `npm audit` is clean. See §6. |

### Next, once those are in

| # | Item | Why |
|---|---|---|
| 6 | Background job queue | Image renditions, video transcode, fair-price recompute, expiry sweeps. None belong in a request. |
| 7 | Cursor pagination | Offset pagination is O(offset): page 100 scans 2,400 rows. Keyset pagination on `(publishedAt, id)` is flat. Deep pages are rare in practice, so this ranks below the blockers. |
| 8 | Read replica | Search and discover are read-dominated and can serve from a replica once one exists. |

---

## 4. Capacity arithmetic

2,000 users/hour is ~0.6 requests/second average — trivially small. **Average is not what
kills a site.** Traffic arrives in bursts: a marketing push or a portal link can produce
200+ concurrent requests in a few seconds, which is exactly the load measured above.

Sizing for the burst, not the average:

- **App**: 2–4 instances behind a load balancer, each 1 vCPU / 1 GB. Stateless already —
  sessions are JWTs, so instances need no affinity.
- **Postgres**: 2 vCPU / 8 GB to start. Watch `pg_stat_statements` for the top queries
  after a week rather than guessing.
- **Redis**: smallest managed instance. It holds counters and cache, not data.
- **Storage**: budget ~650 GB month one, growing with listings. Lifecycle-rule originals to
  infrequent-access after 90 days — they are needed for disputes, not page loads.

---

## 5. How to re-run this

```bash
npm run seed                          # baseline demo data
npx tsx prisma/bench.ts --grow 20000  # grow to month-one volume and time queries
npx tsx prisma/concurrency.ts 200     # concurrent load
npx tsx prisma/bench.ts --clean       # remove benchmark rows (tagged BENCH-)
```

`--clean` removes exactly the rows the benchmark created and nothing else. Run it before
demoing, or the catalogue will show 20,000 cloned listings.

---

## 6. Dependency security

`npm audit` reported 1 critical and 5 high advisories, all pre-existing. Now **0**.

| Advisory | Severity | Resolution |
|---|---|---|
| Next.js — HTTP request smuggling in rewrites | **critical** | `next` 16.1.6 → **16.3.5** (minor) |
| Next.js — unbounded `next/image` disk cache | critical (same CVE set) | same upgrade |
| PostCSS — XSS via unescaped `</style>` | high | resolved by the Next upgrade (postcss is transitive) |
| PostCSS — arbitrary file read via `sourceMappingURL` | high | same |
| sharp — libvips / libheif CVEs | high | `sharp` 0.34.5 → **0.35.4** |
| deepmerge-ts — stack exhaustion on recursive graphs | high ×3 | npm `overrides` → `deepmerge-ts@^8` |

### Notes on the judgement calls

**npm's "breaking" labels were wrong for two of these.** It proposed *downgrading* prisma
to 6.12.0 and called sharp 0.34→0.35 a major. Reading the advisory ranges instead of the
labels: `next@16.3.5` and `sharp@0.35.4` are both forward, in-range upgrades.

**The deepmerge-ts chain needed an override, not a downgrade.** `@prisma/config@6.19.3`
pins `deepmerge-ts` at exactly `7.1.5`, and the fix is ≥8. npm's suggested remedy was to
downgrade Prisma below the migrations in this repo — worse than the vulnerability. An
`overrides` entry forces 8.x instead; both versions expose the same entry points and
`@prisma/config` uses only `deepmerge`.

Verified after the override, because a silent config-loading failure would be worse than
the advisory: `prisma validate`, `prisma migrate status` (7 migrations, up to date),
`prisma generate`, full build, 147 unit tests, 42 journey assertions, 42 Flutter tests, and
every public route returning 200.

Re-check with `npm audit` after any dependency change. The override should be removed once
`@prisma/config` ships a version that depends on `deepmerge-ts@8` itself — it exists to
patch someone else's pin, not to be permanent.

---

## 7. Audit findings (2026-09-19)

A pass over the whole project for bugs, plus an assessment of the back-office.

### Fixed

| # | Finding | Severity |
|---|---|---|
| 1 | **ESLint had never run.** `eslint.config.mjs` used a `FlatCompat` shim that threw `Converting circular structure to JSON` on every invocation, so no lint check had ever reported anything. `eslint-config-next` exports a flat config directly; the shim was both unnecessary and the thing that was broken. | tooling |
| 2 | **Photographers had full back-office access.** `/admin` was guarded by `isStaff(role)`, true for photographer — a field contractor — who could open `/admin/users` and read every account with its phone number, plus reports and the advisor queue. Replaced with section-level permissions (`src/lib/permissions.ts`), enforced in the layout **and** on each page, with 9 tests and a live probe of every role against every URL. | **security** |
| 3 | **`advisorQueue` was unbounded** — every open request with six joined relations, no limit. Works at 5 requests, takes the page down at 5,000. | capacity |
| 4 | **Message threads loaded every message** to render the last screenful. Now a most-recent window of 100, reversed for display. | capacity |
| 5 | **The offers badge loaded every pending offer to count them** — an unbounded read on the hottest authenticated path, running on every dashboard render. Now one indexed `COUNT`. Verified the SQL predicate agrees with the JS filter across 31 users, and that all four expiry cases behave. | capacity |
| 6 | Per-user lists (offers, deals, viewings, saved, requests) were unbounded. Capped via `LIST_PAGE` / `THREAD_PAGE` in `enums.ts`. | capacity |
| 7 | **The brand font was a render-blocking third-party request** to Google Fonts on every page load — slow on mobile and blocked in some networks, which for an Arabic-first product means the typeface silently vanishing. Now self-hosted by `next/font`. | performance |
| 8 | Turn logic ("whose move is it") was implemented three times — offers page, dashboard badge, `/api/auth/me`. Consolidated into `countAwaiting` / `awaitingWhere`. | correctness risk |
| 9 | Dead import, and an `<a>` causing a full page reload instead of client navigation. | minor |

### Back-office structure and capacity

**Structure** is sound: six sections (overview, verification queue, advisor queue, listings,
reports, users), server-rendered, now correctly permissioned. The verification queue is the
operational heart and is well built — it surfaces the exact field that failed a check.

**Capacity gaps that remain**, all of the same shape — the screens cap their queries but
offer no way to go beyond the cap:

| Gap | Consequence at 200k users / 20k listings |
|---|---|
| No pagination anywhere in `/admin` | An admin sees the first 20–100 rows of each section and cannot reach the rest. |
| No search or filter | Finding one user among 200,000, or one listing among 20,000, is impossible. |
| No bulk actions | Verification is one listing at a time. At 20k listings/month that is the binding constraint on the whole business. |
| No assignment or ownership | Two reviewers can work the same listing; nothing records who did what. |
| Audit log is written but never displayed | `AuditLog` rows accumulate with no screen to read them — exactly what is needed during a dispute. |

None of these crash anything. They are the difference between a back-office that works for a
team of two and one that works for a verification team processing 20,000 listings a month —
which is the volume in the brief. **Recommend paging + search before launch**; bulk actions
and assignment shortly after.

---

## 8. Full-stack load test at 200k users (2026-10-04)

Target from the owner: **200,000 users, at least 100 active users per minute**. Read as
request rate, 100 active users each making a request every 3–6 s is **~17–33 requests/s**.

**Method.** Production build (`next build && next start`), HTTP, open-loop (requests fired
at a fixed rate regardless of replies), realistic web+app mix: public pages/API ~65%,
signed-in counters/lists ~30%, writes ~5%. Data: `prisma/growScale.ts` — 200,031 users,
20,308 live listings (one unit each, ~12k owners), 30k offers, 20k viewings, 3k trade
offers, 10k threads / 50k messages. Tools: `prisma/loadHttp.ts`, `prisma/profileEndpoints.ts`.
The production guard was bypassed with `PROPSHOP_LOAD_TEST=1` (see instrumentation.ts).

**Caveat that matters:** all numbers come from a 4-core 1.6 GHz laptop shared by the load
generator, Postgres and the app — and, as discovered during the run, an unauthorised
crypto-miner using ~2 cores (see the security note in the session report). A real server
will do better; treat these as a floor.

| Setup | 10 req/s | 25 req/s | Max sustained | Failure mode beyond it |
|---|---|---|---|---|
| SQLite, 1 instance | p95 476 ms | **collapse** (0.8/s, 116 errors, 458 timeouts) | ~10/s | DB socket timeouts (P1008) — one writer, one connection |
| Postgres, 1 instance | p95 198 ms | p95 316 ms, 0 errors | **~35/s** | Node CPU (page rendering) — queues, no errors |
| Postgres, 2 instances | — | p95 290 ms, 0 errors | **~50/s** | machine CPU — queues, no errors |

**Verdict.** On Postgres the target band (17–33 req/s) fits inside ONE instance on weak
hardware; two instances double the ceiling with zero errors. SQLite fails the target —
production must be Postgres (as §3 already required).

**Fixed during this pass (each measured):**
- `Unit.ownerId` had **no index** — every per-user query (my listings, owner badges, trade
  eligibility/matches, blocking) scanned Unit. Added, plus `ViewingRequest[buyerId,status]`,
  `TradeOffer[recipientId,status,expiresAt]`, `Message[conversationId,readAt]`.
- **Search was never cached** — `CACHE_KEYS.search`/`TTL.search` existed, unused. Now
  `searchListingCards()` (API + home page): repeat searches 125 ms → ~12 ms p50.
- Trade market: one area query **per card** → one per page, and the public rows cached.
  Trade matches: the 500-row candidate scan is cached and shared.
- Conversations list was **unbounded** → capped at LIST_PAGE, unread counted in one groupBy.
- **The app had never compiled against Postgres** (~100 type errors in 31 files — money is
  Decimal there). Fixed at the type level in `src/lib/prisma.ts` (`money-as-number`
  result fields) and guarded by `moneyFields.test.ts`. First successful Postgres build,
  seed and run.

**To run the target in production:** Postgres (with pooler), Redis (shared rate limits +
cache across instances), 2+ app instances behind a load balancer, object storage for media.

## 9. Toward 1,000 active users per minute, at 50,000 listings (2026-10-05)

Target from the owner: **1,000 active users per minute** on a catalogue built for **40,000+
listings** (with all their photos). Read as request rate (a request every 3–6 s per active
user): **~170–330 requests/s**. Bench grown to **50,000 live listings** with
`prisma/growListings.ts 50000` (same shape as growScale: 2 photos each, ≤2 units/owner).

**What changed (each measured):**

| Change | Where | Effect |
|---|---|---|
| Anonymous response cache — a signed-out GET to a public page/API is served from memory; one render per URL per ~20 s (+60 s stale-while-revalidate), gzipped once at store time | `src/proxy.ts`, `src/lib/responseCache.ts` | public pages 31 → **142 req/s**, public API 349 → **645 req/s** (same 3 workers, same URLs) |
| One worker per core on one port, DB connections split between them | `scripts/cluster.mjs`, `npm run start:cluster` | Node used 1 core per server before |
| Viewing counts/lists: owner's listing ids resolved first instead of an OR across a join (unindexable in Postgres) | `src/lib/viewingQueries.ts` | 233 → **12 ms**; `/api/auth/me` 157 → 64 ms, viewings API 145 → 20 ms, dashboard 178 → 99 ms; identical counts for 200/200 users |
| Retired `/search` redirect answered in the proxy (was a full render to send a 307) | `src/lib/searchRedirect.ts` | ~240 ms render → none |
| Header area list cached (was a query per page) | `src/app/layout.tsx` | one query / 10 min |

**Cache safety (17 HTTP checks + 7 unit tests + a real-browser navigation test, all pass):**
only requests with no credentials; key = URL + language + buy/rent cookies + Next's `Vary`
headers; never stores a response that sets a cookie, varies on anything else, or is not a
200 HTML/JSON/RSC payload; a signed-in user never gets a cached page; an in-app navigation
never gets HTML (needs `skipProxyUrlNormalize: true` in next.config — without it the proxy
cannot see Next's navigation headers). A catalogue change clears the cache on that
process; other workers converge within 20 s.

**End-to-end, 3 workers, 50,000 listings, sampling all 50,000 (worst case for the cache):**

| Rate | p50 | p95 | errors |
|---|---|---|---|
| 100 req/s | **69 ms** | **341 ms** | 0 |
| 130 req/s | overloaded (~105/s achieved) | | 0 errors, timeouts |

Was ~35/s (1 instance) and ~50/s (2 instances) in §8. Same caveat, worse: this laptop was
swapping (~10k pages/s at idle, <1 GB free) and running a crypto-miner on ~3 cores, the load
generator and Postgres. The cache hit rate was 65–80% with uniform sampling over 50,000
listings; real traffic is skewed toward popular listings and will hit more.

**Production shape for the target (estimate, not measured):** one 8-core app server running
`npm run start:cluster` (8 workers) ≈ 2.5–3× this laptop's 3 workers → roughly 250–300 req/s;
two such servers behind a load balancer for the full 330 req/s with headroom. Postgres on
its own machine with PgBouncer (raise `DB_CONNECTIONS` then), Redis (`REDIS_URL`) for shared
rate limits and data cache, and photos/videos from object storage + CDN — media bytes must
never pass through the app servers (storage.ts already enforces presigned uploads).

**Media at 40,000+ listings:** ~6 photos × 3 MB originals ≈ 720 GB, renditions ≈ 180 GB;
video tours at ~40 MB each add ~1.6 TB if every listing has one. Serve through a CDN; for
video, use adaptive streaming (HLS) or a hosted tour/video service rather than raw MP4s
from the bucket. Video tours are not yet a product feature (no field, no player).
