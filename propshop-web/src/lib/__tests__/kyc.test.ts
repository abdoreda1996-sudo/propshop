/**
 * Identity KYC rules: when a document waits for a human, when the account reaches level 1,
 * which keys name a stored photo — and recognising HEIC files the browser cannot decode.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { manualReviewReason, identityComplete, isStoredKycKey, kycFileKey, kycReviewState, MANUAL_REVIEW_MARKER, ownershipReviewReason, ownershipFileKey, isStoredOwnershipKey, ownershipPageKeys } from "../kyc";
import { isHeic, imageReadMessage, HeicUnsupportedError, ImageReadError } from "../imageUpload";

const ID = "29001011234567";
const read = (nationalIdRead: string | null, stub = false) => ({ stub, nationalIdRead });

test("manualReviewReason: an unreadable card is flagged, not refused", () => {
  assert.equal(manualReviewReason({ type: "id_front", extraction: null, typedNationalId: ID }), "unreadable");
  assert.equal(manualReviewReason({ type: "id_back", extraction: null, typedNationalId: ID }), "unreadable");
});

test("manualReviewReason: the front must yield the number; the back need not", () => {
  assert.equal(manualReviewReason({ type: "id_front", extraction: read(null), typedNationalId: ID }), "no_id_number");
  assert.equal(manualReviewReason({ type: "id_back", extraction: read(null), typedNationalId: ID }), null);
});

test("manualReviewReason: a number that differs from the typed one is flagged", () => {
  assert.equal(manualReviewReason({ type: "id_front", extraction: read("29001011234568"), typedNationalId: ID }), "id_number_mismatch");
  assert.equal(manualReviewReason({ type: "id_front", extraction: read("2900 1011 2345 67"), typedNationalId: ID }), null);
});

test("manualReviewReason: no API key means nothing was read; the selfie is never flagged", () => {
  assert.equal(manualReviewReason({ type: "id_front", extraction: read(null, true), typedNationalId: ID }), "auto_read_off");
  assert.equal(manualReviewReason({ type: "selfie", extraction: null, typedNationalId: "" }), null);
});

test("identityComplete: three documents, none rejected, none awaiting manual review", () => {
  const doc = (type: string, status = "pending", manualReview = false) => ({ type, status, manualReview });
  assert.equal(identityComplete([doc("id_front"), doc("id_back"), doc("selfie")]), true);
  assert.equal(identityComplete([doc("id_front"), doc("id_back")]), false);
  assert.equal(identityComplete([doc("id_front", "rejected"), doc("id_back"), doc("selfie")]), false);
  assert.equal(identityComplete([doc("id_front", "pending", true), doc("id_back"), doc("selfie")]), false);
  // A reviewer's approval clears the hold even though the flag stays in the history.
  assert.equal(identityComplete([doc("id_front", "approved", true), doc("id_back"), doc("selfie")]), true);
});

test("kycFileKey / isStoredKycKey: scoped by user; legacy placeholders are not stored files", () => {
  const key = kycFileKey("u1", "id_front", "jpg");
  assert.match(key, /^kyc\/u1\/id_front\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(isStoredKycKey("u1", key), true);
  assert.equal(isStoredKycKey("u2", key), false);
  assert.equal(isStoredKycKey("u1", "kyc/id_front-1712345678"), false);
  assert.equal(isStoredKycKey("u1", "kyc/u1/../u2/id_front/x.jpg"), false);
});

test("kycReviewState: reads the flag as the route serialises it", () => {
  const json = JSON.stringify({ manualReview: true, manualReviewReason: "unreadable", typedIdLast4: "4567" });
  assert.ok(json.includes(MANUAL_REVIEW_MARKER));
  assert.deepEqual(kycReviewState(JSON.parse(json)), { manualReview: true, reason: "unreadable", typedIdLast4: "4567" });
  assert.deepEqual(kycReviewState({ manualReviewReason: "bogus" }), { manualReview: false, reason: null, typedIdLast4: null });
});

test("isHeic: by type, or by name when the OS reports no type", () => {
  assert.equal(isHeic({ type: "image/heic", name: "a" }), true);
  assert.equal(isHeic({ type: "image/heif", name: "a" }), true);
  assert.equal(isHeic({ type: "", name: "IMG_0001.HEIC" }), true);
  assert.equal(isHeic({ type: "image/jpeg", name: "a.jpg" }), false);
});

test("imageReadMessage: HEIC gets its own bilingual advice", () => {
  const fallback = { ar: "عام", en: "generic" };
  assert.match(imageReadMessage(new HeicUnsupportedError(), false, fallback), /HEIC/);
  assert.match(imageReadMessage(new HeicUnsupportedError(), true, fallback), /HEIC/);
  assert.equal(imageReadMessage(new ImageReadError(), false, fallback), "generic");
});

test("ownershipReviewReason: a failed read or no API key goes to a person; a real read does not", () => {
  assert.equal(ownershipReviewReason({ ok: false }), "unreadable");
  assert.equal(ownershipReviewReason(null), "unreadable");
  assert.equal(ownershipReviewReason({ ok: true, stub: true }), "auto_read_off");
  assert.equal(ownershipReviewReason({ ok: true, stub: false }), null);
});

test("ownership page keys: scoped by owner and listing; legacy placeholders are not stored files", () => {
  const k1 = ownershipFileKey("u1", "l1", "jpg");
  const k2 = ownershipFileKey("u1", "l1", "png");
  assert.ok(isStoredOwnershipKey("u1", "l1", k1));
  assert.ok(!isStoredOwnershipKey("u2", "l1", k1));
  assert.ok(!isStoredOwnershipKey("u1", "l2", k1));
  const doc = { userId: "u1", listingId: "l1", fileKey: k1 };
  assert.deepEqual(ownershipPageKeys(doc, { pageKeys: [k1, k2, "kyc/u1/ownership/l1/../x.jpg"] }), [k1, k2]);
  assert.deepEqual(ownershipPageKeys(doc, {}), [k1]);
  assert.deepEqual(ownershipPageKeys({ ...doc, fileKey: "docs/l1/contract-171" }, {}), []);
  assert.deepEqual(ownershipPageKeys({ ...doc, listingId: null }, { pageKeys: [k1] }), []);
});
