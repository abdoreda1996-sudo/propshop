/**
 * Market segments.
 *
 * The property that matters is PARTITION: every listing belongs to exactly one segment,
 * so the three tab counts sum to the catalogue. If they overlap, the same unit appears
 * under two tabs and the counts overstate the inventory — on a marketplace whose pitch is
 * that its numbers are checkable, that is a credibility bug, not a cosmetic one.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SEGMENTS,
  Segment,
  segmentOf,
  segmentUnitWhere,
  segmentWhere,
  isSegment,
  COMMERCIAL_TYPES,
  SEGMENT_LABELS,
} from "../segments";

const ALL_TYPES = [
  "apartment",
  "villa",
  "townhouse",
  "duplex",
  "studio",
  "chalet",
  "office",
  "retail",
  "twinhouse",
  "ground_apartment",
  "penthouse",
];

test("coastal is decided by the area, not the unit type", () => {
  // The whole reason the flag lives on Area: both of these are coastal properties.
  assert.equal(segmentOf({ type: "apartment", area: { isCoastal: true } }), "coastal");
  assert.equal(segmentOf({ type: "villa", area: { isCoastal: true } }), "coastal");
  // And a chalet inland is not one.
  assert.equal(segmentOf({ type: "chalet", area: { isCoastal: false } }), "residential");
});

test("coastal beats commercial", () => {
  // A shop in El Gouna belongs to the coastal market, where people shop by destination.
  assert.equal(segmentOf({ type: "retail", area: { isCoastal: true } }), "coastal");
  assert.equal(segmentOf({ type: "office", area: { isCoastal: true } }), "coastal");
});

test("commercial is exactly office and retail", () => {
  for (const type of ALL_TYPES) {
    const got = segmentOf({ type, area: { isCoastal: false } });
    const expected = COMMERCIAL_TYPES.includes(type as (typeof COMMERCIAL_TYPES)[number])
      ? "commercial"
      : "residential";
    assert.equal(got, expected, type);
  }
});

test("a studio is a home, not an office", () => {
  // Stated explicitly because it is the one type people argue about.
  assert.equal(segmentOf({ type: "studio", area: { isCoastal: false } }), "residential");
});

test("the segments partition the catalogue — every unit lands in exactly one", () => {
  for (const type of ALL_TYPES) {
    for (const isCoastal of [true, false]) {
      const unit = { type, area: { isCoastal } };
      const matches = SEGMENTS.filter((s) => matchesWhere(unit, s));
      assert.equal(matches.length, 1, `${type}/${isCoastal} matched ${matches.join(",")}`);
      // …and the SQL predicate agrees with the in-memory reading.
      assert.equal(matches[0], segmentOf(unit), `${type}/${isCoastal}`);
    }
  }
});

/**
 * Evaluate a segmentUnitWhere() predicate against a unit in memory.
 *
 * This is what makes the partition test meaningful: it checks the SQL shape Prisma will
 * receive, not a second hand-written copy of the rule. If segmentUnitWhere ever grows a
 * clause this cannot interpret, the helper throws rather than quietly passing.
 */
function matchesWhere(unit: { type: string; area: { isCoastal: boolean } }, segment: Segment) {
  const where = segmentUnitWhere(segment);
  const known = new Set(["area", "type"]);
  for (const key of Object.keys(where)) {
    if (!known.has(key)) throw new Error(`segmentUnitWhere(${segment}) grew an unhandled clause: ${key}`);
  }

  if (where.area && typeof where.area === "object" && "isCoastal" in where.area) {
    if (unit.area.isCoastal !== where.area.isCoastal) return false;
  }

  const type = where.type;
  if (type && typeof type === "object") {
    if ("in" in type && Array.isArray(type.in) && !type.in.includes(unit.type)) return false;
    if ("notIn" in type && Array.isArray(type.notIn) && type.notIn.includes(unit.type)) return false;
  }
  return true;
}

test("a missing area degrades to residential rather than throwing", () => {
  // segmentOf runs on card view-models, where the area relation may not have been loaded.
  assert.equal(segmentOf({ type: "apartment" }), "residential");
  assert.equal(segmentOf({ type: "apartment", area: null }), "residential");
  assert.equal(segmentOf({ type: "office", area: null }), "commercial");
});

test("isSegment rejects anything not in the list", () => {
  // It guards a value that reaches a Prisma `where` straight from the query string.
  for (const good of SEGMENTS) assert.ok(isSegment(good), good);
  for (const bad of ["", "COASTAL", "resi", "sale", undefined, null, "../etc"]) {
    assert.ok(!isSegment(bad as string), String(bad));
  }
});

test("segmentWhere is segmentUnitWhere lifted to a listing", () => {
  for (const s of SEGMENTS) {
    assert.deepEqual(segmentWhere(s), { unit: segmentUnitWhere(s) });
  }
});

test("every segment has a label in both languages", () => {
  for (const s of SEGMENTS) {
    assert.ok(SEGMENT_LABELS[s].ar.length > 0, s);
    assert.ok(SEGMENT_LABELS[s].en.length > 0, s);
  }
});
