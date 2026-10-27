import { prisma } from "./prisma";

/**
 * In-app notifications (/dashboard/notifications, unread badge in the dashboard nav).
 *
 * Writers pass a `dedupeKey` for anything an event could raise twice — a listing that is
 * approved, paused and re-approved must not notify the same person again. The key is
 * unique per user, so a repeat is an upsert that changes nothing.
 */

export type NewNotification = {
  userId: string;
  kind: string;
  titleAr: string;
  titleEn: string;
  bodyAr?: string | null;
  bodyEn?: string | null;
  href?: string | null;
  dedupeKey?: string | null;
};

/** Creates a notification; with a dedupeKey, returns false when it already existed. */
export async function notify(n: NewNotification): Promise<boolean> {
  const data = {
    userId: n.userId,
    kind: n.kind,
    titleAr: n.titleAr,
    titleEn: n.titleEn,
    bodyAr: n.bodyAr ?? null,
    bodyEn: n.bodyEn ?? null,
    href: n.href ?? null,
    dedupeKey: n.dedupeKey ?? null,
  };
  if (!n.dedupeKey) {
    await prisma.notification.create({ data });
    return true;
  }
  const existing = await prisma.notification.findUnique({
    where: { userId_dedupeKey: { userId: n.userId, dedupeKey: n.dedupeKey } },
    select: { id: true },
  });
  if (existing) return false;
  try {
    await prisma.notification.create({ data });
    return true;
  } catch {
    // Two publishes racing on the same key: the unique index kept one. Not an error.
    return false;
  }
}

/**
 * The dashboard layout shows this on every page, so a missing Notification table (a deploy
 * that went out before the production migration) must cost the badge, not the dashboard.
 */
export function unreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } }).catch(() => 0);
}

export function listNotifications(userId: string, take = 100) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

/** Marks one of the user's notifications read and returns where it points (null if not theirs). */
export async function openNotification(userId: string, id: string): Promise<{ href: string | null } | null> {
  const n = await prisma.notification.findFirst({ where: { id, userId }, select: { href: true, readAt: true } });
  if (!n) return null;
  if (!n.readAt) await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  return { href: n.href };
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const r = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return r.count;
}
