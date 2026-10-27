/**
 * Offer persistence and the transitions that touch more than one row.
 *
 * The rules that need a database live here; the decision logic they call is pure and
 * lives in offers.ts.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { nextReference } from "./api";
import { onListingVisibilityChanged } from "./catalogue";
import { dealFeeTotalFor } from "./fees";
import {
  OfferRowLike,
  OfferStatus,
  Side,
  canAct,
  effectiveStatus,
  isLive,
  listingAcceptsOffers,
  validateOffer,
  OfferError,
  DecisionError,
} from "./offers";

export type OfferFailure = { ok: false; reason: OfferError | DecisionError | "not_found" | "forbidden" };
export type OfferSuccess<T> = { ok: true; value: T };
export type OfferResult<T> = OfferSuccess<T> | OfferFailure;

/** Listing plus the seller, which is the unit's owner. */
async function loadListing(listingId: string) {
  return prisma.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      status: true,
      price: true,
      currency: true,
      reference: true,
      unit: { select: { ownerId: true } },
    },
  });
}

/**
 * The buyer's opening offer, or a fresh one after an earlier chain ended.
 *
 * A buyer may only have one live chain per listing: a second live offer from the same
 * buyer would let them bid against themselves and leaves the seller unsure which one
 * accepting is binding.
 */
export async function createOffer(input: {
  listingId: string;
  buyerId: string;
  amount: number;
  message?: string | null;
  termsJson?: string | null;
  expiresAt?: Date | null;
}): Promise<OfferResult<{ offerId: string }>> {
  const listing = await loadListing(input.listingId);
  if (!listing) return { ok: false, reason: "not_found" };
  if (listing.unit.ownerId === input.buyerId) return { ok: false, reason: "own_listing" };
  if (!listingAcceptsOffers(listing.status)) return { ok: false, reason: "listing_not_open" };

  const check = validateOffer(input.amount, listing.price, input.expiresAt ?? null, { direction: "buyer" });
  if (!check.ok) return { ok: false, reason: check.reason };

  const existing = await prisma.offer.findMany({
    where: { listingId: input.listingId, buyerId: input.buyerId, status: "pending" },
    select: { id: true, direction: true, amount: true, status: true, expiresAt: true, createdAt: true },
  });
  if (existing.some((o) => isLive(o))) return { ok: false, reason: "not_live" };

  const offer = await prisma.offer.create({
    data: {
      listingId: input.listingId,
      buyerId: input.buyerId,
      sellerId: listing.unit.ownerId,
      direction: "buyer",
      amount: input.amount,
      currency: listing.currency,
      message: input.message ?? null,
      termsJson: input.termsJson ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    select: { id: true },
  });

  return { ok: true, value: { offerId: offer.id } };
}

/** The chain an offer belongs to, oldest first. */
export async function offerChain(offerId: string) {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { listingId: true, buyerId: true },
  });
  if (!offer) return [];
  return prisma.offer.findMany({
    where: { listingId: offer.listingId, buyerId: offer.buyerId },
    orderBy: { createdAt: "asc" },
  });
}

function sideOf(userId: string, buyerId: string, sellerId: string): Side | null {
  if (userId === buyerId) return "buyer";
  if (userId === sellerId) return "seller";
  return null;
}

/** Reject, withdraw, or counter. Accepting is separate because it creates a Deal. */
export async function respondToOffer(input: {
  offerId: string;
  actorId: string;
  action: "reject" | "withdraw" | "counter";
  amount?: number;
  message?: string | null;
  expiresAt?: Date | null;
}): Promise<OfferResult<{ offerId: string }>> {
  const offer = await prisma.offer.findUnique({
    where: { id: input.offerId },
    include: { listing: { select: { status: true, price: true, currency: true } } },
  });
  if (!offer) return { ok: false, reason: "not_found" };

  const actor = sideOf(input.actorId, offer.buyerId, offer.sellerId);
  if (!actor) return { ok: false, reason: "forbidden" };

  const decision = canAct(offer, actor, input.action, {
    listingOpen: listingAcceptsOffers(offer.listing.status),
  });
  if (!decision.ok) return { ok: false, reason: decision.reason };

  if (input.action !== "counter") {
    await prisma.offer.update({
      where: { id: offer.id },
      data: { status: input.action === "reject" ? "rejected" : "withdrawn", respondedAt: new Date() },
    });
    return { ok: true, value: { offerId: offer.id } };
  }

  const amount = input.amount ?? 0;
  const counterDirection: Side = actor;
  const check = validateOffer(amount, offer.listing.price, input.expiresAt ?? null, {
    direction: counterDirection,
  });
  if (!check.ok) return { ok: false, reason: check.reason };

  // Marking the parent and creating the child must be atomic: a chain with two live
  // steps would let both sides accept different numbers.
  const [, counter] = await prisma.$transaction([
    prisma.offer.update({
      where: { id: offer.id },
      data: { status: "countered", respondedAt: new Date() },
    }),
    prisma.offer.create({
      data: {
        listingId: offer.listingId,
        buyerId: offer.buyerId,
        sellerId: offer.sellerId,
        direction: counterDirection,
        amount,
        currency: offer.listing.currency,
        message: input.message ?? null,
        termsJson: offer.termsJson,
        expiresAt: input.expiresAt ?? null,
        parentOfferId: offer.id,
      },
      select: { id: true },
    }),
  ]);

  return { ok: true, value: { offerId: counter.id } };
}

export type AcceptResult = { dealId: string; dealReference: string; amount: number };

/**
 * Accept an offer and open the Deal Room.
 *
 * Accepting is the one transition with real contention: two buyers can be mid-offer on
 * the same property, and the seller accepting one must close the others in the same
 * breath. Everything here happens in a single transaction, and the listing moves to
 * "reserved" so `PUBLIC_LISTING_WHERE` stops showing it and no further offer can open.
 */
export async function acceptOffer(input: {
  offerId: string;
  actorId: string;
}): Promise<OfferResult<AcceptResult>> {
  const offer = await prisma.offer.findUnique({
    where: { id: input.offerId },
    // purpose + unit type decide the success fee fixed onto the Deal below.
    include: { listing: { select: { id: true, status: true, purpose: true, unit: { select: { type: true } } } } },
  });
  if (!offer) return { ok: false, reason: "not_found" };

  const actor = sideOf(input.actorId, offer.buyerId, offer.sellerId);
  if (!actor) return { ok: false, reason: "forbidden" };

  const decision = canAct(offer, actor, "accept", {
    listingOpen: listingAcceptsOffers(offer.listing.status),
  });
  if (!decision.ok) return { ok: false, reason: decision.reason };

  const reference = await nextReference("DL");
  const now = new Date();

  const deal = await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction: between the checks above and here, another accept
    // may have taken the listing.
    const fresh = await tx.listing.findUnique({ where: { id: offer.listingId }, select: { status: true } });
    if (!fresh || !listingAcceptsOffers(fresh.status)) return null;

    await tx.offer.update({
      where: { id: offer.id },
      data: { status: "accepted", respondedAt: now },
    });

    // Every other live offer on this property is now dead. Rejecting them explicitly
    // (rather than leaving them pending against a reserved listing) is what makes the
    // other buyers' screens tell the truth.
    await tx.offer.updateMany({
      where: { listingId: offer.listingId, status: "pending", NOT: { id: offer.id } },
      data: { status: "rejected", respondedAt: now },
    });

    await tx.listing.update({ where: { id: offer.listingId }, data: { status: "reserved" } });

    const created = await tx.deal.create({
      data: {
        reference,
        listingId: offer.listingId,
        buyerId: offer.buyerId,
        sellerId: offer.sellerId,
        offerId: offer.id,
        agreedPrice: offer.amount,
        // Fixed at acceptance from the published band schedule, so a later change to the
        // schedule cannot alter what these two parties already agreed to.
        // The WHOLE deal's fee: the band figure from each of two sides. Storing one
        // side's figure here would halve every revenue report.
        adminFee: dealFeeTotalFor({ purpose: offer.listing.purpose, unitType: offer.listing.unit.type, amount: offer.amount }),
        stage: "offer_accepted",
      },
      select: { id: true, reference: true },
    });

    await tx.dealEvent.create({
      data: {
        dealId: created.id,
        actorId: input.actorId,
        event: "offer_accepted",
        note: String(offer.amount),
      },
    });

    return created;
  });

  if (!deal) return { ok: false, reason: "listing_not_open" };

  // The listing just moved to "reserved", so it must leave search and the compound's
  // inventory count. Awaited: a reserved unit still appearing in results is the kind of
  // staleness a buyer notices immediately.
  await onListingVisibilityChanged(offer.listingId);

  return { ok: true, value: { dealId: deal.id, dealReference: deal.reference, amount: offer.amount } };
}

/** Every negotiation on a listing, newest chain first — the seller's offers inbox. */
export async function offersForListing(listingId: string) {
  return prisma.offer.findMany({
    where: { listingId },
    orderBy: { createdAt: "desc" },
  });
}

/** Group a flat offer list into chains keyed by buyer, each sorted oldest first. */
export function groupIntoChains<T extends { buyerId: string; createdAt: Date }>(offers: T[]): T[][] {
  const byBuyer = new Map<string, T[]>();
  for (const o of offers) {
    const list = byBuyer.get(o.buyerId) ?? [];
    list.push(o);
    byBuyer.set(o.buyerId, list);
  }
  return [...byBuyer.values()]
    .map((chain) => [...chain].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()))
    .sort((a, b) => b[b.length - 1].createdAt.getTime() - a[a.length - 1].createdAt.getTime());
}

/** The live step of a chain, if any. */
export function liveStep<T extends OfferRowLike>(chain: T[], now: Date = new Date()): T | null {
  return chain.find((o) => isLive(o, now)) ?? null;
}

/** The status a whole chain should display. */
export function chainStatus(chain: OfferRowLike[], now: Date = new Date()): OfferStatus {
  if (chain.some((o) => o.status === "accepted")) return "accepted";
  const live = liveStep(chain, now);
  if (live) return "pending";
  const last = chain[chain.length - 1];
  return last ? effectiveStatus(last, now) : "expired";
}

export const OFFER_INCLUDE = {
  listing: {
    select: {
      id: true,
      reference: true,
      titleAr: true,
      titleEn: true,
      price: true,
      currency: true,
      status: true,
    },
  },
} satisfies Prisma.OfferInclude;
