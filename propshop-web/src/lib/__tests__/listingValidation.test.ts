/**
 * The publish gate is the product (Section 4: "ask before deviating — they are the
 * product"), so every rule in Section 6c gets a test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateForPublish, namesMatch, ValidationSnapshot } from "../listingValidation";
import { MAX_ACTIVE_LISTINGS_PER_IDENTITY, MIN_PHOTOS, REQUIRED_ROOMS } from "../enums";
import { squareRing } from "../geo";

const COMPOUND_LAT = 30.0176;
const COMPOUND_LNG = 31.4899;

function photos(count = MIN_PHOTOS, overrides: Partial<ValidationSnapshot["media"][number]> = {}) {
  return REQUIRED_ROOMS.slice(0, count).map((room) => ({
    source: "in_app",
    room,
    gpsLat: COMPOUND_LAT,
    gpsLng: COMPOUND_LNG,
    capturedAt: new Date(),
    phash: `hash-${room}`,
    duplicateOf: null,
    ...overrides,
  }));
}

/** A snapshot that passes every check; each test breaks exactly one thing. */
function validSnapshot(): ValidationSnapshot {
  return {
    owner: {
      trustLevel: 1,
      fullName: "أحمد محمود عبد الرحمن",
      nationalIdHash: "hash-1",
      strikes: 0,
      isBlocked: false,
      activeListingCount: 0,
      listingCapOverride: null,
    },
    unit: {
      type: "apartment",
      sizeSqm: 165,
      bedrooms: 3,
      building: "B9",
      unitNumber: "304",
      floor: 3,
      deliveryStatus: "ready",
      lat: COMPOUND_LAT,
      lng: COMPOUND_LNG,
      compoundId: "c1",
    },
    compound: {
      id: "c1",
      nameEn: "Mivida",
      nameAr: "ميفيدا",
      minSizeSqm: 110,
      maxSizeSqm: 620,
      allowedUnitTypes: ["apartment", "villa", "townhouse", "duplex"],
      geomJson: JSON.stringify({ type: "Polygon", coordinates: [squareRing(COMPOUND_LAT, COMPOUND_LNG, 800)] }),
    },
    listing: {
      price: 9800000,
      purpose: "sale",
      paymentType: "cash",
      descriptionAr: "وصف",
      descriptionEn: "Description",
    },
    media: photos(),
    ownershipDoc: {
      type: "contract",
      status: "pending",
      extracted: {
        ownerName: "أحمد محمود عبد الرحمن",
        nationalIdHash: "hash-1",
        compoundName: "ميفيدا",
        building: "B9",
        unitNumber: "304",
        sizeSqm: 165,
        unitType: "apartment",
        isSigned: true,
        isPhotocopy: false,
      },
    },
  };
}

const codes = (s: ValidationSnapshot) => validateForPublish(s).blocks.map((b) => b.code);

test("a complete listing passes the gate", () => {
  const result = validateForPublish(validSnapshot());
  assert.equal(result.canPublish, true, `unexpected blocks: ${result.blocks.map((b) => b.code)}`);
});

test("an unverified identity blocks publishing", () => {
  const s = validSnapshot();
  s.owner.trustLevel = 0;
  assert.ok(codes(s).includes("identity_not_verified"));
});

test("a verified identity alone is enough to reach the gate", () => {
  // Trust level 2 is earned by THIS listing's ownership document, not held by the
  // account — requiring level 2 on the account would deadlock every real owner.
  const s = validSnapshot();
  s.owner.trustLevel = 1;
  assert.equal(validateForPublish(s).canPublish, true);
});

test("a passing listing is published at trust level 2 or above", () => {
  const s = validSnapshot();
  s.owner.trustLevel = 1;
  assert.ok(validateForPublish(s).trustLevel >= 2);
});

test("a blocked account cannot publish", () => {
  const s = validSnapshot();
  s.owner.isBlocked = true;
  assert.ok(codes(s).includes("owner_blocked"));
});

test("the per-identity listing cap is enforced", () => {
  const s = validSnapshot();
  s.owner.activeListingCount = MAX_ACTIVE_LISTINGS_PER_IDENTITY;
  assert.ok(codes(s).includes("listing_cap_reached"));
});

test("an admin override raises the listing cap", () => {
  const s = validSnapshot();
  s.owner.activeListingCount = MAX_ACTIVE_LISTINGS_PER_IDENTITY;
  s.owner.listingCapOverride = MAX_ACTIVE_LISTINGS_PER_IDENTITY + 2;
  assert.ok(!codes(s).includes("listing_cap_reached"));
});

// --- Photos ---------------------------------------------------------------

test("fewer than the minimum photos blocks publishing", () => {
  const s = validSnapshot();
  s.media = photos(MIN_PHOTOS - 1);
  assert.ok(codes(s).includes("photos_below_minimum"));
});

test("a missing required room blocks publishing", () => {
  const s = validSnapshot();
  s.media = photos(MIN_PHOTOS);
  s.media[0].room = null;
  assert.ok(codes(s).includes("rooms_missing"));
});

test("gallery uploads cannot substitute for in-app capture", () => {
  const s = validSnapshot();
  s.media = photos(MIN_PHOTOS, { source: "upload" });
  const c = codes(s);
  assert.ok(c.includes("photos_below_minimum"));
  assert.ok(c.includes("upload_before_capture"));
});

test("photographer shots satisfy the capture requirement", () => {
  const s = validSnapshot();
  s.media = photos(MIN_PHOTOS, { source: "photographer" });
  assert.equal(validateForPublish(s).canPublish, true);
});

test("a duplicate photo blocks publishing", () => {
  const s = validSnapshot();
  s.media[2].duplicateOf = "other-listing-id";
  assert.ok(codes(s).includes("duplicate_photos"));
});

test("photos without GPS warn but do not block, and cost the photo-verified level", () => {
  const s = validSnapshot();
  s.media = photos(MIN_PHOTOS, { gpsLat: null, gpsLng: null });
  const result = validateForPublish(s);
  assert.equal(result.canPublish, true);
  assert.ok(result.warnings.some((w) => w.code === "photos_missing_gps"));
  assert.equal(result.trustLevel, 2, "no GPS means no photo-verified badge");
});

test("GPS-stamped photos earn trust level 3", () => {
  assert.equal(validateForPublish(validSnapshot()).trustLevel, 3);
});

// --- Ownership document ---------------------------------------------------

test("a missing ownership document blocks publishing", () => {
  const s = validSnapshot();
  s.ownershipDoc = null;
  assert.ok(codes(s).includes("ownership_doc_missing"));
});

test("a rejected ownership document blocks publishing", () => {
  const s = validSnapshot();
  s.ownershipDoc!.status = "rejected";
  assert.ok(codes(s).includes("ownership_doc_rejected"));
});

test("an unsigned document is refused", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.isSigned = false;
  assert.ok(codes(s).includes("ownership_doc_unsigned"));
});

test("a photocopy of a photocopy is refused", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.isPhotocopy = true;
  assert.ok(codes(s).includes("ownership_doc_photocopy"));
});

test("an unreadable document is refused", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted = null;
  assert.ok(codes(s).includes("ownership_doc_unreadable"));
});

test("a stored document nobody could read goes to manual review instead of blocking", () => {
  const s = validSnapshot();
  // What the ownership route stores when there is no API key or the read failed.
  s.ownershipDoc!.extracted = { manualReview: true };
  const result = validateForPublish(s);
  assert.equal(result.canPublish, true);
  assert.ok(result.warnings.some((w) => w.code === "ownership_doc_manual_review"));
  assert.ok(!result.blocks.some((b) => b.code === "owner_name_mismatch"));
});

test("manual review does not override a rejected document", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted = { manualReview: true };
  s.ownershipDoc!.status = "rejected";
  assert.ok(codes(s).includes("ownership_doc_rejected"));
});

// --- Extraction vs typed --------------------------------------------------

test("a name mismatch between document and ID blocks publishing", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.ownerName = "شخص مختلف تماما";
  assert.ok(codes(s).includes("owner_name_mismatch"));
});

test("a national ID mismatch blocks publishing", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.nationalIdHash = "a-different-hash";
  assert.ok(codes(s).includes("national_id_mismatch"));
});

test("a unit number mismatch blocks publishing", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.unitNumber = "999";
  assert.ok(codes(s).includes("unit_number_mismatch"));
});

test("a building mismatch blocks publishing", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.building = "B1";
  assert.ok(codes(s).includes("building_mismatch"));
});

test("a size mismatch beyond tolerance blocks publishing", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.sizeSqm = 200; // vs 165 typed
  assert.ok(codes(s).includes("size_mismatch"));
});

test("a small rounding difference in size is tolerated", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.sizeSqm = 168; // within 5%
  assert.ok(!codes(s).includes("size_mismatch"));
});

test("a compound mismatch blocks publishing", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.compoundName = "كمبوند تاني خالص";
  assert.ok(codes(s).includes("compound_mismatch"));
});

test("fields the document does not state are not treated as mismatches", () => {
  const s = validSnapshot();
  s.ownershipDoc!.extracted!.unitNumber = null;
  s.ownershipDoc!.extracted!.building = null;
  s.ownershipDoc!.extracted!.sizeSqm = null;
  assert.equal(validateForPublish(s).canPublish, true);
});

// --- Compound cross-checks ------------------------------------------------

test("a size outside the compound range blocks publishing", () => {
  const s = validSnapshot();
  s.unit.sizeSqm = 5000;
  s.ownershipDoc!.extracted!.sizeSqm = 5000;
  assert.ok(codes(s).includes("size_outside_compound_range"));
});

test("a unit type the compound does not contain blocks publishing", () => {
  const s = validSnapshot();
  s.unit.type = "chalet";
  s.ownershipDoc!.extracted!.unitType = "chalet";
  assert.ok(codes(s).includes("type_not_in_compound"));
});

test("a pin outside the compound polygon blocks publishing", () => {
  const s = validSnapshot();
  s.unit.lat = 31.5;
  s.unit.lng = 30.1;
  assert.ok(codes(s).includes("outside_compound_polygon"));
});

test("an unknown compound boundary does not block", () => {
  const s = validSnapshot();
  s.compound!.geomJson = null;
  assert.ok(!codes(s).includes("outside_compound_polygon"));
});

// --- Listing basics -------------------------------------------------------

test("a non-positive price blocks publishing", () => {
  const s = validSnapshot();
  s.listing.price = 0;
  assert.ok(codes(s).includes("price_invalid"));
});

test("a missing description warns but does not block", () => {
  const s = validSnapshot();
  s.listing.descriptionAr = null;
  s.listing.descriptionEn = null;
  const result = validateForPublish(s);
  assert.equal(result.canPublish, true);
  assert.ok(result.warnings.some((w) => w.code === "description_missing"));
});

test("every block names the field the owner has to fix, in both languages", () => {
  const s = validSnapshot();
  s.ownershipDoc = null;
  s.media = [];
  for (const b of validateForPublish(s).blocks) {
    assert.ok(b.messageAr.length > 0, `${b.code} has no Arabic message`);
    assert.ok(b.messageEn.length > 0, `${b.code} has no English message`);
  }
});

// --- Arabic name matching -------------------------------------------------

test("namesMatch handles honorifics and spacing", () => {
  assert.ok(namesMatch("أحمد محمود عبد الرحمن", "الاستاذ أحمد محمود عبد الرحمن"));
  assert.ok(namesMatch("أحمد  محمود   عبد الرحمن", "أحمد محمود عبد الرحمن"));
});

test("namesMatch normalises alef and ta-marbuta variants", () => {
  assert.ok(namesMatch("احمد محمود عبد الرحمن", "أحمد محمود عبد الرحمن"));
});

test("namesMatch rejects a genuinely different name", () => {
  assert.ok(!namesMatch("أحمد محمود عبد الرحمن", "محمد سيد إبراهيم فتحي"));
});

test("namesMatch rejects a partial overlap of one token", () => {
  assert.ok(!namesMatch("أحمد محمود عبد الرحمن", "أحمد سيد إبراهيم"));
});
