import path from "path";
import sharp, { type Metadata } from "sharp";
import { checkUpload, mediaKey, renditionKey, storage, uploadsDisabled } from "./storage";

/**
 * Real photo ingestion for the local storage driver.
 *
 * Until this existed nothing in the product accepted image bytes: the listing wizard
 * registers demo URLs, and LocalDriver pointed at an `/api/media/upload` route that was
 * never written. The back-office editor is the first caller.
 *
 * Follows storage.ts's rules rather than inventing new ones:
 *   - the ORIGINAL is kept private (`.data/private/...`), never served;
 *   - only DERIVED renditions are public, written under `.data/media/...` and served by
 *     `src/app/media/[...key]/route.ts` at LocalDriver.publicUrl's `/media/<key>`;
 *   - renditions are re-encoded by sharp, which drops EXIF — an owner's phone GPS and
 *     device serial must not ship with a public listing photo.
 *
 * With object storage configured (S3 / Cloudflare R2) the same pipeline writes to the
 * buckets instead of the disk: originals to the private bucket, renditions to the public
 * one. Nothing is ever written to the app server's disk in that mode, which on a
 * serverless host is read-only and would lose files on the next deploy anyway.
 */

export const MEDIA_ROOT = process.env.MEDIA_DIR ?? path.join(process.cwd(), ".data");
export const PUBLIC_MEDIA_DIR = path.join(MEDIA_ROOT, "media");

const GALLERY_WIDTH = 1600;
const THUMB_WIDTH = 400;

export type SavedPhoto = { fileKey: string; thumbKey: string; width: number | null; height: number | null };

export type SaveResult =
  | { ok: true; photo: SavedPhoto }
  | { ok: false; reason: "type_not_allowed" | "too_large" | "not_an_image" | "storage_driver_unsupported" };

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};


export async function saveListingPhoto(listingId: string, bytes: Buffer, mime: string): Promise<SaveResult> {
  const driver = storage();
  if (uploadsDisabled()) return { ok: false, reason: "storage_driver_unsupported" };

  const check = checkUpload("photo", mime, bytes.length);
  if (!check.ok) return { ok: false, reason: check.reason };

  // The browser's Content-Type is a claim; decoding the pixels is the proof.
  let meta: Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    return { ok: false, reason: "not_an_image" };
  }

  const key = mediaKey(listingId, "photo", EXT[mime] ?? "bin");
  // .rotate() applies the EXIF orientation before the metadata is dropped, so portrait
  // phone shots do not come out sideways.
  const [gallery, thumb] = await Promise.all([
    sharp(bytes).rotate().resize({ width: GALLERY_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
    sharp(bytes).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer(),
  ]);

  const galleryKey = renditionKey(key, GALLERY_WIDTH);
  const thumbKey = renditionKey(key, THUMB_WIDTH);
  await Promise.all([
    driver.putObject("private", key, bytes, mime),
    driver.putObject("public", galleryKey, gallery, "image/webp"),
    driver.putObject("public", thumbKey, thumb, "image/webp"),
  ]);

  return {
    ok: true,
    photo: {
      fileKey: driver.publicUrl(galleryKey),
      thumbKey: driver.publicUrl(thumbKey),
      width: meta.width ?? null,
      height: meta.height ?? null,
    },
  };
}

export const MEDIA_TYPES: Record<string, string> = { webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime" };

/**
 * Resolves a public media key to a file path, or null if the key tries to leave the
 * public directory. Only renditions are servable — never originals, never documents.
 */
export function publicMediaPath(segments: string[]): string | null {
  if (!segments.length || segments.some((s) => !s || s === "." || s === ".." || s.includes("\\"))) return null;
  const name = segments[segments.length - 1];
  // Photo renditions and tour posters (.webp), and processed tour videos — which only ever
  // live under a listing's video/ folder with the _tour suffix tourService gives them.
  const isVideo = /_tour\.(mp4|mov)$/.test(name) && segments[segments.length - 2] === "video";
  if (!name.endsWith(".webp") && !isVideo) return null;
  const file = path.resolve(PUBLIC_MEDIA_DIR, ...segments);
  return file.startsWith(path.resolve(PUBLIC_MEDIA_DIR) + path.sep) ? file : null;
}

export type PrivateImage = { mediaType: string; data: string };

export type PrivateSaveResult =
  | { ok: true; key: string; contentType: string }
  | { ok: false; reason: "type_not_allowed" | "too_large" | "not_an_image" | "storage_driver_unsupported" };

/** Base64 images the JSON upload routes accept (what lib/imageUpload.ts and the app send). */
const PRIVATE_IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const PRIVATE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Stores one base64 image as a PRIVATE object, unchanged — it is evidence (an ID card,
 * a contract page), so it is kept as sent rather than re-encoded. `keyFor` receives the
 * file extension and returns the object key. Never written to the public bucket.
 */
export async function savePrivateImage(image: PrivateImage, keyFor: (ext: string) => string): Promise<PrivateSaveResult> {
  if (uploadsDisabled()) return { ok: false, reason: "storage_driver_unsupported" };
  const ext = PRIVATE_IMAGE_TYPES[image.mediaType];
  if (!ext || typeof image.data !== "string") return { ok: false, reason: "type_not_allowed" };
  const bytes = Buffer.from(image.data, "base64");
  if (bytes.length > PRIVATE_IMAGE_MAX_BYTES) return { ok: false, reason: "too_large" };
  // The declared type is a claim; decoding the header is the proof.
  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return { ok: false, reason: "not_an_image" };
  } catch {
    return { ok: false, reason: "not_an_image" };
  }
  const key = keyFor(ext);
  await storage().putObject("private", key, bytes, image.mediaType);
  return { ok: true, key, contentType: image.mediaType };
}

/** Local-driver path of a private object, or null if the key tries to leave the folder. */
export function localPrivatePath(key: string): string | null {
  const segments = key.split("/");
  if (!segments.length || segments.some((s) => !s || s === "." || s === ".." || s.includes("\\"))) return null;
  const root = path.resolve(MEDIA_ROOT, "private");
  const file = path.resolve(root, ...segments);
  return file.startsWith(root + path.sep) ? file : null;
}
