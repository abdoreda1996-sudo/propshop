import { NextRequest } from "next/server";
import { ok, fail, requireStaff, clientIp } from "@/lib/api";
import { canResolveReports } from "@/lib/permissions";
import { resolveReport } from "@/lib/reportService";

/**
 * PATCH /api/reports/[id] — a human upholds or dismisses a report.
 *
 * Only an upheld report issues a strike, and reaching the threshold suspends the account
 * and pauses its live listings. Reporting alone can never harm an owner.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if ("response" in auth) return auth.response;
  // requireStaff admits photographers and advisors too; resolving reports is not their job.
  if (!canResolveReports(auth.user.role)) return fail("forbidden", 403);
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "");
  if (!["upheld", "dismissed"].includes(status)) return fail("invalid_status", 422);

  const r = await resolveReport(id, status as "upheld" | "dismissed", auth.user.id, clientIp(req));
  if (!r.ok) return fail(r.reason, r.reason === "not_found" ? 404 : 409);
  return ok({ status: r.status, strikes: r.strikes, blocked: r.blocked });
}
