/**
 * The Buy / Rent preference.
 *
 * The value arrives from a cookie, which any visitor can set to anything, and ends up in
 * a Prisma `where`. So the only behaviour worth asserting is that an unrecognised value
 * degrades to the default instead of travelling onward.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { PURPOSES, DEFAULT_PURPOSE, isPurpose, purposeFrom, PURPOSE_LABELS } from "../purpose";

test("a tampered or absent cookie degrades to sale", () => {
  for (const bad of [undefined, null, "", "SALE", "buy", "lease", "sale; DROP TABLE", "../../etc"]) {
    assert.equal(purposeFrom(bad as string), DEFAULT_PURPOSE, String(bad));
  }
});

test("a valid cookie is honoured", () => {
  for (const good of PURPOSES) assert.equal(purposeFrom(good), good);
});

test("isPurpose accepts only the two purposes", () => {
  for (const good of PURPOSES) assert.ok(isPurpose(good), good);
  for (const bad of ["", "Sale", "rent ", undefined]) assert.ok(!isPurpose(bad as string), String(bad));
});

test("every purpose has a label in both languages", () => {
  for (const p of PURPOSES) {
    assert.ok(PURPOSE_LABELS[p].ar.length > 0, p);
    assert.ok(PURPOSE_LABELS[p].en.length > 0, p);
  }
});
