/**
 * Data migration for the `ListingMedia.isCover` column.
 *
 * The column is additive — a listing with no cover falls back to the lowest sortOrder —
 * so nothing breaks without this. It exists so listings created before the column
 * existed get the *good* photo on their card rather than whichever room the owner
 * happened to shoot first.
 *
 * Idempotent: a listing that already has a cover is left alone, so it is safe to re-run.
 *
 *   npx tsx prisma/backfillCover.ts
 */
import { PrismaClient } from "@prisma/client";
import { suggestCover } from "../src/lib/cover";

const prisma = new PrismaClient();

async function main() {
  const listings = await prisma.listing.findMany({
    select: {
      id: true,
      unit: { select: { type: true } },
      media: { select: { id: true, room: true, isCover: true, isVerified: true, sortOrder: true } },
    },
  });

  let set = 0;
  let already = 0;
  let noMedia = 0;

  for (const l of listings) {
    if (l.media.length === 0) {
      noMedia++;
      continue;
    }
    if (l.media.some((m) => m.isCover)) {
      already++;
      continue;
    }
    const pick = suggestCover(l.media, l.unit.type);
    if (!pick) continue;
    await prisma.listingMedia.update({ where: { id: pick.id }, data: { isCover: true } });
    set++;
  }

  const byRoom = await prisma.listingMedia.groupBy({ by: ["room"], where: { isCover: true }, _count: true });
  console.log({ listings: listings.length, set, already, noMedia });
  console.log("cover rooms:", byRoom.map((r) => `${r.room}=${r._count}`).join(" "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
