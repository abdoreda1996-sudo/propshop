import { prisma } from "./prisma";
import { storage } from "./storage";
import { PUBLIC_LISTING_WHERE } from "./listings";
import { isSafeEmbedUrl, parseTourLink } from "./tours";
import { backgroundEmbed, type HeroMedia, type HeroPosition } from "@/components/HeroBackdrop";

export type { HeroMedia, HeroPosition };

/**
 * The home page hero cover, as the admin set it in /admin/hero.
 *
 * Stored as one JSON row in SiteSetting ("home_hero"). Five sources:
 *   auto   — the newest approved virtual tour on a live listing, else the newest live
 *            listing's cover photo (what the hero did before it was editable)
 *   tour   — a specific approved listing tour
 *   link   — a tour link pasted here directly (YouTube / Vimeo / Matterport / Kuula),
 *            for a showcase tour that belongs to no listing
 *   photo  — a specific listing photo
 *   upload — an image or video the admin uploaded for the hero
 *
 * Every read re-checks what it points at: a tour that was since rejected, or a listing
 * that went off-market, falls back to `auto` rather than advertising something the site
 * would no longer show.
 */

export const HERO_KEY = "home_hero";

export const HERO_SOURCES = ["auto", "tour", "link", "photo", "upload"] as const;
export type HeroSource = (typeof HERO_SOURCES)[number];
export const HERO_POSITIONS = ["center", "top", "bottom", "left", "right"] as const satisfies readonly HeroPosition[];

export type HeroConfig = {
  source: HeroSource;
  tourId?: string;
  linkUrl?: string; // the normalised embed URL for `link`
  mediaId?: string; // ListingMedia id for `photo`
  uploadUrl?: string;
  uploadKind?: "image" | "video";
  uploadPoster?: string | null;
  /** How strongly the navy wash sinks the cover, 20–100. 100 is the original look. */
  dim: number;
  position: HeroPosition;
};

export const DEFAULT_HERO: HeroConfig = { source: "auto", dim: 100, position: "center" };

export type HeroCredit = { href: string; compoundAr: string | null; compoundEn: string | null; areaAr: string; areaEn: string };

export type HeroCover = {
  media: HeroMedia | null; // null → the page uses its constant fallback photo
  credit: HeroCredit | null;
  /** Set for tours: where "take the tour" goes. */
  tourHref: string | null;
  dim: number;
  position: HeroPosition;
};

const clampDim = (n: unknown) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(100, Math.max(20, v)) : DEFAULT_HERO.dim;
};

/** Validates admin input into a storable config. Returns an error code on bad input. */
export function parseHeroInput(body: Record<string, unknown>): { ok: true; config: HeroConfig } | { ok: false; reason: string } {
  const source = String(body.source ?? "") as HeroSource;
  if (!HERO_SOURCES.includes(source)) return { ok: false, reason: "source_invalid" };
  const position = (HERO_POSITIONS as readonly string[]).includes(String(body.position))
    ? (body.position as HeroPosition)
    : DEFAULT_HERO.position;
  const base: HeroConfig = { source, dim: clampDim(body.dim ?? DEFAULT_HERO.dim), position };

  switch (source) {
    case "auto":
      return { ok: true, config: base };
    case "tour":
      if (typeof body.tourId !== "string" || !body.tourId) return { ok: false, reason: "tour_required" };
      return { ok: true, config: { ...base, tourId: body.tourId } };
    case "photo":
      if (typeof body.mediaId !== "string" || !body.mediaId) return { ok: false, reason: "photo_required" };
      return { ok: true, config: { ...base, mediaId: body.mediaId } };
    case "link": {
      const parsed = parseTourLink(String(body.linkUrl ?? ""));
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      return { ok: true, config: { ...base, linkUrl: parsed.embedUrl } };
    }
    case "upload": {
      const url = String(body.uploadUrl ?? "");
      const kind = body.uploadKind === "video" ? "video" : "image";
      // Only files our own uploader wrote — never an arbitrary URL in an <img>/<video>.
      // The address the storage driver gives hero uploads: /media/... on disk, the bucket's
      // public URL on R2. Anything else is not ours.
      const prefix = storage().publicUrl("listings/site-hero/");
      if (!url.startsWith(prefix)) return { ok: false, reason: "upload_required" };
      const poster = typeof body.uploadPoster === "string" && body.uploadPoster.startsWith(prefix) ? body.uploadPoster : null;
      return { ok: true, config: { ...base, uploadUrl: url, uploadKind: kind, uploadPoster: poster } };
    }
  }
}

export async function getHeroConfig(): Promise<HeroConfig> {
  const row = await prisma.siteSetting.findUnique({ where: { key: HERO_KEY } });
  if (!row) return DEFAULT_HERO;
  try {
    const parsed = parseHeroInput(JSON.parse(row.value));
    return parsed.ok ? parsed.config : DEFAULT_HERO;
  } catch {
    return DEFAULT_HERO;
  }
}

export async function saveHeroConfig(config: HeroConfig, userId: string) {
  const value = JSON.stringify(config);
  await prisma.siteSetting.upsert({
    where: { key: HERO_KEY },
    create: { key: HERO_KEY, value, updatedById: userId },
    update: { value, updatedById: userId },
  });
}

function providerOf(url: string): string {
  const parsed = parseTourLink(url);
  return parsed.ok ? parsed.provider : "embed";
}

const LISTING_CREDIT_SELECT = {
  reference: true,
  unit: { select: { compound: { select: { nameAr: true, nameEn: true } }, area: { select: { nameAr: true, nameEn: true } } } },
} as const;

type CreditRow = { reference: string; unit: { compound: { nameAr: string; nameEn: string } | null; area: { nameAr: string; nameEn: string } } };

const creditOf = (l: CreditRow): HeroCredit => ({
  href: `/listing/${l.reference}`,
  compoundAr: l.unit.compound?.nameAr ?? null,
  compoundEn: l.unit.compound?.nameEn ?? null,
  areaAr: l.unit.area.nameAr,
  areaEn: l.unit.area.nameEn,
});

type TourRow = { kind: string; provider: string; url: string; posterUrl: string | null; listing: CreditRow };

function tourCover(t: TourRow, cfg: HeroConfig): HeroCover {
  const credit = creditOf(t.listing);
  const media: HeroMedia | null =
    t.kind === "video"
      ? { type: "video", src: t.url, poster: t.posterUrl }
      : isSafeEmbedUrl(t.url)
        ? { type: "embed", src: backgroundEmbed(t.url, t.provider), provider: t.provider }
        : null;
  return { media, credit, tourHref: credit.href, dim: cfg.dim, position: cfg.position };
}

const TOUR_ROW_SELECT = { kind: true, provider: true, url: true, posterUrl: true, listing: { select: LISTING_CREDIT_SELECT } } as const;

/**
 * What the home hero shows right now. `newestPhoto` is the page's existing pick (newest
 * live listing with a cover), passed in so `auto` costs no extra query when there is no tour.
 */
export async function resolveHeroCover(newestPhoto: { photo: string; credit: HeroCredit } | null): Promise<HeroCover> {
  const cfg = await getHeroConfig();
  const plain = (media: HeroMedia | null, credit: HeroCredit | null): HeroCover => ({ media, credit, tourHref: null, dim: cfg.dim, position: cfg.position });

  if (cfg.source === "tour" && cfg.tourId) {
    const t = await prisma.listingTour.findFirst({ where: { id: cfg.tourId, status: "approved", listing: PUBLIC_LISTING_WHERE }, select: TOUR_ROW_SELECT });
    if (t) return tourCover(t, cfg);
  }
  if (cfg.source === "link" && cfg.linkUrl && isSafeEmbedUrl(cfg.linkUrl)) {
    const provider = providerOf(cfg.linkUrl);
    return { ...plain({ type: "embed", src: backgroundEmbed(cfg.linkUrl, provider), provider }, null), tourHref: cfg.linkUrl };
  }
  if (cfg.source === "photo" && cfg.mediaId) {
    const m = await prisma.listingMedia.findFirst({ where: { id: cfg.mediaId, listing: PUBLIC_LISTING_WHERE }, select: { fileKey: true, listing: { select: LISTING_CREDIT_SELECT } } });
    if (m) return plain({ type: "image", src: m.fileKey }, creditOf(m.listing));
  }
  if (cfg.source === "upload" && cfg.uploadUrl) {
    return plain(cfg.uploadKind === "video" ? { type: "video", src: cfg.uploadUrl, poster: cfg.uploadPoster ?? null } : { type: "image", src: cfg.uploadUrl }, null);
  }

  // auto — and the fallback for any choice that no longer resolves.
  const tour = await prisma.listingTour.findFirst({
    where: { status: "approved", listing: PUBLIC_LISTING_WHERE },
    orderBy: { createdAt: "desc" },
    select: TOUR_ROW_SELECT,
  });
  if (tour) {
    const cover = tourCover(tour, cfg);
    if (cover.media) return cover;
  }
  return newestPhoto ? plain({ type: "image", src: newestPhoto.photo }, newestPhoto.credit) : plain(null, null);
}

/** What /admin/hero can pick from: approved tours and photos on live listings. */
export async function heroOptions() {
  const [tours, photos] = await Promise.all([
    prisma.listingTour.findMany({
      where: { status: "approved", listing: PUBLIC_LISTING_WHERE },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, kind: true, provider: true, url: true, posterUrl: true, title: true, listing: { select: LISTING_CREDIT_SELECT } },
    }),
    prisma.listingMedia.findMany({
      where: { listing: PUBLIC_LISTING_WHERE },
      orderBy: [{ isCover: "desc" }, { createdAt: "desc" }],
      take: 48,
      select: { id: true, fileKey: true, thumbKey: true, room: true, listing: { select: LISTING_CREDIT_SELECT } },
    }),
  ]);
  return { tours, photos };
}

export type HeroOptions = Awaited<ReturnType<typeof heroOptions>>;
