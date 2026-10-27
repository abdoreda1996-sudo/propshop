/**
 * Owner listing flow — draft → pending_review → live, with the hard validation layer
 * (Section 6c) enforced on the server. The client wizard shows the same checks, but the
 * gate here is the one that counts: publishing is impossible if any check fails.
 */

import { prisma } from "./prisma";
import { compoundPoint } from "./locationCheck";
import { runLocationCheck } from "./locationService";
import { validateForPublish, ValidationSnapshot, ValidationResult } from "./listingValidation";
import { buildUnitFingerprint } from "./fingerprint";
import { canTransition, MAX_ACTIVE_LISTINGS_PER_IDENTITY, OWNERSHIP_DOC_TYPES } from "./enums";
import { parseJson } from "./json";
import { nextReference } from "./api";
import { computeFairPriceForListing } from "./fairPriceService";
import { suggestCover, setCoverMedia } from "./cover";
import { onListingVisibilityChanged } from "./catalogue";
import { notifyTradeRequestMatches } from "./tradeRequestService";

/** Counts against the per-identity cap once a listing is public or awaiting publication. */
const ACTIVE_STATUSES = ["live", "pending_review", "paused"];

/**
 * Drafts are not public, so they do not count as "active" at the publish gate. They are
 * still capped at draft-creation time: without this an account could accumulate unlimited
 * units in progress, which is exactly the inventory-building behaviour the 3-listing rule
 * exists to stop.
 */
export const IN_FLIGHT_STATUSES = [...ACTIVE_STATUSES, "draft"];

/**
 * Assembles everything the pure validator needs. Kept separate so the same snapshot can
 * be shown to the owner in the wizard and to the reviewer in the admin queue.
 */
export async function buildValidationSnapshot(listingId: string): Promise<ValidationSnapshot | null> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: {
      unit: {
        include: {
          compound: true,
          owner: {
            select: { id: true, fullName: true, nationalIdHash: true, trustLevel: true, strikes: true, isBlocked: true },
          },
        },
      },
      media: true,
      kycDocuments: true,
    },
  });
  if (!listing) return null;

  const owner = listing.unit.owner;
  const activeListingCount = await prisma.listing.count({
    where: { unit: { ownerId: owner.id }, status: { in: ACTIVE_STATUSES }, id: { not: listingId } },
  });

  // The most recent ownership document attached to this listing.
  const doc =
    listing.kycDocuments
      .filter((d) => (OWNERSHIP_DOC_TYPES as readonly string[]).includes(d.type))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

  const compound = listing.unit.compound;

  return {
    owner: {
      trustLevel: owner.trustLevel,
      fullName: owner.fullName,
      nationalIdHash: owner.nationalIdHash,
      strikes: owner.strikes,
      isBlocked: owner.isBlocked,
      activeListingCount,
      listingCapOverride: null,
    },
    unit: {
      type: listing.unit.type,
      sizeSqm: listing.unit.sizeSqm,
      bedrooms: listing.unit.bedrooms,
      building: listing.unit.building,
      unitNumber: listing.unit.unitNumber,
      floor: listing.unit.floor,
      deliveryStatus: listing.unit.deliveryStatus,
      lat: listing.unit.lat,
      lng: listing.unit.lng,
      compoundId: listing.unit.compoundId,
    },
    compound: compound
      ? {
          id: compound.id,
          nameEn: compound.nameEn,
          nameAr: compound.nameAr,
          minSizeSqm: compound.minSizeSqm,
          maxSizeSqm: compound.maxSizeSqm,
          allowedUnitTypes: parseJson<string[]>(compound.unitTypesJson, []),
          geomJson: compound.geomJson,
        }
      : null,
    listing: {
      price: listing.price,
      purpose: listing.purpose,
      paymentType: listing.paymentType,
      descriptionAr: listing.descriptionAr,
      descriptionEn: listing.descriptionEn,
    },
    media: listing.media.map((m) => ({
      source: m.source,
      room: m.room,
      gpsLat: m.gpsLat,
      gpsLng: m.gpsLng,
      capturedAt: m.capturedAt,
      phash: m.phash,
      duplicateOf: null, // set by the media worker; see findDuplicatePhotos below
    })),
    ownershipDoc: doc
      ? {
          type: doc.type,
          status: doc.status,
          extracted: parseJson<ValidationSnapshot["ownershipDoc"] extends null ? never : any>(doc.extractedJson, null),
        }
      : null,
  };
}

/**
 * Duplicate detection (Section 5): a second listing carrying the same photo is blocked
 * and both accounts are flagged. Exact pHash match here; the worker will do Hamming
 * distance once the image pipeline lands.
 */
export async function findDuplicatePhotos(listingId: string): Promise<Map<number, string>> {
  const media = await prisma.listingMedia.findMany({ where: { listingId }, select: { phash: true } });
  const hashes = media.map((m) => m.phash).filter(Boolean) as string[];
  if (hashes.length === 0) return new Map();

  const collisions = await prisma.listingMedia.findMany({
    where: { phash: { in: hashes }, listingId: { not: listingId } },
    select: { phash: true, listingId: true },
  });

  const byHash = new Map(collisions.map((c) => [c.phash!, c.listingId]));
  const result = new Map<number, string>();
  media.forEach((m, i) => {
    if (m.phash && byHash.has(m.phash)) result.set(i, byHash.get(m.phash)!);
  });
  return result;
}

/** Runs the gate, including duplicate detection, and records the outcome on the listing. */
export async function validateListing(listingId: string): Promise<ValidationResult | null> {
  const snapshot = await buildValidationSnapshot(listingId);
  if (!snapshot) return null;

  const duplicates = await findDuplicatePhotos(listingId);
  duplicates.forEach((otherListingId, index) => {
    if (snapshot.media[index]) snapshot.media[index].duplicateOf = otherListingId;
  });

  const result = validateForPublish(snapshot);

  await prisma.listing.update({
    where: { id: listingId },
    data: { validationJson: JSON.stringify({ ...result, checkedAt: new Date().toISOString() }) },
  });

  return result;
}

export type PublishOutcome =
  | { ok: true; status: string; trustLevel: number }
  | { ok: false; reason: "not_found" | "forbidden" | "invalid_transition" | "validation_failed"; result?: ValidationResult };

/**
 * Submit for review. This is the only path from draft to pending_review, and it refuses
 * the transition outright when the gate fails.
 */
export async function submitForReview(listingId: string, actorId: string): Promise<PublishOutcome> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { unit: { select: { ownerId: true } } },
  });
  if (!listing) return { ok: false, reason: "not_found" };
  if (listing.unit.ownerId !== actorId) return { ok: false, reason: "forbidden" };
  if (!canTransition(listing.status, "pending_review")) return { ok: false, reason: "invalid_transition" };

  const result = await validateListing(listingId);
  if (!result || !result.canPublish) return { ok: false, reason: "validation_failed", result: result ?? undefined };

  await prisma.listing.update({
    where: { id: listingId },
    data: { status: "pending_review", rejectReason: null },
  });
  // Fresh verdict for the reviewer who picks this up.
  await runLocationCheck(listingId);

  return { ok: true, status: "pending_review", trustLevel: result.trustLevel };
}

/**
 * Reviewer approval. Re-runs the gate rather than trusting the snapshot taken at
 * submission time — the market, the compound ranges or a duplicate may have changed.
 */
export async function approveListing(listingId: string, reviewerId: string): Promise<PublishOutcome> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing) return { ok: false, reason: "not_found" };
  if (!canTransition(listing.status, "live")) return { ok: false, reason: "invalid_transition" };

  const result = await validateListing(listingId);
  if (!result || !result.canPublish) return { ok: false, reason: "validation_failed", result: result ?? undefined };

  const now = new Date();
  await prisma.listing.update({
    where: { id: listingId },
    data: {
      status: "live",
      trustLevel: result.trustLevel,
      publishedAt: listing.publishedAt ?? now,
      /*
        60 days, then the owner must reconfirm.

        This used to be "what the listing fee buys". Listing is now free, so the reason is
        no longer commercial — it is freshness. A catalogue that quietly fills with units
        that sold months ago destroys the one thing this marketplace sells, and an owner
        who cannot be bothered to reconfirm is usually an owner who no longer has the unit
        (brief Section 22: listing expiration and periodic seller reconfirmation).
      */
      expiresAt: new Date(now.getTime() + 60 * 86400_000),
      rejectReason: null,
    },
  });

  // Every live listing needs a cover, because the search card shows exactly one photo.
  // If the owner never picked one, choose the best candidate now rather than letting the
  // card fall back to whichever room was captured first.
  await ensureCover(listingId);
  await runLocationCheck(listingId);

  await prisma.priceHistory.create({ data: { listingId, price: listing.price, kind: "ask" } });
  await prisma.kycDocument.updateMany({
    where: { listingId, status: "pending" },
    data: { status: "approved", reviewerId, reviewedAt: now },
  });

  // A new live listing changes the comparable pool for its neighbours; recompute its own
  // estimate now and leave the rest to the nightly job.
  await computeFairPriceForListing(listingId).catch(() => {});

  // The public catalogue just changed: refresh the compound counter and drop cached
  // discover/search payloads so the listing appears immediately rather than after a TTL.
  await onListingVisibilityChanged(listingId);

  // Opened to trade before it was approved: owners whose trade request it fits hear now.
  // A no-op for a listing that is not open to trade; never throws.
  await notifyTradeRequestMatches(listingId);

  return { ok: true, status: "live", trustLevel: result.trustLevel };
}

export async function rejectListing(
  listingId: string,
  reviewerId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "invalid_transition" }> {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { status: true } });
  if (!listing) return { ok: false, reason: "not_found" };
  // Only a listing under review can be rejected; a draft was never submitted and a live
  // one is taken down through moderation, which also refreshes the public catalogue.
  if (!canTransition(listing.status, "rejected")) return { ok: false, reason: "invalid_transition" };
  await prisma.listing.update({
    where: { id: listingId },
    data: { status: "rejected", rejectReason: reason },
  });
  await prisma.kycDocument.updateMany({
    where: { listingId, status: "pending" },
    data: { status: "rejected", reviewerId, reviewedAt: new Date(), rejectReason: reason },
  });
  return { ok: true };
}

export type DraftInput = {
  compoundId?: string | null;
  areaId: string;
  building?: string | null;
  floor?: number | null;
  unitNumber?: string | null;
  type: string;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  landSqm?: number | null;
  finishing: string;
  deliveryStatus: string;
  deliveryDate?: string | null;
  view?: string | null;
  lat?: number | null;
  lng?: number | null;
  purpose: string;
  price: number;
  /** "بدون أوفر": sold at the original contract price, no premium on top. */
  withoutOver?: boolean;
  paymentType: string;
  installment?: unknown;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  titleAr?: string | null;
  titleEn?: string | null;
};

export type DraftOutcome =
  | { ok: true; listingId: string; reference: string }
  | { ok: false; reason: "duplicate_unit" | "cap_reached" | "blocked"; existingReference?: string };

/**
 * Creates the draft unit + listing. The unit_fingerprint UNIQUE constraint is what
 * actually guarantees one listing per unit; this checks it first so the owner gets a
 * clear message instead of a database error.
 */
export async function createDraft(ownerId: string, input: DraftInput): Promise<DraftOutcome> {
  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { isBlocked: true, strikes: true },
  });
  if (!owner || owner.isBlocked) return { ok: false, reason: "blocked" };

  const inFlightCount = await prisma.listing.count({
    where: { unit: { ownerId }, status: { in: IN_FLIGHT_STATUSES } },
  });
  if (inFlightCount >= MAX_ACTIVE_LISTINGS_PER_IDENTITY) return { ok: false, reason: "cap_reached" };

  /*
    The unit's location is ALWAYS its compound's. Whatever coordinates the client sent
    are ignored: an owner never places a pin, so there is nothing of theirs to trust and
    nothing for them to get wrong. Photos are what the location check then compares.
  */
  const compound = input.compoundId
    ? await prisma.compound.findUnique({
        where: { id: input.compoundId },
        select: { centerLat: true, centerLng: true },
      })
    : null;
  const point = compoundPoint(compound);

  const fingerprint = buildUnitFingerprint({
    compoundId: input.compoundId,
    areaId: input.areaId,
    building: input.building,
    floor: input.floor,
    unitNumber: input.unitNumber,
    type: input.type,
    sizeSqm: input.sizeSqm,
  });

  // Drafts count here too: two drafts of the same unit are a data-quality problem even
  // though only one of them could ever go live.
  const existing = await prisma.unit.findUnique({
    where: { unitFingerprint: fingerprint },
    include: { listings: { where: { status: { in: IN_FLIGHT_STATUSES } }, select: { reference: true } } },
  });
  if (existing && existing.listings.length > 0) {
    return { ok: false, reason: "duplicate_unit", existingReference: existing.listings[0].reference };
  }

  const unit =
    existing && existing.ownerId === ownerId
      ? existing
      : await prisma.unit.create({
          data: {
            ownerId,
            compoundId: input.compoundId ?? null,
            areaId: input.areaId,
            unitFingerprint: fingerprint,
            building: input.building ?? null,
            floor: input.floor ?? null,
            unitNumber: input.unitNumber ?? null,
            type: input.type,
            bedrooms: input.bedrooms,
            bathrooms: input.bathrooms,
            sizeSqm: input.sizeSqm,
            landSqm: input.landSqm ?? null,
            finishing: input.finishing,
            deliveryStatus: input.deliveryStatus,
            deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
            view: input.view ?? null,
            lat: point.lat,
            lng: point.lng,
          },
        });

  // A unit belonging to someone else can never be re-listed by this owner.
  if (unit.ownerId !== ownerId) return { ok: false, reason: "duplicate_unit" };

  // A re-listed unit keeps its row; re-anchor it in case the compound was re-mapped.
  if (unit.lat !== point.lat || unit.lng !== point.lng) {
    await prisma.unit.update({ where: { id: unit.id }, data: { lat: point.lat, lng: point.lng } });
  }

  const reference = await nextReference("AQ");
  const listing = await prisma.listing.create({
    data: {
      reference,
      unitId: unit.id,
      purpose: input.purpose,
      price: input.price,
      withoutOver: input.withoutOver === true,
      paymentType: input.paymentType,
      installmentJson: input.installment ? JSON.stringify(input.installment) : null,
      status: "draft",
      trustLevel: 0,
      titleAr: input.titleAr ?? null,
      titleEn: input.titleEn ?? null,
      descriptionAr: input.descriptionAr ?? null,
      descriptionEn: input.descriptionEn ?? null,
    },
  });

  await runLocationCheck(listing.id);

  return { ok: true, listingId: listing.id, reference: listing.reference };
}

/**
 * Give a listing a cover photo if it has none. Idempotent: an owner-chosen cover is
 * never overwritten.
 */
async function ensureCover(listingId: string): Promise<void> {
  const [media, listing] = await Promise.all([
    prisma.listingMedia.findMany({
      where: { listingId },
      select: { id: true, room: true, isCover: true, isVerified: true, sortOrder: true },
    }),
    prisma.listing.findUnique({ where: { id: listingId }, select: { unit: { select: { type: true } } } }),
  ]);
  if (media.length === 0 || media.some((m) => m.isCover)) return;

  const pick = suggestCover(media, listing?.unit.type);
  if (pick) await setCoverMedia(listingId, pick.id);
}
