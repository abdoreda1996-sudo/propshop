import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser } from "@/lib/api";
import { isStaff } from "@/lib/auth";
import { validateListing } from "@/lib/listingFlow";

/**
 * GET /api/listings/[id]/validate — runs the publish gate and returns every block and
 * warning with the exact field to fix. The wizard calls this on each step so the owner
 * never reaches "publish" only to be refused there.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const listing = await prisma.listing.findUnique({ where: { id }, include: { unit: { select: { ownerId: true } } } });
  if (!listing) return fail("not_found", 404);
  if (listing.unit.ownerId !== auth.user.id && !isStaff(auth.user.role)) return fail("forbidden", 403);

  const result = await validateListing(id);
  if (!result) return fail("not_found", 404);
  return ok(result);
}
