import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { createDraft, DraftInput } from "@/lib/listingFlow";
import { DELIVERY_STATUSES, FINISHINGS, PAYMENT_TYPES, PURPOSES, UNIT_TYPES } from "@/lib/enums";

/** POST /api/listings/draft — step 1 of the owner flow. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const b = await req.json().catch(() => ({}));

  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
  const input: DraftInput = {
    compoundId: b.compoundId ? String(b.compoundId) : null,
    areaId: String(b.areaId ?? ""),
    building: b.building ? String(b.building) : null,
    floor: b.floor === null || b.floor === undefined || b.floor === "" ? null : num(b.floor),
    unitNumber: b.unitNumber ? String(b.unitNumber) : null,
    type: String(b.type ?? ""),
    bedrooms: num(b.bedrooms),
    bathrooms: num(b.bathrooms),
    sizeSqm: num(b.sizeSqm),
    landSqm: b.landSqm ? num(b.landSqm) : null,
    finishing: String(b.finishing ?? ""),
    deliveryStatus: String(b.deliveryStatus ?? ""),
    deliveryDate: b.deliveryDate ? String(b.deliveryDate) : null,
    view: b.view ? String(b.view) : null,
    // Never read from the client: createDraft sets the location from the compound.
    lat: null,
    lng: null,
    // Rent was removed from the marketplace (owner, 2026-10-11): every listing is a sale.
    purpose: "sale",
    price: num(b.price),
    withoutOver: b.withoutOver === true || b.withoutOver === "true",
    paymentType: String(b.paymentType ?? ""),
    installment: b.installment ?? null,
    titleAr: b.titleAr ? String(b.titleAr) : null,
    titleEn: b.titleEn ? String(b.titleEn) : null,
    descriptionAr: b.descriptionAr ? String(b.descriptionAr) : null,
    descriptionEn: b.descriptionEn ? String(b.descriptionEn) : null,
  };

  // Enum-like fields are validated here because SQLite cannot enforce them.
  const invalid: string[] = [];
  if (!input.areaId) invalid.push("areaId");
  // Every unit on the platform is in a compound, and its location comes from it.
  if (!input.compoundId) invalid.push("compoundId");
  if (!UNIT_TYPES.includes(input.type as never)) invalid.push("type");
  if (!FINISHINGS.includes(input.finishing as never)) invalid.push("finishing");
  if (!DELIVERY_STATUSES.includes(input.deliveryStatus as never)) invalid.push("deliveryStatus");
  if (!PURPOSES.includes(input.purpose as never)) invalid.push("purpose");
  if (!PAYMENT_TYPES.includes(input.paymentType as never)) invalid.push("paymentType");
  if (!Number.isFinite(input.sizeSqm) || input.sizeSqm <= 0) invalid.push("sizeSqm");
  if (!Number.isFinite(input.price) || input.price <= 0) invalid.push("price");
  if (!Number.isFinite(input.bedrooms)) invalid.push("bedrooms");
  if (!Number.isFinite(input.bathrooms)) invalid.push("bathrooms");
  if (invalid.length) return fail("invalid_fields", 422, { fields: invalid });

  // The compound must exist, and it decides the area — a mismatched areaId is overridden
  // rather than trusted, for the same reason the coordinates are.
  const compound = await prisma.compound.findUnique({ where: { id: input.compoundId! }, select: { areaId: true } });
  if (!compound) return fail("invalid_fields", 422, { fields: ["compoundId"] });
  input.areaId = compound.areaId;

  const result = await createDraft(auth.user.id, input);
  if (!result.ok) {
    const status = result.reason === "duplicate_unit" ? 409 : 403;
    return fail(result.reason, status, { existingReference: result.existingReference });
  }

  await audit(auth.user.id, "listing_draft_created", "listing", result.listingId, null, clientIp(req));
  return ok(result, { status: 201 });
}
