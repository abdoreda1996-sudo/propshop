/**
 * True cost.
 *
 * The rule under test is honesty: a number we do not have must be named as missing, not
 * silently treated as zero. A total that quietly assumes "no developer instalments" is
 * the single most damaging thing this panel could do.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { computeTrueCost, REGISTRATION_RATE, REGISTRATION_CAP } from "../trueCost";
import { feePerSide, dealFeeTotalFor } from "../fees";
import { timeline, stageProgress, canAdvance, countdown, DEAL_PATH, STAGE_LABELS } from "../deals";

const PRICE = 18_500_000;
// The fee depends on type + purpose (fees.ts). Most tests here are about obligations, so
// they use a plain apartment sale; the fee tests below vary it on purpose.
const APT = { unitType: "apartment", purpose: "sale" } as const;
const aptFee = (amount: number) => feePerSide({ ...APT, amount });

test("a cash-clear property totals price + registration + the buyer's own fee", () => {
  // The buyer's sheet carries the BUYER's side: one fee. The seller pays the same
  // amount separately, which is the seller's cost and not part of what the buyer hands over.
  const c = computeTrueCost({ ...APT, price: PRICE });
  assert.equal(c.total, PRICE + REGISTRATION_CAP + aptFee(PRICE));
  assert.equal(c.incomplete, false);
});

test("the buyer is billed one side's fee, not the whole transaction's", () => {
  // Adding both sides here would invent cost the buyer never pays, on the one screen they
  // use to decide whether they can afford the unit.
  const c = computeTrueCost({ ...APT, price: 40_000_000 });
  const line = c.lines.find((l) => l.key === "admin_fee")!;
  assert.equal(line.amount, aptFee(40_000_000));
  assert.notEqual(line.amount, dealFeeTotalFor({ ...APT, amount: 40_000_000 }));
  // The seller's identical fee is still disclosed in the note, so the buyer can see what
  // the transaction as a whole costs when comparing against a broker's percentage.
  // The seller's identical fee is named in the note — per side, never as a deal total.
  assert.match(line.noteEn ?? "", /seller pays the same fee separately/i);
});

test("a recorded deal total is halved back to one side", () => {
  // Deal.adminFee stores the whole-deal total; the buyer's sheet must show their half of
  // it, not the whole figure.
  const total = dealFeeTotalFor({ ...APT, amount: PRICE });
  const c = computeTrueCost({ ...APT, price: PRICE, adminFee: total });
  const line = c.lines.find((l) => l.key === "admin_fee")!;
  assert.equal(line.amount, total / 2);
  assert.equal(line.amount, aptFee(PRICE));
});

test("registration is capped, not an unbounded percentage", () => {
  // 2.5% of 18.5M would be 462,500 — the cap is what makes the figure realistic.
  const c = computeTrueCost({ ...APT, price: PRICE });
  const reg = c.lines.find((l) => l.key === "registration")!;
  assert.equal(reg.amount, REGISTRATION_CAP);
  assert.ok(PRICE * REGISTRATION_RATE > REGISTRATION_CAP);
});

test("a cheap property pays the percentage rather than the cap", () => {
  const c = computeTrueCost({ ...APT, price: 50_000 });
  const reg = c.lines.find((l) => l.key === "registration")!;
  assert.equal(reg.amount, 50_000 * REGISTRATION_RATE);
});

test("declared instalments and maintenance are added and attributed to the owner", () => {
  const c = computeTrueCost({ ...APT, price: PRICE, remainingInstallments: 2_000_000, maintenanceDue: 120_000 });
  assert.equal(c.total, PRICE + 2_000_000 + 120_000 + REGISTRATION_CAP + aptFee(PRICE));
  assert.equal(c.lines.find((l) => l.key === "installments")?.source, "owner_declared");
  assert.equal(c.lines.find((l) => l.key === "maintenance")?.source, "owner_declared");
});

test("unknown obligations are reported as missing, never assumed to be zero", () => {
  const c = computeTrueCost({ ...APT, price: PRICE, installmentsKnown: false, maintenanceKnown: false });
  assert.equal(c.incomplete, true);
  assert.equal(c.missingAr.length, 2);
  assert.equal(c.missingEn.length, 2);
  // And they are absent from the lines rather than added as 0.
  assert.equal(c.lines.some((l) => l.key === "installments"), false);
});

test("a known-zero obligation is not reported as missing", () => {
  // "The owner told us there are no instalments" is different from "we never asked".
  const c = computeTrueCost({ ...APT, price: PRICE, remainingInstallments: 0, installmentsKnown: true });
  assert.equal(c.incomplete, false);
});

test("the total is always flagged as containing an estimate", () => {
  // Registration is always estimated, so the total can never be presented as exact.
  assert.equal(computeTrueCost({ ...APT, price: PRICE }).hasEstimates, true);
});

test("the admin fee is set by unit type, not by price", () => {
  const fee = (price: number, unitType: string, purpose = "sale") =>
    computeTrueCost({ price, unitType, purpose }).lines.find((l) => l.key === "admin_fee")!.amount;
  assert.equal(fee(3_000_000, "apartment"), 50_000);
  assert.equal(fee(90_000_000, "apartment"), 50_000, "price does not move it");
  assert.equal(fee(5_000_000, "villa"), 100_000);
  assert.equal(fee(60_000_000, "villa"), 100_000);
});

test("a rental's buyer-side fee follows the monthly rent", () => {
  const line = (rent: number) => computeTrueCost({ price: rent, unitType: "villa", purpose: "rent" }).lines.find((l) => l.key === "admin_fee")!;
  assert.equal(line(80_000).amount, 15_000);
  assert.equal(line(120_000).amount, 50_000);
  assert.match(line(80_000).noteEn ?? "", /monthly rent/i);
});

test("the fee note says it is fixed by type and not a percentage — and shows no deal total", () => {
  const line = computeTrueCost({ ...APT, price: 10_000_000 }).lines.find((l) => l.key === "admin_fee")!;
  assert.equal(line.amount, 50_000);
  assert.match(line.noteEn ?? "", /unit type/i);
  assert.match(line.noteEn ?? "", /not a percentage/i);
  assert.doesNotMatch(line.noteEn ?? "", /twice|100,000/i, "display rule: per side only");
});

test("every line declares its source", () => {
  for (const line of computeTrueCost({ ...APT, price: PRICE, remainingInstallments: 1 }).lines) {
    assert.ok(["listing", "owner_declared", "estimate"].includes(line.source), line.key);
  }
});

// --- deal stages ------------------------------------------------------------

test("the timeline marks done, current and upcoming around the stage", () => {
  const t = timeline("due_diligence");
  assert.equal(t.find((s) => s.stage === "offer_accepted")?.state, "done");
  assert.equal(t.find((s) => s.stage === "due_diligence")?.state, "current");
  assert.equal(t.find((s) => s.stage === "transfer")?.state, "upcoming");
});

test("a completed deal has no upcoming steps", () => {
  assert.equal(timeline("completed").every((s) => s.state !== "upcoming"), true);
});

test("a cancelled deal shows one honest step, not a fake progress bar", () => {
  const t = timeline("cancelled");
  assert.equal(t.length, 1);
  assert.equal(t[0].stage, "cancelled");
});

test("an unknown stage degrades to the start instead of throwing", () => {
  assert.equal(timeline("nonsense")[0].state, "current");
  assert.equal(stageProgress("nonsense").done, 0);
});

test("deals only move forward, or to cancelled", () => {
  assert.equal(canAdvance("offer_accepted", "reserved"), true);
  assert.equal(canAdvance("reserved", "offer_accepted"), false);
  assert.equal(canAdvance("due_diligence", "cancelled"), true);
  assert.equal(canAdvance("completed", "transfer"), false);
  assert.equal(canAdvance("cancelled", "reserved"), false);
});

test("every stage on the happy path has a label in both languages", () => {
  for (const stage of DEAL_PATH) {
    assert.ok(STAGE_LABELS[stage].ar.length > 0, stage);
    assert.ok(STAGE_LABELS[stage].en.length > 0, stage);
  }
});

test("the reservation countdown expires rather than going negative", () => {
  const now = new Date("2026-09-17T12:00:00Z");
  const past = new Date(now.getTime() - 60_000);
  assert.deepEqual(countdown(past, now), { expired: true, hours: 0, minutes: 0, seconds: 0 });

  const future = new Date(now.getTime() + (47 * 3600 + 32 * 60 + 18) * 1000);
  assert.deepEqual(countdown(future, now), { expired: false, hours: 47, minutes: 32, seconds: 18 });
  assert.equal(countdown(null, now), null);
});
