/**
 * PropShop Fair Price engine v1 — rules-based (Section 6b-A).
 *
 * Pure function, no I/O: the caller loads comparables and passes them in. That keeps it
 * unit-testable and lets v2 (gradient-boosted, retrained weekly at 2,000+ verified
 * listings and 200+ closed deals) drop in behind the same signature.
 *
 * Method: median EGP/sqm over comparables from the same compound + unit type, adjusted
 * for finishing, delivery status, floor, view and days on market. It returns a RANGE and
 * a confidence label — never a single false-precise number (explicit brief requirement).
 */

import { Finishing, UnitType } from "./enums";

export type Comparable = {
  pricePerSqm: number;
  /** Closed deals are worth far more than asking prices as evidence. */
  isClosed: boolean;
  finishing: Finishing | string;
  deliveryStatus: string;
  floor?: number | null;
  view?: string | null;
  /** Days the listing has sat on the market; a stale ask is a weak comparable. */
  daysOnMarket?: number | null;
};

export type FairPriceSubject = {
  sizeSqm: number;
  type: UnitType | string;
  finishing: Finishing | string;
  deliveryStatus: string;
  floor?: number | null;
  view?: string | null;
  daysOnMarket?: number | null;
};

export type Confidence = "low" | "medium" | "high";

export type FairPriceResult = {
  low: number;
  mid: number;
  high: number;
  confidence: Confidence;
  method: "rules_v1";
  sampleSize: number;
  /** Every multiplier applied, so the listing page can explain the number. */
  factors: Record<string, number>;
  /** Null when there is not enough evidence to show anything at all. */
  insufficientData: boolean;
};

/** Relative value of each finishing level against a fully-finished baseline. */
const FINISHING_FACTOR: Record<string, number> = {
  core_shell: 0.82,
  semi_finished: 0.91,
  fully_finished: 1.0,
  furnished: 1.12,
};

/** Ready-to-move commands a premium over a unit still under construction. */
const DELIVERY_FACTOR: Record<string, number> = {
  ready: 1.0,
  under_construction: 0.88,
};

const VIEW_FACTOR: Record<string, number> = {
  garden: 1.06,
  pool: 1.05,
  landscape: 1.04,
  sea: 1.1,
  open: 1.0,
  street: 0.96,
};

/** Minimum comparables before we will show a compound-level number at all. */
export const MIN_SAMPLE = 3;
/** Sample sizes at which confidence steps up. */
const MEDIUM_SAMPLE = 8;
const HIGH_SAMPLE = 20;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Floor adjustment: ground floors with a garden and very high floors both trade at a
 * premium in Egyptian compounds; the middle floors are the baseline.
 */
export function floorFactor(floor: number | null | undefined): number {
  if (floor === null || floor === undefined) return 1;
  if (floor <= 0) return 1.03; // ground / garden
  if (floor === 1) return 0.98;
  if (floor <= 4) return 1.0;
  return 1.02; // penthouse-ish top floors
}

/**
 * A listing that has sat unsold is evidence its ask was too high, so it is discounted as
 * a comparable. Capped at 8% so one stale outlier cannot drag the median.
 */
export function staleFactor(daysOnMarket: number | null | undefined): number {
  if (!daysOnMarket || daysOnMarket <= 60) return 1;
  const excessMonths = (daysOnMarket - 60) / 30;
  return Math.max(0.92, 1 - excessMonths * 0.02);
}

/** Normalises one comparable to the "fully finished, ready, mid-floor, open view" baseline. */
export function normaliseComparable(c: Comparable): number {
  const f = FINISHING_FACTOR[c.finishing] ?? 1;
  const d = DELIVERY_FACTOR[c.deliveryStatus] ?? 1;
  const fl = floorFactor(c.floor);
  const v = c.view ? (VIEW_FACTOR[c.view] ?? 1) : 1;
  const s = staleFactor(c.daysOnMarket);
  return c.pricePerSqm / (f * d * fl * v * s);
}

/** Drops comparables outside 1.5 IQR so one mistyped price cannot move the median. */
export function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const iqr = q3 - q1;
  if (iqr === 0) return sorted;
  return sorted.filter((v) => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
}

export function confidenceFor(sampleSize: number, closedCount: number): Confidence {
  if (sampleSize >= HIGH_SAMPLE && closedCount >= 3) return "high";
  if (sampleSize >= MEDIUM_SAMPLE) return "medium";
  return "low";
}

/** Band half-width around the mid estimate. Less evidence -> wider band. */
function bandFor(confidence: Confidence): number {
  return confidence === "high" ? 0.05 : confidence === "medium" ? 0.08 : 0.12;
}

export function estimateFairPrice(subject: FairPriceSubject, comparables: Comparable[]): FairPriceResult {
  const baseFactors = {
    finishing: FINISHING_FACTOR[subject.finishing] ?? 1,
    delivery: DELIVERY_FACTOR[subject.deliveryStatus] ?? 1,
    floor: floorFactor(subject.floor),
    view: subject.view ? (VIEW_FACTOR[subject.view] ?? 1) : 1,
  };

  if (comparables.length < MIN_SAMPLE) {
    return {
      low: 0,
      mid: 0,
      high: 0,
      confidence: "low",
      method: "rules_v1",
      sampleSize: comparables.length,
      factors: baseFactors,
      insufficientData: true,
    };
  }

  // Closed deals count double — they are realised prices, not aspirations.
  const weighted: number[] = [];
  let closedCount = 0;
  for (const c of comparables) {
    const normalised = normaliseComparable(c);
    weighted.push(normalised);
    if (c.isClosed) {
      weighted.push(normalised);
      closedCount += 1;
    }
  }

  const cleaned = removeOutliers(weighted);
  const baselineSqm = median(cleaned);
  const adjustedSqm = baselineSqm * baseFactors.finishing * baseFactors.delivery * baseFactors.floor * baseFactors.view;

  const mid = adjustedSqm * subject.sizeSqm;
  const confidence = confidenceFor(comparables.length, closedCount);
  const band = bandFor(confidence);

  return {
    low: roundToNearest(mid * (1 - band), 5000),
    mid: roundToNearest(mid, 5000),
    high: roundToNearest(mid * (1 + band), 5000),
    confidence,
    method: "rules_v1",
    sampleSize: comparables.length,
    factors: { ...baseFactors, baselineSqm: Math.round(baselineSqm), adjustedSqm: Math.round(adjustedSqm) },
    insufficientData: false,
  };
}

export function roundToNearest(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

export type PriceVerdict = "below" | "fair" | "above" | "unknown";

/** Drives the "Below fair price" / "Above fair price" badge on cards and listing pages. */
export function verdictFor(askingPrice: number, fair: FairPriceResult): PriceVerdict {
  if (fair.insufficientData || fair.mid <= 0) return "unknown";
  if (askingPrice < fair.low) return "below";
  if (askingPrice > fair.high) return "above";
  return "fair";
}

/** "Cheaper than developer by X%" badge. Returns null when there is no developer price. */
export function developerGapPct(askingPrice: number, developerPrice: number | null | undefined): number | null {
  if (!developerPrice || developerPrice <= 0) return null;
  return ((developerPrice - askingPrice) / developerPrice) * 100;
}
