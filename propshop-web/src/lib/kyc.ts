/**
 * Identity KYC (level 1) rules — pure, so they are testable without a database.
 * The route is src/app/api/kyc/identity; the reviewer side is src/lib/kycService.ts.
 *
 * Each of the three photos (ID front, ID back, selfie) is stored in the PRIVATE bucket and
 * its key recorded on the KycDocument row, so a reviewer can look at what was actually
 * sent. Claude reads the card; when it cannot — or the number it reads disagrees with the
 * one the user typed — the document is still kept but flagged for manual review, rather
 * than the account silently ending up with no ID hash to match ownership documents against.
 */

import { randomUUID } from "node:crypto";

export const ID_DOC_TYPES = ["id_front", "id_back", "selfie"] as const;
export type IdDocType = (typeof ID_DOC_TYPES)[number];

export function isIdDocType(v: string): v is IdDocType {
  return (ID_DOC_TYPES as readonly string[]).includes(v);
}

/** Why a document waits for a human. Shown on /admin/verification. */
export type ManualReviewReason =
  | "unreadable" // Claude could not read the card at all
  | "no_id_number" // read the front but not the 14-digit number
  | "id_number_mismatch" // the number on the card is not the one the user typed
  | "auto_read_off"; // ANTHROPIC_API_KEY not configured: nothing was read

export const MANUAL_REVIEW_LABELS: Record<ManualReviewReason, { ar: string; en: string }> = {
  unreadable: { ar: "البطاقة مش مقروءة آلياً", en: "Card unreadable by the automatic check" },
  no_id_number: { ar: "رقم البطاقة مش مقروء", en: "ID number not readable" },
  id_number_mismatch: { ar: "الرقم على البطاقة مختلف عن اللي كتبه", en: "Number on card differs from the typed one" },
  auto_read_off: { ar: "القراءة الآلية متوقفة", en: "Automatic reading is off" },
};

/**
 * Whether an uploaded document needs a human, and why. The selfie is never read by the
 * ID extractor (there is no card in it), so it only ever waits in the normal queue.
 */
export function manualReviewReason(input: {
  type: IdDocType;
  /** null when extraction failed outright. */
  extraction: { stub: boolean; nationalIdRead: string | null } | null;
  typedNationalId: string;
}): ManualReviewReason | null {
  if (input.type === "selfie") return null;
  if (!input.extraction) return "unreadable";
  if (input.extraction.stub) return "auto_read_off";
  const read = input.extraction.nationalIdRead?.replace(/\D/g, "") ?? "";
  if (!read) return input.type === "id_front" ? "no_id_number" : null;
  if (input.typedNationalId && read !== input.typedNationalId) return "id_number_mismatch";
  return null;
}

/** Private object key for a KYC photo. Scoped by user, so it can be checked on read. */
export function kycFileKey(userId: string, type: IdDocType, ext: string): string {
  const clean = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5) || "bin";
  return `kyc/${userId}/${type}/${randomUUID()}.${clean}`;
}

/**
 * True for a key this server stored. Rows written before photos were kept carry a
 * client-made placeholder ("kyc/id_front-1712…"), which names no stored object.
 */
export function isStoredKycKey(userId: string, key: string): boolean {
  return key.startsWith(`kyc/${userId}/`) && !key.includes("..");
}

/** What the reviewer page reads out of a document's extractedJson. */
export type KycReviewState = {
  manualReview: boolean;
  reason: ManualReviewReason | null;
  /** Last 4 digits of the number the user typed — enough to compare against the card. */
  typedIdLast4: string | null;
};

export function kycReviewState(extracted: Record<string, unknown>): KycReviewState {
  const reason = typeof extracted.manualReviewReason === "string" ? (extracted.manualReviewReason as ManualReviewReason) : null;
  return {
    manualReview: extracted.manualReview === true,
    reason: reason && reason in MANUAL_REVIEW_LABELS ? reason : null,
    typedIdLast4: typeof extracted.typedIdLast4 === "string" ? extracted.typedIdLast4 : null,
  };
}

/**
 * Identity is verified once all three documents are in, none was rejected, and none is
 * still waiting for a manual review. A flagged document holds the level back until a
 * reviewer approves it — that is what makes the flag a review and not a footnote.
 */
export function identityComplete(docs: { type: string; status: string; manualReview: boolean }[]): boolean {
  return (
    ID_DOC_TYPES.every((tp) => docs.some((d) => d.type === tp)) &&
    docs.every((d) => d.status !== "rejected") &&
    !docs.some((d) => d.status === "pending" && d.manualReview)
  );
}

/**
 * Marker searched for in extractedJson to list flagged documents without a new column.
 * Must match how the route serialises `manualReview: true` (JSON.stringify, no spaces).
 */
export const MANUAL_REVIEW_MARKER = '"manualReview":true';

// --- Ownership documents (trust level 2, per listing) ------------------------

/**
 * Why an ownership document waits for a human. The document is stored either way; the
 * publish gate then skips the automatic comparisons and the reviewer compares by eye.
 */
export type OwnershipReviewReason = "unreadable" | "auto_read_off";

export const OWNERSHIP_REVIEW_LABELS: Record<OwnershipReviewReason, { ar: string; en: string }> = {
  unreadable: { ar: "المستند مش مقروء آلياً", en: "Document unreadable by the automatic check" },
  auto_read_off: { ar: "القراءة الآلية متوقفة", en: "Automatic reading is off" },
};

/** null when the extraction produced a real reading the gate can compare. */
export function ownershipReviewReason(extraction: { ok: boolean; stub?: boolean } | null): OwnershipReviewReason | null {
  if (!extraction || !extraction.ok) return "unreadable";
  if (extraction.stub) return "auto_read_off";
  return null;
}

/** Private object key for one page of a listing's ownership document. */
export function ownershipFileKey(userId: string, listingId: string, ext: string): string {
  const clean = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5) || "bin";
  return `kyc/${userId}/ownership/${listingId}/${randomUUID()}.${clean}`;
}

/** True for an ownership page this server stored for this owner and listing. */
export function isStoredOwnershipKey(userId: string, listingId: string, key: string): boolean {
  return key.startsWith(`kyc/${userId}/ownership/${listingId}/`) && !key.includes("..");
}

/**
 * Every stored page of an ownership document, in order. The first page is the row's
 * fileKey; the rest are listed in extractedJson.pageKeys (a document can run to several
 * pages, the row has one key column). Placeholder keys from before files were kept are
 * dropped, so the result only names objects that exist.
 */
export function ownershipPageKeys(
  doc: { userId: string; listingId: string | null; fileKey: string },
  extracted: Record<string, unknown>,
): string[] {
  if (!doc.listingId) return [];
  const listed = Array.isArray(extracted.pageKeys) ? extracted.pageKeys.filter((k): k is string => typeof k === "string") : [];
  const keys = listed.length ? listed : [doc.fileKey];
  return keys.filter((k) => isStoredOwnershipKey(doc.userId, doc.listingId!, k));
}
