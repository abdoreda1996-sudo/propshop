/**
 * The offer engine (Section 8) — negotiation as structured objects, not chat messages.
 *
 * A negotiation is a chain of Offer rows. The buyer opens; the seller may counter, which
 * creates a NEW row whose parent is marked "countered"; either side may then accept,
 * reject, counter again, or withdraw their own live step. Exactly one step in a chain is
 * live at any moment, and accepting it creates the Deal.
 *
 * The decision logic below is pure so it can be tested without a database. Everything
 * that touches Prisma is in offerService.ts.
 */

export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "countered" | "expired";
export type Side = "buyer" | "seller";

export type OfferView = {
  id: string;
  direction: Side;
  amount: number;
  status: OfferStatus;
  expiresAt: Date | null;
  createdAt: Date;
};

/**
 * A database row. Prisma types `direction` and `status` as plain strings because SQLite
 * has no enums (see the schema header), so every helper below accepts the loose shape
 * and narrows once, rather than making each call site cast.
 */
export type OfferRowLike = {
  id: string;
  direction: string;
  amount: number;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
};

export function asOfferView(o: OfferRowLike): OfferView {
  return {
    id: o.id,
    direction: o.direction === "seller" ? "seller" : "buyer",
    amount: o.amount,
    status: o.status as OfferStatus,
    expiresAt: o.expiresAt,
    createdAt: o.createdAt,
  };
}

/**
 * Whether an offer is still live.
 *
 * Expiry is evaluated here rather than trusted from the column: an offer that passed its
 * deadline is dead the moment it passes it, not whenever a sweep job next runs. Treating
 * a lapsed offer as live would let a seller accept a price the buyer believed had
 * expired — the one bug in a negotiation system nobody forgives.
 */
export function isLive(offer: OfferRowLike, now: Date = new Date()): boolean {
  if (offer.status !== "pending") return false;
  if (offer.expiresAt && offer.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/** The status to display, folding lapsed deadlines into "expired". */
export function effectiveStatus(offer: OfferRowLike, now: Date = new Date()): OfferStatus {
  if (offer.status === "pending" && offer.expiresAt && offer.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return offer.status as OfferStatus;
}

/** Who is allowed to respond to this step: the side that did NOT make it. */
export function respondingSide(offer: OfferRowLike): Side {
  return offer.direction === "buyer" ? "seller" : "buyer";
}

export type OfferAction = "accept" | "reject" | "counter" | "withdraw";

export type Decision = { ok: true } | { ok: false; reason: DecisionError };

export type DecisionError =
  | "not_live"
  | "not_your_turn"
  | "cannot_withdraw_others"
  | "listing_not_open"
  | "own_listing";

/**
 * Can `actor` take `action` on `offer`?
 *
 * The rules, stated once:
 *  - only a live step can be acted on at all;
 *  - accept / reject / counter belong to the side that did not make the step;
 *  - withdraw belongs to the side that DID make it;
 *  - nothing can happen on a listing that is no longer open for offers.
 */
export function canAct(
  offer: OfferRowLike,
  actor: Side,
  action: OfferAction,
  opts: { listingOpen: boolean; now?: Date },
): Decision {
  const now = opts.now ?? new Date();

  if (!isLive(offer, now)) return { ok: false, reason: "not_live" };
  if (!opts.listingOpen) return { ok: false, reason: "listing_not_open" };

  if (action === "withdraw") {
    return offer.direction === actor ? { ok: true } : { ok: false, reason: "cannot_withdraw_others" };
  }

  return respondingSide(offer) === actor ? { ok: true } : { ok: false, reason: "not_your_turn" };
}

/** A listing only accepts offers while it is live and unreserved. */
export function listingAcceptsOffers(status: string): boolean {
  return status === "live";
}

export type OfferValidation = { ok: true } | { ok: false; reason: OfferError };

export type OfferError =
  | "amount_not_positive"
  | "amount_too_low"
  | "amount_above_asking"
  | "expiry_in_past"
  | "expiry_too_far";

/**
 * A floor on offers, as a fraction of the asking price.
 *
 * Without one, a listing collects "EGP 1" offers and sellers stop opening the tab — the
 * failure mode that kills offer systems. 50% is low enough to leave room for a genuinely
 * aggressive bid and high enough to filter noise.
 */
export const MIN_OFFER_FRACTION = 0.5;

/** Offers cannot be left open forever; a stale pending offer blocks the listing. */
export const MAX_EXPIRY_DAYS = 30;

export function validateOffer(
  amount: number,
  askingPrice: number,
  expiresAt: Date | null,
  opts: { now?: Date; direction?: Side } = {},
): OfferValidation {
  const now = opts.now ?? new Date();
  const direction = opts.direction ?? "buyer";

  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: "amount_not_positive" };
  // No minimum (owner, 2026-10-11): buyers may offer any amount below asking.

  // A buyer offering above asking is almost always a typo (an extra digit), and there is
  // no reason to bid against yourself. A seller's counter above asking is legitimate only
  // in that it can equal the asking price, which the check below allows.
  if (direction === "buyer" && amount > askingPrice) return { ok: false, reason: "amount_above_asking" };

  if (expiresAt) {
    if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expiry_in_past" };
    const maxMs = MAX_EXPIRY_DAYS * 86400_000;
    if (expiresAt.getTime() - now.getTime() > maxMs) return { ok: false, reason: "expiry_too_far" };
  }

  return { ok: true };
}

/** Human copy for every rejection, in both languages. Errors are UI, not stack traces. */
export const OFFER_ERROR_COPY: Record<OfferError | DecisionError, { ar: string; en: string }> = {
  amount_not_positive: { ar: "اكتب مبلغ صحيح.", en: "Enter a valid amount." },
  amount_too_low: {
    ar: "العرض أقل من نص السعر المطلوب. اكتب رقم أقرب للسعر.",
    en: "That is below half the asking price. Try a figure closer to it.",
  },
  amount_above_asking: {
    ar: "العرض أعلى من السعر المطلوب. راجع الرقم.",
    en: "Your offer is above the asking price. Check the figure.",
  },
  expiry_in_past: { ar: "تاريخ انتهاء العرض لازم يكون في المستقبل.", en: "The expiry must be in the future." },
  expiry_too_far: {
    ar: `أقصى مدة للعرض ${MAX_EXPIRY_DAYS} يوم.`,
    en: `An offer can stay open for at most ${MAX_EXPIRY_DAYS} days.`,
  },
  not_live: { ar: "العرض ده مابقاش ساري.", en: "This offer is no longer live." },
  not_your_turn: { ar: "الدور مش عليك في التفاوض ده.", en: "It is not your turn in this negotiation." },
  cannot_withdraw_others: { ar: "تقدر تسحب عروضك أنت بس.", en: "You can only withdraw your own offer." },
  listing_not_open: { ar: "الوحدة دي مابقتش بتستقبل عروض.", en: "This property is no longer accepting offers." },
  own_listing: { ar: "مينفعش تقدم عرض على وحدتك.", en: "You cannot make an offer on your own property." },
};

/**
 * How many negotiations are waiting on THIS user.
 *
 * The badge count, and the only number that should pull someone into the app. It used to
 * be reimplemented inline in the dashboard layout and again in /api/auth/me — three
 * copies of one rule, which is how a badge and a page start disagreeing.
 *
 * `now` is a parameter rather than read inside, so this stays a pure function: callers in
 * a React render pass the request time in, which also satisfies the purity lint rule.
 */
export function countAwaiting(
  offers: { buyerId: string; direction: string; expiresAt: Date | null }[],
  userId: string,
  now: Date = new Date(),
): number {
  return offers.filter((o) => {
    // A lapsed offer is nobody's move, whatever its stored status says.
    if (o.expiresAt && o.expiresAt.getTime() <= now.getTime()) return false;
    const iAmBuyer = o.buyerId === userId;
    // It is my move when the last live step came from the other side.
    return iAmBuyer ? o.direction === "seller" : o.direction === "buyer";
  }).length;
}

/**
 * The same "waiting on me" rule, expressed as a Prisma WHERE clause.
 *
 * The badge used to load every pending offer and count them in JavaScript — an unbounded
 * read on the hottest authenticated path, running on every dashboard page render. As a
 * count it is one indexed aggregate that transfers no rows.
 *
 * Keep this in step with countAwaiting(): they must agree, or the badge and the page
 * disagree about how much work is waiting.
 */
export function awaitingWhere(userId: string, now: Date = new Date()) {
  return {
    status: "pending",
    // A lapsed offer is nobody's move, whatever its stored status says.
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    AND: [
      {
        OR: [
          // I am the buyer and the seller moved last.
          { buyerId: userId, direction: "seller" },
          // I am the seller and the buyer moved last.
          { sellerId: userId, direction: "buyer" },
        ],
      },
    ],
  };
}
