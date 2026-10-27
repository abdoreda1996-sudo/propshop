/**
 * Demo trade listings — opens a handful of live, verified units to trade, from different
 * owners, with different requirements, so the trade market and the "your unit fits"
 * suggestions have something real to show.
 *
 * Idempotent: re-running updates the same listings' preferences rather than adding more.
 * Run: npx tsx prisma/seedTrades.ts   (seed.ts also calls it)
 */
import { PrismaClient } from "@prisma/client";

const DEMO_WANTS: {
  type: string; // the unit being opened to trade
  wants: { types: string[]; minBedrooms?: number; minValue?: number; maxValue?: number; cash: string; note: string };
}[] = [
  { type: "apartment", wants: { types: ["villa", "townhouse"], cash: "i_pay", note: "عايز أكبّر — شقتي + فرق فلوس قصاد تاون هاوس أو فيلا." } },
  { type: "villa", wants: { types: ["apartment", "duplex"], minBedrooms: 3, cash: "i_receive", note: "عايز أصغّر لشقة واسعة قريبة من الخدمات، والفرق يرجعلي كاش." } },
  { type: "townhouse", wants: { types: ["villa"], cash: "either", note: "مقايضة بفيلا في نفس المنطقة أو قريب." } },
  { type: "apartment", wants: { types: ["apartment"], minBedrooms: 2, cash: "none", note: "شقة قصاد شقة في منطقة تانية — من غير فلوس." } },
  { type: "duplex", wants: { types: ["apartment", "villa", "townhouse"], cash: "either", note: "مفتوح لأي عرض مناسب." } },
  { type: "chalet", wants: { types: ["apartment"], cash: "i_receive", note: "شاليه الساحل قصاد شقة في القاهرة." } },
];

export async function seedTrades(prisma: PrismaClient) {
  const used = new Set<string>(); // one per owner, so the market shows several people
  let opened = 0;
  for (const demo of DEMO_WANTS) {
    const listing = await prisma.listing.findFirst({
      where: {
        status: "live",
        trustLevel: { gte: 2 },
        unit: { type: demo.type, ownerId: { notIn: [...used] }, owner: { isBlocked: false } },
        offers: { none: { status: "pending" } },
      },
      select: { id: true, price: true, unit: { select: { ownerId: true } } },
      orderBy: { publishedAt: "desc" },
    });
    if (!listing) continue;
    used.add(listing.unit.ownerId);
    const data = {
      typesJson: JSON.stringify(demo.wants.types),
      areaIdsJson: "[]",
      minBedrooms: demo.wants.minBedrooms ?? null,
      minSizeSqm: null,
      minValue: demo.wants.minValue ?? null,
      maxValue: demo.wants.maxValue ?? null,
      cash: demo.wants.cash,
      note: demo.wants.note,
    };
    await prisma.$transaction([
      prisma.listing.update({ where: { id: listing.id }, data: { openToTrade: true } }),
      prisma.tradePreference.upsert({ where: { listingId: listing.id }, create: { listingId: listing.id, ...data }, update: data }),
    ]);
    opened++;
  }
  return opened;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedTrades(prisma)
    .then((n) => console.log(`opened ${n} demo units to trade`))
    .finally(() => prisma.$disconnect());
}
