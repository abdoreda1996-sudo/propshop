/**
 * Virtual tours — the pure rules (no database, no disk), so they are unit-tested directly.
 *
 * A tour is either an uploaded walkthrough VIDEO or an EMBED of a hosted video / 3D tour.
 * Links are accepted only from a short list of providers and only in shapes whose ids we
 * can validate, then rebuilt into the provider's own embed URL. We never embed the URL
 * someone pasted: an arbitrary iframe on a listing page is a phishing page with our
 * branding around it.
 */

export const TOUR_PROVIDERS = ["upload", "youtube", "vimeo", "matterport", "kuula"] as const;
export type TourProvider = (typeof TOUR_PROVIDERS)[number];
export type TourKind = "video" | "embed";
export type TourStatus = "pending" | "approved" | "rejected";

/** Per listing, counting pending and approved (rejected ones don't take a slot). */
export const MAX_TOURS_PER_LISTING = 3;
export const TOUR_TITLE_MAX = 80;

export const TOUR_PROVIDER_LABELS: Record<TourProvider, { ar: string; en: string }> = {
  upload: { ar: "فيديو جولة", en: "Video tour" },
  youtube: { ar: "يوتيوب", en: "YouTube" },
  vimeo: { ar: "فيميو", en: "Vimeo" },
  matterport: { ar: "جولة ثلاثية الأبعاد", en: "3D tour" },
  kuula: { ar: "جولة 360°", en: "360° tour" },
};

/** 3D / 360° tours are explored, not watched — the listing page labels them differently. */
export function isImmersive(provider: string): boolean {
  return provider === "matterport" || provider === "kuula";
}

export type ParsedLink = { ok: true; provider: Exclude<TourProvider, "upload">; embedUrl: string } | { ok: false; reason: "link_invalid" | "provider_not_supported" };

/**
 * Pasted link → the provider's embed URL, or a reason it is refused.
 *
 *   YouTube     watch?v=ID, youtu.be/ID, /shorts/ID, /embed/ID, /live/ID → youtube-nocookie embed
 *   Vimeo       vimeo.com/123, vimeo.com/channels/x/123, player.vimeo.com/video/123
 *   Matterport  my.matterport.com/show/?m=ID
 *   Kuula       kuula.co/share/ID, kuula.co/post/ID (collections: /share/collection/ID)
 */
export function parseTourLink(input: string): ParsedLink {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { ok: false, reason: "link_invalid" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, reason: "link_invalid" };
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be" || host === "music.youtube.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = parts[0] ?? null;
    else if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1] ?? null;
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return { ok: false, reason: "link_invalid" };
    // nocookie: no tracking cookies for buyers who never press play.
    return { ok: true, provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = [...parts].reverse().find((p) => /^\d{6,12}$/.test(p));
    if (!id) return { ok: false, reason: "link_invalid" };
    return { ok: true, provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` };
  }

  if (host === "my.matterport.com" || host === "matterport.com") {
    const id = u.searchParams.get("m");
    if (!id || !/^[A-Za-z0-9]{8,20}$/.test(id)) return { ok: false, reason: "link_invalid" };
    return { ok: true, provider: "matterport", embedUrl: `https://my.matterport.com/show/?m=${id}&play=0` };
  }

  if (host === "kuula.co") {
    const collection = parts[0] === "share" && parts[1] === "collection";
    const id = collection ? parts[2] : parts[0] === "share" || parts[0] === "post" ? parts[1] : null;
    if (!id || !/^[A-Za-z0-9]{4,12}$/.test(id)) return { ok: false, reason: "link_invalid" };
    return { ok: true, provider: "kuula", embedUrl: `https://kuula.co/share/${collection ? "collection/" : ""}${id}?fs=1&vr=1&thumbs=1` };
  }

  return { ok: false, reason: "provider_not_supported" };
}

/** Is a stored embed URL one we would have produced? Guards the render, not just the write. */
export function isSafeEmbedUrl(url: string): boolean {
  return /^https:\/\/(www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}|player\.vimeo\.com\/video\/\d{6,12}|my\.matterport\.com\/show\/\?m=[A-Za-z0-9]{8,20}|kuula\.co\/share\/(collection\/)?[A-Za-z0-9]{4,12})([?&][\w=&%.-]*)?$/.test(url);
}

/** What the public listing page and API get for each approved tour. */
export const PUBLIC_TOUR_SELECT = { id: true, kind: true, provider: true, url: true, posterUrl: true, title: true } as const;

/** Who sees which tours. The public sees approved only; the owner and staff see all. */
export function visibleTourWhere(canSeeAll: boolean) {
  return canSeeAll ? { status: { not: "rejected" } } : { status: "approved" };
}

/**
 * Does an upload look like an MP4 / QuickTime file? The browser's Content-Type is a claim;
 * the `ftyp` box at offset 4 is how the container identifies itself.
 */
export function looksLikeVideo(bytes: Uint8Array): { ok: true; ext: "mp4" | "mov"; mime: string } | { ok: false } {
  if (bytes.length < 12) return { ok: false };
  const tag = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (tag !== "ftyp") return { ok: false };
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  // QuickTime files from iPhones; everything else in the ftyp family plays as MP4.
  return brand === "qt  " ? { ok: true, ext: "mov", mime: "video/quicktime" } : { ok: true, ext: "mp4", mime: "video/mp4" };
}

/**
 * Blanks GPS coordinates inside an MP4/MOV's metadata, in place, without changing the file
 * size — so every offset in the file stays valid and it still plays.
 *
 * Phones write the capture location into the `moov` box as an ISO 6709 string
 * ("+30.0444+031.2357+021.000/") — in `©xyz` (Android, older iOS) and in the
 * `com.apple.quicktime.location.ISO6709` metadata item. An owner's walkthrough must not
 * publish where they live if the listing is not their home, or where they were standing.
 * Only used when ffmpeg is unavailable; ffmpeg strips all metadata properly.
 *
 * Returns how many coordinate strings were blanked.
 */
export function blankVideoLocation(bytes: Uint8Array): number {
  let blanked = 0;
  for (const [start, end] of topLevelBoxes(bytes, "moov")) {
    // latin1 keeps one char per byte, so string offsets are byte offsets.
    const text = Buffer.from(bytes.buffer, bytes.byteOffset + start, end - start).toString("latin1");
    const re = /[+-]\d{1,2}(?:\.\d+)?[+-]\d{1,3}(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)?(?:CRS[^/]*)?\/?/g;
    for (const m of text.matchAll(re)) {
      // Require real precision so random byte runs that happen to look numeric are left alone.
      if (!/\.\d{3,}/.test(m[0])) continue;
      bytes.fill(0x20, start + m.index!, start + m.index! + m[0].length);
      blanked++;
    }
  }
  return blanked;
}

/** [start, end) of each top-level box with the given type. */
function topLevelBoxes(bytes: Uint8Array, type: string): [number, number][] {
  const out: [number, number][] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  while (off + 8 <= bytes.length) {
    let size = view.getUint32(off);
    const t = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    let header = 8;
    if (size === 1 && off + 16 <= bytes.length) {
      size = Number(view.getBigUint64(off + 8));
      header = 16;
    } else if (size === 0) {
      size = bytes.length - off;
    }
    if (size < header || off + size > bytes.length) break;
    if (t === type) out.push([off + header, off + size]);
    off += size;
  }
  return out;
}
