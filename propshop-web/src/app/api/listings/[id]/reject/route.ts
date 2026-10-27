import { NextRequest } from "next/server";
import { ok, fail, requireStaff, audit, clientIp } from "@/lib/api";
import { canDecideVerification } from "@/lib/permissions";
import { rejectListing } from "@/lib/listingFlow";

/** POST /api/listings/[id]/reject — sends the listing back to the owner with a reason. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if ("response" in auth) return auth.response;
  // Any staff role passes requireStaff, including photographer and advisor. Deciding
  // whether a listing publishes is a reviewer/admin job (see permissions.ts).
  if (!canDecideVerification(auth.user.role)) return fail("forbidden", 403);
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 5) return fail("reason_required", 422);

  const r = await rejectListing(id, auth.user.id, reason);
  if (!r.ok) return fail(r.reason, r.reason === "not_found" ? 404 : 409);
  await audit(auth.user.id, "listing_rejected", "listing", id, { reason }, clientIp(req));
  return ok({ status: "rejected" });
}
