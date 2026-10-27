/**
 * Business rules outside the publish gate: fair price, anti-broker enforcement, the
 * listing state machine, unit fingerprinting, and the 24-hour SLA.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  estimateFairPrice,
  verdictFor,
  developerGapPct,
  median,
  removeOutliers,
  floorFactor,
  staleFactor,
  Comparable,
  MIN_SAMPLE,
} from "../fairPrice";
import { scanMessage, maskPhone, latiniseDigits, shouldBlockForStrikes } from "../antiBroker";
import { canTransition, LISTING_STATUSES, MIN_PUBLIC_TRUST, TRUST } from "../enums";
import { buildUnitFingerprint, normaliseToken, hashNationalId } from "../fingerprint";
import { slaDueFrom, slaState, pickAdvisor, formatCountdown } from "../sla";
import { pointInRing, haversineMetres, squareRing, pointInPolygonJson } from "../geo";
import { normalisePhone, countryFromPhone } from "../auth";

// ---------------------------------------------------------------------------
// Fair price engine
// ---------------------------------------------------------------------------

const comp = (pricePerSqm: number, over: Partial<Comparable> = {}): Comparable => ({
  pricePerSqm,
  isClosed: false,
  finishing: "fully_finished",
  deliveryStatus: "ready",
  floor: 3,
  view: "open",
  daysOnMarket: 10,
  ...over,
});

const subject = {
  sizeSqm: 100,
  type: "apartment",
  finishing: "fully_finished",
  deliveryStatus: "ready",
  floor: 3,
  view: "open",
};

test("fair price refuses to guess below the minimum sample", () => {
  const r = estimateFairPrice(subject, [comp(60000), comp(62000)]);
  assert.equal(r.insufficientData, true);
  assert.equal(r.mid, 0);
});

test("fair price returns a range, never a single number", () => {
  const r = estimateFairPrice(subject, [comp(60000), comp(62000), comp(61000), comp(59000)]);
  assert.equal(r.insufficientData, false);
  assert.ok(r.low < r.mid && r.mid < r.high, `${r.low} ${r.mid} ${r.high}`);
});

test("fair price tracks the median of comparables", () => {
  const r = estimateFairPrice(subject, [comp(60000), comp(60000), comp(60000), comp(60000)]);
  // Baseline and subject share every factor, so 100 sqm x 60k should land on 6M.
  assert.equal(r.mid, 6_000_000);
});

test("confidence rises with sample size", () => {
  const few = estimateFairPrice(subject, Array.from({ length: MIN_SAMPLE }, () => comp(60000)));
  const many = estimateFairPrice(subject, Array.from({ length: 10 }, () => comp(60000)));
  assert.equal(few.confidence, "low");
  assert.equal(many.confidence, "medium");
});

test("high confidence needs both a large sample and closed deals", () => {
  const asksOnly = estimateFairPrice(subject, Array.from({ length: 25 }, () => comp(60000)));
  assert.equal(asksOnly.confidence, "medium", "asking prices alone never reach high confidence");

  const withClosed = estimateFairPrice(subject, [
    ...Array.from({ length: 22 }, () => comp(60000)),
    comp(60000, { isClosed: true }),
    comp(60000, { isClosed: true }),
    comp(60000, { isClosed: true }),
  ]);
  assert.equal(withClosed.confidence, "high");
});

test("a wider band accompanies lower confidence", () => {
  const low = estimateFairPrice(subject, Array.from({ length: MIN_SAMPLE }, () => comp(60000)));
  const med = estimateFairPrice(subject, Array.from({ length: 10 }, () => comp(60000)));
  const lowWidth = (low.high - low.low) / low.mid;
  const medWidth = (med.high - med.low) / med.mid;
  assert.ok(lowWidth > medWidth);
});

test("finishing is normalised out of comparables and back onto the subject", () => {
  // Comparables are all core-shell; the subject is fully finished, so it should be dearer.
  const comps = Array.from({ length: 6 }, () => comp(50000, { finishing: "core_shell" }));
  const coreShell = estimateFairPrice({ ...subject, finishing: "core_shell" }, comps);
  const finished = estimateFairPrice(subject, comps);
  assert.ok(finished.mid > coreShell.mid);
});

test("an under-construction subject is valued below a ready one", () => {
  const comps = Array.from({ length: 6 }, () => comp(60000));
  const ready = estimateFairPrice(subject, comps);
  const uc = estimateFairPrice({ ...subject, deliveryStatus: "under_construction" }, comps);
  assert.ok(uc.mid < ready.mid);
});

test("one mistyped price does not move the estimate", () => {
  const clean = Array.from({ length: 8 }, () => comp(60000));
  const withOutlier = [...clean, comp(600_000_000)];
  const a = estimateFairPrice(subject, clean);
  const b = estimateFairPrice(subject, withOutlier);
  assert.equal(a.mid, b.mid);
});

test("closed deals are weighted above asking prices", () => {
  const asks = Array.from({ length: 6 }, () => comp(70000));
  const withClosedLow = [...asks, comp(50000, { isClosed: true })];
  const withAskLow = [...asks, comp(50000)];
  const closed = estimateFairPrice(subject, withClosedLow);
  const ask = estimateFairPrice(subject, withAskLow);
  assert.ok(closed.mid <= ask.mid, "a closed deal should pull the estimate at least as hard as an ask");
});

test("median handles even and odd lengths", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test("removeOutliers keeps small samples intact", () => {
  assert.deepEqual(removeOutliers([1, 100]), [1, 100]);
});

test("floor and staleness factors behave monotonically", () => {
  assert.ok(floorFactor(0) > floorFactor(1), "ground floor with garden beats first floor");
  assert.equal(floorFactor(null), 1);
  assert.equal(staleFactor(30), 1, "a fresh listing is not discounted");
  assert.ok(staleFactor(200) < 1);
  assert.ok(staleFactor(2000) >= 0.92, "the stale discount is capped");
});

test("the price verdict compares the ask against the band", () => {
  const fair = estimateFairPrice(subject, Array.from({ length: 10 }, () => comp(60000)));
  assert.equal(verdictFor(fair.low - 1, fair), "below");
  assert.equal(verdictFor(fair.mid, fair), "fair");
  assert.equal(verdictFor(fair.high + 1, fair), "above");
});

test("the verdict is unknown when there is not enough data", () => {
  const none = estimateFairPrice(subject, [comp(60000)]);
  assert.equal(verdictFor(5_000_000, none), "unknown");
});

test("the developer gap is a percentage of the developer price", () => {
  assert.equal(developerGapPct(8_000_000, 10_000_000), 20);
  assert.equal(developerGapPct(8_000_000, null), null);
  assert.equal(developerGapPct(8_000_000, 0), null);
});

// ---------------------------------------------------------------------------
// Anti-broker enforcement
// ---------------------------------------------------------------------------

test("an Egyptian mobile number in a message is redacted", () => {
  const r = scanMessage("كلمني على 01001234567");
  assert.ok(r.flagged);
  assert.ok(r.reasons.includes("contact_sharing"));
  assert.ok(!r.redacted.includes("01001234567"));
});

test("Arabic-Indic digits do not evade the phone filter", () => {
  const r = scanMessage("رقمي ٠١٠٠١٢٣٤٥٦٧");
  assert.ok(r.flagged, "Arabic-Indic digits should still be caught");
  assert.ok(r.reasons.includes("contact_sharing"));
});

test("separators do not evade the phone filter", () => {
  assert.ok(scanMessage("0100 123 4567").flagged);
  assert.ok(scanMessage("0100-123-4567").flagged);
});

test("a price is not mistaken for a phone number", () => {
  const r = scanMessage("السعر 2,500,000 جنيه");
  assert.ok(!r.reasons.includes("contact_sharing"), `wrongly flagged: ${r.matches}`);
  assert.ok(r.redacted.includes("2,500,000"));
});

test("broker language is flagged without redacting the text", () => {
  const r = scanMessage("انا سمسار وعندي وحدات تانية بعمولة 2%");
  assert.ok(r.reasons.includes("broker_language"));
});

test("email and messaging handles are caught", () => {
  assert.ok(scanMessage("ابعتلي على ahmed@example.com").reasons.includes("contact_sharing"));
  assert.ok(scanMessage("كلمني واتساب").reasons.includes("contact_sharing"));
  assert.ok(scanMessage("find me on telegram").reasons.includes("contact_sharing"));
});

test("an ordinary message is not flagged", () => {
  const r = scanMessage("الشقة لسه متاحة؟ ممكن أعاينها الأسبوع الجاي");
  assert.equal(r.flagged, false, `wrongly flagged: ${r.matches}`);
});

test("latiniseDigits converts Arabic-Indic digits", () => {
  assert.equal(latiniseDigits("٠١٢٣٤٥٦٧٨٩"), "0123456789");
});

test("phone masking never reveals the middle digits", () => {
  const masked = maskPhone("+201001234567");
  assert.ok(!masked.includes("0012345"));
  assert.ok(masked.endsWith("67"));
});

test("three upheld strikes block an account", () => {
  assert.equal(shouldBlockForStrikes(2), false);
  assert.equal(shouldBlockForStrikes(3), true);
});

// ---------------------------------------------------------------------------
// Listing state machine
// ---------------------------------------------------------------------------

test("the listing state machine allows only the documented transitions", () => {
  assert.ok(canTransition("draft", "pending_review"));
  assert.ok(canTransition("pending_review", "live"));
  assert.ok(canTransition("pending_review", "rejected"));
  assert.ok(canTransition("live", "closed"));
  assert.ok(canTransition("rejected", "draft"));
});

test("a listing cannot skip review on its way to live", () => {
  assert.equal(canTransition("draft", "live"), false);
});

test("a closed listing is terminal", () => {
  for (const to of LISTING_STATUSES) {
    assert.equal(canTransition("closed", to), false, `closed should not go to ${to}`);
  }
});

test("public visibility requires ownership verification", () => {
  assert.equal(MIN_PUBLIC_TRUST, TRUST.OWNERSHIP);
  assert.ok(MIN_PUBLIC_TRUST > TRUST.IDENTITY, "an ID alone must not make a listing public");
});

// ---------------------------------------------------------------------------
// Unit fingerprint — the one-listing-per-unit guarantee
// ---------------------------------------------------------------------------

const baseUnit = {
  compoundId: "c1",
  areaId: "a1",
  building: "B9",
  floor: 3,
  unitNumber: "304",
  type: "apartment",
  sizeSqm: 165,
};

test("the same unit written differently yields the same fingerprint", () => {
  const a = buildUnitFingerprint(baseUnit);
  const b = buildUnitFingerprint({ ...baseUnit, building: " b-9 ", unitNumber: "#304" });
  assert.equal(a, b);
});

test("a rounding difference in size does not defeat the fingerprint", () => {
  assert.equal(buildUnitFingerprint(baseUnit), buildUnitFingerprint({ ...baseUnit, sizeSqm: 165.4 }));
});

test("a genuinely different unit yields a different fingerprint", () => {
  const a = buildUnitFingerprint(baseUnit);
  assert.notEqual(a, buildUnitFingerprint({ ...baseUnit, unitNumber: "305" }));
  assert.notEqual(a, buildUnitFingerprint({ ...baseUnit, building: "B8" }));
  assert.notEqual(a, buildUnitFingerprint({ ...baseUnit, compoundId: "c2" }));
});

test("normaliseToken folds Arabic orthographic variants", () => {
  assert.equal(normaliseToken("أحمد"), normaliseToken("احمد"));
  assert.equal(normaliseToken("شقة"), normaliseToken("شقه"));
  assert.equal(normaliseToken("١٢٣"), "123");
});

test("a national ID is hashed, never stored raw", () => {
  const h = hashNationalId("28801011234567");
  assert.equal(h.length, 64);
  assert.ok(!h.includes("28801011234567"));
  assert.equal(h, hashNationalId("28801011234567"), "hashing is deterministic");
});

// ---------------------------------------------------------------------------
// SLA
// ---------------------------------------------------------------------------

test("the SLA window is 24 hours", () => {
  const created = new Date("2026-09-13T10:00:00Z");
  assert.equal(slaDueFrom(created).toISOString(), "2026-09-14T10:00:00.000Z");
});

test("SLA state reports remaining, urgent and breached correctly", () => {
  const now = new Date("2026-09-13T12:00:00Z");
  const inWindow = slaState(new Date("2026-09-14T10:00:00Z"), null, now);
  assert.equal(inWindow.breached, false);
  assert.equal(inWindow.urgent, false);

  const urgent = slaState(new Date("2026-09-13T14:00:00Z"), null, now);
  assert.equal(urgent.urgent, true);
  assert.equal(urgent.breached, false);

  const breached = slaState(new Date("2026-09-13T09:00:00Z"), null, now);
  assert.equal(breached.breached, true);
});

test("a logged first response stops the clock", () => {
  const now = new Date("2026-09-15T12:00:00Z"); // long past the deadline
  const responded = slaState(new Date("2026-09-14T10:00:00Z"), new Date("2026-09-13T11:00:00Z"), now);
  assert.equal(responded.breached, false, "an answered request cannot breach later");
});

test("the countdown reads naturally in both languages", () => {
  assert.ok(formatCountdown(3 * 3600_000, "en").includes("left"));
  assert.ok(formatCountdown(-3600_000, "en").includes("overdue"));
  assert.ok(formatCountdown(3 * 3600_000, "ar").startsWith("باقي"));
  assert.ok(formatCountdown(-3600_000, "ar").startsWith("متأخر"));
});

test("advisor assignment prefers the buyer's country, then the lightest load", () => {
  const pool = [
    { id: "eg-busy", countryCode: "EG", openRequests: 9 },
    { id: "eg-free", countryCode: "EG", openRequests: 1 },
    { id: "sa-free", countryCode: "SA", openRequests: 0 },
  ];
  assert.equal(pickAdvisor(pool, "EG"), "eg-free");
  assert.equal(pickAdvisor(pool, "SA"), "sa-free", "a Gulf buyer gets the Gulf desk");
  assert.equal(pickAdvisor(pool, "AE"), "sa-free", "with no local desk, the lightest load wins");
  assert.equal(pickAdvisor([], "EG"), null);
});

// ---------------------------------------------------------------------------
// Geo
// ---------------------------------------------------------------------------

test("point-in-polygon accepts inside and rejects outside", () => {
  const ring = squareRing(30.0, 31.0, 1000);
  assert.equal(pointInRing([31.0, 30.0], ring), true);
  assert.equal(pointInRing([31.5, 30.5], ring), false);
});

test("pointInPolygonJson returns null when the boundary is unknown", () => {
  assert.equal(pointInPolygonJson(30, 31, null), null);
  assert.equal(pointInPolygonJson(30, 31, "not json"), null);
});

test("haversine distance is accurate to within a percent", () => {
  // One degree of latitude is about 111.2 km.
  const d = haversineMetres(30.0, 31.0, 31.0, 31.0);
  assert.ok(Math.abs(d - 111_200) < 1200, `got ${d}`);
});

// ---------------------------------------------------------------------------
// Phone normalisation (Egypt + Gulf)
// ---------------------------------------------------------------------------

test("Egyptian local numbers normalise to E.164", () => {
  assert.equal(normalisePhone("01001234567"), "+201001234567");
  assert.equal(normalisePhone("0100 123 4567"), "+201001234567");
  assert.equal(normalisePhone("+201001234567"), "+201001234567");
  assert.equal(normalisePhone("00201001234567"), "+201001234567");
});

test("Gulf numbers are accepted and mapped to their country", () => {
  assert.equal(normalisePhone("+966500000001"), "+966500000001");
  assert.equal(countryFromPhone("+966500000001"), "SA");
  assert.equal(countryFromPhone("+971500000001"), "AE");
  assert.equal(countryFromPhone("+201001234567"), "EG");
});

test("unsupported and malformed numbers are rejected", () => {
  assert.equal(normalisePhone("+15551234567"), null, "US numbers are out of scope");
  assert.equal(normalisePhone("123"), null);
  assert.equal(normalisePhone("0201234"), null);
});
