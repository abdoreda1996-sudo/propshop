import { NextRequest } from "next/server";
import { LIST_PAGE } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser } from "@/lib/api";
import { maskPhone, scanMessage } from "@/lib/antiBroker";
import { publicIdentity, PUBLIC_IDENTITY_SELECT } from "@/lib/identity";
import { VIEWABLE_LISTING_WHERE } from "@/lib/listings";

/**
 * GET /api/conversations — the signed-in user's threads, as owner or as buyer.
 *
 * The counterparty's phone is masked unless a viewing has been confirmed for that
 * listing (Section 6c: numbers are exchanged only once the viewing is confirmed).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const me = auth.user.id;

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ ownerId: me }, { buyerId: me }] },
    include: {
      listing: { select: { reference: true, titleAr: true, titleEn: true, price: true, currency: true } },
      // fullName and phone are fetched because a CONFIRMED viewing unlocks them; the
      // projection below decides whether either is actually sent.
      owner: { select: { id: true, fullName: true, phone: true, ...PUBLIC_IDENTITY_SELECT } },
      buyer: { select: { id: true, fullName: true, phone: true, ...PUBLIC_IDENTITY_SELECT } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    // Capped like every per-user list (enums.LIST_PAGE): this was unbounded, so a busy
    // owner loaded every thread they ever had, each with a message join.
    take: LIST_PAGE,
  });

  // Unread per thread in ONE grouped query — what the web inbox and the app's dot show.
  const unreadRows = conversations.length
    ? await prisma.message.groupBy({
        by: ["conversationId"],
        where: { conversationId: { in: conversations.map((c) => c.id) }, readAt: null, senderId: { not: me } },
        _count: { _all: true },
      })
    : [];
  const unread = new Map(unreadRows.map((u) => [u.conversationId, u._count._all]));

  // One query for every listing in play, rather than one per conversation.
  const unlocked = new Set(
    (
      await prisma.viewingRequest.findMany({
        where: {
          listingId: { in: conversations.map((c) => c.listingId) },
          contactUnlockedAt: { not: null },
        },
        select: { listingId: true, buyerId: true },
      })
    ).map((v) => `${v.listingId}:${v.buyerId}`),
  );

  return ok({
    conversations: conversations.map((c) => {
      const isOwner = c.ownerId === me;
      const other = isOwner ? c.buyer : c.owner;
      const contactUnlocked = unlocked.has(`${c.listingId}:${c.buyerId}`);
      return {
        id: c.id,
        listing: c.listing,
        role: isOwner ? "owner" : "buyer",
        counterparty: {
          // Pseudonymous until a viewing is confirmed (Section 6). The name was being
          // sent here unconditionally, which defeated the masked phone beside it.
          ...publicIdentity(other, isOwner ? "buyer" : "seller", {
            ownershipVerified: !isOwner,
          }),
          fullName: contactUnlocked ? other.fullName : null,
          phone: contactUnlocked ? other.phone : maskPhone(other.phone),
          contactUnlocked,
        },
        unread: unread.get(c.id) ?? 0,
        lastMessage: c.messages[0]
          ? { body: c.messages[0].redactedBody ?? c.messages[0].body, createdAt: c.messages[0].createdAt }
          : null,
      };
    }),
  });
}

/** POST /api/conversations — a buyer opens a thread on a listing. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const listingId = String(body.listingId ?? "");
  if (!listingId) return fail("listing_required", 422);

  const listing = await prisma.listing.findFirst({
    where: { AND: [VIEWABLE_LISTING_WHERE, { id: listingId }] },
    select: { id: true, unit: { select: { ownerId: true } } },
  });
  if (!listing) return fail("listing_not_available", 404);
  if (listing.unit.ownerId === auth.user.id) return fail("cannot_message_own_listing", 409);

  const conversation = await prisma.conversation.upsert({
    where: { listingId_buyerId: { listingId: listing.id, buyerId: auth.user.id } },
    create: { listingId: listing.id, ownerId: listing.unit.ownerId, buyerId: auth.user.id },
    update: {},
  });

  // An opening question sent with the thread. Without this the "Ask the owner" sheet
  // created an empty conversation and silently dropped what the buyer typed.
  const text = String(body.body ?? "").trim();
  if (text.length > 0) {
    const scan = scanMessage(text.slice(0, 4000));
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: auth.user.id,
        body: text.slice(0, 4000),
        redactedBody: scan.redacted,
        flagged: scan.flagged,
        flagReason: scan.reasons.join(","),
      },
    });
  }

  return ok({ id: conversation.id }, { status: 201 });
}
