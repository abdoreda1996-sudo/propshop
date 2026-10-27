import { NextRequest } from "next/server";
import { ok, fail, requireUser, rateLimit } from "@/lib/api";
import { saveListingPhoto } from "@/lib/mediaStore";
import { saveTourVideo } from "@/lib/tourService";
import { looksLikeVideo } from "@/lib/tours";

/**
 * Uploads a hero image or video (admin only). Returns { url, kind, poster } — nothing is
 * live until the admin saves it on PUT /api/admin/hero.
 *
 * Reuses the listing pipelines under the reserved "site-hero" prefix, so hero files get
 * the same treatment as listing media: EXIF/GPS stripped, originals kept private, only
 * renditions served.
 */
const HERO_PREFIX = "site-hero";

export async function POST(req: NextRequest) {
  const auth = await requireUser(req, ["admin"]);
  if ("response" in auth) return auth.response;
  if (!(await rateLimit(`hero-upload:${auth.user.id}`, 20, 60 * 60_000))) return fail("rate_limited", 429);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("file_required", 422);
  const bytes = Buffer.from(await file.arrayBuffer());

  if (looksLikeVideo(bytes).ok) {
    const r = await saveTourVideo(HERO_PREFIX, bytes, file.type || "video/mp4");
    if (!r.ok) return fail(r.reason, 422);
    return ok({ url: r.url, kind: "video", poster: r.posterUrl }, { status: 201 });
  }
  const r = await saveListingPhoto(HERO_PREFIX, bytes, file.type);
  if (!r.ok) return fail(r.reason, 422);
  return ok({ url: r.photo.fileKey, kind: "image", poster: null }, { status: 201 });
}
