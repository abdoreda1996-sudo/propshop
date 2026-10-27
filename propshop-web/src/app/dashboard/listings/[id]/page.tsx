import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/json";
import { MAX_ACTIVE_LISTINGS_PER_IDENTITY, OWNERSHIP_DOC_TYPES, REQUIRED_ROOMS, Room } from "@/lib/enums";
import { COVER_FIRST } from "@/lib/cover";
import ListingWizard from "@/components/ListingWizard";
import { validateListing } from "@/lib/listingFlow";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "كمّل إعلانك", en: "Finish your listing" });
}
export const dynamic = "force-dynamic";

/**
 * Continue a draft (or fix a rejected listing). The "Continue" button on My properties
 * linked here, and the page did not exist — every draft was a dead end on the web. The app
 * resumes the same drafts via ListUnitScreen(resumeListingId).
 */
export default async function ContinueListingPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, locale, { id }] = await Promise.all([getSession(), getLocale(), params]);
  if (!session) redirect(`/login?next=/dashboard/listings/${id}`);

  const listing = await prisma.listing.findFirst({
    where: { OR: [{ id }, { reference: id }], unit: { ownerId: session.id } },
    select: {
      id: true,
      reference: true,
      status: true,
      unit: { select: { compoundId: true } },
      media: { orderBy: COVER_FIRST, select: { id: true, room: true, fileKey: true, thumbKey: true, isCover: true, source: true } },
      kycDocuments: { where: { type: { in: [...OWNERSHIP_DOC_TYPES] } }, select: { id: true } },
    },
  });
  // Someone else's listing is a 404, not a 403: do not confirm it exists.
  if (!listing) notFound();
  // Only drafts and rejected listings are editable; anything else goes back to the list.
  if (!["draft", "rejected"].includes(listing.status)) redirect("/dashboard/listings");

  const [areas, compounds, activeCount, fees, validation] = await Promise.all([
    prisma.area.findMany({ orderBy: { nameEn: "asc" } }),
    prisma.compound.findMany({ orderBy: { nameEn: "asc" } }),
    prisma.listing.count({ where: { unit: { ownerId: session.id }, status: { in: ["live", "pending_review", "paused"] } } }),
    prisma.feeConfig.findMany(),
    validateListing(listing.id),
  ]);
  const photoFee = fees.find((f) => f.key === "photo_package");
  // Only in-app (GPS) photos satisfy the rooms requirement, so only they count as captured.
  const capturedRooms = [
    ...new Set(listing.media.filter((m) => m.source === "in_app" && m.room).map((m) => m.room as string)),
  ].filter((r): r is Room => (REQUIRED_ROOMS as readonly string[]).includes(r));

  return (
    <ListingWizard
      locale={locale}
      areas={areas.map((a) => ({ id: a.id, slug: a.slug, nameAr: a.nameAr, nameEn: a.nameEn }))}
      compounds={compounds.map((c) => ({
        id: c.id,
        areaId: c.areaId,
        slug: c.slug,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        developer: c.developer,
        minSizeSqm: c.minSizeSqm,
        maxSizeSqm: c.maxSizeSqm,
        unitTypes: parseJson<string[]>(c.unitTypesJson, []),
        centerLat: c.centerLat,
        geomJson: c.geomJson,
        centerLng: c.centerLng,
      }))}
      fees={{ photo: photoFee ? { amount: photoFee.amount } : null }}
      remainingSlots={MAX_ACTIVE_LISTINGS_PER_IDENTITY - activeCount}
      resume={{
        listingId: listing.id,
        reference: listing.reference,
        compoundId: listing.unit.compoundId,
        capturedRooms,
        photos: listing.media.map((m) => ({ id: m.id, room: m.room, fileKey: m.fileKey, thumbKey: m.thumbKey })),
        coverId: listing.media.find((m) => m.isCover)?.id ?? null,
        docUploaded: listing.kycDocuments.length > 0,
        validation: validation ? JSON.parse(JSON.stringify(validation)) : null,
      }}
    />
  );
}
