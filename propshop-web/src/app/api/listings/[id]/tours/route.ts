import { NextRequest } from "next/server";
import { ok, fail, requireUser, rateLimit, audit, clientIp } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth";
import { addTourLink, addTourVideo, toursFor, tourFail } from "@/lib/tourService";

/**
 * Virtual tours on a listing.
 *
 *   GET   → { tours }   the public sees approved tours; the owner and staff also see
 *                       pending ones (with status) so they can follow the review.
 *   POST  JSON      { url, title? }            a YouTube / Vimeo / Matterport / Kuula link
 *         multipart { file, title? }           an uploaded walkthrough video (MP4 / MOV)
 *
 * Owner-added tours wait for review; staff-added ones are approved on arrival.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionFromRequest(req);
  const tours = await toursFor(id, session);
  if (!tours) return fail("not_found", 404);
  return ok({ tours });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const actor = { id: auth.user.id, role: auth.user.role };

  const isUpload = (req.headers.get("content-type") ?? "").startsWith("multipart/form-data");
  if (isUpload) {
    // Videos are large: a tight limit keeps one account from filling the disk.
    if (!(await rateLimit(`tour-upload:${actor.id}`, 10, 60 * 60_000))) return fail("rate_limited", 429);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("file_required", 422);
    const r = await addTourVideo(id, actor, { bytes: Buffer.from(await file.arrayBuffer()), mime: file.type || "video/mp4", title: form!.get("title") });
    if (!r.ok) return tourFail(r);
    await audit(actor.id, "tour.add_video", "listing", id, { tourId: r.tour.id, status: r.tour.status }, clientIp(req));
    return ok({ tour: r.tour }, { status: 201 });
  }

  if (!(await rateLimit(`tour-link:${actor.id}`, 30, 60 * 60_000))) return fail("rate_limited", 429);
  const body = await req.json().catch(() => ({}));
  const r = await addTourLink(id, actor, body);
  if (!r.ok) return tourFail(r);
  await audit(actor.id, "tour.add_link", "listing", id, { tourId: r.tour.id, provider: r.tour.provider, status: r.tour.status }, clientIp(req));
  return ok({ tour: r.tour }, { status: 201 });
}
