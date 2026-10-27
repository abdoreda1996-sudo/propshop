import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, audit } from "@/lib/api";
import { canAdvance, RESERVATION_HOLD_HOURS } from "@/lib/deals";

/**
 * POST /api/deals/[reference]/reserve — the buyer reserves the unit.
 *
 * This records the reservation and starts the hold. It does NOT move money: no licensed
 * payment provider is connected yet, so the Payment row is written as "pending" with the
 * provider left null, and the UI says so. When a provider is integrated, this handler
 * creates the intent and the provider's webhook flips the row to "paid" — nothing else
 * here has to change.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { reference } = await params;

  const deal = await prisma.deal.findUnique({
    where: { reference },
    select: { id: true, buyerId: true, sellerId: true, stage: true, agreedPrice: true, listingId: true },
  });
  if (!deal) return fail("not_found", 404);

  // Only the buyer reserves. The seller reaching this endpoint is a bug or an attack.
  if (deal.buyerId !== auth.user.id) {
    return fail("forbidden", 403, {
      messageAr: "المشتري بس هو اللي يقدر يحجز.",
      messageEn: "Only the buyer can reserve.",
    });
  }

  if (!canAdvance(deal.stage, "reserved")) {
    return fail("stage_invalid", 409, {
      messageAr: "الصفقة مش في المرحلة اللي تسمح بالحجز.",
      messageEn: "This deal is not at a stage where it can be reserved.",
    });
  }

  const deposit = Math.min(Math.max(Math.round(deal.agreedPrice * 0.01), 25_000), 250_000);
  const reservedUntil = new Date(Date.now() + RESERVATION_HOLD_HOURS * 3600_000);

  await prisma.$transaction([
    prisma.deal.update({
      where: { id: deal.id },
      data: {
        stage: "reserved",
        depositAmount: deposit,
        // Deliberately NOT "held": nothing is held until a provider says so.
        depositStatus: "pending",
        reservedUntil,
      },
    }),
    prisma.payment.create({
      data: {
        userId: auth.user.id,
        listingId: deal.listingId,
        // A refundable hold, NOT the success fee. This row said "deal_fee", which
        // recorded the buyer's deposit as platform revenue — overstating earnings and
        // making a refund look like a loss. The success fee is recorded separately when
        // a deal completes.
        purpose: "reservation_deposit",
        provider: "manual",
        amount: deposit,
        status: "pending",
      },
    }),
    prisma.dealEvent.create({
      data: { dealId: deal.id, actorId: auth.user.id, event: "reservation_intent", note: String(deposit) },
    }),
  ]);

  await audit(auth.user.id, "deal.reserve", "deal", deal.id, { deposit });
  return ok({ reservedUntil, deposit, depositStatus: "pending" });
}
