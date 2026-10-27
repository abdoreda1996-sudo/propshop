import { Prisma } from "@prisma/client";
/**
 * Requests module (Section 6c). Both request paths land here:
 *   Path 1 — unit request: buyer taps "Request this unit" on a listing.
 *   Path 2 — open request: buyer with no specific unit fills a short brief.
 *
 * Every request is assigned to a salaried advisor within minutes and carries a 24-hour
 * SLA with a visible countdown. Owner and buyer never exchange phone numbers until the
 * viewing is confirmed.
 */

import { prisma } from "./prisma";
import { OPEN_REQUEST_STATUSES, pickAdvisor, slaDueFrom, APOLOGY_MESSAGE } from "./sla";
import { nextReference } from "./api";
import { RequestStatus } from "./enums";

export type RequestProfile = {
  purpose?: string;
  budgetMin?: number;
  budgetMax?: number;
  areas?: string[];
  bedrooms?: number;
  paymentType?: string;
  /** When paying in installments: what the buyer can put down, and pay each month (EGP). */
  downPayment?: number;
  monthlyInstallment?: number;
  timeline?: string;
  preferredSlots?: string[];
  note?: string;
};

export async function createRequest(input: {
  type: "unit" | "open";
  buyerId: string;
  listingId?: string | null;
  profile: RequestProfile;
  countryCode?: string;
}) {
  const buyer = await prisma.user.findUnique({
    where: { id: input.buyerId },
    select: { countryCode: true, countryOfResidence: true },
  });

  // Advisors covering the buyer's country are preferred; Gulf buyers get the Gulf desk.
  const advisorPool = await prisma.user.findMany({
    where: { role: "advisor", isBlocked: false },
    select: { id: true, countryCode: true },
  });
  const loads = await prisma.request.groupBy({
    by: ["assignedAdvisorId"],
    where: { status: { in: OPEN_REQUEST_STATUSES }, assignedAdvisorId: { not: null } },
    _count: { _all: true },
  });
  const loadBy = new Map(loads.map((l) => [l.assignedAdvisorId!, l._count._all]));

  const advisorId = pickAdvisor(
    advisorPool.map((a) => ({ id: a.id, countryCode: a.countryCode, openRequests: loadBy.get(a.id) ?? 0 })),
    buyer?.countryOfResidence ?? buyer?.countryCode ?? "EG",
  );

  const now = new Date();
  const reference = await nextReference("RQ");

  const request = await prisma.request.create({
    data: {
      reference,
      type: input.type,
      listingId: input.listingId ?? null,
      buyerId: input.buyerId,
      profileJson: JSON.stringify(input.profile),
      assignedAdvisorId: advisorId,
      assignedAt: advisorId ? now : null,
      slaDueAt: slaDueFrom(now),
      status: advisorId ? "assigned" : "received",
      countryCode: input.countryCode ?? buyer?.countryCode ?? "EG",
    },
  });

  await prisma.requestEvent.create({
    data: {
      requestId: request.id,
      actorId: input.buyerId,
      event: "created",
      note: input.type === "unit" ? "Unit request" : "Open request",
    },
  });
  if (advisorId) {
    await prisma.requestEvent.create({
      data: { requestId: request.id, actorId: advisorId, event: "assigned" },
    });
  }

  return request;
}

/** Records the first human response, which is what actually satisfies the SLA. */
export async function recordFirstResponse(requestId: string, advisorId: string, note?: string) {
  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) return null;

  const updated = await prisma.request.update({
    where: { id: requestId },
    data: {
      firstResponseAt: request.firstResponseAt ?? new Date(),
      status: request.status === "assigned" || request.status === "received" ? "contacted" : request.status,
    },
  });

  await prisma.requestEvent.create({
    data: { requestId, actorId: advisorId, event: "contacted", note },
  });

  return updated;
}

export async function advanceRequest(
  requestId: string,
  status: RequestStatus,
  actorId: string,
  note?: string,
) {
  const updated = await prisma.request.update({ where: { id: requestId }, data: { status } });
  await prisma.requestEvent.create({ data: { requestId, actorId, event: `status:${status}`, note } });
  return updated;
}

/**
 * Escalation job: flags every request that blew its 24-hour window, notifies a manager
 * and sends the buyer an automatic apology. Idempotent — safe to run on a schedule.
 */
export async function runSlaEscalation(): Promise<{ breached: number }> {
  const now = new Date();
  const overdue = await prisma.request.findMany({
    where: {
      firstResponseAt: null,
      slaBreachedAt: null,
      slaDueAt: { lt: now },
      status: { in: OPEN_REQUEST_STATUSES },
    },
    include: { buyer: { select: { id: true, locale: true } } },
  });

  for (const r of overdue) {
    await prisma.request.update({
      where: { id: r.id },
      data: { slaBreachedAt: now, escalatedAt: now },
    });
    await prisma.requestEvent.create({
      data: {
        requestId: r.id,
        event: "sla_breached",
        note: r.buyer.locale === "en" ? APOLOGY_MESSAGE.en : APOLOGY_MESSAGE.ar,
      },
    });
  }

  return { breached: overdue.length };
}

/**
 * The advisor queue, sorted by sla_due_at as the brief specifies. `where` narrows it
 * (filters from the queue page) on top of "open requests"; skip/take page it.
 */
export function advisorQueueWhere(extra: Prisma.RequestWhereInput = {}): Prisma.RequestWhereInput {
  return { status: { in: OPEN_REQUEST_STATUSES }, ...extra };
}

export async function advisorQueue(opts: { where?: Prisma.RequestWhereInput; skip?: number; take?: number } = {}) {
  return prisma.request.findMany({
    skip: opts.skip ?? 0,
    take: opts.take ?? QUEUE_PAGE,
    where: advisorQueueWhere(opts.where),
    include: {
      buyer: { select: { id: true, fullName: true, phone: true, countryOfResidence: true, preferredChannel: true } },
      listing: {
        select: {
          reference: true,
          price: true,
          currency: true,
          titleAr: true,
          titleEn: true,
          unit: { select: { compound: { select: { nameAr: true, nameEn: true } }, area: { select: { nameAr: true, nameEn: true } } } },
        },
      },
      assignedAdvisor: { select: { id: true, fullName: true } },
      events: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    // Oldest deadline first, so the cap always keeps the MOST urgent work rather than
    // an arbitrary slice. Six relations per row makes this expensive: unbounded, it grew
    // with open-request volume and would have taken the queue page down long before it
    // took the database down.
    orderBy: { slaDueAt: "asc" },
  });
}

/** How many rows a staff queue loads at once. */
export const QUEUE_PAGE = 100;
