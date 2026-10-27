import { NextRequest } from "next/server";
import { ok, requireUser } from "@/lib/api";
import { listNotifications, unreadNotificationCount } from "@/lib/notifications";

/** GET /api/notifications — the signed-in user's notifications, newest first, and the unread count. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const [items, unread] = await Promise.all([listNotifications(auth.user.id), unreadNotificationCount(auth.user.id)]);
  return ok({
    unread,
    notifications: items.map((n) => ({
      id: n.id,
      kind: n.kind,
      titleAr: n.titleAr,
      titleEn: n.titleEn,
      bodyAr: n.bodyAr,
      bodyEn: n.bodyEn,
      href: n.href,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
  });
}
