import { UNIT_TYPES, PAYMENT_TYPES } from "./enums";
import { BEDROOM_OPTIONS, BATHROOM_OPTIONS } from "./facets";
import { Preference } from "./trade";

/**
 * Trade requests — the rules, pure so they are testable without a database.
 *
 * A lister who wants to trade says which unit they want in exchange, using the same
 * controls as the browse filters: location (areas and/or compounds), property type,
 * bedrooms, bathrooms, price range and payment, plus a short description. Saving shows
 * every live listing open to trade that fits; every later one that goes live (or is
 * opened to trade) notifies the requester.
 *
 * Matching follows the browse filters exactly, so "what the form says" and "what the
 * filters would find" never disagree: groups AND together, options inside a group OR
 * together, an empty group means "any". The one deliberate difference is location — an
 * area and a compound picked together mean "anywhere in this area OR in this compound",
 * because someone who types "Mivida" and ticks "Sheikh Zayed" wants either, not the
 * (empty) intersection.
 */

export type TradeRequestSpec = {
  types: string[];
  areaIds: string[];
  compoundIds: string[];
  /** BEDROOM_OPTIONS values: "0" studio … "5" = 5 or more. */
  bedrooms: string[];
  /** BATHROOM_OPTIONS values: "1" … "4" = 4 or more. */
  bathrooms: string[];
  payment: string[];
  minPrice: number | null;
  maxPrice: number | null;
  description: string | null;
};

export const EMPTY_TRADE_REQUEST: TradeRequestSpec = {
  types: [],
  areaIds: [],
  compoundIds: [],
  bedrooms: [],
  bathrooms: [],
  payment: [],
  minPrice: null,
  maxPrice: null,
  description: null,
};

export const TRADE_REQUEST_DESCRIPTION_MAX = 500;
const MAX_MONEY = 5_000_000_000;
const BED_VALUES = BEDROOM_OPTIONS.map((o) => o.value);
const BATH_VALUES = BATHROOM_OPTIONS.map((o) => o.value);
/** The top option of a rooms group means "this many or more". */
const BED_OPEN_ENDED = BED_VALUES[BED_VALUES.length - 1];
const BATH_OPEN_ENDED = BATH_VALUES[BATH_VALUES.length - 1];

export type TradeRequestError = { field: string; code: "invalid" | "out_of_range" | "too_long" | "empty" };

/** Validates a trade request from a form/API body against the known areas and compounds. */
export function parseTradeRequest(
  body: unknown,
  known: { areaIds: string[]; compoundIds: string[] },
): { ok: true; spec: TradeRequestSpec } | { ok: false; errors: TradeRequestError[] } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: TradeRequestError[] = [];

  const list = (v: unknown, allowed: readonly string[], field: string) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !allowed.includes(x))) {
      errors.push({ field, code: "invalid" });
      return [];
    }
    return [...new Set(v as string[])];
  };
  const money = (v: unknown, field: string) => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
    if (!Number.isFinite(n)) {
      errors.push({ field, code: "invalid" });
      return null;
    }
    if (n < 0 || n > MAX_MONEY) {
      errors.push({ field, code: "out_of_range" });
      return null;
    }
    return n;
  };

  const spec: TradeRequestSpec = {
    types: list(b.types, UNIT_TYPES, "types"),
    areaIds: list(b.areaIds, known.areaIds, "areaIds"),
    compoundIds: list(b.compoundIds, known.compoundIds, "compoundIds"),
    bedrooms: list(b.bedrooms, BED_VALUES, "bedrooms"),
    bathrooms: list(b.bathrooms, BATH_VALUES, "bathrooms"),
    payment: list(b.payment, PAYMENT_TYPES, "payment"),
    minPrice: money(b.minPrice, "minPrice"),
    maxPrice: money(b.maxPrice, "maxPrice"),
    description: null,
  };
  if (spec.minPrice !== null && spec.maxPrice !== null && spec.minPrice > spec.maxPrice) {
    errors.push({ field: "maxPrice", code: "out_of_range" });
  }
  if (typeof b.description === "string" && b.description.trim()) {
    const d = b.description.trim();
    if (d.length > TRADE_REQUEST_DESCRIPTION_MAX) errors.push({ field: "description", code: "too_long" });
    else spec.description = d;
  }
  // A request with no criterion at all would match — and notify — on every trade listing.
  if (!errors.length && !hasCriteria(spec)) errors.push({ field: "spec", code: "empty" });
  return errors.length ? { ok: false, errors } : { ok: true, spec };
}

/** True when at least one filter narrows the request (the description alone does not). */
export function hasCriteria(s: TradeRequestSpec): boolean {
  return (
    s.types.length + s.areaIds.length + s.compoundIds.length + s.bedrooms.length + s.bathrooms.length + s.payment.length > 0 ||
    s.minPrice !== null ||
    s.maxPrice !== null
  );
}

export type RequestCandidate = {
  type: string;
  areaId: string;
  compoundId: string | null;
  bedrooms: number;
  bathrooms: number;
  paymentType: string;
  /** Number, or a Prisma Decimal on Postgres — compared via Number(). */
  price: number | { toString(): string };
};

const roomsFit = (picked: string[], n: number, openEnded: string) =>
  !picked.length ||
  picked.some((v) => (v === openEnded ? n >= Number(v) : n === Number(v)));

/**
 * Whether one listing fits a request. Returns the criteria that failed so a caller can
 * explain a near miss; `matches` is true only when none did.
 */
export function matchTradeRequest(s: TradeRequestSpec, c: RequestCandidate): { matches: boolean; failed: string[] } {
  const failed: string[] = [];
  if (s.types.length && !s.types.includes(c.type)) failed.push("type");
  if (s.areaIds.length || s.compoundIds.length) {
    const inArea = s.areaIds.includes(c.areaId);
    const inCompound = !!c.compoundId && s.compoundIds.includes(c.compoundId);
    if (!inArea && !inCompound) failed.push("location");
  }
  if (!roomsFit(s.bedrooms, c.bedrooms, BED_OPEN_ENDED)) failed.push("bedrooms");
  if (!roomsFit(s.bathrooms, c.bathrooms, BATH_OPEN_ENDED)) failed.push("bathrooms");
  if (s.payment.length && !s.payment.includes(c.paymentType)) failed.push("payment");
  const price = Number(c.price);
  if (s.minPrice !== null && price < s.minPrice) failed.push("price_low");
  if (s.maxPrice !== null && price > s.maxPrice) failed.push("price_high");
  return { matches: failed.length === 0, failed };
}

/**
 * The listing-level TradePreference implied by a request, for the listing the requester
 * offers in exchange — so the trade market's "would trade for" line says the same thing
 * as the request. TradePreference is coarser (min bedrooms, areas only), so this widens:
 * a compound contributes its area, picked bedrooms become their minimum. Size and cash
 * terms are not on the request and are kept from the existing preference.
 */
export function preferenceFromRequest(
  s: TradeRequestSpec,
  compoundAreaIds: string[],
  existing: Pick<Preference, "minSizeSqm" | "cash">,
): Preference {
  const beds = s.bedrooms.map(Number).filter(Number.isFinite);
  return {
    types: s.types,
    areaIds: [...new Set([...s.areaIds, ...compoundAreaIds])],
    minBedrooms: beds.length ? Math.min(...beds) : null,
    minSizeSqm: existing.minSizeSqm,
    minValue: s.minPrice,
    maxValue: s.maxPrice,
    cash: existing.cash,
    note: s.description,
  };
}

/**
 * The dedupe key that stops one listing notifying one user twice. Per user (the key is
 * unique per user), not per request: two of their requests fitting the same unit is still
 * one piece of news.
 */
export function tradeMatchKey(listingId: string): string {
  return `trade_match:${listingId}`;
}

/** Who opened a listing to trade: its own trade settings, or a trade request offering it. */
export type TradeOpenSource = "owner" | "request";

/**
 * Whether a listing counts as opened BY A REQUEST after a trade-settings write.
 *
 * The owner's own settings screen always takes the listing over (open or closed), so a
 * later request deletion never closes what the owner chose. A request only claims a
 * listing it actually opened: one the owner had already opened keeps its owner origin.
 */
export function openedByRequestAfter(
  before: { open: boolean; byRequest: boolean },
  source: TradeOpenSource,
  open: boolean,
): boolean {
  if (source === "owner" || !open) return false;
  return before.open ? before.byRequest : true;
}

/**
 * The listing a saved request stopped offering — its previous unit when the request was
 * switched to another one or had its unit removed — or null when nothing was released.
 */
export function releasedListingId(before: string | null, after: string | null): string | null {
  return before && before !== after ? before : null;
}

/**
 * Whether a listing that a request no longer offers should be closed to trade: only when
 * a request opened it and no other active request of the same user still offers it.
 */
export function shouldCloseReleasedListing(
  listing: { openToTrade: boolean; openedByRequest: boolean },
  otherActiveRequestsOffering: number,
): boolean {
  return listing.openToTrade && listing.openedByRequest && otherActiveRequestsOffering === 0;
}
