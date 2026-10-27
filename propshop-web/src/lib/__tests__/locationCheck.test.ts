/**
 * Automatic location verification.
 *
 * The unit's location is always its compound's; these pin what counts as a photo "taken
 * there", and that a check which could not run is never reported as verified.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  checkListingLocation,
  compoundPoint,
  distanceToRingMetres,
  LocationSnapshot,
  PHOTO_TOLERANCE_METRES,
} from "../locationCheck";
import { squareRing } from "../geo";

// A 1 km x 1 km compound in New Cairo.
const LAT = 30.03;
const LNG = 31.47;
const geomJson = JSON.stringify({ type: "Polygon", coordinates: [squareRing(LAT, LNG, 500)] });
const compound = { nameAr: "كمبوند", nameEn: "Compound", centerLat: LAT, centerLng: LNG, geomJson };

// ~111 m per 0.001 degrees of latitude.
const north = (metres: number) => LAT + metres / 111_320;

const snap = (over: Partial<LocationSnapshot> = {}): LocationSnapshot => ({
  unit: { lat: LAT, lng: LNG },
  compound,
  media: [
    { id: "a", source: "in_app", gpsLat: LAT, gpsLng: LNG },
    { id: "b", source: "in_app", gpsLat: north(200), gpsLng: LNG },
  ],
  ...over,
});

test("a unit at its compound with on-site photos is verified", () => {
  const r = checkListingLocation(snap());
  assert.equal(r.status, "verified");
  assert.deepEqual(r.issues, []);
});

test("distance to the ring is 0 inside and grows outside", () => {
  assert.equal(distanceToRingMetres(LAT, LNG, geomJson), 0);
  const d = distanceToRingMetres(north(900), LNG, geomJson)!;
  // Boundary is 500 m north of the centre, so 900 m north is ~400 m outside.
  assert.ok(Math.abs(d - 400) < 10, String(d));
});

test("a photo just outside the fence is within tolerance", () => {
  const r = checkListingLocation(snap({ media: [{ id: "x", source: "in_app", gpsLat: north(500 + PHOTO_TOLERANCE_METRES - 50), gpsLng: LNG }] }));
  assert.equal(r.status, "verified");
});

test("a photo taken far from the compound is flagged with its distance and id", () => {
  const r = checkListingLocation(snap({ media: [{ id: "far", source: "in_app", gpsLat: north(5_000), gpsLng: LNG }] }));
  assert.equal(r.status, "issues");
  const issue = r.issues.find((i) => i.code === "photo_outside_compound");
  assert.ok(issue);
  assert.equal(issue.mediaId, "far");
  assert.equal(issue.severity, "high");
  assert.ok(issue.distanceM! > 4_000);
});

test("a demoted upload that still carries far-away GPS is flagged too", () => {
  // The media route demotes far in-app shots to "upload"; the evidence must survive that.
  const r = checkListingLocation(snap({ media: [{ id: "u", source: "upload", gpsLat: north(8_000), gpsLng: LNG }] }));
  assert.ok(r.issues.some((i) => i.code === "photo_outside_compound" && i.mediaId === "u"));
});

test("an in-app photo with no GPS is flagged; a plain upload without GPS is not", () => {
  const r = checkListingLocation(
    snap({
      media: [
        { id: "ok", source: "in_app", gpsLat: LAT, gpsLng: LNG },
        { id: "nogps", source: "in_app", gpsLat: null, gpsLng: null },
        { id: "up", source: "upload", gpsLat: null, gpsLng: null },
      ],
    }),
  );
  const missing = r.issues.filter((i) => i.code === "photo_missing_gps");
  assert.deepEqual(missing.map((i) => i.mediaId), ["nogps"]);
});

test("photos with no location at all are reported", () => {
  const r = checkListingLocation(snap({ media: [{ id: "u", source: "upload", gpsLat: null, gpsLng: null }] }));
  assert.equal(r.status, "issues");
  assert.ok(r.issues.some((i) => i.code === "no_located_photos"));
});

test("a unit moved off its compound is flagged", () => {
  const r = checkListingLocation(snap({ unit: { lat: north(3_000), lng: LNG } }));
  assert.ok(r.issues.some((i) => i.code === "unit_outside_compound"));
});

test("no compound is an issue, never verified", () => {
  const r = checkListingLocation(snap({ compound: null }));
  assert.equal(r.status, "issues");
  assert.equal(r.issues[0].code, "no_compound");
});

test("an unmapped compound is never reported as verified", () => {
  const r = checkListingLocation(snap({ compound: { ...compound, centerLat: null, centerLng: null, geomJson: null } }));
  assert.equal(r.status, "issues");
  assert.ok(r.issues.some((i) => i.code === "compound_not_mapped"));
});

test("centre-only compounds use a generous radius", () => {
  const centreOnly = { ...compound, geomJson: null };
  assert.equal(checkListingLocation(snap({ compound: centreOnly, media: [{ id: "a", source: "in_app", gpsLat: north(1_000), gpsLng: LNG }] })).status, "verified");
  assert.equal(checkListingLocation(snap({ compound: centreOnly, media: [{ id: "a", source: "in_app", gpsLat: north(3_000), gpsLng: LNG }] })).status, "issues");
});

test("compoundPoint is the compound centre, or nothing", () => {
  assert.deepEqual(compoundPoint(compound), { lat: LAT, lng: LNG });
  assert.deepEqual(compoundPoint(null), { lat: null, lng: null });
  assert.deepEqual(compoundPoint({ centerLat: null, centerLng: 1 }), { lat: null, lng: null });
});
