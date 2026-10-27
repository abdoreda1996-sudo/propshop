import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { canEditListings } from "@/lib/permissions";
import { parseAdminEdit, diffFields, FINGERPRINT_FIELDS } from "@/lib/adminEdit";
import { buildUnitFingerprint } from "@/lib/fingerprint";
import { computeFairPriceForListing } from "@/lib/fairPriceService";
import { onListingVisibilityChanged } from "@/lib/catalogue";
import { validateListing } from "@/lib/listingFlow";

/**
 * PATCH /api/admin/listings/[id] — back-office edit of a listing and its unit.
 *
 * Body: `{ unit?: {...}, listing?: {...} }`, only the fields being changed (rules in
 * src/lib/adminEdit.ts). Works in every status, including live: correcting a published
 * listing is exactly what the back office needs to be able to do.
 *
 * Side effects, all inside one transaction or straight after it:
 *   - a fingerprint field changed → the fingerprint is rebuilt, and a clash with another
 *     unit is refused (409) rather than silently creating a second listing for one unit;
 *   - the price changed → a PriceHistory row, then the fair price is recomputed so
 *     "best value" and the verdict follow the new number;
 *   - the audit log gets a field-by-field before/after.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!canEditListings(auth.user.role)) return fail("forbidden", 403);
  const { id } = await params;

  const parsed = parseAdminEdit(await req.json().catch(() => ({})));
  if (!parsed.ok) return fail("invalid_fields", 422, { errors: parsed.errors });

  const listing = await prisma.listing.findUnique({ where: { id }, include: { unit: true } });
  if (!listing) return fail("not_found", 404);

  const unitChanges = diffFields(listing.unit as unknown as Record<string, unknown>, parsed.unit);
  const listingChanges = diffFields(listing as unknown as Record<string, unknown>, parsed.listing);
  if (!Object.keys(unitChanges).length && !Object.keys(listingChanges).length) {
    return ok({ changed: false });
  }

  const unitData: Prisma.UnitUpdateInput = { ...parsed.unit };
  if (FINGERPRINT_FIELDS.some((f) => f in unitChanges)) {
    const next = { ...listing.unit, ...parsed.unit };
    unitData.unitFingerprint = buildUnitFingerprint({
      compoundId: next.compoundId,
      areaId: next.areaId,
      building: next.building,
      floor: next.floor,
      unitNumber: next.unitNumber,
      type: next.type,
      sizeSqm: next.sizeSqm,
    });
  }

  const priceChanged = "price" in listingChanges;

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(unitChanges).length) {
        await tx.unit.update({ where: { id: listing.unitId }, data: unitData });
      }
      if (Object.keys(listingChanges).length) {
        await tx.listing.update({ where: { id }, data: parsed.listing });
      }
      if (priceChanged) {
        await tx.priceHistory.create({ data: { listingId: id, price: parsed.listing.price as number, kind: "ask" } });
      }
    });
  } catch (e) {
    // P2002 on unitFingerprint: the edited address now matches another unit.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("duplicate_unit", 409);
    }
    throw e;
  }

  // Derived data follows the edit. Neither may fail the save that already happened.
  if (priceChanged || "sizeSqm" in unitChanges || "type" in unitChanges) {
    await computeFairPriceForListing(id).catch(() => null);
  }
  await onListingVisibilityChanged(id);

  await audit(auth.user.id, "listing_edited", "listing", id, { unit: unitChanges, listing: listingChanges }, clientIp(req));

  // Report the gate's view of the edited listing. An admin can save something that would
  // no longer pass (e.g. a size outside the compound's range) — they should see that.
  const gate = await validateListing(id);
  return ok({ changed: true, unit: unitChanges, listing: listingChanges, gate });
}
