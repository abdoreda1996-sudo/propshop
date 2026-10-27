/**
 * Trade request rules: parsing a filter-shaped request, matching a listing against it
 * (the same semantics as the browse filters, plus area-OR-compound for location), the
 * listing preference it implies, and the compound type-ahead.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseTradeRequest,
  matchTradeRequest,
  preferenceFromRequest,
  hasCriteria,
  tradeMatchKey,
  openedByRequestAfter,
  releasedListingId,
  shouldCloseReleasedListing,
  EMPTY_TRADE_REQUEST,
  TradeRequestSpec,
  RequestCandidate,
} from "../tradeRequest";
import { foldName, rankByName } from "../nameSearch";

const KNOWN = { areaIds: ["zayed", "newcairo"], compoundIds: ["mivida", "allegria"] };
const spec = (p: Partial<TradeRequestSpec>): TradeRequestSpec => ({ ...EMPTY_TRADE_REQUEST, ...p });
const villa: RequestCandidate = { type: "villa", areaId: "zayed", compoundId: "allegria", bedrooms: 5, bathrooms: 4, paymentType: "cash", price: 20_000_000 };
const flat: RequestCandidate = { type: "apartment", areaId: "newcairo", compoundId: "mivida", bedrooms: 2, bathrooms: 2, paymentType: "installments", price: 6_000_000 };

test("parseTradeRequest: valid body is deduped, money parsed, description trimmed", () => {
  const r = parseTradeRequest(
    { types: ["villa", "villa"], areaIds: ["zayed"], compoundIds: ["mivida"], bedrooms: ["3", "5"], bathrooms: ["2"], payment: ["cash"], minPrice: "5,000,000", maxPrice: 9000000, description: "  garden please  " },
    KNOWN,
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.spec.types, ["villa"]);
  assert.equal(r.spec.minPrice, 5_000_000);
  assert.equal(r.spec.maxPrice, 9_000_000);
  assert.equal(r.spec.description, "garden please");
});

test("parseTradeRequest: unknown ids and values are refused", () => {
  const r = parseTradeRequest({ areaIds: ["mars"], compoundIds: ["x"], bedrooms: ["9"], payment: ["barter"], types: ["castle"] }, KNOWN);
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.deepEqual(r.errors.map((e) => e.field).sort(), ["areaIds", "bedrooms", "compoundIds", "payment", "types"]);
});

test("parseTradeRequest: reversed price range and an overlong description fail", () => {
  const r = parseTradeRequest({ types: ["villa"], minPrice: 10, maxPrice: 5, description: "x".repeat(501) }, KNOWN);
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => e.field === "maxPrice" && e.code === "out_of_range"));
  assert.ok(r.errors.some((e) => e.field === "description" && e.code === "too_long"));
});

test("parseTradeRequest: a request with no criterion (description only) is refused — it would match everything", () => {
  const r = parseTradeRequest({ description: "anything" }, KNOWN);
  assert.ok(!r.ok);
  if (r.ok) return;
  assert.equal(r.errors[0].code, "empty");
  assert.equal(hasCriteria(spec({ maxPrice: 1 })), true);
});

test("matchTradeRequest: empty groups mean any; type, payment and price narrow", () => {
  assert.ok(matchTradeRequest(spec({ maxPrice: 50_000_000 }), villa).matches);
  assert.ok(matchTradeRequest(spec({ types: ["villa", "townhouse"] }), villa).matches);
  assert.deepEqual(matchTradeRequest(spec({ types: ["apartment"] }), villa).failed, ["type"]);
  assert.deepEqual(matchTradeRequest(spec({ payment: ["installments"] }), villa).failed, ["payment"]);
  assert.deepEqual(matchTradeRequest(spec({ maxPrice: 10_000_000 }), villa).failed, ["price_high"]);
  assert.deepEqual(matchTradeRequest(spec({ minPrice: 10_000_000 }), flat).failed, ["price_low"]);
});

test("matchTradeRequest: location is area OR compound", () => {
  // Compound picked, unit is in it (different area than any picked).
  assert.ok(matchTradeRequest(spec({ compoundIds: ["mivida"], areaIds: ["zayed"] }), flat).matches);
  // Area picked, unit in that area but another compound.
  assert.ok(matchTradeRequest(spec({ compoundIds: ["mivida"], areaIds: ["zayed"] }), villa).matches);
  assert.deepEqual(matchTradeRequest(spec({ compoundIds: ["mivida"] }), villa).failed, ["location"]);
  // A unit outside any compound only matches by area.
  assert.deepEqual(matchTradeRequest(spec({ compoundIds: ["mivida"] }), { ...flat, compoundId: null }).failed, ["location"]);
});

test("matchTradeRequest: the top rooms option is open-ended, the rest exact", () => {
  assert.ok(matchTradeRequest(spec({ bedrooms: ["5"] }), { ...villa, bedrooms: 7 }).matches);
  assert.ok(matchTradeRequest(spec({ bedrooms: ["2", "3"] }), flat).matches);
  assert.deepEqual(matchTradeRequest(spec({ bedrooms: ["3"] }), flat).failed, ["bedrooms"]);
  assert.ok(matchTradeRequest(spec({ bathrooms: ["4"] }), { ...villa, bathrooms: 6 }).matches);
  assert.deepEqual(matchTradeRequest(spec({ bathrooms: ["1"] }), flat).failed, ["bathrooms"]);
  // Studio is "0" bedrooms.
  assert.ok(matchTradeRequest(spec({ bedrooms: ["0"] }), { ...flat, bedrooms: 0 }).matches);
});

test("matchTradeRequest: a Decimal-like price (Postgres) compares by value", () => {
  const decimal = { toString: () => "6000000", valueOf: () => 6_000_000 };
  assert.ok(matchTradeRequest(spec({ maxPrice: 7_000_000 }), { ...flat, price: decimal }).matches);
  assert.ok(!matchTradeRequest(spec({ maxPrice: 5_000_000 }), { ...flat, price: decimal }).matches);
});

test("matchTradeRequest: every failed criterion is reported", () => {
  const r = matchTradeRequest(spec({ types: ["villa"], areaIds: ["zayed"], bedrooms: ["4"], payment: ["cash"], maxPrice: 1 }), flat);
  assert.equal(r.matches, false);
  assert.deepEqual(r.failed, ["type", "location", "bedrooms", "payment", "price_high"]);
});

test("preferenceFromRequest: widens to the listing preference, keeping size and cash", () => {
  const p = preferenceFromRequest(spec({ types: ["villa"], areaIds: ["zayed"], bedrooms: ["4", "3"], minPrice: 1, maxPrice: 2, description: "d" }), ["newcairo", "zayed"], {
    minSizeSqm: 200,
    cash: "i_pay",
  });
  assert.deepEqual(p.areaIds, ["zayed", "newcairo"]);
  assert.equal(p.minBedrooms, 3);
  assert.equal(p.minSizeSqm, 200);
  assert.equal(p.cash, "i_pay");
  assert.equal(p.minValue, 1);
  assert.equal(p.maxValue, 2);
  assert.equal(p.note, "d");
  assert.equal(preferenceFromRequest(spec({}), [], { minSizeSqm: null, cash: "either" }).minBedrooms, null);
});

test("tradeMatchKey: one key per listing (unique per user in the table)", () => {
  assert.equal(tradeMatchKey("L1"), "trade_match:L1");
});

test("foldName: case, spacing and Arabic letter variants fold together", () => {
  assert.equal(foldName("Mi Vida"), foldName("mivida"));
  assert.equal(foldName("أليجريا"), foldName("اليجريا"));
  assert.equal(foldName("مدينة"), foldName("مدينه"));
});

test("rankByName: prefix before contains before similar spelling; misses dropped", () => {
  const items = [
    { id: "1", en: "Mivida", ar: "ميفيدا" },
    { id: "2", en: "Villette by Mivida", ar: "فيليت" },
    { id: "3", en: "Allegria", ar: "أليجريا" },
  ];
  const names = (x: (typeof items)[number]) => [x.en, x.ar];
  assert.deepEqual(rankByName(items, "miv", names).map((x) => x.id), ["1", "2"]);
  assert.equal(rankByName(items, "mevida", names)[0]?.id, "1");
  assert.deepEqual(rankByName(items, "اليج", names).map((x) => x.id), ["3"]);
  assert.deepEqual(rankByName(items, "zzz", names), []);
  assert.deepEqual(rankByName(items, "  ", names), []);
});

test("openedByRequestAfter: a request claims only a listing it actually opened", () => {
  // Closed listing opened by a request -> request-owned.
  assert.equal(openedByRequestAfter({ open: false, byRequest: false }, "request", true), true);
  // Owner had already opened it by hand -> stays owner-owned, never closed by the request.
  assert.equal(openedByRequestAfter({ open: true, byRequest: false }, "request", true), false);
  // Already request-owned and re-saved -> still request-owned.
  assert.equal(openedByRequestAfter({ open: true, byRequest: true }, "request", true), true);
  // The owner's own settings take over, whether they open or close it.
  assert.equal(openedByRequestAfter({ open: true, byRequest: true }, "owner", true), false);
  assert.equal(openedByRequestAfter({ open: true, byRequest: true }, "owner", false), false);
  // Anything closed is not request-owned.
  assert.equal(openedByRequestAfter({ open: true, byRequest: true }, "request", false), false);
});

test("releasedListingId: only a switched or removed unit is released", () => {
  assert.equal(releasedListingId("a", "b"), "a");
  assert.equal(releasedListingId("a", null), "a");
  assert.equal(releasedListingId("a", "a"), null);
  assert.equal(releasedListingId(null, "b"), null);
  assert.equal(releasedListingId(null, null), null);
});

test("shouldCloseReleasedListing: closes only a request-opened listing no other active request offers", () => {
  assert.equal(shouldCloseReleasedListing({ openToTrade: true, openedByRequest: true }, 0), true);
  assert.equal(shouldCloseReleasedListing({ openToTrade: true, openedByRequest: true }, 1), false);
  assert.equal(shouldCloseReleasedListing({ openToTrade: true, openedByRequest: false }, 0), false);
  assert.equal(shouldCloseReleasedListing({ openToTrade: false, openedByRequest: true }, 0), false);
});
