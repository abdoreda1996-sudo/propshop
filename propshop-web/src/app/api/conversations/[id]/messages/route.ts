import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, rateLimit, audit, clientIp } from "@/lib/api";
import { scanMessage, shouldBlockForStrikes } from "@/lib/antiBroker";
import { THREAD_PAGE } from "@/lib/enums";

/** GET — the thread. Recipients always read the redacted body. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation) return fail("not_found", 404);
  if (conversation.ownerId !== auth.user.id && conversation.buyerId !== auth.user.id) {
    return fail("forbidden", 403);
  }

  // The most recent window, then reversed for display. A long negotiation is unbounded
  // in principle, and loading every message to render the last twenty is the kind of
  // query that only misbehaves once the product succeeds.
  const messages = (
    await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: THREAD_PAGE,
      select: {
        id: true,
        senderId: true,
        body: true,
        redactedBody: true,
        flagged: true,
        flagReason: true,
        createdAt: true,
      },
    })
  ).reverse(); // newest window, restored to chronological order for display

  await prisma.message.updateMany({
    where: { conversationId: id, senderId: { not: auth.user.id }, readAt: null },
    data: { readAt: new Date() },
  });

  return ok({
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      // No sender name: a thread is between "you" and "the owner"/"the buyer", and the
      // name would undo the pseudonymity the rest of the product maintains.
      mine: m.senderId === auth.user.id,
      // The sender sees what they wrote; everyone else sees the redacted version.
      body: m.senderId === auth.user.id ? m.body : (m.redactedBody ?? m.body),
      flagged: m.flagged,
      flagReason: m.senderId === auth.user.id ? m.flagReason : null,
      createdAt: m.createdAt,
    })),
  });
}

/**
 * POST — send a message.
 *
 * Contact details are redacted before delivery and broker language is flagged for the
 * QA queue (Section 5). The sender is told their message was altered rather than having
 * it silently changed, and repeated contact-sharing earns a strike.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  if (!await rateLimit(`msg:${auth.user.id}`, 60, 60 * 60_000)) return fail("too_many_requests", 429);

  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation) return fail("not_found", 404);
  if (conversation.ownerId !== auth.user.id && conversation.buyerId !== auth.user.id) {
    return fail("forbidden", 403);
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (text.length === 0) return fail("empty_message", 422);
  if (text.length > 4000) return fail("message_too_long", 422);

  const scan = scanMessage(text);

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      senderId: auth.user.id,
      body: text,
      redactedBody: scan.redacted,
      flagged: scan.flagged,
      flagReason: scan.reasons.join(","),
    },
  });

  // Broker language is a QA matter; repeated contact-sharing is an enforcement matter.
  if (scan.reasons.includes("contact_sharing")) {
    const recent = await prisma.message.count({
      where: {
        senderId: auth.user.id,
        flagged: true,
        flagReason: { contains: "contact_sharing" },
        createdAt: { gte: new Date(Date.now() - 30 * 86400_000) },
      },
    });
    if (recent >= 3) {
      await prisma.strike.create({
        data: { userId: auth.user.id, reason: "repeated_contact_sharing" },
      });
      const user = await prisma.user.update({
        where: { id: auth.user.id },
        data: { strikes: { increment: 1 } },
        select: { strikes: true },
      });
      if (shouldBlockForStrikes(user.strikes)) {
        await prisma.user.update({ where: { id: auth.user.id }, data: { isBlocked: true } });
      }
    }
  }

  if (scan.flagged) {
    await audit(auth.user.id, "message_flagged", "message", message.id, { reasons: scan.reasons }, clientIp(req));
  }

  return ok(
    {
      id: message.id,
      body: text,
      delivered: scan.redacted,
      // Telling the sender is the honest thing: a silently altered message is a dark pattern.
      wasRedacted: scan.redacted !== text,
      reasons: scan.reasons,
      notice: scan.reasons.includes("contact_sharing")
        ? "أرقام التليفونات وبيانات التواصل بتتخفي تلقائياً. التواصل بيتم من خلال المنصة لحد ما المعاينة تتأكد."
        : null,
    },
    { status: 201 },
  );
}
