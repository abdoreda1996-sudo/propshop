/**
 * Tops a grown bench database up to a target number of LIVE listings.
 *
 *   DATABASE_URL=<bench copy> npx tsx prisma/growListings.ts 50000
 *
 * The catalogue is sized for 40,000+ listings; growScale.ts builds 20,000. This adds the
 * rest in the same shape — one live listing per unit, two photos each, owners holding at
 * most 2 units (promoting more bench buyers to owners) — so search, detail and cache
 * behaviour are measured at the size the product is built for. Idempotent: run it again
 * with a bigger target to grow further. Refuses anything that is not a bench copy.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("bench")) {
  console.error(`refusing to grow ${url || "(default)"} — point DATABASE_URL at a bench copy`);
  process.exit(1);
}

const TARGET = Number(process.argv[2] ?? 50_000);
const REF_BASE = 720_000; // growScale.ts uses AQ-700000…719999
const UNITS_PER_OWNER = 2;
const prisma = new PrismaClient();
const id = () => "g" + randomBytes(12).toString("hex");
const pick = <T>(a: readonly T[], i: number) => a[i % a.length];
const TYPES = ["apartment", "apartment", "apartment", "villa", "townhouse", "duplex", "studio", "chalet"] as const;
const FINISH = ["core_shell", "semi_finished", "fully_finished", "furnished"] as const;
const ROOMS = ["living", "bedroom", "kitchen", "bathroom", "facade", "view"] as const;

async function main() {
  const live = await prisma.listing.count({ where: { status: "live" } });
  const add = TARGET - live;
  if (add <= 0) return console.log(`already ${live} live listings (target ${TARGET})`);

  // Continue numbering after any earlier top-up.
  const already = await prisma.listing.count({ where: { reference: { startsWith: "AQ-72" } } });
  const compounds = await prisma.compound.findMany({ select: { id: true, areaId: true, centerLat: true, centerLng: true, minSizeSqm: true } });
  const photo = await prisma.listingMedia.findFirst({ select: { fileKey: true, thumbKey: true } });

  // New owners: bench buyers with no units yet, promoted (owners need trust level 2 to list).
  const ownersNeeded = Math.ceil(add / UNITS_PER_OWNER);
  const owners = await prisma.user.findMany({
    where: { email: { endsWith: "@load.test" }, role: "buyer", units: { none: {} } },
    select: { id: true },
    orderBy: { publicRef: "desc" },
    take: ownersNeeded,
  });
  if (owners.length < ownersNeeded) throw new Error(`need ${ownersNeeded} spare bench users, found ${owners.length}`);
  for (let i = 0; i < owners.length; i += 5000) {
    await prisma.user.updateMany({ where: { id: { in: owners.slice(i, i + 5000).map((o) => o.id) } }, data: { role: "owner", trustLevel: 2 } });
  }
  console.log(`${live} live → adding ${add} (promoted ${owners.length} owners)`);

  const t0 = Date.now();
  const SIZE = 2000;
  for (let start = 0; start < add; start += SIZE) {
    const n = Math.min(SIZE, add - start);
    const units = [], listings = [], media = [];
    for (let j = 0; j < n; j++) {
      const i = already + start + j; // global index → stable references
      const c = pick(compounds, i);
      const unitId = id(), listingId = id();
      units.push({
        id: unitId,
        ownerId: owners[Math.floor((start + j) / UNITS_PER_OWNER)].id,
        compoundId: c.id,
        areaId: c.areaId,
        unitFingerprint: "bench" + unitId,
        building: `B${i % 40}`,
        floor: i % 12,
        unitNumber: `X${i}`,
        type: pick(TYPES, i),
        bedrooms: 1 + (i % 5),
        bathrooms: 1 + (i % 3),
        sizeSqm: (c.minSizeSqm ?? 90) + (i % 150),
        finishing: pick(FINISH, i),
        deliveryStatus: i % 4 === 0 ? "under_construction" : "ready",
        lat: c.centerLat,
        lng: c.centerLng,
      });
      listings.push({
        id: listingId,
        reference: `AQ-${REF_BASE + i}`,
        unitId,
        purpose: i % 7 === 0 ? "rent" : "sale",
        price: i % 7 === 0 ? 20_000 + (i % 90) * 1000 : 3_000_000 + (i % 400) * 75_000,
        paymentType: pick(["cash", "installments", "resale_installments"] as const, i),
        status: "live",
        trustLevel: 3,
        titleAr: `وحدة ${REF_BASE + i}`,
        titleEn: `Unit ${REF_BASE + i}`,
        publishedAt: new Date(Date.now() - (i % 180) * 86_400_000),
        expiresAt: new Date(Date.now() + 40 * 86_400_000),
        openToTrade: false,
        locationStatus: "verified",
      });
      for (let k = 0; k < 2; k++) {
        media.push({
          id: id(),
          listingId,
          fileKey: photo?.fileKey ?? "https://picsum.photos/1200/800",
          thumbKey: photo?.thumbKey ?? null,
          source: "in_app",
          room: pick(ROOMS, i * 2 + k),
          isVerified: true,
          isCover: k === 0,
          sortOrder: k,
        });
      }
    }
    await prisma.unit.createMany({ data: units });
    await prisma.listing.createMany({ data: listings });
    await prisma.listingMedia.createMany({ data: media });
    process.stdout.write(`\r  listings ${start + n}/${add}`);
  }
  process.stdout.write("\n");
  // Fresh statistics so the planner sees the new table sizes.
  await prisma.$executeRawUnsafe(`ANALYZE "Unit"; ANALYZE "Listing"; ANALYZE "ListingMedia";`).catch(() =>
    Promise.all(["Unit", "Listing", "ListingMedia"].map((t) => prisma.$executeRawUnsafe(`ANALYZE "${t}"`))),
  );
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${await prisma.listing.count({ where: { status: "live" } })} live listings`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
