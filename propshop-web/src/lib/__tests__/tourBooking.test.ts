/**
 * Tour-shoot bookings: the state machine and who sees which rows. A photographer seeing
 * every booking would be a contractor with every owner's phone number, so the scope rule
 * is pinned here alongside the transitions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { canBookingTransition, bookingScope, bookingTabWhere } from "../tourBooking";
import { canAccessAdminSection, canArrangeBookings } from "../permissions";

test("forward-only lifecycle; cancel only while open", () => {
  assert.equal(canBookingTransition("requested", "schedule"), true);
  assert.equal(canBookingTransition("scheduled", "schedule"), true, "moving a scheduled shoot");
  assert.equal(canBookingTransition("requested", "shot"), false, "can't shoot what isn't scheduled");
  assert.equal(canBookingTransition("scheduled", "shot"), true);
  assert.equal(canBookingTransition("shot", "delivered"), true);
  assert.equal(canBookingTransition("scheduled", "delivered"), true, "tour added straight after the shoot");
  assert.equal(canBookingTransition("requested", "delivered"), false);
  assert.equal(canBookingTransition("delivered", "cancel"), false);
  assert.equal(canBookingTransition("cancelled", "schedule"), false);
  for (const s of ["requested", "scheduled", "shot"]) assert.equal(canBookingTransition(s, "cancel"), true, s);
});

test("photographers see only their own shoots; arrangers see all", () => {
  assert.deepEqual(bookingScope("photographer", "p1"), { photographerId: "p1" });
  assert.deepEqual(bookingScope("admin", "a1"), {});
  assert.deepEqual(bookingScope("advisor", "a2"), {});
  assert.equal(canArrangeBookings("photographer"), false);
  assert.equal(canArrangeBookings("reviewer"), false);
});

test("the bookings section: admin, advisor, photographer — nobody else", () => {
  for (const r of ["admin", "advisor", "photographer"]) assert.equal(canAccessAdminSection(r, "bookings"), true, r);
  for (const r of ["reviewer", "owner", "buyer"]) assert.equal(canAccessAdminSection(r, "bookings"), false, r);
  // The contractor still gets nothing else in /admin.
  for (const s of ["overview", "users", "requests", "viewings", "listings"] as const) assert.equal(canAccessAdminSection("photographer", s), false, s);
});

test("a shoot whose time has passed shows under 'awaiting delivery', not 'upcoming'", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  assert.deepEqual(bookingTabWhere("scheduled", "me", now), { status: "scheduled", scheduledAt: { gt: now } });
  assert.deepEqual(bookingTabWhere("delivery", "me", now), { OR: [{ status: "shot" }, { status: "scheduled", scheduledAt: { lte: now } }] });
  assert.deepEqual(bookingTabWhere("mine", "me", now), { photographerId: "me", status: { in: ["requested", "scheduled", "shot"] } });
});
