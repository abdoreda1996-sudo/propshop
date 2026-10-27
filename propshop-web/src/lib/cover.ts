/**
 * Cover photo — the single image that represents a unit wherever only one is shown:
 * the search card, the owner's dashboard, the app, a share preview.
 *
 * Before this existed, every one-photo surface took `media[0]`, i.e. whichever photo the
 * owner happened to capture first. That is the living room for most listings, because
 * the capture checklist lists it first — so the card sold the sofa, not the property.
 *
 * Two rules, kept here and nowhere else:
 *   1. A listing has at most one photo with `isCover`. Setting a new one clears the old
 *      one in the same transaction (SQLite has no partial unique index, so the database
 *      cannot enforce this for us).
 *   2. When nothing is flagged — every listing seeded or captured before this shipped —
 *      the cover falls back to the lowest `sortOrder`. That keeps the feature additive:
 *      no backfill is required for a listing to render.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Order media so the cover comes first, then capture order.
 *
 * `isCover: "desc"` works because SQLite stores booleans as 0/1 and Postgres orders
 * false < true, so descending puts the flagged row first in both.
 *
 * Used with `take: 1` this is what makes "the cover" a single indexed read rather than
 * fetching every photo to pick one.
 */
export const COVER_FIRST: Prisma.ListingMediaOrderByWithRelationInput[] = [
  { isCover: "desc" },
  { sortOrder: "asc" },
];

type CoverCandidate = { isCover?: boolean; sortOrder?: number };

/**
 * Pick the cover from an already-loaded list, applying rule 2.
 *
 * For a list fetched with COVER_FIRST this is just the first element, but callers that
 * loaded media in another order (or mutated it client-side) get the same answer.
 */
export function coverOf<T extends CoverCandidate>(media: T[]): T | null {
  if (media.length === 0) return null;
  const flagged = media.find((m) => m.isCover);
  if (flagged) return flagged;
  return media.reduce((lowest, m) => ((m.sortOrder ?? 0) < (lowest.sortOrder ?? 0) ? m : lowest), media[0]);
}

/**
 * Preference order for choosing a cover automatically — and it depends on what is being
 * sold.
 *
 * For a villa, townhouse or chalet the buyer is buying the building, so the facade is
 * the photo that answers "is this the kind of place I want?". For an apartment the
 * facade is a shared block that looks like every other block in the compound and says
 * nothing about the unit; the living room does the work. Ranking by facade everywhere
 * turns a results page into a wall of identical exteriors.
 *
 * The bathroom ranks last in both: it is on the required-rooms checklist for
 * verification, not because it sells anything.
 */
const WHOLE_PROPERTY_TYPES = new Set(["villa", "townhouse", "twinhouse", "duplex", "chalet"]);

const ROOM_RANK_EXTERIOR: Record<string, number> = {
  facade: 0,
  view: 1,
  living: 2,
  kitchen: 3,
  bedroom: 4,
  bathroom: 5,
};

const ROOM_RANK_INTERIOR: Record<string, number> = {
  living: 0,
  view: 1,
  kitchen: 2,
  bedroom: 3,
  facade: 4,
  bathroom: 5,
};

export function coverRoomRank(unitType?: string | null): Record<string, number> {
  return WHOLE_PROPERTY_TYPES.has(unitType ?? "") ? ROOM_RANK_EXTERIOR : ROOM_RANK_INTERIOR;
}

/**
 * The photo we would pick if the owner does not. Verified photos outrank unverified
 * ones — an unverified upload must never become the face of a "verified" listing —
 * then the room ranking for this unit type, then capture order.
 */
export function suggestCover<T extends CoverCandidate & { room?: string | null; isVerified?: boolean }>(
  media: T[],
  unitType?: string | null,
): T | null {
  if (media.length === 0) return null;
  const rank = coverRoomRank(unitType);
  const score = (m: T) => [m.isVerified === false ? 1 : 0, rank[m.room ?? ""] ?? 9, m.sortOrder ?? 0];
  return [...media].sort((a, b) => {
    const [av, arank, aorder] = score(a);
    const [bv, brank, border] = score(b);
    return av - bv || arank - brank || aorder - border;
  })[0];
}

export type SetCoverResult = { ok: true; mediaId: string } | { ok: false; error: "not_found" };

/**
 * Flag one photo as the cover, clearing any previous one. Rule 1 lives here.
 *
 * The clear and the set are one transaction: a failure between them would leave the
 * listing with no cover at all, which silently falls back to `media[0]` — the exact
 * behaviour the owner was trying to change.
 */
export async function setCoverMedia(listingId: string, mediaId: string): Promise<SetCoverResult> {
  const target = await prisma.listingMedia.findFirst({
    where: { id: mediaId, listingId },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "not_found" };

  await prisma.$transaction([
    prisma.listingMedia.updateMany({
      where: { listingId, isCover: true, NOT: { id: mediaId } },
      data: { isCover: false },
    }),
    prisma.listingMedia.update({ where: { id: mediaId }, data: { isCover: true } }),
  ]);

  return { ok: true, mediaId };
}
