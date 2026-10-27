import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicIdentity, identityLabel, PUBLIC_IDENTITY_SELECT } from "@/lib/identity";
import { MIN_PUBLIC_TRUST, THREAD_PAGE } from "@/lib/enums";
import { formatPriceExact } from "@/lib/format";
import MessageThread from "@/components/MessageThread";

export const dynamic = "force-dynamic";

/** One masked thread. Only its two participants can open it. */
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return notFound();
  const ar = locale === "ar";

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      listing: {
        select: {
          reference: true,
          titleAr: true,
          titleEn: true,
          price: true,
          currency: true,
          trustLevel: true,
        },
      },
      owner: { select: PUBLIC_IDENTITY_SELECT },
      buyer: { select: PUBLIC_IDENTITY_SELECT },
    },
  });

  if (!conversation) return notFound();

  // A thread is private to its two participants. Not staff-readable: unlike a deal room
  // there is no support reason to read private negotiation chat by default.
  const isOwner = conversation.ownerId === session.id;
  const isBuyer = conversation.buyerId === session.id;
  if (!isOwner && !isBuyer) return notFound();

  const counterparty = isOwner
    ? publicIdentity(conversation.buyer, "buyer")
    : publicIdentity(conversation.owner, "seller", {
        ownershipVerified: conversation.listing.trustLevel >= MIN_PUBLIC_TRUST,
      });

  // Most recent window, reversed for display — matching the API. An old thread should
  // not load hundreds of messages to render the last screenful.
  const rows = (
    await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
      take: THREAD_PAGE,
      select: { id: true, senderId: true, body: true, redactedBody: true, flagged: true, createdAt: true },
    })
  ).reverse();

  // Mark the other side's messages read on open.
  await prisma.message.updateMany({
    where: { conversationId: id, senderId: { not: session.id }, readAt: null },
    data: { readAt: new Date() },
  });

  const messages = rows.map((m) => ({
    id: m.id,
    mine: m.senderId === session.id,
    // You see what you wrote; the other side sees the redacted version.
    body: m.senderId === session.id ? m.body : (m.redactedBody ?? m.body),
    flagged: m.flagged,
    createdAt: m.createdAt.toISOString(),
  }));

  const title = (ar ? conversation.listing.titleAr : conversation.listing.titleEn) || conversation.listing.reference;

  return (
    <>
      <Link
        href="/dashboard/messages"
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-500 hover:text-ink-900"
      >
        <ChevronRight size={15} className="ltr:rotate-180" />
        {ar ? "كل الرسايل" : "All messages"}
      </Link>

      <div className="card mt-3 overflow-hidden">
        <div className="border-b border-[var(--border)] p-4">
          <Link href={`/listing/${conversation.listing.reference}`} className="text-[15px] font-semibold text-ink-900 hover:underline">
            {title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] muted">
            <span className="tnum">{formatPriceExact(conversation.listing.price, locale, conversation.listing.currency)}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              {counterparty.identityVerified && <ShieldCheck size={12} className="text-accent-500" />}
              {identityLabel(counterparty, locale)}
            </span>
          </div>
        </div>

        <div className="h-[min(60vh,520px)]">
          <MessageThread conversationId={id} locale={locale} initial={messages} />
        </div>
      </div>
    </>
  );
}
