/**
 * Concurrency probe — does the database survive simultaneous users?
 *
 *   npx tsx prisma/concurrency.ts [concurrent]
 *
 * Throughput numbers from bench.ts are measured one query at a time, which is not how
 * traffic arrives. This fires N operations at once and reports failures and tail latency.
 *
 * It matters most for WRITES. SQLite allows exactly one writer at a time for the whole
 * file: concurrent writes serialise and, past a timeout, fail with SQLITE_BUSY. A read
 * benchmark will never show that.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONCURRENT = Number(process.argv[2] ?? 50);

type Result = { ok: number; failed: number; errors: Map<string, number>; p50: number; p95: number; max: number };

async function burst(label: string, make: (i: number) => Promise<unknown>, n = CONCURRENT): Promise<Result> {
  const times: number[] = [];
  const errors = new Map<string, number>();
  let ok = 0;
  let failed = 0;

  const started = performance.now();
  await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const t0 = performance.now();
      try {
        await make(i);
        ok++;
        times.push(performance.now() - t0);
      } catch (e) {
        failed++;
        const msg = (e as Error).message.split("\n")[0].slice(0, 70);
        errors.set(msg, (errors.get(msg) ?? 0) + 1);
      }
    }),
  );
  const wall = performance.now() - started;

  const sorted = times.sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
  const res = { ok, failed, errors, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0 };

  const status = failed > 0 ? "FAILED" : "ok";
  console.log(
    `  ${label.padEnd(40)} ${String(ok).padStart(4)} ok  ${String(failed).padStart(4)} fail  ` +
      `p50 ${res.p50.toFixed(0).padStart(5)}ms  p95 ${res.p95.toFixed(0).padStart(5)}ms  ` +
      `wall ${wall.toFixed(0)}ms  ${status}`,
  );
  for (const [msg, count] of res.errors) console.log(`      ${count}x ${msg}`);
  return res;
}

const PUBLIC = { status: "live", trustLevel: { gte: 2 } } as const;

async function main() {
  const total = await prisma.listing.count();
  console.log(`\n=== ${total} listings · ${CONCURRENT} concurrent operations ===\n`);

  const ids = (await prisma.listing.findMany({ where: PUBLIC, select: { id: true }, take: 50 })).map((l) => l.id);
  if (ids.length === 0) throw new Error("run `npm run seed` first");

  console.log("READS");
  await burst("search page 1", () =>
    prisma.listing.findMany({
      where: PUBLIC,
      include: { unit: { include: { compound: true, area: true } }, media: { take: 1 } },
      orderBy: [{ publishedAt: "desc" }],
      take: 24,
    }),
  );
  await burst("listing detail", (i) =>
    prisma.listing.findUnique({ where: { id: ids[i % ids.length] }, include: { media: true, unit: true } }),
  );

  console.log("\nWRITES — the real test");
  // Every listing page view does exactly this today.
  await burst("incrementViews on DIFFERENT rows", (i) =>
    prisma.listing.update({ where: { id: ids[i % ids.length] }, data: { views: { increment: 1 } } }),
  );
  // A popular listing: everyone hits the same row.
  await burst("incrementViews on ONE hot row", () =>
    prisma.listing.update({ where: { id: ids[0] }, data: { views: { increment: 1 } } }),
  );

  console.log("\nMIXED — reads and writes together, as real traffic arrives");
  await burst("50/50 read+write", (i) =>
    i % 2 === 0
      ? prisma.listing.findMany({ where: PUBLIC, take: 24, orderBy: [{ publishedAt: "desc" }] })
      : prisma.listing.update({ where: { id: ids[i % ids.length] }, data: { views: { increment: 1 } } }),
  );

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
