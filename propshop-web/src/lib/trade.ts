import { UNIT_TYPES } from "./enums";

/**
 * Unit trading — the rules, pure so they are testable without a database.
 *
 * An owner marks a verified listing "open to trade" and says what they want in return
 * (TradePreference). Another owner offers 1–3 of their own verified units, plus an
 * optional cash difference paid by either side. The recipient accepts or rejects; the
 * proposer can withdraw. Offers lapse after TRADE_EXPIRY_DAYS, evaluated at read time like
 * sale offers, so a lapsed trade can never be accepted because no sweep job ran.
 *
 * Requirements are GUIDANCE for matching, not a gate: an owner who wants "villas in New
 * Cairo" may still like an offer of a townhouse plus cash, and it is their call. The one
 * hard rule taken from the preference is cash direction — if the owner said they will
 * not pay cash, an offer asking them to is refused, because that is a stated term, not a
 * taste.
 */

export const TRADE_CASH = ["i_pay", "i_receive", "either", "none"] as const;
export type TradeCash = (typeof TRADE_CASH)[number];
export const MAX_TRADE_UNITS = 3;
export const TRADE_EXPIRY_DAYS = 14;
const MAX_MONEY = 5_000_000_000;

export type Preference = {
  types: string[];
  areaIds: string[];
  minBedrooms: number | null;
  minSizeSqm: number | null;
  minValue: number | null;
  maxValue: number | null;
  cash: TradeCash;
  note: string | null;
};

export const EMPTY_PREFERENCE: Preference = {
  types: [],
  areaIds: [],
  minBedrooms: null,
  minSizeSqm: null,
  minValue: null,
  maxValue: null,
  cash: "either",
  note: null,
};

export type PrefError = { field: string; code: "invalid" | "out_of_range" | "too_long" };

/** Validates an owner's trade requirements from a form/API body. */
export function parsePreference(body: unknown, knownAreaIds: string[]): { ok: true; pref: Preference } | { ok: false; errors: PrefError[] } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: PrefError[] = [];

  const list = (v: unknown, allowed: readonly string[], field: string) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !allowed.includes(x))) {
      errors.push({ field, code: "invalid" });
      return [];
    }
    return [...new Set(v as string[])];
  };
  const num = (v: unknown, field: string, min: number, max: number, int = false) => {
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    if (!Number.isFinite(n) || (int && !Number.isInteger(n))) {
      errors.push({ field, code: "invalid" });
      return null;
    }
    if (n < min || n > max) {
      errors.push({ field, code: "out_of_range" });
      return null;
    }
    return n;
  };

  const pref: Preference = {
    types: list(b.types, UNIT_TYPES, "types"),
    areaIds: list(b.areaIds, knownAreaIds, "areaIds"),
    minBedrooms: num(b.minBedrooms, "minBedrooms", 0, 20, true),
    minSizeSqm: num(b.minSizeSqm, "minSizeSqm", 10, 100_000),
    minValue: num(b.minValue, "minValue", 0, MAX_MONEY),
    maxValue: num(b.maxValue, "maxValue", 0, MAX_MONEY),
    cash: TRADE_CASH.includes(b.cash as TradeCash) ? (b.cash as TradeCash) : "either",
    note: null,
  };
  if (b.cash !== undefined && !TRADE_CASH.includes(b.cash as TradeCash)) errors.push({ field: "cash", code: "invalid" });
  if (pref.minValue !== null && pref.maxValue !== null && pref.minValue > pref.maxValue) {
    errors.push({ field: "maxValue", code: "out_of_range" });
  }
  if (typeof b.note === "string" && b.note.trim()) {
    if (b.note.trim().length > 500) errors.push({ field: "note", code: "too_long" });
    else pref.note = b.note.trim();
  }
  return errors.length ? { ok: false, errors } : { ok: true, pref };
}

export type CandidateUnit = { type: string; areaId: string; bedrooms: number; sizeSqm: number; price: number };

/**
 * Whether a set of units fits a preference. Type/area/bedrooms/size are judged on the
 * best single unit (an owner who wants a 3-bedroom is not satisfied by two studios);
 * value is judged on the package total (two flats CAN add up to one villa's value).
 * Returns the criteria that failed, so the UI can say why something is a near miss.
 */
export function matchPreference(pref: Preference, units: CandidateUnit[]): { matches: boolean; failed: string[] } {
  if (!units.length) return { matches: false, failed: ["units"] };
  const unitFits = (u: CandidateUnit) => {
    const f: string[] = [];
    if (pref.types.length && !pref.types.includes(u.type)) f.push("type");
    if (pref.areaIds.length && !pref.areaIds.includes(u.areaId)) f.push("area");
    if (pref.minBedrooms !== null && u.bedrooms < pref.minBedrooms) f.push("bedrooms");
    if (pref.minSizeSqm !== null && u.sizeSqm < pref.minSizeSqm) f.push("size");
    return f;
  };
  // The unit with the fewest misses represents the package.
  const best = units.map(unitFits).sort((a, b) => a.length - b.length)[0];
  const failed = [...best];
  const total = units.reduce((s, u) => s + u.price, 0);
  if (pref.minValue !== null && total < pref.minValue) failed.push("value_low");
  if (pref.maxValue !== null && total > pref.maxValue) failed.push("value_high");
  return { matches: failed.length === 0, failed };
}

export type TradeOfferInput = {
  targetListingId: string;
  unitListingIds: string[];
  cashAmount: number;
  cashPayer: "proposer" | "recipient" | null;
};

export type TradeOfferError =
  | "units_required"
  | "too_many_units"
  | "duplicate_units"
  | "own_listing"
  | "cash_invalid"
  | "cash_payer_required"
  | "cash_not_accepted"
  | "cash_direction_refused";

/** Shape and term checks that need no database. Ownership/status are checked by the service. */
export function validateTradeOffer(raw: unknown, targetCash: TradeCash): { ok: true; value: TradeOfferInput } | { ok: false; error: TradeOfferError } {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ids = Array.isArray(b.unitListingIds) ? b.unitListingIds.filter((x): x is string => typeof x === "string" && !!x) : [];
  if (!ids.length) return { ok: false, error: "units_required" };
  if (ids.length > MAX_TRADE_UNITS) return { ok: false, error: "too_many_units" };
  if (new Set(ids).size !== ids.length) return { ok: false, error: "duplicate_units" };
  const target = typeof b.targetListingId === "string" ? b.targetListingId : "";
  if (ids.includes(target)) return { ok: false, error: "own_listing" };

  const cash = b.cashAmount === undefined || b.cashAmount === null || b.cashAmount === "" ? 0 : Number(String(b.cashAmount).replace(/,/g, ""));
  if (!Number.isFinite(cash) || cash < 0 || cash > MAX_MONEY) return { ok: false, error: "cash_invalid" };
  let payer: "proposer" | "recipient" | null = null;
  if (cash > 0) {
    if (b.cashPayer !== "proposer" && b.cashPayer !== "recipient") return { ok: false, error: "cash_payer_required" };
    payer = b.cashPayer;
    // The owner's stated cash terms are binding: "none" means no cash, "i_receive"
    // means they will not pay it, "i_pay" means they will not receive it.
    if (targetCash === "none") return { ok: false, error: "cash_not_accepted" };
    if (targetCash === "i_receive" && payer === "recipient") return { ok: false, error: "cash_direction_refused" };
    if (targetCash === "i_pay" && payer === "proposer") return { ok: false, error: "cash_direction_refused" };
  }
  return { ok: true, value: { targetListingId: target, unitListingIds: ids, cashAmount: cash, cashPayer: payer } };
}

export function isTradeLive(o: { status: string; expiresAt: Date }, now: Date = new Date()): boolean {
  return o.status === "pending" && o.expiresAt.getTime() > now.getTime();
}

export function tradeEffectiveStatus(o: { status: string; expiresAt: Date }, now: Date = new Date()): string {
  return o.status === "pending" && o.expiresAt.getTime() <= now.getTime() ? "expired" : o.status;
}

/** Prisma filter equivalent of isTradeLive — keep the two in step. */
export function liveTradeWhere(now: Date) {
  return { status: "pending", expiresAt: { gt: now } };
}

export const TRADE_ERROR_COPY: Record<string, { ar: string; en: string }> = {
  units_required: { ar: "اختار وحدة واحدة على الأقل من وحداتك.", en: "Choose at least one of your units." },
  too_many_units: { ar: `أقصى عدد ${MAX_TRADE_UNITS} وحدات في العرض.`, en: `At most ${MAX_TRADE_UNITS} units per offer.` },
  duplicate_units: { ar: "الوحدة متكررة.", en: "A unit is listed twice." },
  own_listing: { ar: "مينفعش تقايض وحدتك بنفسها.", en: "You cannot trade a unit for itself." },
  cash_invalid: { ar: "مبلغ الفرق مش صحيح.", en: "The cash difference is not valid." },
  cash_payer_required: { ar: "حدد مين هيدفع الفرق.", en: "Say who pays the difference." },
  cash_not_accepted: { ar: "المالك عايز مقايضة من غير فلوس.", en: "The owner wants a swap with no cash." },
  cash_direction_refused: { ar: "المالك محدد مين يدفع فرق الفلوس، والعرض ده بيعكسه.", en: "The owner set who pays the cash difference, and this offer has it the other way round." },
  not_found: { ar: "مش موجود.", en: "Not found." },
  not_open_to_trade: { ar: "الوحدة دي مش متاحة للمقايضة دلوقتي.", en: "This unit is not open to trade right now." },
  unit_not_eligible: { ar: "وحداتك لازم تكون منشورة وموثّقة ومش محجوزة.", en: "Your units must be live, verified and not reserved." },
  already_offered: { ar: "عندك عرض مقايضة شغال على الوحدة دي بالفعل.", en: "You already have a live trade offer on this unit." },
  forbidden: { ar: "مش مسموح.", en: "Not allowed." },
  not_live: { ar: "العرض ده خلص.", en: "This offer is no longer live." },
  units_unavailable: { ar: "واحدة من الوحدات اتحجزت أو اتقفلت.", en: "One of the units has been reserved or closed." },
};

// ---------------------------------------------------------------------------
// Back-office arrangement of an ACCEPTED trade (/admin/trades)
// ---------------------------------------------------------------------------

/** Forward-only. Two transfers at once: both owners' documents, then both contracts. */
export const TRADE_STAGES = ["agreed", "documents", "contracts", "completed"] as const;
export type TradeStage = (typeof TRADE_STAGES)[number];

export const TRADE_STAGE_LABELS: Record<TradeStage | "cancelled", { ar: string; en: string }> = {
  agreed: { ar: "اتفقوا", en: "Agreed" },
  documents: { ar: "المستندات اتراجعت", en: "Documents checked" },
  contracts: { ar: "العقود اتمضت", en: "Contracts signed" },
  completed: { ar: "المقايضة تمت", en: "Completed" },
  cancelled: { ar: "اتلغت", en: "Cancelled" },
};

/**
 * Whether staff may move an accepted trade from `current` to `next`. Forward only, one or
 * more steps (paperwork sometimes arrives together), never backwards — a stage records
 * something that happened, and "un-signing" a contract is a cancellation, not an edit.
 */
export function canMoveStage(current: string | null, next: string): boolean {
  const from = TRADE_STAGES.indexOf(current as TradeStage);
  const to = TRADE_STAGES.indexOf(next as TradeStage);
  return from >= 0 && to > from;
}

/** A trade staff can still cancel: accepted and not yet completed. */
export function canCancelTrade(o: { status: string; stage: string | null }): boolean {
  return o.status === "accepted" && o.stage !== "completed";
}
