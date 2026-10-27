import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { canArrangeTrades, VIEWING_ASSIGNABLE_ROLES } from "@/lib/permissions";
import { arrangeTrade } from "@/lib/tradeService";

/**
 * POST /api/admin/trades/[id] — staff arrange a trade. Admin + advisor.
 *   { action: "assign", staffId } | { action: "note", body } |
 *   { action: "stage", stage } | { action: "cancel", reason }
 * Staff never accept or reject a trade on an owner's behalf — that decision is theirs.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!canArrangeTrades(auth.user.role)) return fail("forbidden", 403);
  const { id } = await params;
  const exists = await prisma.tradeOffer.findUnique({ where: { id }, select: { assignedStaffId: true } });
  if (!exists) return fail("not_found", 404);
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const ip = clientIp(req);

  if (action === "note") {
    const body = typeof b.body === "string" ? b.body.trim() : "";
    if (!body) return fail("note_required", 422);
    if (body.length > 1000) return fail("note_too_long", 422);
    const note = await prisma.tradeNote.create({ data: { tradeOfferId: id, authorId: auth.user.id, body }, select: { id: true } });
    await audit(auth.user.id, "trade.note", "trade", id, { noteId: note.id }, ip);
    return ok({ noteId: note.id }, { status: 201 });
  }
  if (action === "assign") {
    const staffId = b.staffId ? String(b.staffId) : null;
    if (staffId) {
      const s = await prisma.user.findUnique({ where: { id: staffId }, select: { role: true, isBlocked: true } });
      if (!s || s.isBlocked || !(VIEWING_ASSIGNABLE_ROLES as readonly string[]).includes(s.role)) return fail("staff_invalid", 422);
    }
    await prisma.tradeOffer.update({ where: { id }, data: { assignedStaffId: staffId } });
    await audit(auth.user.id, "trade.assign", "trade", id, { from: exists.assignedStaffId, to: staffId }, ip);
    return ok({ assignedStaffId: staffId });
  }
  if (action === "stage" || action === "cancel") {
    const r = await arrangeTrade(id, action, { stage: b.stage, reason: b.reason });
    // Validation problems are the caller's to fix (422); the rest are state conflicts (409).
    if (!r.ok) return fail(r.reason, r.reason === "not_found" ? 404 : ["reason_required", "action_invalid"].includes(r.reason) ? 422 : 409);
    await audit(auth.user.id, `trade.staff_${action}`, "trade", id, { ...r, reason: b.reason ?? null }, ip);
    return ok(r);
  }
  return fail("action_invalid", 422);
}
