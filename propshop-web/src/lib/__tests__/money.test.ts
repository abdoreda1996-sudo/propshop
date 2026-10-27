/**
 * Decimal normalisation at the Prisma boundary.
 *
 * The production schema stores money as Decimal(14,2); Prisma returns those as Decimal
 * objects. Every price in this codebase is then formatted, compared or multiplied as a
 * number. Without the conversion in src/lib/prisma.ts, `price * 0.9` becomes a string
 * concatenation or NaN — and only in production, because SQLite dev uses Float.
 *
 * That is the worst class of bug this project could ship, so the conversion is tested
 * rather than assumed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import { __testing } from "../prisma";

const { decimalsToNumbers } = __testing;

test("a bare Decimal becomes a number", () => {
  const out = decimalsToNumbers(new Prisma.Decimal("14100000.00"));
  assert.equal(typeof out, "number");
  assert.equal(out, 14_100_000);
});

test("cents survive the conversion", () => {
  assert.equal(decimalsToNumbers(new Prisma.Decimal("1234.56")), 1234.56);
});

test("Decimals nested in a row become numbers", () => {
  const row = {
    id: "l1",
    price: new Prisma.Decimal("9800000.00"),
    title: "شقة",
    views: 42,
  };
  const out = decimalsToNumbers(row);
  assert.equal(typeof out.price, "number");
  assert.equal(out.price, 9_800_000);
  // And arithmetic works, which is the whole point.
  assert.equal(out.price * 0.9, 8_820_000);
  assert.equal(out.title, "شقة");
  assert.equal(out.views, 42);
});

test("Decimals inside arrays and nested relations are converted", () => {
  const payload = {
    listing: {
      price: new Prisma.Decimal("1000"),
      priceHistory: [{ price: new Prisma.Decimal("1100") }, { price: new Prisma.Decimal("1050") }],
    },
    offers: [{ amount: new Prisma.Decimal("950.25") }],
  };
  const out = decimalsToNumbers(payload);
  assert.equal(out.listing.price, 1000);
  assert.deepEqual(
    out.listing.priceHistory.map((h) => h.price),
    [1100, 1050],
  );
  assert.equal(out.offers[0].amount, 950.25);
});

test("Dates are NOT rebuilt into plain objects", () => {
  // The bug this guards: a generic object walk turns every Date into {}, which breaks
  // every timestamp in the product at once.
  const at = new Date("2026-09-18T12:00:00Z");
  const out = decimalsToNumbers({ createdAt: at, amount: new Prisma.Decimal("5") });
  assert.ok(out.createdAt instanceof Date);
  assert.equal(out.createdAt.getTime(), at.getTime());
  assert.equal(out.amount, 5);
});

test("null and undefined pass through untouched", () => {
  assert.equal(decimalsToNumbers(null), null);
  assert.equal(decimalsToNumbers(undefined), undefined);
  assert.deepEqual(decimalsToNumbers({ expiresAt: null }), { expiresAt: null });
});

test("plain values are unchanged", () => {
  assert.equal(decimalsToNumbers(7), 7);
  assert.equal(decimalsToNumbers("AQ-100001"), "AQ-100001");
  assert.equal(decimalsToNumbers(true), true);
});

test("an array of rows converts every element", () => {
  const rows = [{ price: new Prisma.Decimal("1") }, { price: new Prisma.Decimal("2") }];
  assert.deepEqual(
    decimalsToNumbers(rows).map((r) => r.price),
    [1, 2],
  );
});

test("the converted value serialises to JSON as a number, not an object", () => {
  // The API sends these to the Flutter client, which parses `price` as a num. A Decimal
  // serialises as {"s":1,"e":6,"d":[...]} and the app would show nothing.
  const json = JSON.stringify(decimalsToNumbers({ price: new Prisma.Decimal("14100000") }));
  assert.equal(json, '{"price":14100000}');
});
