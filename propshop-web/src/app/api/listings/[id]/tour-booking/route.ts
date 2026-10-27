import { NextRequest } from "next/server";
import { ok, fail, requireUser, rateLimit, audit, clientIp } from "@/lib/api";
import { ownerBookingView, requestBooking, ownerCancelBooking, type BookingFail } from "@/lib/tourBooking";

/**
 * The owner's professional tour shoot for one listing.
 *
 *   GET     → { booking, last, fee, bookable }   current open booking (if any), the last
 *                                                 closed one, and today's package price
 *   POST    { slot: { date, window }, note? }     book a shoot (one open booking per listing)
 *   DELETE                                        cancel it (before it has been shot)
 */
const STATUS: Partial<Record<BookingFail["reason"], number>> = { not_found: 404, forbidden: 403, listing_closed: 409, already_booked: 409 };
const bookingFail = (f: BookingFail) => fail(f.reason, STATUS[f.reason] ?? 422);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const view = await ownerBookingView(id, auth.user.id);
  if (!view) return fail("not_found", 404);
  return ok(view);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await rateLimit(`tour-booking:${auth.user.id}`, 10, 60 * 60_000))) return fail("rate_limited", 429);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const r = await requestBooking(auth.user.id, id, { slot: b.slot, note: b.note });
  if (!r.ok) return bookingFail(r);
  await audit(auth.user.id, "booking.request", "listing", id, { bookingId: r.booking.id, reference: r.booking.reference }, clientIp(req));
  return ok({ booking: r.booking }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const r = await ownerCancelBooking(auth.user.id, id);
  if (!r.ok) return bookingFail(r);
  await audit(auth.user.id, "booking.owner_cancel", "listing", id, { bookingId: r.id }, clientIp(req));
  return ok({ cancelled: true });
}
