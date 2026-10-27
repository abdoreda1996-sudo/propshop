/**
 * Unit trading rules. The cash-direction rule is a stated term of the owner's, so it is
 * tested on every combination; matching is guidance, so it is tested for the cases that
 * would make suggestions wrong (packages, value on the total, best unit represents).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  parsePreference,
  matchPreference,
  validateTradeOffer,
  isTradeLive,
  tradeEffectiveStatus,
  canMoveStage,
  canCancelTrade,
  EMPTY_PREFERENCE,
  Preference,
} from "../trade";
import { canArrangeTrades, canAccessAdminSection } from "../permissions";

const AREAS = ["a1", "a2"];
const pref = (p: Partial<Preference>): Preference => ({ ...EMPTY_PREFERENCE, ...p });
const villaA1 = { type: "villa", areaId: "a1", bedrooms: 4, sizeSqm: 300, price: 12_000_000 };
const flatA2 = { type: "apartment", areaId: "a2", bedrooms: 2, sizeSqm: 120, price: 4_000_000 };

test("parsePreference: valid, deduped, unknown area refused", () => {
  const ok = parsePreference({ types: ["villa", "villa"], areaIds: ["a1"], minBedrooms: "3", maxValue: "15,000,000", cash: "i_receive" }, AREAS);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.pref.types, ["villa"]);
    assert.equal(ok.pref.minBedrooms, 3);
    assert.equal(ok.pref.maxValue, 15_000_000);
    assert.equal(ok.pref.cash, "i_receive");
  }
  assert.equal(parsePreference({ areaIds: ["nope"] }, AREAS).ok, false);
  assert.equal(parsePreference({ types: ["castle"] }, AREAS).ok, false);
  assert.equal(parsePreference({ minValue: 10, maxValue: 5 }, AREAS).ok, false, "min above max");
  assert.equal(parsePreference({ cash: "maybe" }, AREAS).ok, false);
});

test("empty preference matches anything", () => {
  assert.ok(matchPreference(EMPTY_PREFERENCE, [flatA2]).matches);
});

test("criteria and the reasons a unit misses", () => {
  const p = pref({ types: ["villa"], areaIds: ["a1"], minBedrooms: 3 });
  assert.ok(matchPreference(p, [villaA1]).matches);
  assert.deepEqual(matchPreference(p, [flatA2]).failed.sort(), ["area", "bedrooms", "type"]);
});

test("a package: best unit represents the type, the TOTAL is the value", () => {
  const p = pref({ types: ["villa"], minValue: 15_000_000 });
  assert.equal(matchPreference(p, [villaA1]).matches, false, "villa alone is 12M < 15M");
  assert.ok(matchPreference(p, [villaA1, flatA2]).matches, "villa + flat = 16M");
  assert.equal(matchPreference(pref({ minBedrooms: 3 }), [flatA2, flatA2]).matches, false, "two 2-beds are not a 3-bed");
});

test("offer shape", () => {
  const v = (b: object, cash = "either" as const) => validateTradeOffer({ targetListingId: "T", ...b }, cash);
  assert.deepEqual(v({ unitListingIds: [] }), { ok: false, error: "units_required" });
  assert.deepEqual(v({ unitListingIds: ["a", "b", "c", "d"] }), { ok: false, error: "too_many_units" });
  assert.deepEqual(v({ unitListingIds: ["a", "a"] }), { ok: false, error: "duplicate_units" });
  assert.deepEqual(v({ unitListingIds: ["T"] }), { ok: false, error: "own_listing" });
  assert.deepEqual(v({ unitListingIds: ["a"], cashAmount: -5 }), { ok: false, error: "cash_invalid" });
  assert.deepEqual(v({ unitListingIds: ["a"], cashAmount: 100 }), { ok: false, error: "cash_payer_required" });
  const ok = v({ unitListingIds: ["a", "b"], cashAmount: "1,000,000", cashPayer: "proposer" });
  assert.ok(ok.ok && ok.value.cashAmount === 1_000_000 && ok.value.cashPayer === "proposer");
  const zero = v({ unitListingIds: ["a"], cashAmount: 0, cashPayer: "recipient" });
  assert.ok(zero.ok && zero.value.cashPayer === null, "no cash, no payer");
});

test("the owner's cash terms are binding", () => {
  const offer = (payer: string) => ({ targetListingId: "T", unitListingIds: ["a"], cashAmount: 500_000, cashPayer: payer });
  assert.deepEqual(validateTradeOffer(offer("proposer"), "none"), { ok: false, error: "cash_not_accepted" });
  assert.deepEqual(validateTradeOffer(offer("recipient"), "i_receive"), { ok: false, error: "cash_direction_refused" });
  assert.ok(validateTradeOffer(offer("proposer"), "i_receive").ok);
  assert.deepEqual(validateTradeOffer(offer("proposer"), "i_pay"), { ok: false, error: "cash_direction_refused" });
  assert.ok(validateTradeOffer(offer("recipient"), "i_pay").ok);
  assert.ok(validateTradeOffer(offer("recipient"), "either").ok && validateTradeOffer(offer("proposer"), "either").ok);
  assert.ok(validateTradeOffer({ targetListingId: "T", unitListingIds: ["a"] }, "none").ok, "a straight swap is fine with 'none'");
});

test("expiry is read-time", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const past = { status: "pending", expiresAt: new Date("2026-10-02T11:59:59Z") };
  assert.equal(isTradeLive(past, now), false);
  assert.equal(tradeEffectiveStatus(past, now), "expired");
  assert.equal(isTradeLive({ status: "pending", expiresAt: new Date("2026-10-03T00:00:00Z") }, now), true);
  assert.equal(isTradeLive({ status: "accepted", expiresAt: new Date("2026-10-03T00:00:00Z") }, now), false);
});

test("stages move forward only; completed trades cannot be cancelled", () => {
  assert.ok(canMoveStage("agreed", "documents"));
  assert.ok(canMoveStage("agreed", "contracts"), "may skip ahead");
  assert.equal(canMoveStage("contracts", "documents"), false);
  assert.equal(canMoveStage("agreed", "agreed"), false);
  assert.equal(canMoveStage(null, "documents"), false, "not accepted yet");
  assert.ok(canCancelTrade({ status: "accepted", stage: "contracts" }));
  assert.equal(canCancelTrade({ status: "accepted", stage: "completed" }), false);
  assert.equal(canCancelTrade({ status: "pending", stage: null }), false, "a pending offer is the owners' to answer");
});

test("trades: admin + advisor arrange", () => {
  assert.ok(canArrangeTrades("admin") && canArrangeTrades("advisor"));
  for (const r of ["reviewer", "photographer", "owner", "buyer"]) assert.ok(!canArrangeTrades(r), r);
  assert.ok(canAccessAdminSection("advisor", "trades") && !canAccessAdminSection("reviewer", "trades"));
});
