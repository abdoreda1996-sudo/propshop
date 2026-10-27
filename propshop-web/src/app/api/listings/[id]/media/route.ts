import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser } from "@/lib/api";
import { REQUIRED_ROOMS } from "@/lib/enums";
import { classifyPhotoSource } from "@/lib/photoSource";
import { setCoverMedia, suggestCover } from "@/lib/cover";
import { runLocationCheck } from "@/lib/locationService";

/**
 * GET /api/listings/[id]/media — the owner's own photos of a draft or listing, so the app
 * can tick off its room checklist when an owner resumes. Owner only: any other account
 * gets 404, not 403, so listing ids cannot be probed. `room` is the same key the photo
 * checklist and POST use (REQUIRED_ROOMS); every ListingMedia row is a photo, so `kind`
 * is always "photo" (virtual tours live under /tours).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      unit: { select: { ownerId: true } },
      media: {
        orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, room: true, source: true, fileKey: true, thumbKey: true, isCover: true, isVerified: true, capturedAt: true },
      },
    },
  });
  if (!listing || listing.unit.ownerId !== auth.user.id) return fail("not_found", 404);

  return ok({
    media: listing.media.map((m) => ({
      id: m.id,
      room: m.room,
      kind: "photo",
      source: m.source,
      thumbUrl: m.thumbKey ?? m.fileKey,
      url: m.fileKey,
      isCover: m.isCover,
      isVerified: m.isVerified,
      capturedAt: m.capturedAt,
    })),
  });
}

/**
 * POST /api/listings/[id]/media — registers a captured photo.
 *
 * The web wizard posts URLs; the Flutter app posts the same shape after uploading to
 * object storage, including EXIF GPS and capture time. A photo claiming in-app capture
 * must carry GPS, and that GPS must be near the unit — otherwise the source is demoted
 * to "upload", which cannot satisfy the minimum-photo rule.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { unit: { select: { ownerId: true, lat: true, lng: true } }, media: { select: { id: true } } },
  });
  if (!listing) return fail("not_found", 404);
  if (listing.unit.ownerId !== auth.user.id) return fail("forbidden", 403);
  if (listing.status === "live" || listing.status === "closed") return fail("listing_locked", 409);

  const b = await req.json().catch(() => ({}));
  const items: unknown[] = Array.isArray(b.media) ? b.media : [b];

  // Typed explicitly: `created.length` feeds sortOrder below, so an inferred type would
  // be circular.
  // Includes the keys so the caller can render the photo it just registered — the
  // wizard's cover picker needs a thumbnail, not just an id.
  const created: { id: string; source: string; room: string | null; fileKey: string; thumbKey: string | null }[] = [];
  for (const raw of items) {
    const m = raw as Record<string, unknown>;
    const fileKey = String(m.fileKey ?? "");
    if (!fileKey) continue;

    const room = m.room && REQUIRED_ROOMS.includes(String(m.room) as never) ? String(m.room) : null;
    // Number(null) is 0, so a client sending `gpsLat: null` used to store the photo at
    // (0,0) — "far from the unit" rather than "no GPS". Treat null/"" as absent.
    const coord = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    const gpsLat = coord(m.gpsLat);
    const gpsLng = coord(m.gpsLng);
    const source = classifyPhotoSource(m.source, { lat: gpsLat, lng: gpsLng }, listing.unit);

    const media = await prisma.listingMedia.create({
      data: {
        listingId: id,
        fileKey,
        thumbKey: m.thumbKey ? String(m.thumbKey) : null,
        phash: m.phash ? String(m.phash) : null,
        gpsLat,
        gpsLng,
        capturedAt: m.capturedAt ? new Date(String(m.capturedAt)) : null,
        source,
        room,
        isVerified: source !== "upload",
        sortOrder: listing.media.length + created.length,
      },
    });
    created.push({ id: media.id, source: media.source, room: media.room, fileKey: media.fileKey, thumbKey: media.thumbKey });
  }

  // New evidence: re-check that the photos were taken at the compound. The verdict goes
  // to the reviewer; the owner is not told which photo tripped it.
  if (created.length) await runLocationCheck(id);

  return ok({ created }, { status: 201 });
}

/**
 * PATCH /api/listings/[id]/media — sets the cover photo: `{ "coverMediaId": "..." }`.
 *
 * Unlike POST this stays available on a live listing. Changing which photo fronts the
 * card is presentation, not a change to what was verified: the photo was already
 * approved, and forcing an owner to unpublish to swap it would be absurd.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { unit: { select: { ownerId: true } } },
  });
  if (!listing) return fail("not_found", 404);
  if (listing.unit.ownerId !== auth.user.id) return fail("forbidden", 403);

  const b = await req.json().catch(() => ({}));
  const coverMediaId = typeof b.coverMediaId === "string" ? b.coverMediaId : "";
  if (!coverMediaId) return fail("cover_media_required", 422);

  // setCoverMedia scopes the lookup to this listing, so an owner cannot point their
  // cover at another listing's photo by guessing an id.
  const result = await setCoverMedia(id, coverMediaId);
  if (!result.ok) return fail("media_not_found", 404);

  return ok({ coverMediaId: result.mediaId });
}

/** DELETE /api/listings/[id]/media?mediaId=... */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const mediaId = req.nextUrl.searchParams.get("mediaId");
  if (!mediaId) return fail("media_required", 422);

  const listing = await prisma.listing.findUnique({ where: { id }, include: { unit: { select: { ownerId: true, type: true } } } });
  if (!listing) return fail("not_found", 404);
  if (listing.unit.ownerId !== auth.user.id) return fail("forbidden", 403);

  const removed = await prisma.listingMedia.findFirst({ where: { id: mediaId, listingId: id }, select: { isCover: true } });
  await prisma.listingMedia.deleteMany({ where: { id: mediaId, listingId: id } });

  // Deleting the cover would otherwise silently demote the listing to the fallback
  // (lowest sortOrder). Promote the best remaining photo instead.
  if (removed?.isCover) {
    const rest = await prisma.listingMedia.findMany({
      where: { listingId: id },
      select: { id: true, room: true, isVerified: true, sortOrder: true },
    });
    const next = suggestCover(rest, listing.unit.type);
    if (next) await setCoverMedia(id, next.id);
  }

  await runLocationCheck(id);

  return ok({ deleted: true });
}
