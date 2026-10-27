import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { parseJson } from "@/lib/json";

/** GET /api/compounds — the curated location taxonomy for pickers in both clients. */
export async function GET() {
  const compounds = await prisma.compound.findMany({
    include: {
      area: { select: { slug: true, nameAr: true, nameEn: true, city: true } },
      _count: { select: { units: true } },
    },
    orderBy: { nameEn: "asc" },
  });

  return ok({
    compounds: compounds.map((c) => ({
      id: c.id,
      slug: c.slug,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      developer: c.developer,
      // The app's listing wizard sends this with a draft (the server re-derives it anyway).
      areaId: c.areaId,
      area: c.area,
      centerLat: c.centerLat,
      centerLng: c.centerLng,
      minSizeSqm: c.minSizeSqm,
      maxSizeSqm: c.maxSizeSqm,
      unitTypes: parseJson<string[]>(c.unitTypesJson, []),
      units: c._count.units,
    })),
  });
}
