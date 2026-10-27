import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser } from "@/lib/api";
import { parseJson } from "@/lib/json";
import { publicIdentity, PUBLIC_IDENTITY_SELECT } from "@/lib/identity";
import { MIN_PUBLIC_TRUST } from "@/lib/enums";
import { splitFee } from "@/lib/fees";
import {
  DEFAULT_CHECKLIST,
  ChecklistItem,
  STAGE_LABELS,
  STAGE_EXPLAINER,
  DEAL_EVENT_COPY,
  DealStage,
  PROVIDER_PENDING,
} from "@/lib/deals";

/**
 * GET /api/deals/[reference] — one deal room.
 *
 * Private to its two parties, and to staff for support. An outsider gets 404 rather than
 * 403: a 403 would confirm the deal exists.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { reference } = await params;

  const deal = await prisma.deal.findUnique({
    where: { reference },
    include: {
      listing: {
        select: { reference: true, titleAr: true, titleEn: true, currency: true, trustLevel: true },
      },
      buyer: { select: PUBLIC_IDENTITY_SELECT },
      seller: { select: PUBLIC_IDENTITY_SELECT },
      events: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, type: true, status: true } },
    },
  });
  if (!deal) return fail("not_found", 404);

  const isBuyer = deal.buyerId === auth.user.id;
  const isSeller = deal.sellerId === auth.user.id;
  const isStaffMember = ["admin", "reviewer", "advisor"].includes(auth.user.role);
  if (!isBuyer && !isSeller && !isStaffMember) return fail("not_found", 404);

  const stage = deal.stage as DealStage;
  const checklist = parseJson<ChecklistItem[]>(deal.checklistJson, DEFAULT_CHECKLIST);

  return ok({
    reference: deal.reference,
    listingReference: deal.listing.reference,
    title: deal.listing.titleAr ?? deal.listing.reference,
    titleEn: deal.listing.titleEn,
    currency: deal.listing.currency,
    agreedPrice: deal.agreedPrice,
    /*
      What each side pays — and ONLY that. The whole-deal total is deliberately not
      sent: the fee is only ever shown per side (owner, 2026-09-27), and a figure that
      is not in the payload cannot leak onto a screen.

      Split on the SERVER so the website and the app cannot disagree about who owes what.
      Both clients render a figure a customer will be invoiced for; a rounding rule
      duplicated in Dart and TypeScript is a rounding rule that eventually diverges.

      Derived from the STORED total, fixed when the offer was accepted, so a later change
      to the fee schedule never re-prices a deal already in progress.
    */
    fee: (({ buyer, seller }) => ({ buyer, seller }))(splitFee(deal.adminFee)),
    stage: deal.stage,
    stageLabelAr: STAGE_LABELS[stage]?.ar ?? deal.stage,
    stageExplainerAr: STAGE_EXPLAINER[stage]?.ar ?? "",
    role: isBuyer ? "buyer" : "seller",
    reservedUntil: deal.reservedUntil,
    depositAmount: deal.depositAmount,
    depositStatus: deal.depositStatus,
    /** True while no licensed payment provider is connected; the UI must say so. */
    providerPending: PROVIDER_PENDING,
    counterparty: isBuyer
      ? publicIdentity(deal.seller, "seller", {
          ownershipVerified: deal.listing.trustLevel >= MIN_PUBLIC_TRUST,
        })
      : publicIdentity(deal.buyer, "buyer"),
    checklist,
    documents: deal.documents,
    events: deal.events.map((e) => ({
      event: e.event,
      label: DEAL_EVENT_COPY[e.event]?.ar ?? e.event,
      labelEn: DEAL_EVENT_COPY[e.event]?.en ?? e.event,
      createdAt: e.createdAt,
    })),
  });
}
