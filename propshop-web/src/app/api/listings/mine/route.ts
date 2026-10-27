import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, requireUser } from "@/lib/api";
import { COVER_FIRST } from "@/lib/cover";
import { MAX_ACTIVE_LISTINGS_PER_IDENTITY, LIST_PAGE } from "@/lib/enums";
import { IN_FLIGHT_STATUSES, validateListing } from "@/lib/listingFlow";

/**
 * GET /api/listings/mine — the signed-in owner's listings, for the app's "My listings"
 * (the web's /dashboard/listings reads the same data server-side).
 *
 * Drafts and rejected listings carry the publish gate's current blocks, so the owner sees
 * what to fix and can resume where they stopped.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const rows = await prisma.listing.findMany({
    where: { unit: { ownerId: auth.user.id } },
    select: {
      id: true,
      reference: true,
      titleAr: true,
      titleEn: true,
      status: true,
      price: true,
      currency: true,
      purpose: true,
      views: true,
      openToTrade: true,
      tourCount: true,
      rejectReason: true,
      expiresAt: true,
      publishedAt: true,
      createdAt: true,
      unit: { select: { type: true, compound: { select: { nameAr: true, nameEn: true } } } },
      media: { orderBy: COVER_FIRST, take: 1, select: { thumbKey: true, fileKey: true } },
      _count: { select: { savedBy: true, requests: true, offers: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_PAGE,
  });

  // The gate only for listings the owner can still act on (≤3 by the listing cap).
  const resumable = rows.filter((r) => ["draft", "rejected"].includes(r.status));
  const gates = new Map(
    await Promise.all(resumable.map(async (r) => [r.id, await validateListing(r.id)] as const)),
  );

  return ok({
    activeCount: rows.filter((r) => (IN_FLIGHT_STATUSES as readonly string[]).includes(r.status)).length,
    cap: MAX_ACTIVE_LISTINGS_PER_IDENTITY,
    listings: rows.map((r) => {
      const gate = gates.get(r.id);
      return {
        id: r.id,
        reference: r.reference,
        titleAr: r.titleAr ?? "",
        titleEn: r.titleEn ?? "",
        status: r.status,
        price: r.price,
        currency: r.currency,
        purpose: r.purpose,
        type: r.unit.type,
        compoundAr: r.unit.compound?.nameAr ?? null,
        compoundEn: r.unit.compound?.nameEn ?? null,
        photo: r.media[0]?.thumbKey ?? r.media[0]?.fileKey ?? null,
        views: r.views,
        saves: r._count.savedBy,
        requests: r._count.requests,
        offers: r._count.offers,
        openToTrade: r.openToTrade,
        tourCount: r.tourCount,
        rejectReason: r.rejectReason,
        expiresAt: r.expiresAt,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
        blocks: gate ? gate.blocks.map((b) => ({ code: b.code, messageAr: b.messageAr, messageEn: b.messageEn })) : [],
      };
    }),
  });
}
