import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { formatDate } from "@/lib/format";
import { listNotifications } from "@/lib/notifications";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "الإشعارات", en: "Notifications" });
}
export const dynamic = "force-dynamic";

/**
 * The user's in-app notifications, newest first. Each one opens through
 * /api/notifications/[id]/open, which marks it read on the way — plain <a>, not <Link>,
 * so a prefetch can never mark something read that nobody opened.
 */
export default async function NotificationsPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";
  const items = await listNotifications(session.id);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold text-ink-900">{ar ? "الإشعارات" : "Notifications"}</h1>
        {unread > 0 && (
          <form action="/api/notifications/read-all" method="post">
            <button type="submit" className="btn btn-ghost text-[13px]">
              {ar ? "علّم الكل كمقروء" : "Mark all as read"}
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="text-[14px] muted">
            {ar ? "مفيش إشعارات لسه. لما وحدة جديدة تناسب طلب المقايضة بتاعك هتلاقيها هنا." : "No notifications yet. When a new unit fits your trade request, it shows up here."}
          </p>
        </div>
      ) : (
        <ul className="mt-5 border-y border-[var(--border)]">
          {items.map((n) => (
            <li key={n.id} className="border-b border-[var(--border)] last:border-0">
              <a href={`/api/notifications/${n.id}/open`} className="flex gap-3 py-3.5 transition hover:bg-ink-50">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent-500"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] text-ink-900 ${n.readAt ? "font-medium" : "font-bold"}`}>{ar ? n.titleAr : n.titleEn}</span>
                  {(ar ? n.bodyAr : n.bodyEn) && <span className="mt-0.5 block truncate text-[12.5px] muted">{ar ? n.bodyAr : n.bodyEn}</span>}
                </span>
                <span className="tnum shrink-0 text-[12px] muted">{formatDate(n.createdAt, locale)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
