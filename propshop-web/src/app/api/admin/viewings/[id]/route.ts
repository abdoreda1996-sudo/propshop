import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { canArrangeViewings, VIEWING_ASSIGNABLE_ROLES } from "@/lib/permissions";
import { decideStaffAction, NOTE_MAX } from "@/lib/viewingArrange";

/**
 * POST /api/admin/viewings/[id] — staff arrange a viewing. Admin + advisor.
 *
 *   { action: "confirm", slot: {date, window} }   confirm or move the time
 *   { action: "cancel" }
 *   { action: "complete", outcome: "attended" | "no_show" }
 *   { action: "assign", staffId: string | null }
 *   { action: "note", body: string }               staff-only, never shown to the parties
 *
 * State rules live in src/lib/viewingArrange.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!canArrangeViewings(auth.user.role)) return fail("forbidden", 403);
  const { id } = await params;

  const viewing = await prisma.viewingRequest.findUnique({
    where: { id },
    select: { id: true, status: true, scheduledAt: true, contactUnlockedAt: true, assignedStaffId: true },
  });
  if (!viewing) return fail("not_found", 404);

  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const ip = clientIp(req);

  if (action === "note") {
    const body = typeof b.body === "string" ? b.body.trim() : "";
    if (!body) return fail("note_required", 422);
    if (body.length > NOTE_MAX) return fail("note_too_long", 422, { max: NOTE_MAX });
    const note = await prisma.viewingNote.create({
      data: { viewingId: id, authorId: auth.user.id, body },
      select: { id: true, body: true, createdAt: true },
    });
    await audit(auth.user.id, "viewing.note", "viewing", id, { noteId: note.id }, ip);
    return ok({ note: { ...note, author: auth.user.fullName } }, { status: 201 });
  }

  if (action === "assign") {
    const staffId = b.staffId === null || b.staffId === "" ? null : String(b.staffId ?? "");
    if (staffId) {
      const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { role: true, isBlocked: true } });
      if (!staff || staff.isBlocked || !(VIEWING_ASSIGNABLE_ROLES as readonly string[]).includes(staff.role)) {
        return fail("staff_invalid", 422);
      }
    }
    await prisma.viewingRequest.update({ where: { id }, data: { assignedStaffId: staffId } });
    await audit(auth.user.id, "viewing.assign", "viewing", id, { from: viewing.assignedStaffId, to: staffId }, ip);
    return ok({ assignedStaffId: staffId });
  }

  const decision = decideStaffAction(viewing, action, { slot: b.slot, outcome: b.outcome });
  if (!decision.ok) return fail(decision.error, decision.error === "action_invalid" ? 422 : 409);

  await prisma.viewingRequest.update({ where: { id }, data: decision.data });
  await audit(
    auth.user.id,
    `viewing.staff_${action}`,
    "viewing",
    id,
    { from: { status: viewing.status, scheduledAt: viewing.scheduledAt }, to: decision.data },
    ip,
  );
  return ok({ status: decision.data.status, scheduledAt: decision.data.scheduledAt ?? viewing.scheduledAt });
}
