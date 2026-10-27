import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, rateLimit, clientIp, audit } from "@/lib/api";
import { createRequest, RequestProfile } from "@/lib/requests";
import { VIEWABLE_LISTING_WHERE } from "@/lib/listings";
import { LIST_PAGE } from "@/lib/enums";

/** GET /api/requests — the signed-in buyer's own requests, with SLA fields. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const requests = await prisma.request.findMany({
    where: { buyerId: auth.user.id },
    include: {
      listing: { select: { reference: true, titleAr: true, titleEn: true, price: true, currency: true } },
      assignedAdvisor: { select: { fullName: true } },
      events: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_PAGE,
  });

  return ok({ requests });
}

/** POST /api/requests — creates a unit or open request (Section 6c paths 1 and 2). */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const ip = clientIp(req);
  // Stops a single account from spamming the advisor queue.
  if (!await rateLimit(`req:${auth.user.id}`, 10, 60 * 60_000)) return fail("too_many_requests", 429);

  const body = await req.json().catch(() => ({}));
  const type = body.type === "open" ? "open" : "unit";
  const profile = (body.profile ?? {}) as RequestProfile;
  // Installment amounts only mean something with installments, and only as positive numbers.
  const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);
  if (profile.paymentType === "installments") {
    profile.downPayment = money(profile.downPayment);
    profile.monthlyInstallment = money(profile.monthlyInstallment);
  } else {
    delete profile.downPayment;
    delete profile.monthlyInstallment;
  }

  let listingId: string | null = null;
  if (type === "unit") {
    const ref = String(body.listingId ?? body.reference ?? "");
    if (!ref) return fail("listing_required", 422);
    // Only a publicly visible listing can be requested — never a draft or pending one.
    const listing = await prisma.listing.findFirst({
      where: { AND: [VIEWABLE_LISTING_WHERE, { OR: [{ id: ref }, { reference: ref }] }] },
      select: { id: true },
    });
    if (!listing) return fail("listing_not_available", 404);
    listingId = listing.id;
  } else if (!profile.budgetMax && !profile.areas?.length) {
    return fail("brief_too_thin", 422);
  }

  const request = await createRequest({ type, buyerId: auth.user.id, listingId, profile });
  await audit(auth.user.id, "request_created", "request", request.id, { type }, ip);

  return ok(
    {
      id: request.id,
      reference: request.reference,
      status: request.status,
      slaDueAt: request.slaDueAt,
      assigned: !!request.assignedAdvisorId,
    },
    { status: 201 },
  );
}
