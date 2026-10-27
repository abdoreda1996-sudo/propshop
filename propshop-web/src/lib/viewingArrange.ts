import { parseSlot } from "./viewingSlots";

/**
 * Back-office arrangement of a viewing — the state rules, pure so they are testable.
 *
 * Staff act on the owner's behalf. They can do what the owner can (confirm a time,
 * cancel) plus two things only staff can:
 *   - MOVE a confirmed viewing. The parties cannot re-decide a confirmed slot (they must
 *     cancel), because the other side planned around it. Staff can, because moving it is
 *     the arrangement they were asked to make, and it is audited.
 *   - RECORD the outcome — attended or no-show — once the time has passed.
 *
 * Confirming here is the same transition as the owner confirming: it releases contact
 * details (`contactUnlockedAt`). That rule has exactly one meaning wherever it happens.
 *
 * Times are always one of the three daily windows (viewingSlots.ts) — staff do not get to
 * book 7:40 AM because the form let them.
 */

export const TERMINAL_STATUSES = ["declined", "cancelled", "completed"] as const;
export const VIEWING_OUTCOMES = ["attended", "no_show"] as const;
export type ViewingOutcome = (typeof VIEWING_OUTCOMES)[number];

export type StaffAction = "confirm" | "cancel" | "complete";

export type ViewingState = {
  status: string;
  scheduledAt: Date | null;
  contactUnlockedAt: Date | null;
};

export type ArrangeError =
  | "action_invalid"
  | "already_settled"
  | "slot_invalid"
  | "slot_in_past"
  | "not_confirmed"
  | "not_yet_happened"
  | "outcome_invalid";

export type ArrangeDecision =
  | {
      ok: true;
      data: {
        status: string;
        scheduledAt?: Date;
        contactUnlockedAt?: Date;
        completedAt?: Date;
        outcome?: ViewingOutcome;
      };
    }
  | { ok: false; error: ArrangeError };

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function decideStaffAction(
  viewing: ViewingState,
  action: string,
  input: { slot?: unknown; outcome?: unknown },
  now: Date = new Date(),
): ArrangeDecision {
  if (!["confirm", "cancel", "complete"].includes(action)) return { ok: false, error: "action_invalid" };
  if (isTerminal(viewing.status)) return { ok: false, error: "already_settled" };

  if (action === "cancel") return { ok: true, data: { status: "cancelled" } };

  if (action === "confirm") {
    const at = parseSlot(input.slot);
    if (!at) return { ok: false, error: "slot_invalid" };
    if (at.getTime() <= now.getTime()) return { ok: false, error: "slot_in_past" };
    return {
      ok: true,
      data: {
        status: "accepted",
        scheduledAt: at,
        // Moving an already-confirmed viewing keeps the original unlock time — the
        // contact details were released then, not now.
        contactUnlockedAt: viewing.contactUnlockedAt ?? now,
      },
    };
  }

  // complete
  if (viewing.status !== "accepted" || !viewing.scheduledAt) return { ok: false, error: "not_confirmed" };
  if (viewing.scheduledAt.getTime() > now.getTime()) return { ok: false, error: "not_yet_happened" };
  if (!(VIEWING_OUTCOMES as readonly string[]).includes(String(input.outcome))) return { ok: false, error: "outcome_invalid" };
  return { ok: true, data: { status: "completed", completedAt: now, outcome: input.outcome as ViewingOutcome } };
}

/**
 * The staff queue's buckets. "Unrecorded" is the one that slips: a confirmed viewing whose
 * time has passed with nobody saying whether it happened.
 */
export type ViewingBucket = "needs_action" | "upcoming" | "unrecorded" | "closed";

export function bucketOf(v: { status: string; scheduledAt: Date | null }, now: Date = new Date()): ViewingBucket {
  if (isTerminal(v.status)) return "closed";
  if (v.status === "accepted") {
    return v.scheduledAt && v.scheduledAt.getTime() <= now.getTime() ? "unrecorded" : "upcoming";
  }
  return "needs_action"; // requested | proposed
}

/** The same buckets as Prisma filters, so the tab counts and the list cannot disagree. */
export function bucketWhere(bucket: ViewingBucket, now: Date) {
  switch (bucket) {
    case "needs_action":
      return { status: { in: ["requested", "proposed"] } };
    case "upcoming":
      return { status: "accepted", scheduledAt: { gt: now } };
    case "unrecorded":
      return { status: "accepted", scheduledAt: { lte: now } };
    case "closed":
      return { status: { in: [...TERMINAL_STATUSES] } };
  }
}

export const NOTE_MAX = 1000;
