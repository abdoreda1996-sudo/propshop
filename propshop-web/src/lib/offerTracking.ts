/**
 * Back-office offer tracking (/admin/offers) — the Prisma filters behind each tab.
 *
 * Liveness here MUST agree with offers.isLive: pending AND not past its deadline, read
 * at query time rather than trusted from the status column. A tab that counted lapsed
 * offers as live would show staff a negotiation that is already dead.
 */

export type OfferTab = "live" | "accepted" | "closed" | "all";

export function LIVE_OFFER_WHERE(now: Date) {
  return { status: "pending", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export function offerTabWhere(tab: OfferTab, now: Date) {
  switch (tab) {
    case "live":
      return LIVE_OFFER_WHERE(now);
    case "accepted":
      return { status: "accepted" };
    case "closed":
      // Everything that is over without a deal, including pending rows whose deadline
      // passed before the sweep job marked them.
      return {
        OR: [
          { status: { in: ["rejected", "withdrawn", "countered", "expired"] } },
          { status: "pending", expiresAt: { lte: now } },
        ],
      };
    case "all":
      return {};
  }
}
