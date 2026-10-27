import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { canManageUsers } from "@/lib/permissions";
import { applyBlock, applyUnblock } from "@/lib/moderation";

/**
 * POST /api/admin/users/[id] — block or unblock an account. Admin only.
 *
 *   { action: "block", reason: string }   reason required: it is the record of WHY
 *   { action: "unblock" }
 *
 * Consequences are defined once, in src/lib/moderation.ts.
 *
 * An admin cannot block themselves (a lockout with nobody left to undo it) or another
 * admin (a dispute between admins is not a moderation action).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!canManageUsers(auth.user.role)) return fail("forbidden", 403);
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, isBlocked: true } });
  if (!target) return fail("not_found", 404);

  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const ip = clientIp(req);

  if (action === "block") {
    if (target.id === auth.user.id) return fail("cannot_block_self", 422);
    if (target.role === "admin") return fail("cannot_block_admin", 422);
    if (target.isBlocked) return fail("already_blocked", 409);
    const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : "";
    if (!reason) return fail("reason_required", 422);
    const effects = await applyBlock(id);
    await audit(auth.user.id, "user_blocked", "user", id, { via: "admin", reason, ...effects }, ip);
    return ok({ blocked: true, ...effects });
  }

  if (action === "unblock") {
    if (!target.isBlocked) return fail("not_blocked", 409);
    const result = await applyUnblock(id);
    await audit(auth.user.id, "user_unblocked", "user", id, result, ip);
    return ok({ blocked: false, ...result });
  }

  return fail("action_invalid", 422);
}
