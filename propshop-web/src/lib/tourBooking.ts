import { prisma } from "./prisma";
import { nextReference } from "./api";
import { parseSlot, describeSlot } from "./viewingSlots";
import { PHOTOGRAPHY_FEE } from "./fees";
import { BOOKING_ASSIGNABLE_ROLES, canArrangeBookings } from "./permissions";

/**
 * Professional photography + 360° virtual tour shoots — the bookings an owner makes and
 * staff arrange (PhotoBooking).
 *
 *   requested → scheduled → shot → delivered          cancelled from requested/scheduled/shot
 *
 * Times are the same three Cairo windows as viewings (viewingSlots.ts): clients send
 * `{ date, window }`, never an instant. "Delivered" is set by deliverOpenBooking() when
 * staff add the finished tour to the listing (tourService), so nobody has to remember to.
 */

export const BOOKING_STATUSES = ["requested", "scheduled", "shot", "delivered", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const OPEN_BOOKING_STATUSES = ["requested", "scheduled", "shot"] as const;
export const BOOKING_NOTE_MAX = 1000;
/** Listings an owner can still book a shoot for. */
const BOOKABLE_LISTING = ["draft", "pending_review", "live", "paused", "rejected"];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, { ar: string; en: string }> = {
  requested: { ar: "طلب جديد", en: "New request" },
  scheduled: { ar: "اتحدد ميعاد", en: "Scheduled" },
  shot: { ar: "اتصورت، مستنية التسليم", en: "Shot, awaiting delivery" },
  delivered: { ar: "اتسلمت", en: "Delivered" },
  cancelled: { ar: "اتلغت", en: "Cancelled" },
};

export type BookingTab = "new" | "scheduled" | "delivery" | "mine" | "closed";
export const BOOKING_TABS: { key: BookingTab; ar: string; en: string }[] = [
  { key: "new", ar: "طلبات جديدة", en: "New requests" },
  { key: "scheduled", ar: "القادمة", en: "Upcoming shoots" },
  { key: "delivery", ar: "مستنية التسليم", en: "Awaiting delivery" },
  { key: "mine", ar: "المسندة ليّا", en: "Assigned to me" },
  { key: "closed", ar: "المقفولة", en: "Closed" },
];

/**
 * A tab's rows. "Awaiting delivery" includes shoots whose time has passed without anyone
 * recording them — the one that slips, as with viewings.
 */
export function bookingTabWhere(tab: BookingTab, me: string, now: Date) {
  switch (tab) {
    case "new":
      return { status: "requested" };
    case "scheduled":
      return { status: "scheduled", scheduledAt: { gt: now } };
    case "delivery":
      return { OR: [{ status: "shot" }, { status: "scheduled", scheduledAt: { lte: now } }] };
    case "mine":
      return { photographerId: me, status: { in: [...OPEN_BOOKING_STATUSES] } };
    case "closed":
      return { status: { in: ["delivered", "cancelled"] } };
  }
}

/** Photographers only ever see their own shoots; arrangers see everything. */
export function bookingScope(role: string, me: string) {
  return canArrangeBookings(role) ? {} : { photographerId: me };
}

export type BookingFail = {
  ok: false;
  reason:
    | "not_found"
    | "forbidden"
    | "listing_closed"
    | "already_booked"
    | "slot_invalid"
    | "slot_in_past"
    | "invalid_transition"
    | "reason_required"
    | "staff_invalid"
    | "note_required"
    | "note_too_long";
};
const fail = (reason: BookingFail["reason"]): BookingFail => ({ ok: false, reason });

/** The pure state machine: may `action` move a booking in `status`? */
export function canBookingTransition(status: string, action: "schedule" | "shot" | "delivered" | "cancel"): boolean {
  switch (action) {
    case "schedule":
      return status === "requested" || status === "scheduled"; // scheduling again = moving it
    case "shot":
      return status === "scheduled";
    case "delivered":
      return status === "scheduled" || status === "shot";
    case "cancel":
      return (OPEN_BOOKING_STATUSES as readonly string[]).includes(status);
  }
}

function futureSlot(input: unknown, now: Date): Date | BookingFail {
  const at = parseSlot(input);
  if (!at) return fail("slot_invalid");
  if (at.getTime() <= now.getTime()) return fail("slot_in_past");
  return at;
}

export const BOOKING_PUBLIC_SELECT = {
  id: true,
  reference: true,
  status: true,
  preferredAt: true,
  scheduledAt: true,
  ownerNote: true,
  cancelReason: true,
  feeAmount: true,
  createdAt: true,
  photographer: { select: { fullName: true } },
} as const;

/** The owner's current (open) booking for a listing, plus the price of a new one. */
export async function ownerBookingView(listingId: string, ownerId: string) {
  const listing = await prisma.listing.findFirst({ where: { id: listingId, unit: { ownerId } }, select: { id: true, status: true } });
  if (!listing) return null;
  const [booking, last, fee] = await Promise.all([
    prisma.photoBooking.findFirst({ where: { listingId, status: { in: [...OPEN_BOOKING_STATUSES] } }, select: BOOKING_PUBLIC_SELECT, orderBy: { createdAt: "desc" } }),
    prisma.photoBooking.findFirst({ where: { listingId, status: { in: ["delivered", "cancelled"] } }, select: BOOKING_PUBLIC_SELECT, orderBy: { createdAt: "desc" } }),
    photoPackageFee(),
  ]);
  // Times described server-side (Cairo day + window), so the app does no timezone maths.
  const described = <T extends { preferredAt: Date | null; scheduledAt: Date | null }>(b: T | null) =>
    b && {
      ...b,
      preferredSlot: b.preferredAt ? describeSlot(b.preferredAt) : null,
      scheduledSlot: b.scheduledAt ? describeSlot(b.scheduledAt) : null,
    };
  return { booking: described(booking), last: described(last), fee, bookable: BOOKABLE_LISTING.includes(listing.status) };
}

export async function photoPackageFee(): Promise<number | null> {
  // The admin-editable price; the published default (fees.ts) if it was never configured.
  const f = await prisma.feeConfig.findFirst({ where: { key: "photo_package" }, select: { amount: true } });
  return f?.amount ?? PHOTOGRAPHY_FEE;
}

/** The owner books a shoot. One open booking per listing. */
export async function requestBooking(ownerId: string, listingId: string, input: { slot?: unknown; note?: unknown }, now = new Date()) {
  const listing = await prisma.listing.findFirst({ where: { id: listingId, unit: { ownerId } }, select: { status: true } });
  if (!listing) return fail("not_found");
  if (!BOOKABLE_LISTING.includes(listing.status)) return fail("listing_closed");
  const open = await prisma.photoBooking.count({ where: { listingId, status: { in: [...OPEN_BOOKING_STATUSES] } } });
  if (open) return fail("already_booked");
  const at = futureSlot(input.slot, now);
  if (!(at instanceof Date)) return at;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : "";
  const booking = await prisma.photoBooking.create({
    data: {
      reference: await nextReference("TB"),
      listingId,
      requestedById: ownerId,
      preferredAt: at,
      ownerNote: note || null,
      feeAmount: await photoPackageFee(),
      packageKey: "photo_package",
    },
    select: BOOKING_PUBLIC_SELECT,
  });
  return { ok: true as const, booking };
}

/** The owner cancels their own open booking (not once it's been shot). */
export async function ownerCancelBooking(ownerId: string, listingId: string) {
  const b = await prisma.photoBooking.findFirst({
    where: { listingId, listing: { unit: { ownerId } }, status: { in: ["requested", "scheduled"] } },
    select: { id: true },
  });
  if (!b) return fail("not_found");
  await prisma.photoBooking.update({ where: { id: b.id }, data: { status: "cancelled", cancelReason: "cancelled_by_owner" } });
  return { ok: true as const, id: b.id };
}

type Actor = { id: string; role: string; fullName?: string };

/**
 * One staff action on a booking. Arrangers (admin, advisor) may do everything; a
 * photographer may only record their own shoot as shot or delivered, and add notes.
 */
export async function arrangeBooking(
  actor: Actor,
  id: string,
  action: string,
  input: { slot?: unknown; staffId?: unknown; reason?: unknown; body?: unknown },
  now = new Date(),
) {
  const b = await prisma.photoBooking.findUnique({ where: { id }, select: { id: true, status: true, photographerId: true } });
  if (!b) return fail("not_found");
  const arranger = canArrangeBookings(actor.role);
  const ownShoot = b.photographerId === actor.id;
  if (!arranger && !(ownShoot && ["shot", "delivered", "note"].includes(action))) return fail("forbidden");

  switch (action) {
    case "schedule": {
      if (!canBookingTransition(b.status, "schedule")) return fail("invalid_transition");
      const at = futureSlot(input.slot, now);
      if (!(at instanceof Date)) return at;
      await prisma.photoBooking.update({ where: { id }, data: { status: "scheduled", scheduledAt: at } });
      return { ok: true as const, status: "scheduled", scheduledAt: at };
    }
    case "assign": {
      const staffId = input.staffId === null || input.staffId === "" ? null : String(input.staffId ?? "");
      if (staffId) {
        const s = await prisma.user.findUnique({ where: { id: staffId }, select: { role: true, isBlocked: true } });
        if (!s || s.isBlocked || !(BOOKING_ASSIGNABLE_ROLES as readonly string[]).includes(s.role)) return fail("staff_invalid");
      }
      await prisma.photoBooking.update({ where: { id }, data: { photographerId: staffId } });
      return { ok: true as const, photographerId: staffId };
    }
    case "shot":
    case "delivered": {
      if (!canBookingTransition(b.status, action)) return fail("invalid_transition");
      await prisma.photoBooking.update({
        where: { id },
        data: action === "shot" ? { status: "shot", shotAt: now } : { status: "delivered", deliveredAt: now, ...(b.status === "scheduled" ? { shotAt: now } : {}) },
      });
      return { ok: true as const, status: action };
    }
    case "cancel": {
      if (!canBookingTransition(b.status, "cancel")) return fail("invalid_transition");
      const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
      if (!reason) return fail("reason_required");
      await prisma.photoBooking.update({ where: { id }, data: { status: "cancelled", cancelReason: reason } });
      return { ok: true as const, status: "cancelled" };
    }
    case "note": {
      const body = typeof input.body === "string" ? input.body.trim() : "";
      if (!body) return fail("note_required");
      if (body.length > BOOKING_NOTE_MAX) return fail("note_too_long");
      const note = await prisma.photoBookingNote.create({ data: { bookingId: id, authorId: actor.id, body }, select: { id: true, body: true, createdAt: true } });
      return { ok: true as const, note: { ...note, author: actor.fullName ?? "" } };
    }
    default:
      return fail("invalid_transition");
  }
}

/**
 * Staff added the finished tour to a listing → its open shoot is delivered. Called from
 * tourService for staff-added tours; a no-op when there is no scheduled/shot booking.
 */
export async function deliverOpenBooking(listingId: string, now = new Date()) {
  const b = await prisma.photoBooking.findFirst({ where: { listingId, status: { in: ["scheduled", "shot"] } }, select: { id: true, status: true } });
  if (!b) return null;
  await prisma.photoBooking.update({
    where: { id: b.id },
    data: { status: "delivered", deliveredAt: now, ...(b.status === "scheduled" ? { shotAt: now } : {}) },
  });
  return b.id;
}
