import path from "path";
import os from "os";
import { spawn } from "child_process";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { prisma } from "./prisma";
import { fail } from "./api";
import { checkUpload, mediaKey, storage, uploadsDisabled } from "./storage";
import { PUBLIC_MEDIA_DIR, MEDIA_ROOT } from "./mediaStore";
import { scanMessage } from "./antiBroker";
import { invalidatePublicCatalogue } from "./cache";
import { deliverOpenBooking } from "./tourBooking";
import { canDecideVerification } from "./permissions";
import {
  MAX_TOURS_PER_LISTING,
  TOUR_TITLE_MAX,
  blankVideoLocation,
  looksLikeVideo,
  parseTourLink,
  visibleTourWhere,
} from "./tours";

/**
 * Virtual tours — persistence, storage and permissions. Rules live in tours.ts.
 *
 * Who may do what:
 *   - the listing's OWNER adds tours (pending until reviewed) and removes their own;
 *   - STAFF who produce tours (admin, reviewer, photographer — PropShop sells the
 *     professional shoot and 360° tour) add tours that are approved on arrival;
 *   - REVIEWERS (canDecideVerification) approve or reject, and admins remove any.
 *
 * Listing.tourCount mirrors the number of approved tours so search cards can show the
 * badge without a join; every write that can change it ends in recount().
 */

const PRIVATE_MEDIA_DIR = path.join(MEDIA_ROOT, "private");
const STAFF_ADDERS = new Set(["admin", "reviewer", "photographer"]);

export type TourFail = {
  ok: false;
  reason:
    | "not_found"
    | "forbidden"
    | "listing_closed"
    | "too_many_tours"
    | "link_invalid"
    | "provider_not_supported"
    | "title_contact_details"
    | "type_not_allowed"
    | "too_large"
    | "not_a_video"
    | "storage_driver_unsupported"
    | "reason_required"
    | "action_invalid"
    | "already_reviewed";
};

const STATUS: Record<TourFail["reason"], number> = {
  not_found: 404,
  forbidden: 403,
  listing_closed: 409,
  too_many_tours: 409,
  already_reviewed: 409,
  storage_driver_unsupported: 501,
  link_invalid: 422,
  provider_not_supported: 422,
  title_contact_details: 422,
  type_not_allowed: 422,
  too_large: 413,
  not_a_video: 422,
  reason_required: 422,
  action_invalid: 422,
};
/** A TourFail as an HTTP error response, with the right status. */
export const tourFail = (f: TourFail) => fail(f.reason, STATUS[f.reason] ?? 422);

type Actor = { id: string; role: string };

export const TOUR_SELECT = {
  id: true,
  kind: true,
  provider: true,
  url: true,
  posterUrl: true,
  title: true,
  status: true,
  rejectReason: true,
  sortOrder: true,
  createdAt: true,
} as const;

/** Tours on a listing as `viewer` may see them. */
export async function toursFor(listingId: string, viewer: Actor | null) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { unit: { select: { ownerId: true } } } });
  if (!listing) return null;
  const all = !!viewer && (viewer.id === listing.unit.ownerId || STAFF_ADDERS.has(viewer.role));
  return prisma.listingTour.findMany({
    where: { listingId, ...visibleTourWhere(all) },
    select: TOUR_SELECT,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

async function loadForAdd(listingId: string, actor: Actor) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { status: true, unit: { select: { ownerId: true } } },
  });
  if (!listing) return { ok: false, reason: "not_found" } as TourFail;
  const isOwner = listing.unit.ownerId === actor.id;
  const isStaff = STAFF_ADDERS.has(actor.role);
  if (!isOwner && !isStaff) return { ok: false, reason: "forbidden" } as TourFail;
  if (["closed", "sold"].includes(listing.status)) return { ok: false, reason: "listing_closed" } as TourFail;
  const used = await prisma.listingTour.count({ where: { listingId, status: { not: "rejected" } } });
  if (used >= MAX_TOURS_PER_LISTING) return { ok: false, reason: "too_many_tours" } as TourFail;
  return { ok: true as const, isStaff, sortOrder: used };
}

function cleanTitle(raw: unknown): { ok: true; title: string | null } | TourFail {
  const title = typeof raw === "string" ? raw.trim().slice(0, TOUR_TITLE_MAX) : "";
  if (!title) return { ok: true, title: null };
  // Same contact-detail rule as chat: no numbers, links or "call me" in a public caption.
  if (scanMessage(title).flagged) return { ok: false, reason: "title_contact_details" };
  return { ok: true, title };
}

/** Adds a hosted tour from a pasted link. */
export async function addTourLink(listingId: string, actor: Actor, input: { url?: unknown; title?: unknown }) {
  const gate = await loadForAdd(listingId, actor);
  if (!gate.ok) return gate;
  const parsed = parseTourLink(String(input.url ?? ""));
  if (!parsed.ok) return { ok: false, reason: parsed.reason } as TourFail;
  const t = cleanTitle(input.title);
  if (!t.ok) return t;
  const tour = await prisma.listingTour.create({
    data: {
      listingId,
      kind: "embed",
      provider: parsed.provider,
      url: parsed.embedUrl,
      sourceUrl: String(input.url).trim().slice(0, 500),
      title: t.title,
      addedById: actor.id,
      ...arrival(gate.isStaff, actor.id),
      sortOrder: gate.sortOrder,
    },
    select: TOUR_SELECT,
  });
  if (gate.isStaff) await deliverOpenBooking(listingId);
  await recount(listingId);
  return { ok: true as const, tour };
}

/** Adds an uploaded walkthrough video. */
export async function addTourVideo(listingId: string, actor: Actor, file: { bytes: Buffer; mime: string; title?: unknown }) {
  const gate = await loadForAdd(listingId, actor);
  if (!gate.ok) return gate;
  const t = cleanTitle(file.title);
  if (!t.ok) return t;
  const saved = await saveTourVideo(listingId, file.bytes, file.mime);
  if (!saved.ok) return saved;
  const tour = await prisma.listingTour.create({
    data: {
      listingId,
      kind: "video",
      provider: "upload",
      url: saved.url,
      posterUrl: saved.posterUrl,
      mimeType: saved.mime,
      bytes: saved.bytes,
      title: t.title,
      addedById: actor.id,
      ...arrival(gate.isStaff, actor.id),
      sortOrder: gate.sortOrder,
    },
    select: TOUR_SELECT,
  });
  // The finished tour from a booked shoot closes that booking.
  if (gate.isStaff) await deliverOpenBooking(listingId);
  await recount(listingId);
  return { ok: true as const, tour };
}

/** Staff-produced tours are reviewed by the person adding them; owners' wait for review. */
function arrival(isStaff: boolean, actorId: string) {
  return isStaff ? { status: "approved", reviewedById: actorId, reviewedAt: new Date() } : { status: "pending" };
}

export async function reviewTour(tourId: string, actor: Actor, action: string, reason?: string) {
  if (!canDecideVerification(actor.role)) return { ok: false, reason: "forbidden" } as TourFail;
  const tour = await prisma.listingTour.findUnique({ where: { id: tourId }, select: { listingId: true, status: true } });
  if (!tour) return { ok: false, reason: "not_found" } as TourFail;
  if (tour.status !== "pending") return { ok: false, reason: "already_reviewed" } as TourFail;
  const why = (reason ?? "").trim().slice(0, 300);
  if (action === "reject" && !why) return { ok: false, reason: "reason_required" } as TourFail;
  if (action !== "approve" && action !== "reject") return { ok: false, reason: "action_invalid" } as TourFail;
  await prisma.listingTour.update({
    where: { id: tourId },
    data: {
      status: action === "approve" ? "approved" : "rejected",
      rejectReason: action === "reject" ? why : null,
      reviewedById: actor.id,
      reviewedAt: new Date(),
    },
  });
  await recount(tour.listingId);
  return { ok: true as const, listingId: tour.listingId };
}

export async function deleteTour(tourId: string, actor: Actor) {
  const tour = await prisma.listingTour.findUnique({
    where: { id: tourId },
    select: { listingId: true, url: true, posterUrl: true, kind: true, listing: { select: { unit: { select: { ownerId: true } } } } },
  });
  if (!tour) return { ok: false, reason: "not_found" } as TourFail;
  if (tour.listing.unit.ownerId !== actor.id && actor.role !== "admin") return { ok: false, reason: "forbidden" } as TourFail;
  await prisma.listingTour.delete({ where: { id: tourId } });
  await recount(tour.listingId);
  if (tour.kind === "video") await removeLocalFiles([tour.url, tour.posterUrl]);
  return { ok: true as const, listingId: tour.listingId };
}

/** Keeps Listing.tourCount true and the public pages fresh. */
export async function recount(listingId: string) {
  const approved = await prisma.listingTour.count({ where: { listingId, status: "approved" } });
  const before = await prisma.listing.update({ where: { id: listingId }, data: { tourCount: approved }, select: { status: true } });
  // A tour change alters the public listing page and its card; drop the cached copies.
  if (before.status === "live") invalidatePublicCatalogue();
}

// ---------------------------------------------------------------------------
// Video files
// ---------------------------------------------------------------------------

type SavedVideo = { ok: true; url: string; posterUrl: string | null; mime: string; bytes: number };

let ffmpegChecked: Promise<string | null> | null = null;

/** The ffmpeg binary, if this machine has one (FFMPEG_PATH, else `ffmpeg` on PATH). */
function ffmpegBinary(): Promise<string | null> {
  ffmpegChecked ??= new Promise((resolve) => {
    const bin = process.env.FFMPEG_PATH || "ffmpeg";
    const p = spawn(bin, ["-version"], { stdio: "ignore", windowsHide: true });
    p.on("error", () => resolve(null));
    p.on("exit", (code) => resolve(code === 0 ? bin : null));
  });
  return ffmpegChecked;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.on("error", () => (clearTimeout(timer), resolve(false)));
    p.on("exit", (code) => (clearTimeout(timer), resolve(code === 0)));
  });
}

async function put(root: string, key: string, bytes: Buffer) {
  const file = path.join(root, ...key.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return file;
}

/**
 * Stores an uploaded tour video for the LOCAL storage driver.
 *
 * The original is kept private (it may carry the phone's GPS). The public copy is:
 *   - with ffmpeg: remuxed with ALL metadata dropped and the index moved to the front
 *     (`+faststart`, so playback starts before the whole file arrives), plus a poster
 *     frame. Remux, not re-encode — `-c copy` takes seconds, not minutes.
 *   - without ffmpeg: the same bytes with GPS coordinates blanked in place.
 * With object storage (R2) configured, the original goes to the private bucket and the
 * GPS-blanked copy to the public one (no ffmpeg pass: there is no disk to run it on).
 */
export async function saveTourVideo(listingId: string, bytes: Buffer, mime: string): Promise<SavedVideo | TourFail> {
  const driver = storage();
  if (uploadsDisabled()) return { ok: false, reason: "storage_driver_unsupported" };
  const check = checkUpload("video", mime, bytes.length);
  if (!check.ok) return { ok: false, reason: check.reason };
  const sniff = looksLikeVideo(bytes);
  if (!sniff.ok) return { ok: false, reason: "not_a_video" };

  const originalKey = mediaKey(listingId, "video", sniff.ext);
  const base = originalKey.replace(/\.[^.]+$/, "");

  // Object storage (R2): the original goes to the private bucket; the public copy is the
  // GPS-blanked bytes below. ffmpeg needs files on a disk, which a serverless host lacks.
  if (driver.name !== "local") {
    await driver.putObject("private", originalKey, bytes, sniff.mime);
    const copy = Buffer.from(bytes);
    blankVideoLocation(copy);
    const publicKey = `${base}_tour.${sniff.ext}`;
    await driver.putObject("public", publicKey, copy, sniff.mime);
    return { ok: true, url: driver.publicUrl(publicKey), posterUrl: null, mime: sniff.mime, bytes: copy.length };
  }

  const originalFile = await put(PRIVATE_MEDIA_DIR, originalKey, bytes);

  const bin = await ffmpegBinary();
  if (bin) {
    const tmp = path.join(os.tmpdir(), `tour-${randomUUID()}`);
    await mkdir(tmp, { recursive: true });
    try {
      const outFile = path.join(tmp, "tour.mp4");
      const remuxed = await run(
        bin,
        ["-v", "error", "-y", "-i", originalFile, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-map_metadata", "-1", "-map_chapters", "-1", "-movflags", "+faststart", outFile],
        120_000,
      );
      if (remuxed) {
        const publicKey = `${base}_tour.mp4`;
        const out = await readFile(outFile);
        await put(PUBLIC_MEDIA_DIR, publicKey, out);
        let posterUrl: string | null = null;
        const frame = path.join(tmp, "poster.png");
        if (await run(bin, ["-v", "error", "-y", "-ss", "1", "-i", outFile, "-frames:v", "1", frame], 30_000)) {
          const webp = await sharp(await readFile(frame)).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
          const posterKey = `${base}_poster.webp`;
          await put(PUBLIC_MEDIA_DIR, posterKey, webp);
          posterUrl = driver.publicUrl(posterKey);
        }
        return { ok: true, url: driver.publicUrl(publicKey), posterUrl, mime: "video/mp4", bytes: out.length };
      }
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  // No ffmpeg (or it could not read the file): publish the bytes with GPS blanked.
  const copy = Buffer.from(bytes);
  blankVideoLocation(copy);
  const publicKey = `${base}_tour.${sniff.ext}`;
  await put(PUBLIC_MEDIA_DIR, publicKey, copy);
  return { ok: true, url: driver.publicUrl(publicKey), posterUrl: null, mime: sniff.mime, bytes: copy.length };
}

async function removeLocalFiles(urls: (string | null)[]) {
  for (const url of urls) {
    if (!url?.startsWith("/media/")) continue;
    const file = path.resolve(PUBLIC_MEDIA_DIR, ...url.slice("/media/".length).split("/"));
    if (file.startsWith(path.resolve(PUBLIC_MEDIA_DIR) + path.sep)) await rm(file, { force: true }).catch(() => {});
  }
}
