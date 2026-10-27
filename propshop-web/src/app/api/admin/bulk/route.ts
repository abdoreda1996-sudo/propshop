import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { BULK_MAX } from "@/lib/adminList";
import { canTransition } from "@/lib/enums";
import { approveListing, rejectListing } from "@/lib/listingFlow";
import { onListingVisibilityChanged } from "@/lib/catalogue";
import { notifyTradeRequestMatches } from "@/lib/tradeRequestService";
import { resolveReport } from "@/lib/reportService";
import { applyBlock, applyUnblock } from "@/lib/moderation";
import { decideStaffAction } from "@/lib/viewingArrange";
import { arrangeTrade } from "@/lib/tradeService";
import { recordFirstResponse } from "@/lib/requests";
import { reviewTour } from "@/lib/tourService";
import { arrangeBooking } from "@/lib/tourBooking";
import {
  canAccessAdminSection,
  canArrangeTrades,
  canArrangeViewings,
  canDecideVerification,
  canEditListings,
  canManageUsers,
  canResolveReports,
  VIEWING_ASSIGNABLE_ROLES,
  BOOKING_ASSIGNABLE_ROLES,
  canArrangeBookings,
} from "@/lib/permissions";

/**
 * POST /api/admin/bulk — one action over many selected items, from any back-office queue.
 *
 *   { entity, action, ids: string[] (≤ BULK_MAX), params?: { staffId?, reason? } }
 *
 * Every item goes through the SAME rules as its single-item button (approveListing re-runs
 * the publish gate, resolveReport issues strikes, applyBlock defines blocking…), one at a
 * time, and the response lists what was skipped and why. Permission is checked per action
 * with the same functions the single routes use. Each item is audited individually.
 */

type Outcome = { ok: true } | { ok: false; reason: string };

/** Who may be assigned which kind of work. */
const ASSIGNABLE: Record<string, readonly string[]> = {
  listing: ["admin", "reviewer"],
  request: ["admin", "advisor"],
  viewing: VIEWING_ASSIGNABLE_ROLES,
  trade: VIEWING_ASSIGNABLE_ROLES,
  booking: BOOKING_ASSIGNABLE_ROLES,
};

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const me = auth.user;
  const ip = clientIp(req);

  const b = await req.json().catch(() => ({}));
  const entity = String(b.entity ?? "");
  const action = String(b.action ?? "");
  const raw: unknown[] = Array.isArray(b.ids) ? b.ids : [];
  const ids: string[] = [...new Set(raw.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (!ids.length) return fail("ids_required", 422);
  if (ids.length > BULK_MAX) return fail("too_many", 422, { max: BULK_MAX });
  const params = (b.params && typeof b.params === "object" ? b.params : {}) as { staffId?: string | null; reason?: string };
  const reason = typeof params.reason === "string" ? params.reason.trim().slice(0, 500) : "";

  // --- assignment (four entities, one shape) --------------------------------
  if (action === "assign") {
    const allowedToAssign =
      entity === "listing" ? canDecideVerification(me.role)
      : entity === "request" ? canAccessAdminSection(me.role, "requests")
      : entity === "viewing" ? canArrangeViewings(me.role)
      : entity === "trade" ? canArrangeTrades(me.role)
      : entity === "booking" ? canArrangeBookings(me.role)
      : false;
    if (!allowedToAssign) return fail("forbidden", 403);
    const staffId = params.staffId ? String(params.staffId) : null;
    if (staffId) {
      const s = await prisma.user.findUnique({ where: { id: staffId }, select: { role: true, isBlocked: true } });
      if (!s || s.isBlocked || !ASSIGNABLE[entity].includes(s.role)) return fail("staff_invalid", 422);
    }
    const now = new Date();
    const res =
      entity === "listing" ? await prisma.listing.updateMany({ where: { id: { in: ids } }, data: { assignedReviewerId: staffId } })
      : entity === "request" ? await prisma.request.updateMany({ where: { id: { in: ids } }, data: { assignedAdvisorId: staffId, assignedAt: staffId ? now : null } })
      : entity === "viewing" ? await prisma.viewingRequest.updateMany({ where: { id: { in: ids } }, data: { assignedStaffId: staffId } })
      : entity === "booking" ? await prisma.photoBooking.updateMany({ where: { id: { in: ids } }, data: { photographerId: staffId } })
      : await prisma.tradeOffer.updateMany({ where: { id: { in: ids } }, data: { assignedStaffId: staffId } });
    for (const id of ids) await audit(me.id, `${entity}.bulk_assign`, entity, id, { to: staffId }, ip);
    return ok({ done: res.count, skipped: ids.length > res.count ? [{ id: "", reason: "not_found" }] : [] });
  }

  // --- per-item actions -----------------------------------------------------
  let run: ((id: string) => Promise<Outcome>) | null = null;

  if (entity === "listing" && action === "approve") {
    if (!canDecideVerification(me.role)) return fail("forbidden", 403);
    run = async (id) => {
      const r = await approveListing(id, me.id);
      if (!r.ok) return { ok: false, reason: r.reason };
      await audit(me.id, "listing_approved", "listing", id, { bulk: true }, ip);
      return { ok: true };
    };
  } else if (entity === "listing" && action === "reject") {
    if (!canDecideVerification(me.role)) return fail("forbidden", 403);
    if (!reason) return fail("reason_required", 422);
    run = async (id) => {
      const l = await prisma.listing.findUnique({ where: { id }, select: { status: true } });
      if (!l) return { ok: false, reason: "not_found" };
      // Only what is waiting for review can be rejected from the queue.
      if (l.status !== "pending_review") return { ok: false, reason: "invalid_transition" };
      await rejectListing(id, me.id, reason);
      await audit(me.id, "listing_rejected", "listing", id, { reason, bulk: true }, ip);
      return { ok: true };
    };
  } else if (entity === "booking" && ["mark_shot", "mark_delivered", "cancel"].includes(action)) {
    // Photographers may record their OWN shoots (arrangeBooking checks each one); only
    // arrangers may cancel.
    if (!canArrangeBookings(me.role) && !(me.role === "photographer" && action !== "cancel")) return fail("forbidden", 403);
    if (action === "cancel" && !reason) return fail("reason_required", 422);
    const verb = action === "mark_shot" ? "shot" : action === "mark_delivered" ? "delivered" : "cancel";
    run = async (id) => {
      const r = await arrangeBooking(me, id, verb, { reason });
      if (!r.ok) return { ok: false, reason: r.reason };
      await audit(me.id, `booking.bulk_${verb}`, "booking", id, { bulk: true, ...(reason ? { reason } : {}) }, ip);
      return { ok: true };
    };
  } else if (entity === "listing" && (action === "approve_tours" || action === "reject_tours")) {
    // Every pending virtual tour on each selected listing, through the single-tour rule.
    if (!canDecideVerification(me.role)) return fail("forbidden", 403);
    if (action === "reject_tours" && !reason) return fail("reason_required", 422);
    run = async (id) => {
      const pending = await prisma.listingTour.findMany({ where: { listingId: id, status: "pending" }, select: { id: true } });
      if (!pending.length) return { ok: false, reason: "no_pending_tours" };
      for (const t of pending) {
        const r = await reviewTour(t.id, me, action === "approve_tours" ? "approve" : "reject", reason);
        if (!r.ok) return { ok: false, reason: r.reason };
      }
      await audit(me.id, `tour.bulk_${action === "approve_tours" ? "approve" : "reject"}`, "listing", id, { tours: pending.length, reason: reason || null }, ip);
      return { ok: true };
    };
  } else if (entity === "listing" && (action === "pause" || action === "unpause")) {
    if (!canEditListings(me.role)) return fail("forbidden", 403);
    const [from, to] = action === "pause" ? ["live", "paused"] : ["paused", "live"];
    run = async (id) => {
      const l = await prisma.listing.findUnique({ where: { id }, select: { status: true } });
      if (!l) return { ok: false, reason: "not_found" };
      if (l.status !== from || !canTransition(from, to)) return { ok: false, reason: "invalid_transition" };
      await prisma.listing.update({ where: { id }, data: { status: to } });
      await onListingVisibilityChanged(id);
      // Back on the market while open to trade: owners whose trade request it fits hear
      // now. Deduped per user and listing, and a no-op for a listing not open to trade.
      if (to === "live") await notifyTradeRequestMatches(id);
      await audit(me.id, `listing_${action}d`, "listing", id, { bulk: true }, ip);
      return { ok: true };
    };
  } else if (entity === "report" && (action === "uphold" || action === "dismiss")) {
    if (!canResolveReports(me.role)) return fail("forbidden", 403);
    run = async (id) => {
      const r = await resolveReport(id, action === "uphold" ? "upheld" : "dismissed", me.id, ip);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    };
  } else if (entity === "user" && (action === "block" || action === "unblock")) {
    if (!canManageUsers(me.role)) return fail("forbidden", 403);
    if (action === "block" && !reason) return fail("reason_required", 422);
    run = async (id) => {
      const u = await prisma.user.findUnique({ where: { id }, select: { role: true, isBlocked: true } });
      if (!u) return { ok: false, reason: "not_found" };
      if (action === "block") {
        if (id === me.id) return { ok: false, reason: "cannot_block_self" };
        if (u.role === "admin") return { ok: false, reason: "cannot_block_admin" };
        if (u.isBlocked) return { ok: false, reason: "already_blocked" };
        const effects = await applyBlock(id);
        await audit(me.id, "user_blocked", "user", id, { via: "admin", reason, bulk: true, ...effects }, ip);
      } else {
        if (!u.isBlocked) return { ok: false, reason: "not_blocked" };
        const r = await applyUnblock(id);
        await audit(me.id, "user_unblocked", "user", id, { bulk: true, ...r }, ip);
      }
      return { ok: true };
    };
  } else if (entity === "request" && action === "respond") {
    if (!canAccessAdminSection(me.role, "requests")) return fail("forbidden", 403);
    run = async (id) => {
      const r = await prisma.request.findUnique({ where: { id }, select: { firstResponseAt: true } });
      if (!r) return { ok: false, reason: "not_found" };
      if (r.firstResponseAt) return { ok: false, reason: "already_responded" };
      await recordFirstResponse(id, me.id, reason || undefined);
      await audit(me.id, "request.first_response", "request", id, { bulk: true }, ip);
      return { ok: true };
    };
  } else if (entity === "viewing" && ["cancel", "complete_attended", "complete_no_show"].includes(action)) {
    if (!canArrangeViewings(me.role)) return fail("forbidden", 403);
    const [verb, outcome] = action === "cancel" ? ["cancel", undefined] : ["complete", action.slice("complete_".length)];
    run = async (id) => {
      const v = await prisma.viewingRequest.findUnique({ where: { id }, select: { status: true, scheduledAt: true, contactUnlockedAt: true } });
      if (!v) return { ok: false, reason: "not_found" };
      // Same state rules as the single-viewing button.
      const d = decideStaffAction(v, verb, { outcome });
      if (!d.ok) return { ok: false, reason: d.error };
      await prisma.viewingRequest.update({ where: { id }, data: d.data });
      await audit(me.id, `viewing.staff_${verb}`, "viewing", id, { from: v.status, to: d.data, bulk: true }, ip);
      return { ok: true };
    };
  } else if (entity === "trade" && (action.startsWith("stage_") || action === "cancel")) {
    if (!canArrangeTrades(me.role)) return fail("forbidden", 403);
    if (action === "cancel" && !reason) return fail("reason_required", 422);
    run = async (id) => {
      const r = action === "cancel" ? await arrangeTrade(id, "cancel", { reason }) : await arrangeTrade(id, "stage", { stage: action.slice("stage_".length) });
      if (!r.ok) return { ok: false, reason: r.reason };
      await audit(me.id, `trade.staff_${action}`, "trade", id, { bulk: true, ...(reason ? { reason } : {}) }, ip);
      return { ok: true };
    };
  }

  if (!run) return fail("action_invalid", 422);

  let done = 0;
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const r = await run(id);
    if (r.ok) done++;
    else skipped.push({ id, reason: r.reason });
  }
  return ok({ done, skipped });
}
