/**
 * HTTP load test against a running PRODUCTION build — the whole stack, not just queries.
 *
 *   DATABASE_URL=file:./bench.db JWT_SECRET=<server's secret> \
 *     npx tsx prisma/loadHttp.ts http://localhost:4300 10,25,50,100 45
 *
 * Open-loop: requests are FIRED at a fixed rate whether or not earlier ones returned —
 * that is how real traffic arrives, and it is what exposes queueing. (A closed loop that
 * waits for each reply politely slows down with the server and hides the problem.)
 *
 * The mix is the web + app traffic shape: public browsing dominates, signed-in counters
 * and lists are next, writes are a small slice. Signed-in requests use tokens minted for
 * real bench users (bench{n}@load.test) so per-user queries have real fan-out.
 */
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const [baseArg = "http://localhost:4300", ratesArg = "10,25,50,100", secsArg = "45"] = process.argv.slice(2);
// Several bases (comma-separated) = several app instances; requests round-robin across
// them, the way a load balancer would.
const BASES = baseArg.split(",");
let rr = 0;
const nextBase = () => BASES[rr++ % BASES.length];
const RATES = ratesArg.split(",").map(Number);
const SECS = Number(secsArg);
const prisma = new PrismaClient();

type Op = { name: string; weight: number; auth?: boolean; run: (ctx: Ctx) => Promise<Response> };
type Ctx = { token: () => string; ref: () => string; listingId: () => string };

async function setup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@load.test" } },
    select: { id: true, role: true, trustLevel: true, phone: true },
    take: 400,
    // owners (first 12k) and buyers both: spread across ids
    orderBy: { publicRef: "asc" },
    skip: 0,
  });
  const buyers = await prisma.user.findMany({
    where: { email: { endsWith: "@load.test" }, role: "buyer" },
    select: { id: true, role: true, trustLevel: true, phone: true },
    take: 400,
    skip: 50_000,
  });
  const people = [...users, ...buyers];
  const secret = process.env.JWT_SECRET!;
  const tokens = people.map((u) =>
    jwt.sign({ sub: u.id, role: u.role, trustLevel: u.trustLevel, countryCode: "EG", phone: u.phone }, secret, { expiresIn: "2h" }),
  );
  const listings = await prisma.listing.findMany({ where: { status: "live", reference: { startsWith: "AQ-7" } }, select: { id: true, reference: true }, take: 50_000 });
  const r = (n: number) => Math.floor(Math.random() * n);
  return {
    token: () => tokens[r(tokens.length)],
    ref: () => listings[r(listings.length)].reference,
    listingId: () => listings[r(listings.length)].id,
  };
}

const H = (t?: string): Record<string, string> => (t ? { authorization: `Bearer ${t}` } : {});
const OPS: Op[] = [
  { name: "page /", weight: 8, run: () => fetch(`${nextBase()}/`) },
  { name: "page /search", weight: 6, run: () => fetch(`${nextBase()}/search?page=${1 + Math.floor(Math.random() * 20)}`) },
  { name: "page /listing", weight: 12, run: (c) => fetch(`${nextBase()}/listing/${c.ref()}`) },
  { name: "page /trade", weight: 3, run: () => fetch(`${nextBase()}/trade`) },
  { name: "api search", weight: 14, run: () => fetch(`${nextBase()}/api/listings?page=${1 + Math.floor(Math.random() * 30)}&sort=newest`) },
  { name: "api listing", weight: 10, run: (c) => fetch(`${nextBase()}/api/listings/${c.ref()}`) },
  { name: "api home", weight: 6, run: () => fetch(`${nextBase()}/api/home`) },
  { name: "api trade market", weight: 4, run: () => fetch(`${nextBase()}/api/trade/market`) },
  { name: "api compounds", weight: 2, run: () => fetch(`${nextBase()}/api/compounds`) },
  { name: "api auth/me", weight: 10, auth: true, run: (c) => fetch(`${nextBase()}/api/auth/me`, { headers: H(c.token()) }) },
  { name: "page /dashboard", weight: 4, auth: true, run: (c) => fetch(`${nextBase()}/dashboard`, { headers: { cookie: `aq_at=${c.token()}` } }) },
  { name: "api offers", weight: 5, auth: true, run: (c) => fetch(`${nextBase()}/api/offers`, { headers: H(c.token()) }) },
  { name: "api viewings", weight: 3, auth: true, run: (c) => fetch(`${nextBase()}/api/viewings`, { headers: H(c.token()) }) },
  { name: "api trade matches", weight: 3, auth: true, run: (c) => fetch(`${nextBase()}/api/trade/matches`, { headers: H(c.token()) }) },
  { name: "api trade offers", weight: 2, auth: true, run: (c) => fetch(`${nextBase()}/api/trade-offers`, { headers: H(c.token()) }) },
  {
    name: "WRITE offer",
    weight: 3,
    auth: true,
    run: (c) =>
      fetch(`${nextBase()}/api/offers`, {
        method: "POST",
        headers: { ...H(c.token()), "content-type": "application/json" },
        body: JSON.stringify({ listingId: c.listingId(), amount: 6_000_000 }),
      }),
  },
  {
    name: "WRITE viewing",
    weight: 2,
    auth: true,
    run: (c) =>
      fetch(`${nextBase()}/api/viewings`, {
        method: "POST",
        headers: { ...H(c.token()), "content-type": "application/json" },
        body: JSON.stringify({ listingId: c.listingId(), slots: [{ date: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10), window: "14-18" }] }),
      }),
  },
];
const TOTAL_W = OPS.reduce((s, o) => s + o.weight, 0);
const pickOp = () => {
  let x = Math.random() * TOTAL_W;
  for (const o of OPS) if ((x -= o.weight) <= 0) return o;
  return OPS[0];
};

const pct = (a: number[], p: number) => (a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0);

async function stage(ctx: Ctx, rate: number) {
  const lat: Record<string, number[]> = {};
  const all: number[] = [];
  let errors = 0, rejected = 0, timeouts = 0, inflightMax = 0, inflight = 0;
  const statuses: Record<string, number> = {};
  const pending: Promise<void>[] = [];
  const interval = 1000 / rate;
  const start = performance.now();
  let n = 0;
  while (performance.now() - start < SECS * 1000) {
    const due = start + n * interval;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    n++;
    const op = pickOp();
    inflight++;
    inflightMax = Math.max(inflightMax, inflight);
    const t0 = performance.now();
    const ctl = AbortSignal.timeout(15_000);
    pending.push(
      op
        .run(ctx)
        .then(async (res) => {
          await res.arrayBuffer().catch(() => null);
          const ms = performance.now() - t0;
          (lat[op.name] ??= []).push(ms);
          all.push(ms);
          statuses[res.status] = (statuses[res.status] ?? 0) + 1;
          // Business-rule refusals on writes (422/409/429) are correct answers, not failures.
          if (res.status >= 500) errors++;
          else if (op.name.startsWith("WRITE") && res.status >= 400) rejected++;
          else if (res.status >= 400) errors++;
        })
        .catch(() => {
          timeouts++;
        })
        .finally(() => {
          inflight--;
        }),
    );
    void ctl;
  }
  await Promise.all(pending);
  const wall = (performance.now() - start) / 1000;
  all.sort((a, b) => a - b);
  console.log(`\n=== ${rate} req/s for ${SECS}s  (${n} sent, achieved ${(all.length / wall).toFixed(1)}/s, max in-flight ${inflightMax})`);
  console.log(`    ALL  p50 ${pct(all, 50).toFixed(0)}ms  p95 ${pct(all, 95).toFixed(0)}ms  p99 ${pct(all, 99).toFixed(0)}ms  errors ${errors}  timeouts ${timeouts}  rule-refusals ${rejected}  statuses ${JSON.stringify(statuses)}`);
  for (const [name, a] of Object.entries(lat).sort()) {
    a.sort((x, y) => x - y);
    console.log(`    ${name.padEnd(18)} n=${String(a.length).padStart(5)}  p50 ${pct(a, 50).toFixed(0).padStart(5)}  p95 ${pct(a, 95).toFixed(0).padStart(5)}`);
  }
}

(async () => {
  const ctx = await setup();
  // Warm-up: one of each so first-hit compilation/cache fill does not count.
  for (const op of OPS.filter((o) => !o.name.startsWith("WRITE"))) await op.run(ctx).then((r) => r.arrayBuffer()).catch(() => null);
  for (const r of RATES) await stage(ctx, r);
  await prisma.$disconnect();
})();
