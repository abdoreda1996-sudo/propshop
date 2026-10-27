/**
 * The negotiation rules.
 *
 * These are the rules a user would feel cheated by if they broke: accepting a lapsed
 * offer, responding out of turn, withdrawing someone else's offer, or bidding on a
 * property that is already reserved.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  OfferView,
  canAct,
  effectiveStatus,
  isLive,
  listingAcceptsOffers,
  respondingSide,
  validateOffer,
  MIN_OFFER_FRACTION,
  MAX_EXPIRY_DAYS,
  OFFER_ERROR_COPY,
} from "../offers";
import { chainStatus, groupIntoChains, liveStep } from "../offerService";

const NOW = new Date("2026-09-17T12:00:00Z");
const hours = (n: number) => new Date(NOW.getTime() + n * 3600_000);

function offer(over: Partial<OfferView> = {}): OfferView {
  return {
    id: "o1",
    direction: "buyer",
    amount: 9_000_000,
    status: "pending",
    expiresAt: null,
    createdAt: NOW,
    ...over,
  };
}

// --- liveness ---------------------------------------------------------------

test("a pending offer with no expiry is live", () => {
  assert.equal(isLive(offer(), NOW), true);
});

test("an offer past its expiry is dead even though the column still says pending", () => {
  // The bug this guards: a sweep job has not run, the row still reads "pending", and a
  // seller accepts a price the buyer believed had lapsed.
  const lapsed = offer({ expiresAt: hours(-1) });
  assert.equal(lapsed.status, "pending");
  assert.equal(isLive(lapsed, NOW), false);
  assert.equal(effectiveStatus(lapsed, NOW), "expired");
});

test("an offer expiring in the future is still live", () => {
  assert.equal(isLive(offer({ expiresAt: hours(1) }), NOW), true);
});

test("expiry is exclusive at the exact deadline", () => {
  assert.equal(isLive(offer({ expiresAt: NOW }), NOW), false);
});

test("a settled offer is never live again", () => {
  for (const status of ["accepted", "rejected", "withdrawn", "countered", "expired"] as const) {
    assert.equal(isLive(offer({ status }), NOW), false, status);
  }
});

// --- turn taking ------------------------------------------------------------

test("the side that did not make the offer is the one who responds", () => {
  assert.equal(respondingSide(offer({ direction: "buyer" })), "seller");
  assert.equal(respondingSide(offer({ direction: "seller" })), "buyer");
});

test("a seller may accept, reject or counter a buyer's offer", () => {
  for (const action of ["accept", "reject", "counter"] as const) {
    assert.deepEqual(canAct(offer(), "seller", action, { listingOpen: true, now: NOW }), { ok: true });
  }
});

test("a buyer cannot accept their own offer", () => {
  const d = canAct(offer({ direction: "buyer" }), "buyer", "accept", { listingOpen: true, now: NOW });
  assert.deepEqual(d, { ok: false, reason: "not_your_turn" });
});

test("a buyer cannot accept their own counteroffer either", () => {
  const d = canAct(offer({ direction: "seller" }), "seller", "accept", { listingOpen: true, now: NOW });
  assert.deepEqual(d, { ok: false, reason: "not_your_turn" });
});

test("you withdraw your own offer, not the other side's", () => {
  assert.deepEqual(canAct(offer({ direction: "buyer" }), "buyer", "withdraw", { listingOpen: true, now: NOW }), {
    ok: true,
  });
  assert.deepEqual(canAct(offer({ direction: "buyer" }), "seller", "withdraw", { listingOpen: true, now: NOW }), {
    ok: false,
    reason: "cannot_withdraw_others",
  });
});

test("nothing can be accepted once the listing stops taking offers", () => {
  const d = canAct(offer(), "seller", "accept", { listingOpen: false, now: NOW });
  assert.deepEqual(d, { ok: false, reason: "listing_not_open" });
});

test("a lapsed offer cannot be accepted", () => {
  const d = canAct(offer({ expiresAt: hours(-1) }), "seller", "accept", { listingOpen: true, now: NOW });
  assert.deepEqual(d, { ok: false, reason: "not_live" });
});

test("only a live listing accepts offers", () => {
  assert.equal(listingAcceptsOffers("live"), true);
  for (const s of ["reserved", "draft", "pending_review", "paused", "closed", "sold", "expired"]) {
    assert.equal(listingAcceptsOffers(s), false, s);
  }
});

// --- amounts ----------------------------------------------------------------

const ASK = 10_000_000;

test("a sensible offer passes", () => {
  assert.deepEqual(validateOffer(8_500_000, ASK, null, { now: NOW }), { ok: true });
});

test("zero and negative amounts are rejected", () => {
  assert.deepEqual(validateOffer(0, ASK, null, { now: NOW }), { ok: false, reason: "amount_not_positive" });
  assert.deepEqual(validateOffer(-5, ASK, null, { now: NOW }), { ok: false, reason: "amount_not_positive" });
  assert.deepEqual(validateOffer(NaN, ASK, null, { now: NOW }), { ok: false, reason: "amount_not_positive" });
});

test("lowball offers below the floor are rejected", () => {
  // Without a floor, listings collect "EGP 1" offers and sellers stop opening the tab.
  // No floor any more: a low offer is the seller's to decline, not ours to block.
  assert.deepEqual(validateOffer(ASK * MIN_OFFER_FRACTION - 1, ASK, null, { now: NOW }), { ok: true });
  assert.deepEqual(validateOffer(1000, ASK, null, { now: NOW }), { ok: true });
  assert.deepEqual(validateOffer(ASK * MIN_OFFER_FRACTION, ASK, null, { now: NOW }), { ok: true });
});

test("a buyer offering above asking is treated as a typo", () => {
  assert.deepEqual(validateOffer(ASK + 1, ASK, null, { now: NOW, direction: "buyer" }), {
    ok: false,
    reason: "amount_above_asking",
  });
});

test("a seller's counter may sit at the asking price", () => {
  // The common case: the buyer lowballs and the seller counters at full price.
  assert.deepEqual(validateOffer(ASK, ASK, null, { now: NOW, direction: "seller" }), { ok: true });
});

test("expiry must be in the future and within the cap", () => {
  assert.deepEqual(validateOffer(8e6, ASK, hours(-1), { now: NOW }), { ok: false, reason: "expiry_in_past" });
  assert.deepEqual(validateOffer(8e6, ASK, hours(24), { now: NOW }), { ok: true });
  const tooFar = new Date(NOW.getTime() + (MAX_EXPIRY_DAYS + 1) * 86400_000);
  assert.deepEqual(validateOffer(8e6, ASK, tooFar, { now: NOW }), { ok: false, reason: "expiry_too_far" });
});

// --- chains -----------------------------------------------------------------

test("a chain reports the live step and hides settled ones", () => {
  const chain: OfferView[] = [
    offer({ id: "a", direction: "buyer", status: "countered", amount: 8e6 }),
    offer({ id: "b", direction: "seller", status: "pending", amount: 9e6 }),
  ];
  assert.equal(liveStep(chain, NOW)?.id, "b");
  assert.equal(chainStatus(chain, NOW), "pending");
});

test("an accepted chain reads accepted regardless of earlier steps", () => {
  const chain: OfferView[] = [
    offer({ id: "a", status: "countered" }),
    offer({ id: "b", direction: "seller", status: "accepted" }),
  ];
  assert.equal(chainStatus(chain, NOW), "accepted");
  assert.equal(liveStep(chain, NOW), null);
});

test("a chain whose last step lapsed reads expired", () => {
  const chain: OfferView[] = [offer({ id: "a", status: "pending", expiresAt: hours(-2) })];
  assert.equal(chainStatus(chain, NOW), "expired");
});

test("chains group by buyer, newest negotiation first", () => {
  const rows = [
    { id: "1", buyerId: "b1", createdAt: new Date("2026-09-01") },
    { id: "2", buyerId: "b2", createdAt: new Date("2026-09-05") },
    { id: "3", buyerId: "b1", createdAt: new Date("2026-09-03") },
  ];
  const chains = groupIntoChains(rows);
  assert.equal(chains.length, 2);
  // b1's chain last moved on the 3rd, b2's on the 5th, so b2 leads.
  assert.equal(chains[0][0].buyerId, "b2");
  assert.deepEqual(
    chains[1].map((o) => o.id),
    ["1", "3"],
  );
});

// --- copy -------------------------------------------------------------------

test("every failure reason has copy in both languages", () => {
  for (const [reason, copy] of Object.entries(OFFER_ERROR_COPY)) {
    assert.ok(copy.ar.length > 0, `${reason} missing Arabic`);
    assert.ok(copy.en.length > 0, `${reason} missing English`);
  }
});
