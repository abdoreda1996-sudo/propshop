import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, rateLimit, audit, clientIp } from "@/lib/api";

const REASONS = ["contacted_by_broker", "fake_photos", "duplicate", "wrong_price", "unreachable", "other"];

/**
 * POST /api/reports — buyer-side reporting (Section 5). "I was contacted by a broker"
 * in one tap. Reports feed the strike system after a human upholds them; reporting
 * alone never auto-strikes an owner.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!await rateLimit(`report:${auth.user.id}`, 20, 60 * 60_000)) return fail("too_many_requests", 429);

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason ?? "");
  if (!REASONS.includes(reason)) return fail("invalid_reason", 422);

  const listingId = body.listingId ? String(body.listingId) : null;
  let targetUserId: string | null = null;
  if (listingId) {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { unit: { select: { ownerId: true } } },
    });
    if (!listing) return fail("listing_not_found", 404);
    targetUserId = listing.unit.ownerId;
  }

  const report = await prisma.report.create({
    data: {
      reporterId: auth.user.id,
      targetUserId,
      listingId,
      reason,
      detail: body.detail ? String(body.detail).slice(0, 2000) : null,
    },
  });

  await audit(auth.user.id, "report_created", "report", report.id, { reason }, clientIp(req));
  return ok({ id: report.id, status: report.status }, { status: 201 });
}
