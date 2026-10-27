import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { publicIdentity, identityLabel, PUBLIC_IDENTITY_SELECT } from "@/lib/identity";
import { formatDate } from "@/lib/format";
import { MIN_PUBLIC_TRUST } from "@/lib/enums";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "الرسايل", en: "Messages" });
}
export const dynamic = "force-dynamic";

/** Every masked thread this user is in, newest activity first. */
export default async function MessagesPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";
  const me = session.id;

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ ownerId: me }, { buyerId: me }] },
    include: {
      listing: { select: { reference: true, titleAr: true, titleEn: true, trustLevel: true } },
      owner: { select: PUBLIC_IDENTITY_SELECT },
      buyer: { select: PUBLIC_IDENTITY_SELECT },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  });

  // Sort by last activity, which is what a message list is for.
  const threads = conversations
    .map((c) => {
      const isOwner = c.ownerId === me;
      const last = c.messages[0];
      return {
        id: c.id,
        reference: c.listing.reference,
        title: (ar ? c.listing.titleAr : c.listing.titleEn) || c.listing.reference,
        counterparty: isOwner
          ? publicIdentity(c.buyer, "buyer")
          : publicIdentity(c.owner, "seller", { ownershipVerified: c.listing.trustLevel >= MIN_PUBLIC_TRUST }),
        // Recipients read the redacted body; that is what the list must preview too.
        preview: last ? (last.senderId === me ? last.body : (last.redactedBody ?? last.body)) : null,
        unread: c.messages.some((m) => m.senderId !== me && m.readAt === null),
        at: last?.createdAt ?? c.createdAt,
      };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <h1 className="text-[24px] font-bold text-ink-900">{ar ? "الرسايل" : "Messages"}</h1>
      <p className="mt-1.5 text-[14px] muted">
        {ar
          ? "كلامك مع الطرف التاني من غير ما حد يشوف اسمك ولا رقمك."
          : "Your conversations, with neither side seeing the other's name or number."}
      </p>

      {threads.length === 0 ? (
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-[14px] muted">
          {ar ? "مفيش رسايل. لما تسأل مالك عن وحدة، الكلام بيظهر هنا. " : "No messages. When you ask an owner about a unit, the thread shows up here. "}
          <Link href="/" className="font-semibold text-brand-500 hover:underline">
            {ar ? "تصفح الوحدات" : "Browse units"}
          </Link>
        </p>
      ) : (
        <div className="mt-5 border-y border-[var(--border)]">
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/messages/${t.id}`}
              className="flex items-start gap-3 border-b border-[var(--border)] py-3.5 transition last:border-0 hover:bg-ink-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`truncate text-[14px] text-ink-900 ${t.unread ? "font-bold" : "font-semibold"}`}>{t.title}</span>
                  {t.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent-500" aria-hidden />}
                </div>
                <div className="mt-0.5 text-[12px] muted">{identityLabel(t.counterparty, locale)}</div>
                {t.preview && <p className="mt-1.5 line-clamp-1 text-[13px] text-ink-700">{t.preview}</p>}
              </div>
              <span className="tnum shrink-0 text-[12px] muted">{formatDate(t.at, locale)}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
