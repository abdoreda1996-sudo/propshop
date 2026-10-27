import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireStaff, audit, clientIp } from "@/lib/api";
import { advanceRequest, recordFirstResponse } from "@/lib/requests";
import { REQUEST_STATUSES, RequestStatus } from "@/lib/enums";
import { canAccessAdminSection } from "@/lib/permissions";

/** PATCH /api/requests/[id] — advisor actions: log the first response, move the status. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if ("response" in auth) return auth.response;
  // requireStaff admits photographers and reviewers too; this queue is the advisors'.
  if (!canAccessAdminSection(auth.user.role, "requests")) return fail("forbidden", 403);
  const { id } = await params;

  const request = await prisma.request.findUnique({ where: { id } });
  if (!request) return fail("not_found", 404);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "first_response") {
    // Take ownership if the request was unassigned, so the queue reflects reality.
    if (!request.assignedAdvisorId) {
      await prisma.request.update({
        where: { id },
        data: { assignedAdvisorId: auth.user.id, assignedAt: new Date() },
      });
    }
    const updated = await recordFirstResponse(id, auth.user.id, body.note ? String(body.note) : undefined);
    await audit(auth.user.id, "request_first_response", "request", id, null, clientIp(req));
    return ok({ status: updated?.status, firstResponseAt: updated?.firstResponseAt });
  }

  if (action === "status") {
    const status = String(body.status ?? "");
    if (!REQUEST_STATUSES.includes(status as RequestStatus)) return fail("invalid_status", 422);
    const updated = await advanceRequest(id, status as RequestStatus, auth.user.id, body.note ? String(body.note) : undefined);
    await audit(auth.user.id, "request_status", "request", id, { status }, clientIp(req));
    return ok({ status: updated.status });
  }

  return fail("invalid_action", 422);
}
