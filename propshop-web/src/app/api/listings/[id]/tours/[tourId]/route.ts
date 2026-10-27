import { NextRequest } from "next/server";
import { ok, requireUser, audit, clientIp } from "@/lib/api";
import { deleteTour, reviewTour, tourFail } from "@/lib/tourService";

/**
 *   POST   { action: "approve" | "reject", reason? }   reviewers (admin, reviewer)
 *   DELETE                                             the listing's owner, or an admin
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; tourId: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { tourId } = await params;
  const b = await req.json().catch(() => ({}));
  const r = await reviewTour(tourId, auth.user, String(b.action ?? ""), typeof b.reason === "string" ? b.reason : undefined);
  if (!r.ok) return tourFail(r);
  await audit(auth.user.id, `tour.${b.action}`, "listing", r.listingId, { tourId, reason: b.reason ?? null }, clientIp(req));
  return ok({ status: b.action === "approve" ? "approved" : "rejected" });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; tourId: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { tourId } = await params;
  const r = await deleteTour(tourId, auth.user);
  if (!r.ok) return tourFail(r);
  await audit(auth.user.id, "tour.delete", "listing", r.listingId, { tourId }, clientIp(req));
  return ok({ deleted: true });
}
