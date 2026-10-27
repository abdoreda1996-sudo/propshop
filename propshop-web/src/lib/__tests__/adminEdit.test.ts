/**
 * Back-office listing edits. The parser decides what an admin's form can write to a live
 * listing, so its edges are the ones that would corrupt data: blanking required fields,
 * smuggling in fields that are not editable, and typos an order of magnitude off.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { parseAdminEdit, diffFields, isRoom, FINGERPRINT_FIELDS } from "../adminEdit";
import { canEditListings } from "../permissions";
import { publicMediaPath } from "../mediaStore";

test("only fields present are patched", () => {
  const r = parseAdminEdit({ listing: { price: "13,200,000" } });
  assert.ok(r.ok);
  assert.deepEqual(r.unit, {});
  assert.deepEqual(r.listing, { price: 13_200_000 });
});

test("compound, area, owner and status are not editable — silently ignored", () => {
  const r = parseAdminEdit({
    unit: { compoundId: "x", areaId: "y", ownerId: "z", unitFingerprint: "f" },
    listing: { status: "live", trustLevel: 4, reference: "AQ-1" },
  });
  assert.ok(r.ok);
  assert.deepEqual(r.unit, {});
  assert.deepEqual(r.listing, {});
});

test("required fields cannot be blanked; optional ones can", () => {
  const blank = parseAdminEdit({ unit: { sizeSqm: "", bedrooms: null } });
  assert.equal(blank.ok, false);
  if (!blank.ok) {
    assert.deepEqual(
      blank.errors.map((e) => `${e.field}:${e.code}`).sort(),
      ["unit.bedrooms:required", "unit.sizeSqm:required"],
    );
  }
  const cleared = parseAdminEdit({ unit: { floor: "", building: "  ", view: "" }, listing: { maintenanceDue: null } });
  assert.ok(cleared.ok);
  assert.deepEqual(cleared.unit, { floor: null, building: null, view: null });
  assert.deepEqual(cleared.listing, { maintenanceDue: null });
});

test("enums are enforced", () => {
  const r = parseAdminEdit({ unit: { type: "castle", finishing: "fully_finished" }, listing: { purpose: "lease" } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.errors.map((e) => e.field).sort(), ["listing.purpose", "unit.type"]);
});

test("price below EGP 1,000 is refused (a typo, not a price)", () => {
  assert.equal(parseAdminEdit({ listing: { price: 999 } }).ok, false);
  assert.ok(parseAdminEdit({ listing: { price: 1000 } }).ok);
});

test("integers must be integers", () => {
  const r = parseAdminEdit({ unit: { bedrooms: 2.5, floor: "3" } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.errors.map((e) => e.field), ["unit.bedrooms"]);
});

test("over-long text is refused, not truncated", () => {
  const r = parseAdminEdit({ listing: { titleAr: "ا".repeat(121) } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0].code, "too_long");
});

test("diffFields reports only real changes, dates by value", () => {
  const before = { price: 100, titleAr: "a", deliveryDate: new Date("2027-01-01T00:00:00Z"), view: null };
  const d = diffFields(before, { price: 100, titleAr: "b", deliveryDate: new Date("2027-01-01T00:00:00Z"), view: null });
  assert.deepEqual(d, { titleAr: { from: "a", to: "b" } });
});

test("fingerprint fields match the fingerprint's own inputs", () => {
  // If fingerprint.ts gains an input, an edit to it must rebuild the fingerprint too.
  assert.deepEqual([...FINGERPRINT_FIELDS].sort(), ["building", "floor", "sizeSqm", "type", "unitNumber"]);
});

test("isRoom accepts the six gate rooms only", () => {
  assert.ok(isRoom("kitchen"));
  assert.ok(!isRoom("garage"));
  assert.ok(!isRoom(null));
});

test("only admin may edit listings", () => {
  assert.ok(canEditListings("admin"));
  for (const r of ["reviewer", "advisor", "photographer", "owner", "buyer", "investor"]) {
    assert.ok(!canEditListings(r), r);
  }
});

test("media route cannot be walked out of the public directory", () => {
  assert.ok(publicMediaPath(["listings", "abc", "photo", "x_1600.webp"]));
  assert.equal(publicMediaPath(["..", "private", "listings", "abc", "photo", "x.jpg"]), null);
  assert.equal(publicMediaPath(["listings", "..", "..", "secret_1600.webp"]), null);
  assert.equal(publicMediaPath(["listings", "abc", "photo", "x.jpg"]), null, "originals are never servable");
  assert.equal(publicMediaPath(["listings\\..\\..", "x.webp"]), null);
  assert.equal(publicMediaPath([]), null);
});
