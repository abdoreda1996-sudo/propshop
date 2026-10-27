import { prisma } from "./prisma";
import { SessionUser } from "./auth";
import { pageOf, param, assigneeWhere, oneOf, SearchParams } from "./adminList";
import {
  UNIT_TYPES,
  UNIT_TYPE_LABELS,
  LISTING_STATUSES,
  REQUEST_STATUS_LABELS,
  RequestStatus,
  TRUST_LABELS,
} from "./enums";
import { t } from "./i18n";
import { OPEN_REQUEST_STATUSES } from "./sla";
import { advisorQueueWhere } from "./requests";
import { LOCATION_ISSUE_WHERE } from "./locationService";
import { bucketWhere, ViewingBucket } from "./viewingArrange";
import { offerTabWhere, OfferTab } from "./offerTracking";
import { tradeEffectiveStatus, TRADE_STAGE_LABELS, TradeStage } from "./trade";
import { effectiveStatus } from "./offers";
import { maskPhone } from "./antiBroker";
import { describeSlot } from "./viewingSlots";
import {
  canAccessAdminSection,
  canDecideVerification,
  canEditListings,
  canManageUsers,
  canResolveReports,
  canArrangeViewings,
  canArrangeTrades,
  canArrangeBookings,
  VIEWING_ASSIGNABLE_ROLES,
  BOOKING_ASSIGNABLE_ROLES,
  AdminSection,
} from "./permissions";
import { BOOKING_STATUS_LABELS, BOOKING_TABS, BookingStatus, BookingTab, bookingScope, bookingTabWhere } from "./tourBooking";

/**
 * The back-office queues as DATA — one definition per queue, used by the mobile app's
 * staff panel (GET /api/admin/queues/[queue]) and by the website's admin pages (the
 * `*Where` builders), so a filter means the same thing on both.
 *
 * The server also describes the UI the app should draw: which filters exist (with their
 * options), which bulk actions THIS user may run, and who can be assigned. The app holds
 * no queue-specific rules — a permission or filter change here reaches both clients.
 */

type L = { ar: string; en: string };
const l = (ar: string, en: string): L => ({ ar, en });

export type QueueFilter = { name: string; label: L; kind: "search" | "select"; options?: { value: string; label: L }[] };
export type QueueAction = { key: string; label: L; needsReason?: boolean; danger?: boolean };
export type QueueItem = {
  id: string;
  ref: string;
  title: string;
  subtitle?: string;
  badges: { text: L; tone: "neutral" | "ok" | "warn" | "danger" }[];
  lines?: L[];
  assignee?: string | null;
  createdAt: string;
};
export type QueuePage = {
  queue: QueueKey;
  entity: "listing" | "request" | "viewing" | "trade" | "report" | "user" | "booking" | null;
  title: L;
  items: QueueItem[];
  total: number;
  page: number;
  pageSize: number;
  filters: QueueFilter[];
  actions: QueueAction[];
  assign: { label: L; staff: { id: string; fullName: string; role: string }[] } | null;
};

export const QUEUE_KEYS = ["verification", "requests", "viewings", "bookings", "trades", "offers", "reports", "listings", "users"] as const;
export type QueueKey = (typeof QUEUE_KEYS)[number];
const SECTION: Record<QueueKey, AdminSection> = {
  verification: "verification",
  requests: "requests",
  viewings: "viewings",
  bookings: "bookings",
  trades: "trades",
  offers: "offers",
  reports: "reports",
  listings: "listings",
  users: "users",
};

export function queuesFor(role: string): QueueKey[] {
  return QUEUE_KEYS.filter((q) => canAccessAdminSection(role, SECTION[q]));
}

const ASSIGNEE_OPTS = (staff: { id: string; fullName: string }[]) => [
  { value: "me", label: l("أنا", "Me") },
  { value: "none", label: l("مش مسندة", "Unassigned") },
  ...staff.map((s) => ({ value: s.id, label: l(s.fullName, s.fullName) })),
];
const staffOf = (roles: readonly string[]) =>
  prisma.user.findMany({ where: { role: { in: [...roles] }, isBlocked: false }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } });

// ---------------------------------------------------------------------------
// WHERE builders — shared with the website pages
// ---------------------------------------------------------------------------

export function verificationWhere(sp: SearchParams, me: string) {
  const q = param(sp, "q");
  const area = param(sp, "area");
  const type = oneOf(param(sp, "type"), UNIT_TYPES);
  return {
    status: "pending_review",
    ...(param(sp, "location") === "issues" ? { locationStatus: "issues" } : {}),
    ...assigneeWhere("assignedReviewerId", param(sp, "assignee"), me),
    ...(q ? { OR: [{ reference: { contains: q } }, { titleAr: { contains: q } }, { titleEn: { contains: q } }] } : {}),
    ...(area || type ? { unit: { ...(area ? { area: { slug: area } } : {}), ...(type ? { type } : {}) } } : {}),
  };
}

export function listingsWhere(sp: SearchParams, me: string) {
  const status = oneOf(param(sp, "status"), LISTING_STATUSES);
  const q = param(sp, "q");
  const area = param(sp, "area");
  const type = oneOf(param(sp, "type"), UNIT_TYPES);
  return {
    AND: [
      param(sp, "location") === "issues" ? LOCATION_ISSUE_WHERE : status ? { status } : {},
      assigneeWhere("assignedReviewerId", param(sp, "assignee"), me),
      q ? { OR: [{ reference: { contains: q } }, { titleAr: { contains: q } }, { titleEn: { contains: q } }, { unit: { owner: { fullName: { contains: q } } } }] } : {},
      area || type ? { unit: { ...(area ? { area: { slug: area } } : {}), ...(type ? { type } : {}) } } : {},
      // Owner-added virtual tours waiting for a reviewer.
      param(sp, "tours") === "pending" ? { tours: { some: { status: "pending" } } } : {},
    ],
  };
}

export function requestsWhere(sp: SearchParams, me: string) {
  const assignee = param(sp, "mine") === "1" ? "me" : param(sp, "assignee");
  const status = oneOf(param(sp, "status"), OPEN_REQUEST_STATUSES);
  const kind = oneOf(param(sp, "kind"), ["unit", "open"] as const);
  const q = param(sp, "q");
  return advisorQueueWhere({
    ...assigneeWhere("assignedAdvisorId", assignee, me),
    ...(status ? { status } : {}),
    ...(kind ? { type: kind } : {}),
    ...(param(sp, "sla") === "breached" ? { firstResponseAt: null, slaDueAt: { lt: new Date() } } : {}),
    ...(q ? { reference: { contains: q } } : {}),
  });
}

const VIEW_TABS = ["needs_action", "upcoming", "unrecorded", "mine", "closed"] as const;
export function viewingsWhere(sp: SearchParams, me: string) {
  const tab = oneOf(param(sp, "tab"), VIEW_TABS) ?? "needs_action";
  const q = param(sp, "q");
  const base =
    tab === "mine"
      ? { assignedStaffId: me, status: { notIn: ["declined", "cancelled", "completed"] } }
      : bucketWhere(tab as ViewingBucket, new Date());
  return { AND: [base, assigneeWhere("assignedStaffId", param(sp, "assignee"), me), q ? { listing: { reference: { contains: q } } } : {}] };
}

const TRADE_TABS = ["in_progress", "pending", "mine", "closed"] as const;
export function tradesWhere(sp: SearchParams, me: string) {
  const tab = oneOf(param(sp, "tab"), TRADE_TABS) ?? "in_progress";
  const now = new Date();
  const q = param(sp, "q");
  const base =
    tab === "in_progress" ? { status: "accepted", stage: { not: "completed" } }
    : tab === "pending" ? { status: "pending", expiresAt: { gt: now } }
    : tab === "mine" ? { assignedStaffId: me, status: { in: ["pending", "accepted"] } }
    : { OR: [{ status: { in: ["rejected", "withdrawn", "cancelled", "expired"] } }, { status: "pending", expiresAt: { lte: now } }, { status: "accepted", stage: "completed" }] };
  return {
    AND: [
      base,
      assigneeWhere("assignedStaffId", param(sp, "assignee"), me),
      q ? { OR: [{ reference: { contains: q } }, { targetListing: { reference: { contains: q } } }] } : {},
    ],
  };
}

const OFFER_TABS = ["live", "accepted", "closed", "all"] as const;
export function offersWhere(sp: SearchParams) {
  const tab = (oneOf(param(sp, "tab"), OFFER_TABS) ?? "live") as OfferTab;
  const q = param(sp, "q");
  const direction = oneOf(param(sp, "direction"), ["buyer", "seller"] as const);
  return { AND: [offerTabWhere(tab, new Date()), q ? { listing: { reference: { contains: q } } } : {}, direction ? { direction } : {}] };
}

export const REPORT_REASONS: Record<string, L> = {
  contacted_by_broker: l("اتصل بيا سمسار", "Contacted by a broker"),
  fake_photos: l("صور مش للوحدة", "Photos not of this unit"),
  duplicate: l("إعلان مكرر", "Duplicate listing"),
  wrong_price: l("السعر مش حقيقي", "Price is not real"),
  unreachable: l("مش بيرد", "Unreachable"),
  other: l("سبب آخر", "Other"),
};
export function reportsWhere(sp: SearchParams) {
  const s = param(sp, "status");
  const status = s === "all" ? undefined : oneOf(s, ["open", "upheld", "dismissed"] as const) ?? "open";
  const reason = oneOf(param(sp, "reason"), Object.keys(REPORT_REASONS));
  return { ...(status ? { status } : {}), ...(reason ? { reason } : {}) };
}

export const USER_ROLES = ["buyer", "owner", "investor", "advisor", "reviewer", "photographer", "admin"] as const;
export function usersWhere(sp: SearchParams) {
  const q = param(sp, "q") ?? "";
  const blocked = oneOf(param(sp, "blocked"), ["1", "0"] as const);
  const role = oneOf(param(sp, "role"), USER_ROLES);
  const trust = oneOf(param(sp, "trust"), ["0", "1", "2", "3", "4"] as const);
  const digits = q.replace(/\D/g, "").replace(/^(20|0)/, "");
  return {
    ...(blocked ? { isBlocked: blocked === "1" } : {}),
    ...(role ? { role } : {}),
    ...(trust ? { trustLevel: Number(trust) } : {}),
    ...(q ? { OR: [{ fullName: { contains: q } }, { email: { contains: q.toLowerCase() } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])] } : {}),
  };
}

// ---------------------------------------------------------------------------
// The queue page, for the app
// ---------------------------------------------------------------------------

const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} EGP`;

export async function queuePage(queue: QueueKey, sp: SearchParams, user: SessionUser): Promise<QueuePage | null> {
  if (!canAccessAdminSection(user.role, SECTION[queue])) return null;
  const { page, skip, take, pageSize } = pageOf(sp);
  const me = user.id;
  const areaOpts = async () =>
    (await prisma.area.findMany({ select: { slug: true, nameAr: true, nameEn: true }, orderBy: { nameEn: "asc" } })).map((a) => ({ value: a.slug, label: l(a.nameAr, a.nameEn) }));
  const typeOpts = UNIT_TYPES.map((x) => ({ value: x, label: UNIT_TYPE_LABELS[x] }));

  switch (queue) {
    case "verification": {
      const where = verificationWhere(sp, me);
      const [rows, total, reviewers, areas] = await Promise.all([
        prisma.listing.findMany({
          where,
          include: { unit: { include: { area: true, compound: true } }, assignedReviewer: { select: { fullName: true } } },
          orderBy: [{ locationStatus: "asc" }, { updatedAt: "asc" }],
          skip,
          take,
        }),
        prisma.listing.count({ where }),
        staffOf(["admin", "reviewer"]),
        areaOpts(),
      ]);
      const decide = canDecideVerification(user.role);
      return {
        queue, entity: "listing", title: l("طابور التوثيق", "Verification queue"), total, page, pageSize,
        items: rows.map((r) => ({
          id: r.id,
          ref: r.reference,
          title: r.titleAr || r.titleEn || r.reference,
          subtitle: `${money(r.price)} · ${r.unit.sizeSqm} m² · ${r.unit.compound?.nameEn ?? r.unit.area.nameEn}`,
          badges: [
            { text: UNIT_TYPE_LABELS[r.unit.type as (typeof UNIT_TYPES)[number]] ?? l(r.unit.type, r.unit.type), tone: "neutral" as const },
            ...(r.locationStatus === "issues" ? [{ text: l("مشكلة في الموقع", "Location issue"), tone: "danger" as const }] : []),
          ],
          assignee: r.assignedReviewer?.fullName ?? null,
          createdAt: r.updatedAt.toISOString(),
        })),
        filters: [
          { name: "q", kind: "search", label: l("رقم الإعلان أو العنوان", "Reference or title") },
          { name: "area", kind: "select", label: l("المنطقة", "Area"), options: areas },
          { name: "type", kind: "select", label: l("النوع", "Type"), options: typeOpts },
          { name: "location", kind: "select", label: l("الموقع", "Location"), options: [{ value: "issues", label: l("فيها مشكلة", "Has issues") }] },
          { name: "assignee", kind: "select", label: l("مسندة لـ", "Assigned to"), options: ASSIGNEE_OPTS(reviewers) },
        ],
        actions: decide
          ? [
              { key: "approve", label: l("اعتمد ونشر", "Approve & publish") },
              { key: "reject", label: l("ارفض", "Reject"), needsReason: true, danger: true },
            ]
          : [],
        assign: decide ? { label: l("أسند لمراجع", "Assign to reviewer"), staff: reviewers } : null,
      };
    }

    case "listings": {
      const where = listingsWhere(sp, me);
      const [rows, total, reviewers, areas] = await Promise.all([
        prisma.listing.findMany({
          where,
          include: {
            unit: { include: { area: true, owner: { select: { fullName: true } } } },
            assignedReviewer: { select: { fullName: true } },
            _count: { select: { tours: { where: { status: "pending" } } } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
        prisma.listing.count({ where }),
        staffOf(["admin", "reviewer"]),
        areaOpts(),
      ]);
      const decide = canDecideVerification(user.role);
      return {
        queue, entity: "listing", title: l("كل الإعلانات", "All listings"), total, page, pageSize,
        items: rows.map((r) => ({
          id: r.id,
          ref: r.reference,
          title: r.titleAr || r.titleEn || r.reference,
          subtitle: `${money(r.price)} · ${r.unit.owner.fullName}`,
          badges: [
            { text: { ar: t(`status_${r.status}`, "ar"), en: t(`status_${r.status}`, "en") }, tone: r.status === "live" ? "ok" : "neutral" },
            ...(r._count.tours > 0 ? [{ text: l(`جولة للمراجعة (${r._count.tours})`, `Tour to review (${r._count.tours})`), tone: "warn" as const }] : []),
          ],
          assignee: r.assignedReviewer?.fullName ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        filters: [
          { name: "q", kind: "search", label: l("المرجع أو العنوان أو المالك", "Reference, title or owner") },
          { name: "status", kind: "select", label: l("الحالة", "Status"), options: LISTING_STATUSES.map((s) => ({ value: s, label: { ar: t(`status_${s}`, "ar"), en: t(`status_${s}`, "en") } })) },
          { name: "location", kind: "select", label: l("الموقع", "Location"), options: [{ value: "issues", label: l("فيها مشكلة", "Has issues") }] },
          { name: "area", kind: "select", label: l("المنطقة", "Area"), options: areas },
          { name: "type", kind: "select", label: l("النوع", "Type"), options: typeOpts },
          { name: "assignee", kind: "select", label: l("المراجع", "Reviewer"), options: ASSIGNEE_OPTS(reviewers) },
          { name: "tours", kind: "select", label: l("الجولات", "Tours"), options: [{ value: "pending", label: l("محتاجة مراجعة", "Awaiting review") }] },
        ],
        actions: [
          ...(canEditListings(user.role) ? [{ key: "pause", label: l("إيقاف مؤقت", "Pause") }, { key: "unpause", label: l("رجّعها منشورة", "Unpause") }] : []),
          ...(decide ? [{ key: "approve_tours", label: l("وافق على الجولات", "Approve tours") }, { key: "reject_tours", label: l("ارفض الجولات", "Reject tours"), needsReason: true, danger: true }] : []),
        ],
        assign: decide ? { label: l("أسند لمراجع", "Assign to reviewer"), staff: reviewers } : null,
      };
    }

    case "requests": {
      const where = requestsWhere(sp, me);
      const [rows, total, advisors] = await Promise.all([
        prisma.request.findMany({
          where,
          include: { buyer: { select: { fullName: true, phone: true } }, listing: { select: { reference: true } }, assignedAdvisor: { select: { fullName: true } } },
          orderBy: { slaDueAt: "asc" },
          skip,
          take,
        }),
        prisma.request.count({ where }),
        staffOf(["admin", "advisor"]),
      ]);
      const now = Date.now();
      return {
        queue, entity: "request", title: l("طابور المستشارين", "Advisor queue"), total, page, pageSize,
        items: rows.map((r) => ({
          id: r.id,
          ref: r.reference,
          // Same rule as the web queue: the buyer's number stays masked until someone responds.
          title: `${r.buyer.fullName} · ${r.firstResponseAt ? r.buyer.phone : maskPhone(r.buyer.phone)}`,
          subtitle: r.listing ? r.listing.reference : undefined,
          badges: [
            { text: r.type === "unit" ? l("طلب وحدة", "Unit request") : l("طلب مفتوح", "Open request"), tone: "neutral" as const },
            { text: REQUEST_STATUS_LABELS[r.status as RequestStatus] ?? l(r.status, r.status), tone: "neutral" as const },
            ...(!r.firstResponseAt && r.slaDueAt.getTime() < now ? [{ text: l("تخطى الـ24 ساعة", "Past 24h"), tone: "danger" as const }] : []),
          ],
          assignee: r.assignedAdvisor?.fullName ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        filters: [
          { name: "q", kind: "search", label: l("رقم الطلب", "Request reference") },
          { name: "status", kind: "select", label: l("الحالة", "Status"), options: OPEN_REQUEST_STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS_LABELS[s as RequestStatus] ?? l(s, s) })) },
          { name: "kind", kind: "select", label: l("النوع", "Type"), options: [{ value: "unit", label: l("طلب وحدة", "Unit request") }, { value: "open", label: l("طلب مفتوح", "Open request") }] },
          { name: "sla", kind: "select", label: l("الـ24 ساعة", "24-hour SLA"), options: [{ value: "breached", label: l("اتخطت", "Breached") }] },
          { name: "assignee", kind: "select", label: l("المستشار", "Advisor"), options: ASSIGNEE_OPTS(advisors) },
        ],
        actions: [{ key: "respond", label: l("سجّل أول رد", "Log first response") }],
        assign: { label: l("أسند لمستشار", "Assign to advisor"), staff: advisors },
      };
    }

    case "viewings": {
      const where = viewingsWhere(sp, me);
      const [rows, total, staff] = await Promise.all([
        prisma.viewingRequest.findMany({
          where,
          include: { listing: { select: { reference: true, titleAr: true, titleEn: true } }, assignedStaff: { select: { fullName: true } } },
          orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
          skip,
          take,
        }),
        prisma.viewingRequest.count({ where }),
        staffOf(VIEWING_ASSIGNABLE_ROLES),
      ]);
      const arrange = canArrangeViewings(user.role);
      return {
        queue, entity: "viewing", title: l("طلبات المعاينة", "Viewing requests"), total, page, pageSize,
        items: rows.map((r) => {
          const slot = r.scheduledAt ? describeSlot(r.scheduledAt) : null;
          return {
            id: r.id,
            ref: r.listing.reference,
            title: r.listing.titleAr || r.listing.titleEn || r.listing.reference,
            subtitle: slot ? `${slot.date} · ${slot.labelEn}` : undefined,
            badges: [{ text: l(r.status, r.status), tone: r.status === "accepted" ? ("ok" as const) : ("neutral" as const) }],
            assignee: r.assignedStaff?.fullName ?? null,
            createdAt: r.createdAt.toISOString(),
          };
        }),
        filters: [
          { name: "tab", kind: "select", label: l("القائمة", "List"), options: [
            { value: "needs_action", label: l("محتاجة ترتيب", "Needs arranging") },
            { value: "upcoming", label: l("القادمة", "Upcoming") },
            { value: "unrecorded", label: l("عدّت ومش متسجلة", "Passed, not recorded") },
            { value: "mine", label: l("المسندة ليّا", "Assigned to me") },
            { value: "closed", label: l("المقفولة", "Closed") },
          ] },
          { name: "q", kind: "search", label: l("رقم الإعلان", "Listing reference") },
          { name: "assignee", kind: "select", label: l("مسندة لـ", "Assigned to"), options: ASSIGNEE_OPTS(staff) },
        ],
        actions: arrange
          ? [
              { key: "complete_attended", label: l("تمت: حضر", "Done: attended") },
              { key: "complete_no_show", label: l("محضرش", "No-show") },
              { key: "cancel", label: l("إلغاء", "Cancel"), danger: true },
            ]
          : [],
        assign: arrange ? { label: l("أسند لـ", "Assign to"), staff } : null,
      };
    }

    case "bookings": {
      const arranger = canArrangeBookings(user.role);
      const tabs = arranger ? BOOKING_TABS : BOOKING_TABS.filter((x) => x.key !== "new");
      const tab = (oneOf(param(sp, "tab"), tabs.map((x) => x.key)) ?? (arranger ? "new" : "mine")) as BookingTab;
      const q = param(sp, "q");
      const where = {
        AND: [
          bookingTabWhere(tab, me, new Date()),
          bookingScope(user.role, me),
          arranger ? assigneeWhere("photographerId", param(sp, "assignee"), me) : {},
          q ? { OR: [{ reference: { contains: q } }, { listing: { reference: { contains: q } } }] } : {},
        ],
      };
      const [rows, total, staff] = await Promise.all([
        prisma.photoBooking.findMany({
          where,
          include: {
            listing: { select: { reference: true, titleAr: true, titleEn: true, unit: { select: { owner: { select: { fullName: true, phone: true } } } } } },
            photographer: { select: { fullName: true } },
          },
          orderBy: [{ scheduledAt: "asc" }, { preferredAt: "asc" }, { createdAt: "asc" }],
          skip,
          take,
        }),
        prisma.photoBooking.count({ where }),
        staffOf(BOOKING_ASSIGNABLE_ROLES),
      ]);
      return {
        queue, entity: "booking", title: l("حجوزات الجولات", "Tour bookings"), total, page, pageSize,
        items: rows.map((r) => {
          const at = r.scheduledAt ?? r.preferredAt;
          const slot = at ? describeSlot(at) : null;
          return {
            id: r.id,
            ref: `${r.reference ?? ""} · ${r.listing.reference}`,
            title: `${r.listing.unit.owner.fullName} · ${r.listing.unit.owner.phone}`,
            subtitle: slot ? `${r.scheduledAt ? "✓ " : "? "}${slot.date} · ${slot.labelEn}` : undefined,
            badges: [{ text: BOOKING_STATUS_LABELS[r.status as BookingStatus] ?? l(r.status, r.status), tone: r.status === "delivered" || r.status === "scheduled" ? ("ok" as const) : ("neutral" as const) }],
            assignee: r.photographer?.fullName ?? null,
            createdAt: r.createdAt.toISOString(),
          };
        }),
        filters: [
          { name: "tab", kind: "select", label: l("القائمة", "List"), options: tabs.map((x) => ({ value: x.key, label: l(x.ar, x.en) })) },
          { name: "q", kind: "search", label: l("رقم الحجز أو الإعلان", "Booking or listing reference") },
          ...(arranger ? [{ name: "assignee", kind: "select" as const, label: l("المصوّر", "Photographer"), options: ASSIGNEE_OPTS(staff) }] : []),
        ],
        actions: [
          { key: "mark_shot", label: l("اتصورت", "Mark shot") },
          { key: "mark_delivered", label: l("اتسلمت", "Mark delivered") },
          ...(arranger ? [{ key: "cancel", label: l("إلغاء", "Cancel"), needsReason: true, danger: true }] : []),
        ],
        assign: arranger ? { label: l("ابعت مصوّر", "Send photographer"), staff } : null,
      };
    }

    case "trades": {
      const where = tradesWhere(sp, me);
      const [rows, total, staff] = await Promise.all([
        prisma.tradeOffer.findMany({
          where,
          include: { targetListing: { select: { reference: true } }, assignedStaff: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
        prisma.tradeOffer.count({ where }),
        staffOf(VIEWING_ASSIGNABLE_ROLES),
      ]);
      const arrange = canArrangeTrades(user.role);
      const now = new Date();
      return {
        queue, entity: "trade", title: l("المقايضات", "Trades"), total, page, pageSize,
        items: rows.map((r) => ({
          id: r.id,
          ref: r.reference,
          title: `→ ${r.targetListing.reference}`,
          subtitle: r.cashAmount > 0 ? `+ ${money(r.cashAmount)}` : undefined,
          badges: [
            { text: l(tradeEffectiveStatus(r, now), tradeEffectiveStatus(r, now)), tone: r.status === "accepted" ? ("ok" as const) : ("neutral" as const) },
            ...(r.stage ? [{ text: TRADE_STAGE_LABELS[r.stage as TradeStage], tone: "neutral" as const }] : []),
          ],
          assignee: r.assignedStaff?.fullName ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
        filters: [
          { name: "tab", kind: "select", label: l("القائمة", "List"), options: [
            { value: "in_progress", label: l("شغالين عليها", "In progress") },
            { value: "pending", label: l("مستنية رد المالك", "Awaiting owner") },
            { value: "mine", label: l("المسندة ليّا", "Assigned to me") },
            { value: "closed", label: l("المقفولة", "Closed") },
          ] },
          { name: "q", kind: "search", label: l("رقم المقايضة أو الإعلان", "Trade or listing reference") },
          { name: "assignee", kind: "select", label: l("مسندة لـ", "Assigned to"), options: ASSIGNEE_OPTS(staff) },
        ],
        actions: arrange
          ? [
              { key: "stage_documents", label: TRADE_STAGE_LABELS.documents },
              { key: "stage_contracts", label: TRADE_STAGE_LABELS.contracts },
              { key: "stage_completed", label: TRADE_STAGE_LABELS.completed },
              { key: "cancel", label: l("إلغاء المقايضة", "Cancel trade"), needsReason: true, danger: true },
            ]
          : [],
        assign: arrange ? { label: l("أسند لـ", "Assign to"), staff } : null,
      };
    }

    case "offers": {
      const where = offersWhere(sp);
      const [rows, total] = await Promise.all([
        prisma.offer.findMany({ where, include: { listing: { select: { reference: true, price: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
        prisma.offer.count({ where }),
      ]);
      const now = new Date();
      return {
        queue, entity: null, title: l("العروض", "Offers"), total, page, pageSize,
        items: rows.map((r) => ({
          id: r.id,
          ref: r.listing.reference,
          title: money(r.amount),
          subtitle: `${l("المطلوب", "asking").en} ${money(r.listing.price)}`,
          badges: [{ text: l(effectiveStatus(r, now), effectiveStatus(r, now)), tone: "neutral" as const }, { text: r.direction === "seller" ? l("عرض مقابل", "Counter") : l("عرض", "Offer"), tone: "neutral" as const }],
          createdAt: r.createdAt.toISOString(),
        })),
        filters: [
          { name: "tab", kind: "select", label: l("القائمة", "List"), options: [
            { value: "live", label: l("شغّالة", "Live") },
            { value: "accepted", label: l("اتقبلت", "Accepted") },
            { value: "closed", label: l("انتهت", "Ended") },
            { value: "all", label: l("الكل", "All") },
          ] },
          { name: "q", kind: "search", label: l("رقم الإعلان", "Listing reference") },
          { name: "direction", kind: "select", label: l("من", "From"), options: [{ value: "buyer", label: l("المشتري", "Buyer") }, { value: "seller", label: l("المالك", "Owner") }] },
        ],
        actions: [],
        assign: null,
      };
    }

    case "reports": {
      const where = reportsWhere(sp);
      const [rows, total] = await Promise.all([
        prisma.report.findMany({
          where,
          include: { listing: { select: { reference: true } }, targetUser: { select: { fullName: true, strikes: true } } },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          skip,
          take,
        }),
        prisma.report.count({ where }),
      ]);
      return {
        queue, entity: "report", title: l("البلاغات", "Reports"), total, page, pageSize,
        items: rows.map((r) => ({
          id: r.id,
          ref: r.listing?.reference ?? "—",
          title: r.targetUser ? `${r.targetUser.fullName} · ${r.targetUser.strikes} strikes` : "—",
          subtitle: r.detail ?? undefined,
          badges: [
            { text: REPORT_REASONS[r.reason] ?? l(r.reason, r.reason), tone: "danger" as const },
            { text: l(r.status, r.status), tone: "neutral" as const },
          ],
          createdAt: r.createdAt.toISOString(),
        })),
        filters: [
          { name: "status", kind: "select", label: l("الحالة", "Status"), options: [
            { value: "open", label: l("مفتوح", "Open") },
            { value: "upheld", label: l("مؤكد", "Upheld") },
            { value: "dismissed", label: l("مرفوض", "Dismissed") },
            { value: "all", label: l("الكل", "Everything") },
          ] },
          { name: "reason", kind: "select", label: l("السبب", "Reason"), options: Object.entries(REPORT_REASONS).map(([value, label]) => ({ value, label })) },
        ],
        actions: canResolveReports(user.role)
          ? [{ key: "uphold", label: l("أكّد (إنذار)", "Uphold (strike)"), danger: true }, { key: "dismiss", label: l("ارفض البلاغ", "Dismiss") }]
          : [],
        assign: null,
      };
    }

    case "users": {
      const where = usersWhere(sp);
      const [rows, total] = await Promise.all([
        prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, select: { id: true, fullName: true, phone: true, role: true, trustLevel: true, isBlocked: true, strikes: true, createdAt: true, publicRef: true } }),
        prisma.user.count({ where }),
      ]);
      return {
        queue, entity: "user", title: l("المستخدمون", "Users"), total, page, pageSize,
        items: rows.map((r) => ({
          id: r.id,
          ref: r.publicRef ? `#${r.publicRef}` : r.role,
          title: r.fullName,
          subtitle: maskPhone(r.phone),
          badges: [
            { text: l(r.role, r.role), tone: "neutral" as const },
            { text: TRUST_LABELS[r.trustLevel] ?? l(String(r.trustLevel), String(r.trustLevel)), tone: "neutral" as const },
            ...(r.isBlocked ? [{ text: l("موقوف", "Blocked"), tone: "danger" as const }] : []),
            ...(r.strikes ? [{ text: l(`${r.strikes} إنذار`, `${r.strikes} strikes`), tone: "warn" as const }] : []),
          ],
          createdAt: r.createdAt.toISOString(),
        })),
        filters: [
          { name: "q", kind: "search", label: l("الاسم أو الرقم أو الإيميل", "Name, phone or email") },
          { name: "role", kind: "select", label: l("الدور", "Role"), options: USER_ROLES.map((x) => ({ value: x, label: l(x, x) })) },
          { name: "blocked", kind: "select", label: l("الحساب", "Account"), options: [{ value: "1", label: l("موقوف", "Blocked") }, { value: "0", label: l("نشط", "Active") }] },
          { name: "trust", kind: "select", label: l("التوثيق", "Verification"), options: [0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: TRUST_LABELS[n] ?? l(String(n), String(n)) })) },
        ],
        actions: canManageUsers(user.role)
          ? [{ key: "block", label: l("إيقاف", "Block"), needsReason: true, danger: true }, { key: "unblock", label: l("ارفع الإيقاف", "Unblock") }]
          : [],
        assign: null,
      };
    }
  }
}

/** Badge counts for the app's staff home (same numbers as the web sidebar). */
export async function queueCounts(role: string): Promise<Partial<Record<QueueKey, number>>> {
  const allowed = new Set(queuesFor(role));
  const now = new Date();
  const out: Partial<Record<QueueKey, number>> = {};
  const jobs: Promise<void>[] = [];
  const add = (k: QueueKey, p: Promise<number>) => allowed.has(k) && jobs.push(p.then((n) => void (out[k] = n)));
  add("verification", prisma.listing.count({ where: { status: "pending_review" } }));
  add("requests", prisma.request.count({ where: advisorQueueWhere() }));
  add("viewings", prisma.viewingRequest.count({ where: bucketWhere("needs_action", now) }));
  add("trades", prisma.tradeOffer.count({ where: { status: "accepted", stage: { not: "completed" } } }));
  add("reports", prisma.report.count({ where: { status: "open" } }));
  add("offers", prisma.offer.count({ where: offerTabWhere("live", now) }));
  // New shoot requests to arrange (photographers don't arrange, so no badge for them).
  if (canArrangeBookings(role)) add("bookings", prisma.photoBooking.count({ where: { status: "requested" } }));
  await Promise.all(jobs);
  return out;
}
