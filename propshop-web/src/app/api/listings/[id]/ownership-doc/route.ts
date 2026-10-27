import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { extractOwnershipDocument, toValidationExtract, isClaudeConfigured } from "@/lib/claude";
import { OWNERSHIP_DOC_TYPES } from "@/lib/enums";
import { validateListing } from "@/lib/listingFlow";
import { savePrivateImage } from "@/lib/mediaStore";
import { storage } from "@/lib/storage";
import { ownershipFileKey, ownershipReviewReason, ownershipPageKeys } from "@/lib/kyc";
import { parseJson } from "@/lib/json";

/**
 * POST /api/listings/[id]/ownership-doc — attaches the ownership proof and runs the
 * Claude extraction that the publish gate compares against the typed unit details.
 *
 * The pages are stored in the PRIVATE bucket first (up to 4; the first page's key is the
 * row's fileKey, every page's key is in extractedJson.pageKeys), so the verification team
 * sees exactly what was sent through /api/admin/kyc/[id]/file. When the extraction is
 * unavailable (no ANTHROPIC_API_KEY) or fails, the document is still kept and flagged for
 * manual review rather than refused: the gate then skips the automatic comparisons and a
 * reviewer compares the pages by eye before approving the listing.
 *
 * The extraction is evidence for the reviewer; it never approves anything by itself.
 */
/** Pages kept per document; matches what the web wizard and the app send. */
const MAX_PAGES = 4;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: { unit: { select: { ownerId: true, building: true, unitNumber: true, sizeSqm: true, type: true, compound: { select: { nameAr: true } } } } },
  });
  if (!listing) return fail("not_found", 404);
  if (listing.unit.ownerId !== auth.user.id) return fail("forbidden", 403);
  if (!["draft", "rejected"].includes(listing.status)) return fail("listing_locked", 409);

  const body = await req.json().catch(() => ({}));
  const type = String(body.type ?? "contract");
  if (!(OWNERSHIP_DOC_TYPES as readonly string[]).includes(type)) return fail("invalid_type", 422);

  const owner = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { fullName: true, nationalIdHash: true },
  });

  let extracted: Record<string, unknown>;
  let fileKey: string;
  let manualReview = false;
  if (Array.isArray(body.images) && body.images.length > 0) {
    const images = body.images.slice(0, MAX_PAGES);
    // Store first: whatever the extraction makes of it, a reviewer must be able to look.
    const pageKeys: string[] = [];
    for (const image of images) {
      const saved = await savePrivateImage(image, (ext) => ownershipFileKey(auth.user.id, id, ext));
      if (!saved.ok) {
        // Do not leave half a document behind.
        for (const k of pageKeys) await storage().deletePrivateObject(k).catch(() => {});
        const status = saved.reason === "too_large" ? 413 : saved.reason === "storage_driver_unsupported" ? 503 : 422;
        return fail(saved.reason, status);
      }
      pageKeys.push(saved.key);
    }
    fileKey = pageKeys[0];

    const result = await extractOwnershipDocument(images);
    if (result.ok && !result.stub) {
      extracted = { ...toValidationExtract(result.data), legibilityNotes: result.data.legibilityNotes };
    } else {
      manualReview = true;
      extracted = {
        manualReview: true,
        manualReviewReason: ownershipReviewReason(result),
        ...(result.ok ? {} : { extractionError: result.error.slice(0, 200) }),
      };
    }
    extracted.pageKeys = pageKeys;
  } else if (body.demo && process.env.NODE_ENV !== "production") {
    // Demo path for the web wizard, which has no real document upload yet. It mirrors a
    // clean extraction of the unit the owner just described, so the gate can be exercised
    // end to end without an API key or a scanned contract.
    fileKey = String(body.fileKey ?? "") || `docs/${id}/demo-${type}`;
    extracted = {
      ownerName: owner?.fullName ?? null,
      nationalIdHash: owner?.nationalIdHash ?? null,
      compoundName: listing.unit.compound?.nameAr ?? null,
      building: listing.unit.building,
      unitNumber: listing.unit.unitNumber,
      sizeSqm: listing.unit.sizeSqm,
      unitType: listing.unit.type,
      deliveryDate: null,
      documentDate: new Date().toISOString().slice(0, 10),
      isSigned: true,
      isPhotocopy: false,
    };
  } else {
    return fail("images_required", 422, { claudeConfigured: isClaudeConfigured() });
  }

  // One ownership document per listing — a re-upload replaces the previous one, the row
  // and its stored pages. The new row goes in first, so a failure never leaves none.
  const previous = await prisma.kycDocument.findMany({
    where: { listingId: id, type: { in: [...OWNERSHIP_DOC_TYPES] } },
    select: { id: true, userId: true, listingId: true, fileKey: true, extractedJson: true },
  });
  const doc = await prisma.kycDocument.create({
    data: {
      userId: auth.user.id,
      listingId: id,
      type,
      fileKey,
      status: "pending",
      extractedJson: JSON.stringify(extracted),
    },
  });
  if (previous.length) {
    await prisma.kycDocument.deleteMany({ where: { id: { in: previous.map((p) => p.id) } } });
    const keep = new Set(Array.isArray(extracted.pageKeys) ? (extracted.pageKeys as string[]) : []);
    for (const p of previous) {
      for (const k of ownershipPageKeys(p, parseJson<Record<string, unknown>>(p.extractedJson, {}))) {
        if (!keep.has(k)) await storage().deletePrivateObject(k).catch(() => {});
      }
    }
  }

  const validation = await validateListing(id);
  await audit(auth.user.id, "ownership_doc_uploaded", "listing", id, { type, manualReview }, clientIp(req));

  // pageKeys are storage internals; the owner gets the reading, not the object keys.
  const { pageKeys: _pageKeys, ...shown } = extracted;
  void _pageKeys;
  return ok({ documentId: doc.id, extracted: shown, manualReview, validation }, { status: 201 });
}
