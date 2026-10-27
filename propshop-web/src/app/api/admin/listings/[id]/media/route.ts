import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { canEditListings } from "@/lib/permissions";
import { isRoom } from "@/lib/adminEdit";
import { saveListingPhoto } from "@/lib/mediaStore";
import { setCoverMedia, suggestCover } from "@/lib/cover";
import { runLocationCheck } from "@/lib/locationService";
import { onListingVisibilityChanged } from "@/lib/catalogue";

/**
 * Back-office photo management for one listing. Admin only (canEditListings).
 *
 *   POST   multipart `files` (1–12 images, optional `room`) — upload
 *   PATCH  `{ coverMediaId }` | `{ order: [mediaId…] }` | `{ mediaId, room }` — arrange
 *   DELETE ?mediaId=…
 *
 * Unlike the owner's /api/listings/[id]/media this works on a live listing — fixing a
 * published listing's photos is the point — and every change is audited.
 *
 * Admin uploads are recorded as source "upload", NOT "in_app": they carry no capture GPS,
 * so they must never count toward the in-app photo minimum the publish gate enforces.
 * They are marked verified because a staff member is vouching for them, which is what
 * lets one serve as the cover of a verified listing.
 */

const MAX_FILES = 12;

async function guard(req: NextRequest, id: string) {
  const auth = await requireUser(req);
  if ("response" in auth) return { response: auth.response };
  if (!canEditListings(auth.user.role)) return { response: fail("forbidden", 403) };
  const listing = await prisma.listing.findUnique({
    where: { id },
    select: { id: true, unit: { select: { type: true } } },
  });
  if (!listing) return { response: fail("not_found", 404) };
  return { user: auth.user, listing };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if ("response" in g) return g.response;

  const form = await req.formData().catch(() => null);
  if (!form) return fail("multipart_required", 422);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return fail("files_required", 422);
  if (files.length > MAX_FILES) return fail("too_many_files", 422, { max: MAX_FILES });
  const roomRaw = form.get("room");
  const room = isRoom(roomRaw) ? roomRaw : null;

  const last = await prisma.listingMedia.findFirst({
    where: { listingId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let sortOrder = (last?.sortOrder ?? -1) + 1;

  const created: { id: string; fileKey: string; thumbKey: string | null; room: string | null }[] = [];
  const rejected: { name: string; reason: string }[] = [];
  for (const file of files) {
    const saved = await saveListingPhoto(id, Buffer.from(await file.arrayBuffer()), file.type);
    if (!saved.ok) {
      if (saved.reason === "storage_driver_unsupported") return fail(saved.reason, 501);
      rejected.push({ name: file.name, reason: saved.reason });
      continue;
    }
    const m = await prisma.listingMedia.create({
      data: {
        listingId: id,
        fileKey: saved.photo.fileKey,
        thumbKey: saved.photo.thumbKey,
        source: "upload",
        room,
        isVerified: true,
        sortOrder: sortOrder++,
      },
      select: { id: true, fileKey: true, thumbKey: true, room: true },
    });
    created.push(m);
  }

  if (created.length) {
    await runLocationCheck(id);
    await onListingVisibilityChanged(id);
    await audit(g.user.id, "listing_media_added", "listing", id, { mediaIds: created.map((c) => c.id), room }, clientIp(req));
  }
  return ok({ created, rejected }, { status: created.length ? 201 : 422 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if ("response" in g) return g.response;
  const b = await req.json().catch(() => ({}));

  if (typeof b.coverMediaId === "string") {
    // setCoverMedia scopes the lookup to this listing.
    const r = await setCoverMedia(id, b.coverMediaId);
    if (!r.ok) return fail("media_not_found", 404);
    await onListingVisibilityChanged(id);
    await audit(g.user.id, "listing_cover_set", "listing", id, { mediaId: r.mediaId }, clientIp(req));
    return ok({ coverMediaId: r.mediaId });
  }

  if (Array.isArray(b.order)) {
    const ids = b.order.filter((x: unknown): x is string => typeof x === "string");
    const owned = await prisma.listingMedia.findMany({ where: { listingId: id }, select: { id: true } });
    const ownedIds = new Set(owned.map((m) => m.id));
    // The full set, exactly once each — a partial order would leave duplicate sortOrders.
    if (ids.length !== ownedIds.size || new Set(ids).size !== ids.length || !ids.every((x: string) => ownedIds.has(x))) {
      return fail("order_must_list_every_photo", 422);
    }
    await prisma.$transaction(ids.map((mid: string, i: number) => prisma.listingMedia.update({ where: { id: mid }, data: { sortOrder: i } })));
    await onListingVisibilityChanged(id);
    await audit(g.user.id, "listing_media_reordered", "listing", id, { order: ids }, clientIp(req));
    return ok({ order: ids });
  }

  if (typeof b.mediaId === "string" && "room" in b) {
    const room = b.room === null || b.room === "" ? null : isRoom(b.room) ? b.room : undefined;
    if (room === undefined) return fail("invalid_room", 422);
    const r = await prisma.listingMedia.updateMany({ where: { id: b.mediaId, listingId: id }, data: { room } });
    if (!r.count) return fail("media_not_found", 404);
    await audit(g.user.id, "listing_media_room_set", "listing", id, { mediaId: b.mediaId, room }, clientIp(req));
    return ok({ mediaId: b.mediaId, room });
  }

  return fail("nothing_to_do", 422);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if ("response" in g) return g.response;
  const mediaId = req.nextUrl.searchParams.get("mediaId");
  if (!mediaId) return fail("media_required", 422);

  const removed = await prisma.listingMedia.findFirst({ where: { id: mediaId, listingId: id } });
  if (!removed) return fail("media_not_found", 404);
  await prisma.listingMedia.delete({ where: { id: mediaId } });

  // Same rule as the owner route: never leave a listing without a deliberate cover.
  if (removed.isCover) {
    const rest = await prisma.listingMedia.findMany({
      where: { listingId: id },
      select: { id: true, room: true, isVerified: true, sortOrder: true },
    });
    const next = suggestCover(rest, g.listing.unit.type);
    if (next) await setCoverMedia(id, next.id);
  }

  await runLocationCheck(id);
  await onListingVisibilityChanged(id);
  // The row is gone, so the audit entry keeps enough to know what was removed.
  await audit(
    g.user.id,
    "listing_media_deleted",
    "listing",
    id,
    { mediaId, fileKey: removed.fileKey, room: removed.room, source: removed.source, wasCover: removed.isCover },
    clientIp(req),
  );
  return ok({ deleted: true });
}
