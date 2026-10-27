import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, rateLimit, clientIp, audit } from "@/lib/api";
import { createOffer, chainStatus, liveStep, OFFER_INCLUDE } from "@/lib/offerService";
import { OFFER_ERROR_COPY, effectiveStatus } from "@/lib/offers";
import { LIST_PAGE, MIN_PUBLIC_TRUST } from "@/lib/enums";
import { publicIdentity, PUBLIC_IDENTITY_SELECT } from "@/lib/identity";

/**
 * GET /api/offers — the signed-in user's negotiations, as buyer and as seller.
 *
 * Returned as chains, not rows: the UI shows one card per negotiation with its history
 * folded inside, which is the only way a seller with six offers can read the screen.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const me = auth.user.id;

  // Capped: a busy account accumulates offers without limit, and every row carries a
  // listing join.
  const rows = await prisma.offer.findMany({
    where: { OR: [{ buyerId: me }, { sellerId: me }] },
    // The counterparty is projected through PUBLIC_IDENTITY_SELECT — the same pseudonymous
    // shape the web offers page and the deal/conversation routes use. This route used to
    // omit it, so the app showed every buyer as "verified owner" with no #ref.
    include: {
      ...OFFER_INCLUDE,
      listing: { select: { ...OFFER_INCLUDE.listing.select, trustLevel: true } },
      buyer: { select: PUBLIC_IDENTITY_SELECT },
      seller: { select: PUBLIC_IDENTITY_SELECT },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_PAGE,
  });

  const now = new Date();
  // Group per listing AND per buyer: one listing can hold several independent chains.
  const byPair = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.listingId}:${r.buyerId}`;
    byPair.set(key, [...(byPair.get(key) ?? []), r]);
  }

  const chains = [...byPair.values()].map((chain) => {
    const ordered = [...chain].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const live = liveStep(ordered, now);
    const last = ordered[ordered.length - 1];
    return {
      listing: {
        id: last.listing.id,
        reference: last.listing.reference,
        titleAr: last.listing.titleAr,
        titleEn: last.listing.titleEn,
        price: last.listing.price,
        currency: last.listing.currency,
        status: last.listing.status,
      },
      role: last.buyerId === me ? "buyer" : "seller",
      counterparty:
        last.buyerId === me
          ? publicIdentity(last.seller, "seller", { ownershipVerified: last.listing.trustLevel >= MIN_PUBLIC_TRUST })
          : publicIdentity(last.buyer, "buyer"),
      status: chainStatus(ordered, now),
      /** Whose move it is, or null when the negotiation is settled. */
      awaiting: live ? (live.direction === "buyer" ? "seller" : "buyer") : null,
      latestAmount: last.amount,
      updatedAt: last.createdAt,
      steps: ordered.map((o) => ({
        id: o.id,
        direction: o.direction,
        amount: o.amount,
        message: o.message,
        status: effectiveStatus(o, now),
        expiresAt: o.expiresAt,
        createdAt: o.createdAt,
      })),
    };
  });

  chains.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return ok({ chains });
}

/** POST /api/offers — a buyer opens a negotiation. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  // Offers are cheap to send and expensive to receive; without a cap one account can
  // bury every seller on the platform.
  if (!await rateLimit(`offer:${auth.user.id}:${clientIp(req)}`, 10, 60 * 60_000)) {
    return fail("rate_limited", 429);
  }

  const b = await req.json().catch(() => ({}));
  const listingId = typeof b.listingId === "string" ? b.listingId : "";
  const amount = Number(b.amount);
  if (!listingId) return fail("listing_required", 422);

  const expiresAt = b.expiresAt ? new Date(String(b.expiresAt)) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return fail("expiry_invalid", 422);

  const terms = {
    paymentType: typeof b.paymentType === "string" ? b.paymentType : null,
    closingDays: Number.isFinite(Number(b.closingDays)) ? Number(b.closingDays) : null,
  };

  const result = await createOffer({
    listingId,
    buyerId: auth.user.id,
    amount,
    message: typeof b.message === "string" ? b.message.slice(0, 1000) : null,
    termsJson: JSON.stringify(terms),
    expiresAt,
  });

  if (!result.ok) {
    const copy = OFFER_ERROR_COPY[result.reason as keyof typeof OFFER_ERROR_COPY];
    return fail(result.reason, result.reason === "not_found" ? 404 : 422, {
      messageAr: copy?.ar,
      messageEn: copy?.en,
    });
  }

  await audit(auth.user.id, "offer.create", "offer", result.value.offerId, { listingId, amount });
  return ok(result.value, { status: 201 });
}
