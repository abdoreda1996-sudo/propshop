import { prisma } from "./prisma";
import { checkListingLocation, LocationIssue, LocationResult, LocationStatus } from "./locationCheck";

/**
 * Run the automatic location check for one listing and store the verdict on it.
 *
 * Called on draft creation, whenever media is added or removed, on submit and on
 * approval — every moment the evidence can change. Cheap: one listing, its compound and
 * its photos. Never throws into the caller's request: a failed check leaves the previous
 * verdict in place rather than failing the owner's upload.
 */
export async function runLocationCheck(listingId: string): Promise<LocationResult | null> {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
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
    if (!listing) return null;

    const result = checkListingLocation({
      unit: { lat: listing.unit.lat, lng: listing.unit.lng },
      compound: listing.unit.compound,
      media: listing.media,
    });

    await prisma.listing.update({
      where: { id: listingId },
      data: {
        locationStatus: result.status,
        locationIssuesJson: result.issues.length ? JSON.stringify(result.issues) : null,
        locationCheckedAt: new Date(),
      },
    });
    return result;
  } catch (err) {
    console.error("[locationCheck] failed for", listingId, err);
    return null;
  }
}

/** Parse the stored issue list; tolerant of null or a malformed value. */
export function parseLocationIssues(json: string | null | undefined): LocationIssue[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as LocationIssue[]) : [];
  } catch {
    return [];
  }
}

export type { LocationStatus };

/**
 * Listings whose location problem a reviewer should act on: submitted, live or reserved.
 * Drafts are excluded — the owner is still adding photos and the verdict will change.
 *
 * The one definition behind the nav count, the overview tile and the admin filter, so
 * the three can never quote different numbers.
 */
export const LOCATION_ISSUE_WHERE = {
  locationStatus: "issues",
  status: { in: ["pending_review", "live", "reserved"] },
};
