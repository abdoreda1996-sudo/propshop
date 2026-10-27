import { NextRequest } from "next/server";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { canDecideVerification } from "@/lib/permissions";
import { decideIdentityDocument } from "@/lib/kycService";

/**
 * POST /api/admin/kyc/[id] — a reviewer decides one pending identity document.
 *   { decision: "approve", nationalId?, confirmMismatch? } | { decision: "reject", reason }
 * `nationalId` is the number the reviewer reads off the card; it is required to approve an
 * ID front that was never machine-read, and is only ever stored as a hash.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!canDecideVerification(auth.user.role)) return fail("forbidden", 403);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const decision = b.decision === "approve" || b.decision === "reject" ? b.decision : null;
  if (!decision) return fail("invalid_fields", 422);

  const r = await decideIdentityDocument(id, auth.user.id, {
    decision,
    reason: typeof b.reason === "string" ? b.reason : undefined,
    nationalId: typeof b.nationalId === "string" ? b.nationalId : undefined,
    confirmMismatch: b.confirmMismatch === true,
  });
  if (!r.ok) return fail(r.reason, r.reason === "not_found" ? 404 : r.reason === "not_pending" || r.reason === "typed_mismatch" ? 409 : 422);
  await audit(auth.user.id, `kyc_document_${decision === "approve" ? "approved" : "rejected"}`, "kyc_document", id, { complete: r.complete }, clientIp(req));
  return ok({ id, decision, complete: r.complete });
}
