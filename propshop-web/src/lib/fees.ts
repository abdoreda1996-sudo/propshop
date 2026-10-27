/**
 * The complete fee model — the ONLY place fee figures exist.
 *
 * TWO FEES. THAT IS ALL.
 *   1. The SUCCESS FEE (a.k.a. admin fee) — earned only when a deal completes.
 *   2. PHOTOGRAPHY — a flat EGP 10,000, only if the owner books our photographer.
 * Listing is free. There is no listing fee, featured fee or membership; if one reappears
 * it is a regression, not a new product.
 *
 * ── THE SUCCESS FEE (owner, 2026-10-02) ──────────────────────────────────────
 *
 * FLAT BY UNIT TYPE, PER SIDE. The price no longer matters for a sale: a 5M villa and a
 * 60M villa both pay 100,000 per side. This replaced the five value tiers of 2026-09-19,
 * and with them the "fee cliff" at each band boundary — there are no boundaries now for a
 * sale, so nobody pays 150,000 extra for one pound of price.
 *
 *   SALE                                         per side
 *   apartment, studio, chalet                      50,000
 *   villa, townhouse, duplex, office, retail      100,000
 *
 *   RENT (by monthly rent)                       per side
 *   up to 100,000 / month                          15,000
 *   above 100,000 / month                          50,000
 *
 *   TRADE — each owner pays the SALE fee for the type of unit they RECEIVE. A villa ⇄
 *   apartment swap: the one getting the villa pays 100,000, the other 50,000. When one
 *   side receives several units it pays one fee, the highest of the types received.
 *
 * Rent boundary: exactly 100,000 / month pays 15,000 ("under 100k" read as up to and
 * including). RENT_THRESHOLD is the only place that boundary exists.
 *
 * ── WHO PAYS ──────────────────────────────────────────────────────────────
 * BOTH SIDES PAY, EACH IN FULL (owner, 2026-09-20). Not a split. A villa sale is 100,000
 * from the buyer AND 100,000 from the seller.
 *
 * DISPLAY RULE (owner, 2026-09-27): the fee is ONLY ever shown per side. No screen, API
 * payload or piece of copy shows a whole-deal total; `dealFeeTotalFor()` is for storage
 * and internal revenue maths only.
 *
 * ── WHY THIS IS NOT A COMMISSION ─────────────────────────────────────────────
 * A commission is a percentage: double the price, double the fee. This fee does not move
 * with the price at all for a sale. Copy must say "a fixed fee by unit type" — never "a
 * percentage", and never one single flat figure, because there are two (four with rent).
 * PRICING_NOTE is the sanctioned wording.
 */

export const PHOTOGRAPHY_FEE = 10_000;

/** The two paying parties. Each pays the fee in full — this is not a split. */
export const FEE_PARTIES = ["buyer", "seller"] as const;
export type FeeParty = (typeof FEE_PARTIES)[number];

export const FEE_PARTY_LABELS: Record<FeeParty, { ar: string; en: string }> = {
  buyer: { ar: "المشتري", en: "Buyer" },
  seller: { ar: "البائع", en: "Seller" },
};

/** Sale fee tiers by unit type. Every type in enums.UNIT_TYPES must appear in exactly one. */
export const SALE_FEE_TIERS = [
  { key: "standard", fee: 50_000, types: ["apartment", "studio", "chalet", "ground_apartment"] },
  { key: "large", fee: 100_000, types: ["villa", "townhouse", "twinhouse", "duplex", "penthouse", "office", "retail"] },
] as const;

/** An unknown type (legacy data) pays the higher tier, so we never under-quote a fee. */
const FALLBACK_SALE_FEE = 100_000;

export const RENT_THRESHOLD = 100_000; // monthly rent, inclusive upper bound of the low tier
export const RENT_FEE_LOW = 15_000;
export const RENT_FEE_HIGH = 50_000;

export function saleFeeForType(unitType: string): number {
  for (const tier of SALE_FEE_TIERS) if ((tier.types as readonly string[]).includes(unitType)) return tier.fee;
  return FALLBACK_SALE_FEE;
}

export function rentFeeFor(monthlyRent: number): number {
  return Number.isFinite(monthlyRent) && monthlyRent > RENT_THRESHOLD ? RENT_FEE_HIGH : RENT_FEE_LOW;
}

export type FeeInput = {
  /** "sale" | "rent" — anything else is treated as a sale. */
  purpose: string;
  unitType: string;
  /** Sale price, or MONTHLY rent. Only rent uses it. */
  amount: number;
};

/** What ONE SIDE pays on this transaction. Both sides pay it, each in full. */
export function feePerSide(input: FeeInput): number {
  return input.purpose === "rent" ? rentFeeFor(input.amount) : saleFeeForType(input.unitType);
}

/**
 * What the PLATFORM collects on a completed deal: the fee from each of two sides.
 * Stored on Deal.adminFee at acceptance. Never displayed (display rule above).
 */
export function dealFeeTotalFor(input: FeeInput): number {
  return feePerSide(input) * FEE_PARTIES.length;
}

/**
 * A trade: each owner pays the sale fee for what they RECEIVE. When a side receives
 * several units, it pays one fee — the highest among the types received.
 */
export function tradeFeeForReceived(receivedUnitTypes: string[]): number {
  if (!receivedUnitTypes.length) return 0;
  return Math.max(...receivedUnitTypes.map(saleFeeForType));
}

/**
 * Break a Deal's STORED total into what each side owes. The stored total was fixed at
 * acceptance, so a later schedule change never re-prices a deal in progress. The odd pound
 * goes to the seller so the two always add back to the recorded total.
 */
export function splitFee(total: number): { total: number; buyer: number; seller: number } {
  const safe = Number.isFinite(total) && total > 0 ? total : 0;
  const buyer = Math.round(safe / FEE_PARTIES.length);
  return { total: safe, buyer, seller: safe - buyer };
}

/** Rows for the pricing page, derived from the tiers so they cannot drift. */
/** `fee: null` = depends on the units (trade) — rendered as "by type", never a made-up figure. */
export const FEE_SCHEDULE_ROWS: { key: string; ar: string; en: string; fee: number | null }[] = [
  { key: "sale_standard", ar: "بيع شقة أو ستوديو أو شاليه", en: "Sale of an apartment, studio or chalet", fee: SALE_FEE_TIERS[0].fee },
  { key: "sale_large", ar: "بيع فيلا أو تاون هاوس أو دوبلكس أو مكتب أو محل", en: "Sale of a villa, townhouse, duplex, office or shop", fee: SALE_FEE_TIERS[1].fee },
  { key: "rent_low", ar: "إيجار لحد 100 ألف في الشهر", en: "Rent up to 100,000 a month", fee: RENT_FEE_LOW },
  { key: "rent_high", ar: "إيجار أكتر من 100 ألف في الشهر", en: "Rent above 100,000 a month", fee: RENT_FEE_HIGH },
  { key: "trade", ar: "مقايضة: كل طرف حسب نوع الوحدة اللي بياخدها", en: "Trade: each side by the type of unit it receives", fee: null },
];

/** The sanctioned description of the fee. Never "a flat fee of X" — there are several. */
export const PRICING_NOTE = {
  ar: "رسم نجاح ثابت حسب نوع الوحدة، معلن قبل ما تبدأ: 50 ألف للشقق و100 ألف للفيلات والوحدات الكبيرة والتجاري. كل طرف (المشتري والبائع) بيدفع الرسم كامل، مش نصه. مش نسبة من السعر، ومش بيزيد لما السعر يزيد، ومفيش عمولة من أي طرف.",
  en: "A fixed success fee by unit type, published before you commit: 50,000 for apartments and 100,000 for villas, larger units and commercial. Each side, buyer and seller, pays it in full, not half. It is not a percentage of the price, it does not rise with the price, and there is no commission from either side.",
} as const;

/** The whole fee model in one sentence — for the hero, the footer and the wizard. */
export const FEE_MODEL_NOTE = {
  ar: "اعرض وحدتك مجاناً. مفيش رسوم إعلان ولا اشتراك ولا رسوم ظهور مميز. بناخد رسومنا بس لما الصفقة تتم: رسم نجاح ثابت حسب نوع الوحدة، بيدفعه كل طرف على حدة. الجولة الافتراضية 360 لبيتك اختيارية بـ 10,000 جنيه.",
  en: "Listing is free. No listing fee, no subscription, no promoted placement. We are paid only when a deal completes, as a fixed success fee by unit type that each side pays separately. A 360° virtual home tour is optional at EGP 10,000.",
} as const;
