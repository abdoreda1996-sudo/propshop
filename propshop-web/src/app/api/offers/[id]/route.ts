import { NextRequest } from "next/server";
import { ok, fail, requireUser, audit } from "@/lib/api";
import { respondToOffer, acceptOffer } from "@/lib/offerService";
import { OFFER_ERROR_COPY } from "@/lib/offers";

/**
 * POST /api/offers/[id] — respond to an offer: accept, reject, counter or withdraw.
 *
 * One endpoint rather than four, because they are four transitions of one object and
 * every one of them needs the same "is it your turn, is it still live" gate. That gate
 * lives in offers.ts and is applied by the service, never here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");

  if (!["accept", "reject", "counter", "withdraw"].includes(action)) {
    return fail("action_invalid", 422);
  }

  const expiresAt = b.expiresAt ? new Date(String(b.expiresAt)) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return fail("expiry_invalid", 422);

  const result =
    action === "accept"
      ? await acceptOffer({ offerId: id, actorId: auth.user.id })
      : await respondToOffer({
          offerId: id,
          actorId: auth.user.id,
          action: action as "reject" | "counter" | "withdraw",
          amount: Number(b.amount),
          message: typeof b.message === "string" ? b.message.slice(0, 1000) : null,
          expiresAt,
        });

  if (!result.ok) {
    const copy = OFFER_ERROR_COPY[result.reason as keyof typeof OFFER_ERROR_COPY];
    const status = result.reason === "not_found" ? 404 : result.reason === "forbidden" ? 403 : 422;
    return fail(result.reason, status, { messageAr: copy?.ar, messageEn: copy?.en });
  }

  await audit(auth.user.id, `offer.${action}`, "offer", id);
  return ok(result.value);
}
