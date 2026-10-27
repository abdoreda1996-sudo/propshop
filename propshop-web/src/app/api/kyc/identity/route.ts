import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { extractNationalId } from "@/lib/claude";
import { hashNationalId } from "@/lib/fingerprint";
import { namesMatch } from "@/lib/listingValidation";
import { TRUST } from "@/lib/enums";
import { savePrivateImage } from "@/lib/mediaStore";
import { storage } from "@/lib/storage";
import { isIdDocType, kycFileKey, isStoredKycKey, manualReviewReason } from "@/lib/kyc";
import { refreshIdentityTrust } from "@/lib/kycService";

/**
 * POST /api/kyc/identity — KYC level 1.
 *
 * The photo is stored in the PRIVATE bucket and its key recorded, so the verification
 * team can see exactly what was sent (/admin/verification). A card Claude cannot read, or
 * whose number differs from the typed one, is still stored — flagged for manual review —
 * instead of being refused or leaving the account without an ID hash nobody notices.
 *
 * Once all three documents are in and none is rejected or awaiting manual review, the
 * account is raised to trust level 1. Level 1 only proves who the person is; it never
 * makes a listing public on its own — that needs the per-unit ownership document (level 2).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const type = String(body.type ?? "");
  if (!isIdDocType(type)) return fail("invalid_type", 422);

  const nationalId = String(body.nationalId ?? "").replace(/\D/g, "");
  if (type !== "selfie" && nationalId.length !== 14) return fail("national_id_required", 422);

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { fullName: true, nationalIdHash: true },
  });
  if (!user) return fail("not_found", 404);

  let extracted: Record<string, unknown> | null = null;
  let nameMismatch = false;
  let fileKey: string;
  let manualReason: ReturnType<typeof manualReviewReason> = null;

  if (Array.isArray(body.images) && body.images.length > 0) {
    // Store first: whatever the extraction makes of it, a reviewer must be able to look.
    const saved = await savePrivateImage(body.images[0], (ext) => kycFileKey(auth.user.id, type, ext));
    if (!saved.ok) {
      const status = saved.reason === "too_large" ? 413 : saved.reason === "storage_driver_unsupported" ? 503 : 422;
      return fail(saved.reason, status);
    }
    fileKey = saved.key;

    // The selfie has no card in it; sending it to the ID reader only produced failures.
    const result = type === "selfie" ? null : await extractNationalId(body.images);
    const read = result?.ok ? (result.data.nationalId?.replace(/\D/g, "") ?? "") : "";
    manualReason = manualReviewReason({
      type,
      extraction: result?.ok ? { stub: result.stub, nationalIdRead: read || null } : null,
      typedNationalId: nationalId,
    });

    extracted = result?.ok
      ? { ...result.data, nationalId: undefined } // never persist the raw number
      : type === "selfie"
        ? { side: "selfie" }
        : { extractionError: result && !result.ok ? result.error : "extraction_failed" };
    // The name on the card must match the account name (Section 5, level 1).
    if (result?.ok && result.data.fullName && !namesMatch(result.data.fullName, user.fullName)) nameMismatch = true;
    // Only a number the card and the user agree on becomes the identity hash.
    if (read && !manualReason) {
      await prisma.user.update({ where: { id: auth.user.id }, data: { nationalIdHash: hashNationalId(read) } });
    }
  } else if (body.demo && process.env.NODE_ENV !== "production") {
    fileKey = String(body.fileKey ?? "") || `kyc/demo-${type}`;
    extracted = { fullName: user.fullName, side: type === "id_back" ? "back" : "front", demo: true };
    if (nationalId) {
      await prisma.user.update({
        where: { id: auth.user.id },
        data: { nationalIdHash: hashNationalId(nationalId) },
      });
    }
  } else {
    return fail("images_required", 422);
  }

  if (type !== "selfie" && nationalId) {
    // For the reviewer: the last digits to compare against the card, and a hash a manual
    // approval can check its own reading against. Never the number itself.
    extracted = { ...extracted, typedIdLast4: nationalId.slice(-4), typedIdHash: hashNationalId(nationalId) };
  }
  if (manualReason) extracted = { ...extracted, manualReview: true, manualReviewReason: manualReason };

  // A re-upload replaces the previous photo — the row and the stored object.
  const previous = await prisma.kycDocument.findMany({
    where: { userId: auth.user.id, type, listingId: null },
    select: { fileKey: true },
  });
  await prisma.kycDocument.deleteMany({ where: { userId: auth.user.id, type, listingId: null } });
  await prisma.kycDocument.create({
    data: {
      userId: auth.user.id,
      type,
      fileKey,
      status: nameMismatch ? "rejected" : "pending",
      rejectReason: nameMismatch ? "Name on ID does not match the account name." : null,
      extractedJson: extracted ? JSON.stringify(extracted) : null,
    },
  });
  for (const p of previous) {
    if (p.fileKey !== fileKey && isStoredKycKey(auth.user.id, p.fileKey)) {
      await storage().deletePrivateObject(p.fileKey).catch(() => {});
    }
  }

  const complete = await refreshIdentityTrust(auth.user.id);

  await audit(
    auth.user.id,
    "kyc_document_uploaded",
    "user",
    auth.user.id,
    { type, complete, manualReview: manualReason },
    clientIp(req),
  );

  return ok(
    {
      type,
      complete,
      nameMismatch,
      manualReview: !!manualReason,
      trustLevel: complete ? TRUST.IDENTITY : auth.user.trustLevel,
    },
    { status: 201 },
  );
}
