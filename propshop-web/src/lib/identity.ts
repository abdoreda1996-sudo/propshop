/**
 * Pseudonymous identity (Section 6).
 *
 * Buyers and sellers transact without ever seeing each other's name, phone, email or
 * address. What they see instead is a handle plus the verification that actually matters
 * for the decision in front of them:
 *
 *   a buyer sees   "مالك موثق · مالك منذ 2022 · الملكية موثقة ✓"
 *   a seller sees  "مشتري موثق #4821 · الميزانية موثقة ✓ · كاش · خلال 30 يوم"
 *
 * This module is the ONLY place allowed to turn a User row into something shown to a
 * counterparty. Anything that hands a raw User to the other side is a leak — the type
 * here deliberately has no name/phone/email field, so a leak cannot type-check.
 */

import { Locale } from "./i18n";

/** Everything a counterparty may know about the other side. Deliberately narrow. */
export type PublicIdentity = {
  /** Stable pseudonymous handle, e.g. 4821. Null only for legacy rows. */
  ref: number | null;
  /** "buyer" | "seller" — which side of this deal they are on. */
  side: "buyer" | "seller";
  /** Year they joined, e.g. 2022. A proxy for "not created yesterday". */
  memberSince: number;
  identityVerified: boolean;
  /** Buyer side only: funds or financing attested, never an amount. */
  fundsVerified: boolean;
  /** Seller side only: this listing's ownership passed the document gate. */
  ownershipVerified: boolean;
};

type UserLike = {
  publicRef: number | null;
  trustLevel: number;
  createdAt: Date;
  fundsStatus?: string;
};

/** Identity verification is trust level 1; see listingValidation.ts. */
const TRUST_IDENTITY = 1;

export function publicIdentity(
  user: UserLike,
  side: "buyer" | "seller",
  opts: { ownershipVerified?: boolean } = {},
): PublicIdentity {
  return {
    ref: user.publicRef,
    side,
    memberSince: user.createdAt.getFullYear(),
    identityVerified: user.trustLevel >= TRUST_IDENTITY,
    fundsVerified: side === "buyer" && user.fundsStatus === "verified",
    ownershipVerified: side === "seller" && (opts.ownershipVerified ?? false),
  };
}

/** The one-line label, e.g. "مشتري موثق #4821". */
export function identityLabel(id: PublicIdentity, locale: Locale): string {
  const ar = locale === "ar";
  const tag = id.ref === null ? "" : ` #${id.ref}`;
  if (id.side === "buyer") return ar ? `مشتري موثق${tag}` : `Verified buyer${tag}`;
  return ar ? `مالك موثق${tag}` : `Verified owner${tag}`;
}

/**
 * The Prisma `select` for a counterparty. Use this instead of writing a select by hand —
 * it cannot accidentally include a name or a phone number.
 */
export const PUBLIC_IDENTITY_SELECT = {
  publicRef: true,
  trustLevel: true,
  createdAt: true,
  fundsStatus: true,
} as const;

/**
 * Allocate a public handle.
 *
 * Four digits starting at 1000 reads like a membership number rather than a row id, and
 * deliberately leaks nothing about how many users exist (unlike a sequential id). The
 * caller retries on the unique constraint; with a 9000-wide space this is only viable
 * for a marketplace of thousands, so `allocatePublicRef` widens the range once the
 * space gets crowded rather than spinning forever.
 */
export function randomPublicRef(attempt: number): number {
  const width = attempt < 5 ? 9000 : 90000;
  const base = attempt < 5 ? 1000 : 10000;
  return base + Math.floor(Math.random() * width);
}

/**
 * Claim a free public handle.
 *
 * Retries on the unique constraint rather than pre-checking, because a check-then-insert
 * races two concurrent signups into the same number. Widening after a few collisions
 * keeps this terminating as the space fills.
 */
export async function assignPublicRef(
  claim: (ref: number) => Promise<boolean>,
  attempts = 10,
): Promise<number | null> {
  for (let i = 0; i < attempts; i++) {
    const ref = randomPublicRef(i);
    if (await claim(ref)) return ref;
  }
  // A user without a handle still works: identityLabel() renders "مشتري موثق" with no
  // number rather than blocking the signup.
  return null;
}
