/**
 * The success fee schedule (owner, 2026-10-02): flat by unit type for a sale, by monthly
 * rent for a rental, by the unit received for a trade — per side, both sides in full.
 *
 * Money rules are tested at their boundaries and across every unit type, because a type
 * missing from the table would silently fall to the fallback and quote the wrong fee.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  feePerSide,
  dealFeeTotalFor,
  saleFeeForType,
  rentFeeFor,
  tradeFeeForReceived,
  splitFee,
  SALE_FEE_TIERS,
  RENT_THRESHOLD,
  RENT_FEE_LOW,
  RENT_FEE_HIGH,
  FEE_SCHEDULE_ROWS,
  PRICING_NOTE,
  FEE_MODEL_NOTE,
  FEE_PARTIES,
  FEE_PARTY_LABELS,
} from "../fees";
import { UNIT_TYPES } from "../enums";

const sale = (unitType: string, amount = 10_000_000) => feePerSide({ purpose: "sale", unitType, amount });

test("sale: apartments, studios and chalets pay 50,000 per side", () => {
  for (const t of ["apartment", "studio", "chalet"]) assert.equal(sale(t), 50_000, t);
});

test("sale: villas, townhouses, duplexes, offices and retail pay 100,000 per side", () => {
  for (const t of ["villa", "townhouse", "duplex", "office", "retail"]) assert.equal(sale(t), 100_000, t);
});

test("every unit type is in exactly one tier — none falls through to the fallback", () => {
  for (const t of UNIT_TYPES) {
    const tiers = SALE_FEE_TIERS.filter((tier) => (tier.types as readonly string[]).includes(t));
    assert.equal(tiers.length, 1, `${t} is in ${tiers.length} tiers`);
  }
});

test("a sale fee does not move with the price — a 5M villa and a 60M villa pay the same", () => {
  assert.equal(sale("villa", 5_000_000), sale("villa", 60_000_000));
  assert.equal(sale("apartment", 1_000_000), sale("apartment", 99_000_000));
});

test("an unknown type pays the higher tier rather than being under-quoted", () => {
  assert.equal(saleFeeForType("castle"), 100_000);
});

test("rent: up to 100,000 a month pays 15,000; above it 50,000", () => {
  assert.equal(rentFeeFor(20_000), RENT_FEE_LOW);
  assert.equal(rentFeeFor(RENT_THRESHOLD), RENT_FEE_LOW, "exactly 100,000 is in the low tier");
  assert.equal(rentFeeFor(RENT_THRESHOLD + 1), RENT_FEE_HIGH);
  assert.equal(RENT_FEE_LOW, 15_000);
  assert.equal(RENT_FEE_HIGH, 50_000);
});

test("rent ignores the unit type", () => {
  assert.equal(feePerSide({ purpose: "rent", unitType: "villa", amount: 30_000 }), 15_000);
  assert.equal(feePerSide({ purpose: "rent", unitType: "apartment", amount: 150_000 }), 50_000);
});

test("junk rent degrades to the low tier instead of throwing", () => {
  assert.equal(rentFeeFor(NaN), RENT_FEE_LOW);
  assert.equal(rentFeeFor(-5), RENT_FEE_LOW);
});

test("trade: each side pays by the type it RECEIVES; several units = the highest", () => {
  assert.equal(tradeFeeForReceived(["villa"]), 100_000, "the side getting the villa");
  assert.equal(tradeFeeForReceived(["apartment"]), 50_000, "the side getting the apartment");
  assert.equal(tradeFeeForReceived(["apartment", "studio"]), 50_000);
  assert.equal(tradeFeeForReceived(["apartment", "townhouse"]), 100_000);
  assert.equal(tradeFeeForReceived([]), 0);
});

test("BOTH sides pay in full — the deal total is twice the per-side fee", () => {
  assert.equal(FEE_PARTIES.length, 2);
  assert.equal(dealFeeTotalFor({ purpose: "sale", unitType: "villa", amount: 1 }), 200_000);
  assert.equal(dealFeeTotalFor({ purpose: "rent", unitType: "villa", amount: 50_000 }), 30_000);
});

test("splitFee divides a RECORDED total into two equal sides; odd pound to the seller", () => {
  assert.deepEqual(splitFee(200_000), { total: 200_000, buyer: 100_000, seller: 100_000 });
  const odd = splitFee(100_001);
  assert.equal(odd.buyer + odd.seller, 100_001);
  assert.deepEqual(splitFee(NaN), { total: 0, buyer: 0, seller: 0 });
});

test("the pricing schedule rows come from the same constants", () => {
  const byKey = Object.fromEntries(FEE_SCHEDULE_ROWS.map((r) => [r.key, r.fee]));
  assert.equal(byKey.sale_standard, sale("apartment"));
  assert.equal(byKey.sale_large, sale("villa"));
  assert.equal(byKey.rent_low, RENT_FEE_LOW);
  assert.equal(byKey.rent_high, RENT_FEE_HIGH);
  assert.equal(byKey.trade, null, "a trade has no single figure — never invent one");
});

test("published wording: by unit type, each side in full, not a percentage, no single flat fee", () => {
  for (const note of [PRICING_NOTE, FEE_MODEL_NOTE]) {
    assert.match(note.en, /by unit type/i);
    assert.match(note.ar, /نوع الوحدة/);
    assert.doesNotMatch(note.en, /a flat fee of/i);
    assert.doesNotMatch(note.en, /band/i);
  }
  assert.match(PRICING_NOTE.en, /each side/i);
  assert.match(PRICING_NOTE.en, /not half/i);
  assert.match(PRICING_NOTE.en, /not a percentage/i);
});

test("both parties have a label in both languages", () => {
  for (const p of FEE_PARTIES) assert.ok(FEE_PARTY_LABELS[p].ar && FEE_PARTY_LABELS[p].en);
});
