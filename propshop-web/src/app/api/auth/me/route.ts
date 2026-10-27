import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { CURRENCIES } from "@/lib/enums";
import { awaitingWhere } from "@/lib/offers";
import { awaitingViewingsCount } from "@/lib/viewingQueries";

/** GET /api/auth/me — current user plus the counters the app header needs. */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return fail("unauthorized", 401);

  const [user, activeListings, openRequests, saved, awaitingOffers, openDeals, unreadMessages, awaitingViewings, awaitingTrades] =
    await Promise.all([
    prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true, fullName: true, phone: true, email: true, role: true, trustLevel: true,
        strikes: true, countryCode: true, countryOfResidence: true, preferredCurrency: true,
        preferredChannel: true, locale: true, createdAt: true,
      },
    }),
    prisma.listing.count({ where: { unit: { ownerId: session.id }, status: { in: ["live", "pending_review", "paused"] } } }),
    prisma.request.count({ where: { buyerId: session.id, status: { notIn: ["closed", "cancelled"] } } }),
    prisma.savedListing.count({ where: { userId: session.id } }),
    /*
      Offers whose NEXT move belongs to this user — the only count that should pull
      someone into the app. Everything else is a tally they learn to ignore.

      The turn rule is: if I am the buyer, it is my move when the last live step came
      from the seller, and vice versa. Expiry is applied below rather than in SQL
      because a lapsed offer is dead regardless of what its status column says.
    */
    prisma.offer.count({ where: awaitingWhere(session.id) }),
    prisma.deal.count({
      where: {
        OR: [{ buyerId: session.id }, { sellerId: session.id }],
        stage: { notIn: ["completed", "cancelled"] },
      },
    }),
    prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: session.id },
        conversation: { OR: [{ ownerId: session.id }, { buyerId: session.id }] },
      },
    }),
    // Same two "waiting on YOU" counts the web sidebar shows (dashboard/layout.tsx).
    awaitingViewingsCount(session.id),
    prisma.tradeOffer.count({ where: { recipientId: session.id, status: "pending", expiresAt: { gt: new Date() } } }),
  ]);

  return ok({
    user,
    counts: { activeListings, openRequests, saved, awaitingOffers, openDeals, unreadMessages, awaitingViewings, awaitingTrades },
  });
}

/** PATCH /api/auth/me — profile settings the user controls. */
export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return fail("unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  // The name is locked once an identity is verified: it is matched against the ID and
  // every ownership document, so letting it drift would break the publish gate.
  const current = await prisma.user.findUnique({
    where: { id: session.id },
    select: { trustLevel: true },
  });
  if (body.fullName && (current?.trustLevel ?? 0) < 1) {
    const name = String(body.fullName).trim();
    if (name.length < 4) return fail("name_too_short", 422);
    data.fullName = name;
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("invalid_email", 422);
    data.email = email || null;
  }
  if (body.countryOfResidence) data.countryOfResidence = String(body.countryOfResidence).slice(0, 8);
  if (body.preferredCurrency && CURRENCIES.includes(String(body.preferredCurrency) as never)) {
    data.preferredCurrency = String(body.preferredCurrency);
  }
  if (["in_app", "whatsapp", "call"].includes(String(body.preferredChannel))) {
    data.preferredChannel = String(body.preferredChannel);
  }
  if (body.locale === "ar" || body.locale === "en") data.locale = body.locale;

  try {
    const updated = await prisma.user.update({ where: { id: session.id }, data });
    return ok({ id: updated.id, fullName: updated.fullName, email: updated.email });
  } catch {
    // The only realistic failure here is the unique constraint on email.
    return fail("email_taken", 409);
  }
}
