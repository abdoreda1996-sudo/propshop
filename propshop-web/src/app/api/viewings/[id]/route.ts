import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit } from "@/lib/api";
import { parseSlot } from "@/lib/viewingSlots";

/**
 * POST /api/viewings/[id] — the owner answers a viewing request (Section 12).
 *
 * accept  — confirm one of the buyer's slots
 * decline — no
 * propose — suggest a different time, which the buyer then confirms
 * confirm — the buyer accepting the owner's proposed time
 * cancel  — either side calls it off
 *
 * Confirming a slot is also the moment contact details become exchangeable: the two are
 * one transition, so `contactUnlockedAt` is set here and nowhere else.
 */
const OWNER_ACTIONS = ["accept", "decline", "propose"];
const BUYER_ACTIONS = ["confirm", "cancel"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const viewing = await prisma.viewingRequest.findUnique({
    where: { id },
    include: { listing: { select: { unit: { select: { ownerId: true } } } } },
  });
  if (!viewing) return fail("not_found", 404);

  const isOwner = viewing.listing.unit.ownerId === auth.user.id;
  const isBuyer = viewing.buyerId === auth.user.id;
  if (!isOwner && !isBuyer) return fail("forbidden", 403);

  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");

  if (isOwner && !OWNER_ACTIONS.includes(action) && action !== "cancel") {
    return fail("action_invalid", 422);
  }
  if (isBuyer && !BUYER_ACTIONS.includes(action)) {
    return fail("action_invalid", 422, {
      messageAr: "المالك هو اللي بيأكد الميعاد.",
      messageEn: "The owner confirms the time.",
    });
  }

  // Terminal states accept nothing further.
  if (["completed", "cancelled", "declined"].includes(viewing.status)) {
    return fail("already_settled", 409, {
      messageAr: "طلب المعاينة ده اتقفل خلاص.",
      messageEn: "This viewing request is already closed.",
    });
  }

  // A confirmed viewing can still be called off — plans change — but it cannot be
  // re-decided. Declining or re-proposing a slot the other side has already arranged
  // their day around (and which released their contact details) is not a correction,
  // it is a different event: cancel it.
  if (viewing.status === "accepted" && action !== "cancel") {
    return fail("already_confirmed", 409, {
      messageAr: "المعاينة متأكدة خلاص. لو مش هتقدر تحضر، الغيها.",
      messageEn: "This viewing is already confirmed. If you cannot attend, cancel it.",
    });
  }

  const now = new Date();

  if (action === "decline" || action === "cancel") {
    await prisma.viewingRequest.update({
      where: { id },
      data: { status: action === "decline" ? "declined" : "cancelled" },
    });
    await audit(auth.user.id, `viewing.${action}`, "viewing", id);
    return ok({ status: action === "decline" ? "declined" : "cancelled" });
  }

  if (action === "propose") {
    // The owner's alternative is one of the same three daily windows.
    const at = parseSlot(b.slot ?? b.at);
    if (!at) {
      return fail("slot_invalid", 422, {
        messageAr: "اختار من الفترات المتاحة: 11 ص – 2 م، 2 م – 6 م، أو 6 م – 9 م.",
        messageEn: "Pick one of the available windows: 11 AM – 2 PM, 2 PM – 6 PM or 6 PM – 9 PM.",
      });
    }
    if (at.getTime() <= now.getTime()) {
      return fail("slot_invalid", 422, {
        messageAr: "الميعاد لازم يكون في المستقبل.",
        messageEn: "The proposed time must be in the future.",
      });
    }
    await prisma.viewingRequest.update({
      where: { id },
      data: {
        status: "proposed",
        proposedAt: at,
        note: typeof b.note === "string" ? b.note.slice(0, 500) : null,
      },
    });
    await audit(auth.user.id, "viewing.propose", "viewing", id);
    return ok({ status: "proposed", proposedAt: at });
  }

  // accept (owner picks one of the buyer's slots) or confirm (buyer takes the owner's).
  const slots: string[] = JSON.parse(viewing.slotsJson || "[]");
  const chosen =
    action === "confirm"
      ? viewing.proposedAt
      : typeof b.at === "string" && slots.includes(b.at)
        ? new Date(b.at)
        : null;

  if (!chosen || Number.isNaN(chosen.getTime())) {
    return fail("slot_invalid", 422, {
      messageAr: "اختار ميعاد من المواعيد المطروحة.",
      messageEn: "Pick one of the proposed times.",
    });
  }

  await prisma.viewingRequest.update({
    where: { id },
    data: {
      status: "accepted",
      scheduledAt: chosen,
      // A confirmed viewing is the point at which the two sides may exchange numbers.
      // This is the only place that unlocks it.
      contactUnlockedAt: now,
    },
  });

  await audit(auth.user.id, `viewing.${action}`, "viewing", id, { scheduledAt: chosen });
  return ok({ status: "accepted", scheduledAt: chosen, contactUnlocked: true });
}
