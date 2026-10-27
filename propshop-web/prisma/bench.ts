/**
 * Load benchmark — measures the queries that will decide whether this survives traffic.
 *
 *   npx tsx prisma/bench.ts            # measure against whatever is seeded
 *   npx tsx prisma/bench.ts --grow 20000   # bulk-insert up to N listings first
 *
 * The point is to find which query degrades with row count, not to produce a pretty
 * number. Every timing is the median of several runs, because a single cold run mostly
 * measures the filesystem.
 *
 * Bulk-inserted rows are tagged `BENCH-` in their reference so `--clean` can remove
 * exactly what this created and nothing else.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const growTo = args.includes("--grow") ? Number(args[args.indexOf("--grow") + 1]) : 0;
const clean = args.includes("--clean");

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function time(label: string, fn: () => Promise<unknown>, runs = 5) {
  await fn(); // warm
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn();
    times.push(performance.now() - t0);
  }
  const ms = median(times);
  const flag = ms > 500 ? "  ⚠ SLOW" : ms > 150 ? "  ~" : "";
  console.log(`  ${label.padEnd(48)} ${ms.toFixed(0).padStart(6)} ms${flag}`);
  return ms;
}

/** Bulk-insert listings cloned from the seeded ones, to reach a realistic row count. */
async function grow(target: number) {
  const current = await prisma.listing.count();
  if (current >= target) {
    console.log(`already at ${current} listings`);
    return;
  }

  const units = await prisma.unit.findMany({ select: { id: true }, take: 500 });
  const templates = await prisma.listing.findMany({
    where: { status: "live" },
    take: 200,
    select: { unitId: true, purpose: true, price: true, paymentType: true, titleAr: true, titleEn: true },
  });
  if (templates.length === 0) throw new Error("run `npm run seed` first");

  const need = target - current;
  console.log(`inserting ${need} listings…`);

  // createMany in batches: one statement per batch rather than per row.
  const BATCH = 1000;
  let made = 0;
  while (made < need) {
    const rows = [];
    for (let i = 0; i < Math.min(BATCH, need - made); i++) {
      const t = templates[(made + i) % templates.length];
      const daysAgo = (made + i) % 180;
      rows.push({
        reference: `BENCH-${Date.now().toString(36)}-${made + i}`,
        unitId: t.unitId,
        purpose: t.purpose,
        price: Math.round(Number(t.price) * (0.7 + ((made + i) % 60) / 100)),
        paymentType: t.paymentType,
        status: "live",
        trustLevel: 3,
        titleAr: t.titleAr,
        titleEn: t.titleEn,
        publishedAt: new Date(Date.now() - daysAgo * 86400_000),
      });
    }
    await prisma.listing.createMany({ data: rows });
    made += rows.length;
    process.stdout.write(`\r  ${made}/${need}`);
  }
  console.log(`\n  done — ${await prisma.listing.count()} listings total`);
  void units;
}

async function cleanup() {
  const { count } = await prisma.listing.deleteMany({ where: { reference: { startsWith: "BENCH-" } } });
  console.log(`removed ${count} benchmark listings`);
}

const PUBLIC = { status: "live", trustLevel: { gte: 2 } } as const;

const CARD_INCLUDE = {
  unit: { include: { compound: true, area: true } },
  media: { orderBy: [{ isCover: "desc" as const }, { sortOrder: "asc" as const }], take: 1 },
  fairPrice: { orderBy: { computedAt: "desc" as const }, take: 1 },
  _count: { select: { media: true } },
};

async function main() {
  if (clean) return cleanup();
  if (growTo) await grow(growTo);

  const listings = await prisma.listing.count();
  const media = await prisma.listingMedia.count();
  console.log(`\n=== ${listings} listings, ${media} media rows ===\n`);

  console.log("SEARCH (the hot path)");
  await time("page 1, no filters", () =>
    prisma.listing.findMany({ where: PUBLIC, include: CARD_INCLUDE, orderBy: [{ publishedAt: "desc" }], take: 24 }),
  );
  await time("count() for pagination total", () => prisma.listing.count({ where: PUBLIC }));
  await time("page 1 + count (what /search actually does)", async () => {
    await Promise.all([
      prisma.listing.count({ where: PUBLIC }),
      prisma.listing.findMany({ where: PUBLIC, include: CARD_INCLUDE, orderBy: [{ publishedAt: "desc" }], take: 24 }),
    ]);
  });
  await time("deep page (skip 2400)", () =>
    prisma.listing.findMany({
      where: PUBLIC,
      include: CARD_INCLUDE,
      orderBy: [{ publishedAt: "desc" }],
      skip: 2400,
      take: 24,
    }),
  );
  await time("price range filter", () =>
    prisma.listing.findMany({
      where: { ...PUBLIC, price: { gte: 5_000_000, lte: 15_000_000 } },
      include: CARD_INCLUDE,
      orderBy: [{ publishedAt: "desc" }],
      take: 24,
    }),
  );
  await time("free-text search (contains)", () =>
    prisma.listing.findMany({
      where: {
        ...PUBLIC,
        OR: [
          { unit: { compound: { OR: [{ nameAr: { contains: "ميفيدا" } }, { nameEn: { contains: "Mivida" } }] } } },
          { unit: { area: { OR: [{ nameAr: { contains: "ميفيدا" } }, { nameEn: { contains: "Mivida" } }] } } },
          { titleAr: { contains: "ميفيدا" } },
          { titleEn: { contains: "Mivida" } },
        ],
      },
      include: CARD_INCLUDE,
      take: 24,
    }),
  );

  console.log("\nHOME / DISCOVER");
  // The new shape: ordered by the denormalised counter instead of a relation aggregate.
  await time("top compounds NEW (denormalised counter)", () =>
    prisma.compound.findMany({
      where: { liveListingCount: { gt: 0 } },
      orderBy: { liveListingCount: "desc" },
      take: 10,
      select: {
        id: true,
        _count: { select: { units: true } },
        units: {
          where: { listings: { some: PUBLIC } },
          take: 1,
          select: { listings: { where: PUBLIC, take: 1, select: { media: { take: 1 } } } },
        },
      },
    }),
  );
  await time("top compounds OLD (relation _count sort)", () =>
    prisma.compound.findMany({
      where: { units: { some: { listings: { some: PUBLIC } } } },
      orderBy: { units: { _count: "desc" } },
      take: 10,
      select: {
        id: true,
        _count: { select: { units: true } },
        units: {
          where: { listings: { some: PUBLIC } },
          take: 1,
          select: { listings: { where: PUBLIC, take: 1, select: { media: { take: 1 } } } },
        },
      },
    }),
  );
  await time("public listing count (the hero counter)", () => prisma.listing.count({ where: PUBLIC }));

  console.log("\nWRITES");
  const one = await prisma.listing.findFirst({ where: PUBLIC, select: { id: true } });
  if (one) {
    await time("incrementViews (fires on EVERY page view)", () =>
      prisma.listing.update({ where: { id: one.id }, data: { views: { increment: 1 } } }),
    );
  }

  console.log("\nDETAIL");
  const ref = await prisma.listing.findFirst({ where: PUBLIC, select: { reference: true } });
  if (ref) {
    await time("listing detail (full include)", () =>
      prisma.listing.findUnique({
        where: { reference: ref.reference },
        include: {
          unit: { include: { compound: { include: { area: true } }, area: true, owner: true } },
          media: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] },
          priceHistory: { orderBy: { changedAt: "asc" } },
          fairPrice: { orderBy: { computedAt: "desc" }, take: 1 },
        },
      }),
    );
  }

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
