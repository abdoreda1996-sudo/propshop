import { prisma } from "./prisma";
import { TRUST } from "./enums";
import { parseJson } from "./json";
import { hashNationalId } from "./fingerprint";
import { notify } from "./notifications";
import { ID_DOC_TYPES, identityComplete, kycReviewState, MANUAL_REVIEW_MARKER } from "./kyc";

/**
 * Identity KYC persistence: trust-level upkeep and the reviewer's decision on one
 * document. Rules live in kyc.ts.
 */

type IdDoc = { type: string; status: string; extractedJson: string | null };

const withReviewState = (docs: IdDoc[]) =>
  docs.map((d) => ({ ...d, manualReview: kycReviewState(parseJson<Record<string, unknown>>(d.extractedJson, {})).manualReview }));

/** Raises the account to trust level 1 when its identity documents are complete. */
export async function refreshIdentityTrust(userId: string): Promise<boolean> {
  const docs = await prisma.kycDocument.findMany({
    where: { userId, type: { in: [...ID_DOC_TYPES] }, listingId: null },
    select: { type: true, status: true, extractedJson: true },
  });
  const complete = identityComplete(withReviewState(docs));
  if (complete) {
    await prisma.user.updateMany({
      where: { id: userId, trustLevel: { lt: TRUST.IDENTITY } },
      data: { trustLevel: TRUST.IDENTITY },
    });
  }
  return complete;
}

/** Identity documents a reviewer has to look at by hand: flagged and still pending. */
export function manualReviewWhere() {
  return {
    type: { in: [...ID_DOC_TYPES] },
    listingId: null,
    status: "pending",
    extractedJson: { contains: MANUAL_REVIEW_MARKER },
  };
}

export type IdentityDecision =
  | { ok: true; complete: boolean }
  | { ok: false; reason: "not_found" | "not_pending" | "reason_required" | "national_id_required" | "typed_mismatch" };

/**
 * A reviewer approves or rejects one pending identity document.
 *
 * Approving an ID front whose number was never machine-read requires the reviewer to type
 * the number from the card: that reading becomes the account's ID hash, so ownership
 * documents can be matched against it. If it differs from what the user typed the
 * reviewer must confirm (`confirmMismatch`) — the card wins, but not by accident.
 *
 * Rejecting drops the account back below level 1 and lets the user upload again.
 */
export async function decideIdentityDocument(
  docId: string,
  reviewerId: string,
  input: { decision: "approve" | "reject"; reason?: string; nationalId?: string; confirmMismatch?: boolean },
): Promise<IdentityDecision> {
  const doc = await prisma.kycDocument.findUnique({
    where: { id: docId },
    include: { user: { select: { id: true, nationalIdHash: true } } },
  });
  if (!doc || doc.listingId || !(ID_DOC_TYPES as readonly string[]).includes(doc.type)) return { ok: false, reason: "not_found" };
  if (doc.status !== "pending") return { ok: false, reason: "not_pending" };
  const extracted = parseJson<Record<string, unknown>>(doc.extractedJson, {});
  const now = new Date();

  if (input.decision === "reject") {
    const reason = (input.reason ?? "").trim().slice(0, 500);
    if (reason.length < 5) return { ok: false, reason: "reason_required" };
    await prisma.kycDocument.update({
      where: { id: docId },
      data: { status: "rejected", rejectReason: reason, reviewerId, reviewedAt: now },
    });
    await prisma.user.updateMany({ where: { id: doc.userId, trustLevel: TRUST.IDENTITY }, data: { trustLevel: 0 } });
    await notify({
      userId: doc.userId,
      kind: "kyc_rejected",
      titleAr: "محتاجين صورة تانية لتوثيق الهوية",
      titleEn: "We need another photo to verify your identity",
      bodyAr: reason,
      bodyEn: reason,
      href: "/dashboard/verify",
    }).catch(() => false);
    return { ok: true, complete: false };
  }

  let nationalIdHash: string | null = null;
  if (doc.type === "id_front" && !doc.user.nationalIdHash) {
    const read = (input.nationalId ?? "").replace(/\D/g, "");
    if (read.length !== 14) return { ok: false, reason: "national_id_required" };
    nationalIdHash = hashNationalId(read);
    const typed = typeof extracted.typedIdHash === "string" ? extracted.typedIdHash : null;
    if (typed && typed !== nationalIdHash && !input.confirmMismatch) return { ok: false, reason: "typed_mismatch" };
  }

  await prisma.kycDocument.update({
    where: { id: docId },
    data: {
      status: "approved",
      reviewerId,
      reviewedAt: now,
      extractedJson: JSON.stringify({ ...extracted, reviewedManually: true }),
    },
  });
  if (nationalIdHash) await prisma.user.update({ where: { id: doc.userId }, data: { nationalIdHash } });

  const complete = await refreshIdentityTrust(doc.userId);
  if (complete) {
    await notify({
      userId: doc.userId,
      kind: "kyc_verified",
      titleAr: "هويتك اتوثقت",
      titleEn: "Your identity is verified",
      href: "/dashboard/verify",
      dedupeKey: "kyc_verified",
    }).catch(() => false);
  }
  return { ok: true, complete };
}
