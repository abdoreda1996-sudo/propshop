import { NextRequest } from "next/server";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { canAccessAdminSection } from "@/lib/permissions";
import { arrangeBooking } from "@/lib/tourBooking";

/**
 * POST /api/admin/bookings/[id] — staff arrange a tour-shoot booking.
 *
 *   { action: "schedule", slot: { date, window } }   set or move the shoot time
 *   { action: "assign", staffId: string | null }      send a photographer
 *   { action: "shot" } | { action: "delivered" }      record progress
 *   { action: "cancel", reason }
 *   { action: "note", body }                          staff-only, never shown to the owner
 *
 * Admins and advisors may do all of it; a photographer only records their own shoot.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!canAccessAdminSection(auth.user.role, "bookings")) return fail("forbidden", 403);
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const r = await arrangeBooking(auth.user, id, action, { slot: b.slot, staffId: b.staffId, reason: b.reason, body: b.body });
  if (!r.ok) return fail(r.reason, r.reason === "not_found" ? 404 : r.reason === "forbidden" ? 403 : r.reason === "invalid_transition" ? 409 : 422);
  await audit(auth.user.id, `booking.${action}`, "booking", id, { ...b, body: undefined }, clientIp(req));
  return ok(r, action === "note" ? { status: 201 } : undefined);
}
