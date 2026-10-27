import { NextRequest } from "next/server";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { submitForReview } from "@/lib/listingFlow";

/** POST /api/listings/[id]/submit — draft to pending_review, refused unless the gate passes. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const outcome = await submitForReview(id, auth.user.id);
  if (!outcome.ok) {
    const status = outcome.reason === "not_found" ? 404 : outcome.reason === "forbidden" ? 403 : 422;
    return fail(outcome.reason, status, { validation: outcome.result });
  }

  await audit(auth.user.id, "listing_submitted", "listing", id, null, clientIp(req));
  return ok(outcome);
}
