import { NextRequest } from "next/server";
import { ok, fail, requireStaff, audit, clientIp } from "@/lib/api";
import { canDecideVerification } from "@/lib/permissions";
import { approveListing } from "@/lib/listingFlow";

/** POST /api/listings/[id]/publish — reviewer approval. Re-runs the gate before going live. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if ("response" in auth) return auth.response;
  // Any staff role passes requireStaff, including photographer and advisor. Deciding
  // whether a listing publishes is a reviewer/admin job (see permissions.ts).
  if (!canDecideVerification(auth.user.role)) return fail("forbidden", 403);
  const { id } = await params;

  const outcome = await approveListing(id, auth.user.id);
  if (!outcome.ok) {
    const status = outcome.reason === "not_found" ? 404 : 422;
    return fail(outcome.reason, status, { validation: outcome.result });
  }

  await audit(auth.user.id, "listing_approved", "listing", id, null, clientIp(req));
  return ok(outcome);
}
