/**
 * Data migration for automatic location verification.
 *
 * 1. Re-anchors every unit to its compound's centre — a unit's location is always its
 *    compound's, and rows created before that rule may hold an owner-dropped pin.
 * 2. Runs the location check on every listing and stores the verdict
 *    (`locationStatus`, `locationIssuesJson`, `locationCheckedAt`).
 *
 * Idempotent: units already at their compound are left alone, and re-running the check
 * just rewrites the same verdict. Safe to run again after re-mapping a compound.
 *
 *   npx tsx prisma/backfillLocation.ts
 */
import { PrismaClient } from "@prisma/client";
import { checkListingLocation, compoundPoint } from "../src/lib/locationCheck";

const prisma = new PrismaClient();

async function main() {
  // --- 1. Units -------------------------------------------------------------
  const units = await prisma.unit.findMany({
    where: { compoundId: { not: null } },
    select: { id: true, lat: true, lng: true, compound: { select: { centerLat: true, centerLng: true } } },
  });
  let moved = 0;
  for (const u of units) {
    const p = compoundPoint(u.compound);
    if (p.lat === null || (u.lat === p.lat && u.lng === p.lng)) continue;
    await prisma.unit.update({ where: { id: u.id }, data: { lat: p.lat, lng: p.lng } });
    moved++;
  }

  // --- 2. Listings ----------------------------------------------------------
  const listings = await prisma.listing.findMany({
    select: {
      id: true,
      status: true,
      unit: {
        select: {
          lat: true,
          lng: true,
          compound: { select: { nameAr: true, nameEn: true, centerLat: true, centerLng: true, geomJson: true } },
        },
      },
      media: { select: { id: true, source: true, gpsLat: true, gpsLng: true } },
    },
  });

  let verified = 0;
  let issues = 0;
  const byCode = new Map<string, number>();
  const now = new Date();

  for (const l of listings) {
    const r = checkListingLocation({ unit: l.unit, compound: l.unit.compound, media: l.media });
    await prisma.listing.update({
      where: { id: l.id },
      data: {
        locationStatus: r.status,
        locationIssuesJson: r.issues.length ? JSON.stringify(r.issues) : null,
        locationCheckedAt: now,
      },
    });
    if (r.status === "verified") verified++;
    else issues++;
    for (const i of r.issues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
  }

  console.log(`units re-anchored to their compound: ${moved} of ${units.length}`);
  console.log(`listings checked: ${listings.length} — verified ${verified}, with issues ${issues}`);
  for (const [code, n] of [...byCode].sort((a, b) => b[1] - a[1])) console.log(`  ${code}: ${n}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
