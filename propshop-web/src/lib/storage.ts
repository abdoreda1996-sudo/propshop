/**
 * Object storage for listing media.
 *
 * THE PROBLEM THIS SOLVES
 *
 * 20,000 listings in month one, each with ~6 photos, ownership documents and optionally a
 * video. Sizing it honestly:
 *
 *   photos     20,000 x 6 x ~3 MB original      ≈  360 GB
 *   renditions 20,000 x 6 x ~250 KB (3 sizes)   ≈   90 GB
 *   documents  20,000 x 2 x ~1 MB               ≈   40 GB
 *   video      say 20% x 1 x ~40 MB             ≈  160 GB
 *                                               ─────────
 *                                                 ~650 GB in month one
 *
 * None of that can go through the application server. Two rules follow, and everything
 * below exists to enforce them:
 *
 *   1. BYTES NEVER TOUCH THE APP. The browser and the app upload straight to object
 *      storage with a short-lived presigned URL, and download straight from a CDN. An
 *      upload proxied through Node occupies a request worker for the length of the
 *      transfer — at 3 MB on a mobile connection that is tens of seconds, and a few
 *      hundred concurrent uploads is the whole instance.
 *
 *   2. ORIGINALS ARE PRIVATE. Ownership documents are contracts containing national ID
 *      numbers. They live in a bucket with no public read, reachable only through a
 *      short-lived signed URL issued to someone the server has checked. Only derived,
 *      watermarked photo renditions are public.
 *
 * WHAT IS IMPLEMENTED HERE
 *
 * The key scheme, the content rules and the interface. `LocalDriver` writes to disk so
 * development needs no cloud account. `S3Driver` is a stub with the exact call shape
 * needed — filling it in is a contained change behind this interface, and nothing else in
 * the codebase has to know which driver is active.
 */

import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------------------------------------------------------------------------
// What may be uploaded
// ---------------------------------------------------------------------------

export type MediaKind = "photo" | "document" | "video";

type Rule = { mime: string[]; maxBytes: number; public: boolean };

/**
 * Per-kind limits.
 *
 * `public: false` on every entry is deliberate and should stay that way. Originals and
 * documents are never publicly readable; only DERIVED renditions are published, and those
 * are written to the public bucket by the processing job, not by an upload.
 */
const RULES: Record<MediaKind, Rule> = {
  photo: {
    mime: ["image/jpeg", "image/png", "image/webp", "image/heic"],
    maxBytes: 15 * 1024 * 1024,
    public: false, // originals stay private; only renditions are published
  },
  document: {
    mime: ["application/pdf", "image/jpeg", "image/png"],
    maxBytes: 25 * 1024 * 1024,
    public: false, // contracts and IDs — never public, under any circumstances
  },
  video: {
    mime: ["video/mp4", "video/quicktime"],
    maxBytes: 200 * 1024 * 1024,
    public: false,
  },
};

export function rulesFor(kind: MediaKind): Rule {
  return RULES[kind];
}

export type UploadCheck = { ok: true } | { ok: false; reason: "type_not_allowed" | "too_large" };

export function checkUpload(kind: MediaKind, mime: string, bytes: number): UploadCheck {
  const rule = RULES[kind];
  if (!rule.mime.includes(mime)) return { ok: false, reason: "type_not_allowed" };
  if (bytes > rule.maxBytes) return { ok: false, reason: "too_large" };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Key scheme
// ---------------------------------------------------------------------------

/**
 * Object keys are structured, not random.
 *
 *   listings/<listingId>/photo/<uuid>.<ext>
 *   listings/<listingId>/photo/<uuid>_800.webp      (rendition)
 *   listings/<listingId>/document/<uuid>.pdf        (private, always)
 *
 * The listing id prefix means deleting a listing's media is one prefix delete rather than
 * a row-by-row walk, and a lifecycle rule can expire a whole prefix. The uuid means an
 * object key is unguessable even before signing.
 */
export function mediaKey(listingId: string, kind: MediaKind, ext: string): string {
  const clean = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5) || "bin";
  return `listings/${listingId}/${kind}/${randomUUID()}.${clean}`;
}

/** The three widths the site actually requests: card, gallery thumb, gallery hero. */
export const RENDITIONS = [400, 800, 1600] as const;

export function renditionKey(originalKey: string, width: number): string {
  return originalKey.replace(/\.[^.]+$/, "") + `_${width}.webp`;
}

/** Deterministic id for deduplication, so the same file is not stored twice. */
export function contentId(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Driver interface
// ---------------------------------------------------------------------------

export type PresignedUpload = {
  /** Where the client PUTs the bytes. Short-lived. */
  url: string;
  /** Headers the client must send, so the signature matches. */
  headers: Record<string, string>;
  /** The key to record on the ListingMedia row once the client reports success. */
  key: string;
  expiresInSeconds: number;
};

export interface StorageDriver {
  readonly name: string;
  /** A URL the client can PUT to directly. The app never sees the bytes. */
  presignUpload(key: string, mime: string, maxBytes: number): Promise<PresignedUpload>;
  /** A short-lived URL for a private object, issued only after a permission check. */
  presignDownload(key: string, expiresInSeconds: number): Promise<string>;
  /** The public CDN URL for a derived, publishable rendition. */
  publicUrl(key: string): string;
  /** Remove every object under a prefix — used when a listing is deleted. */
  deletePrefix(prefix: string): Promise<number>;
  /**
   * Store bytes the SERVER produced or vetted (re-encoded photo renditions, a tour video
   * with its metadata stripped). "private" for originals, "public" for what is served.
   */
  putObject(visibility: "public" | "private", key: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Remove one private object, e.g. a KYC photo replaced by a re-upload. Missing is fine. */
  deletePrivateObject(key: string): Promise<void>;
}

/** Where the local driver keeps files (mirrors mediaStore's MEDIA_ROOT). */
const LOCAL_ROOT = process.env.MEDIA_DIR ?? path.join(process.cwd(), ".data");

/**
 * Development driver: the app serves files from disk.
 *
 * Correct for one developer on one machine and wrong for anything else — it puts the
 * bytes back through the application server, which is the thing this module exists to
 * prevent. `assertProductionStorage()` below refuses to let it run in production.
 */
export class LocalDriver implements StorageDriver {
  readonly name = "local";

  async presignUpload(key: string, mime: string): Promise<PresignedUpload> {
    return {
      url: `/api/media/upload?key=${encodeURIComponent(key)}`,
      headers: { "Content-Type": mime },
      key,
      expiresInSeconds: 600,
    };
  }

  async presignDownload(key: string): Promise<string> {
    return `/api/media/file?key=${encodeURIComponent(key)}`;
  }

  publicUrl(key: string): string {
    return `/media/${key}`;
  }

  async deletePrefix(): Promise<number> {
    return 0;
  }

  async putObject(visibility: "public" | "private", key: string, bytes: Buffer): Promise<void> {
    const file = path.join(LOCAL_ROOT, visibility === "public" ? "media" : "private", ...key.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }

  async deletePrivateObject(key: string): Promise<void> {
    await unlink(path.join(LOCAL_ROOT, "private", ...key.split("/"))).catch(() => {});
  }
}

/**
 * Production driver — S3-compatible (AWS S3, Cloudflare R2, Backblaze B2).
 *
 * Recommended for this workload: Cloudflare R2. A property marketplace is egress-heavy —
 * 650 GB of photos served repeatedly is exactly where an S3 bill goes wrong — and R2 has
 * no egress charge.
 *
 * Two buckets, and the split is a security boundary, not an organisational one:
 *   private — originals and ownership documents. No public access, ever. Documents are
 *             contracts containing national ID numbers; they are reachable only through a
 *             signed URL issued after a server-side permission check.
 *   public  — derived, watermarked renditions, served through the CDN.
 */
export class S3Driver implements StorageDriver {
  readonly name = "s3";
  private readonly client: S3Client;

  constructor(
    private readonly config: {
      endpoint: string;
      region: string;
      bucketPrivate: string;
      bucketPublic: string;
      cdnBaseUrl: string;
      accessKeyId: string;
      secretAccessKey: string;
    },
  ) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      // R2 and most S3-compatible providers require path-style addressing.
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * A presigned PUT the client uploads to directly.
   *
   * ContentLength is part of the signature, so a client cannot sign for a 2 MB photo and
   * then upload 2 GB. Without that condition the size caps in RULES are advisory only —
   * the client would simply be asked nicely.
   */
  async presignUpload(key: string, mime: string, maxBytes: number): Promise<PresignedUpload> {
    const expiresInSeconds = 600;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucketPrivate,
        Key: key,
        ContentType: mime,
        ContentLength: maxBytes,
      }),
      { expiresIn: expiresInSeconds },
    );

    return {
      url,
      headers: { "Content-Type": mime, "Content-Length": String(maxBytes) },
      key,
      expiresInSeconds,
    };
  }

  /**
   * A short-lived URL for a private object.
   *
   * Call this ONLY after checking that the requester may see the object. The URL itself
   * carries no authorisation beyond its expiry — anyone holding it can read the file
   * until it lapses, so keep the window short and never log it.
   */
  async presignDownload(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucketPrivate, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Public renditions are served by the CDN, never by this application. */
  publicUrl(key: string): string {
    return `${this.config.cdnBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  /**
   * Delete everything under a prefix — used when a listing is removed.
   *
   * Paginated because a listing with photos, renditions and documents can exceed the
   * 1,000-key page limit, and a single unpaginated call would silently leave files
   * behind. Deleted from both buckets: a rendition in the public bucket outliving its
   * original is a photo of a property that no longer exists, still on the CDN.
   */
  async putObject(visibility: "public" | "private", key: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: visibility === "public" ? this.config.bucketPublic : this.config.bucketPrivate,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        // Keys carry a uuid and are never rewritten, so public renditions cache forever.
        CacheControl: visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
      }),
    );
  }

  async deletePrivateObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucketPrivate, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    for (const Bucket of [this.config.bucketPrivate, this.config.bucketPublic]) {
      let ContinuationToken: string | undefined;
      do {
        const listed = await this.client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }),
        );
        const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key);
        if (keys.length > 0) {
          await this.client.send(
            new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }),
          );
          deleted += keys.length;
        }
        ContinuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (ContinuationToken);
    }
    return deleted;
  }
}

let driver: StorageDriver | null = null;

/** MEDIA_UPLOADS=disabled: refuse every upload (see assertProductionStorage). */
export function uploadsDisabled(): boolean {
  return process.env.MEDIA_UPLOADS === "disabled";
}

export function storage(): StorageDriver {
  if (driver) return driver;

  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  // All three or none. Half-configured storage that silently falls back to local is how
  // uploads end up on an ephemeral container disk and disappear on the next deploy.
  if (endpoint && accessKeyId && secretAccessKey) {
    driver = new S3Driver({
      endpoint,
      region: process.env.S3_REGION ?? "auto",
      bucketPrivate: process.env.S3_BUCKET_PRIVATE ?? "aqar-private",
      bucketPublic: process.env.S3_BUCKET_PUBLIC ?? "aqar-public",
      cdnBaseUrl: process.env.CDN_BASE_URL ?? "",
      accessKeyId,
      secretAccessKey,
    });
  } else {
    driver = new LocalDriver();
  }
  return driver;
}

/**
 * Fail fast at boot rather than at the first upload.
 *
 * Serving 650 GB of media from a Node process is not a degraded mode, it is an outage
 * waiting for traffic. Call this from a startup check.
 */
export function assertProductionStorage(): void {
  if (process.env.NODE_ENV !== "production") return;
  // A deliberate, visible choice for preview deploys with no object storage (e.g. Vercel,
  // whose disk is read-only): uploads are refused with storage_driver_unsupported instead
  // of half-working on an ephemeral disk. Nothing is served from local disk either.
  if (uploadsDisabled()) return;
  if (storage().name === "local") {
    throw new Error(
      "Object storage is not configured (needs S3_ENDPOINT, S3_ACCESS_KEY_ID and " +
        "S3_SECRET_ACCESS_KEY) and the local driver routes media through the application " +
        "server. Configure storage before deploying.",
    );
  }
}

export function storageStats(): { driver: string; productionReady: boolean } {
  const name = storage().name;
  return { driver: name, productionReady: name !== "local" };
}
