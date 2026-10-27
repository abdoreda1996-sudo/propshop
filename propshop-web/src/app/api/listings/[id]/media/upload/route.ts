import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, rateLimit } from "@/lib/api";
import { REQUIRED_ROOMS } from "@/lib/enums";
import { saveListingPhoto } from "@/lib/mediaStore";
import { classifyPhotoSource } from "@/lib/photoSource";
import { runLocationCheck } from "@/lib/locationService";

/**
 * POST /api/listings/[id]/media/upload — the app's in-app camera sends the PHOTO ITSELF.
 *
 * multipart: `file` (image), `room`, `gpsLat`, `gpsLng`, `capturedAt`.
 *
 * Before this existed the app registered `shot.path` — a path on the phone's disk — as
 * the photo URL, so every in-app photo was a broken image anywhere but that phone. Bytes
 * now go through the same pipeline as back-office uploads (mediaStore: decoded, resized,
 * EXIF stripped, original kept private), and the GPS claim goes through the same rule as
 * the URL route (photoSource.classifyPhotoSource).
 *
 * GPS travels as form fields, not EXIF: the renditions are stripped of EXIF on purpose,
 * and the server judges the location the device reported at capture.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await rateLimit(`photo-upload:${auth.user.id}`, 60, 15 * 60_000))) return fail("rate_limited", 429);
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { unit: { select: { ownerId: true, lat: true, lng: true } }, media: { select: { id: true } } },
  });
  if (!listing) return fail("not_found", 404);
  if (listing.unit.ownerId !== auth.user.id) return fail("forbidden", 403);
  if (listing.status === "live" || listing.status === "closed") return fail("listing_locked", 409);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("file_required", 422);

  const roomRaw = String(form!.get("room") ?? "");
  const room = (REQUIRED_ROOMS as readonly string[]).includes(roomRaw) ? roomRaw : null;
  const num = (k: string) => {
    const v = form!.get(k);
    const n = v === null || v === "" ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const gpsLat = num("gpsLat");
  const gpsLng = num("gpsLng");
  const capturedRaw = String(form!.get("capturedAt") ?? "");
  const capturedAt = capturedRaw && !Number.isNaN(Date.parse(capturedRaw)) ? new Date(capturedRaw) : null;

  const saved = await saveListingPhoto(id, Buffer.from(await file.arrayBuffer()), file.type || "image/jpeg");
  if (!saved.ok) return fail(saved.reason, saved.reason === "storage_driver_unsupported" ? 501 : 422);

  const source = classifyPhotoSource("in_app", { lat: gpsLat, lng: gpsLng }, listing.unit);
  const media = await prisma.listingMedia.create({
    data: {
      listingId: id,
      fileKey: saved.photo.fileKey,
      thumbKey: saved.photo.thumbKey,
      gpsLat,
      gpsLng,
      capturedAt,
      source,
      room,
      isVerified: source !== "upload",
      sortOrder: listing.media.length,
    },
    select: { id: true, source: true, room: true, fileKey: true, thumbKey: true },
  });

  await runLocationCheck(id);
  // `demoted` tells the camera screen to say why a shot did not count, instead of letting
  // the owner discover it at the publish gate.
  return ok({ created: media, demoted: source !== "in_app" }, { status: 201 });
}
