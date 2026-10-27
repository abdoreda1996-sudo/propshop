import { NextRequest } from "next/server";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { respondTradeOffer } from "@/lib/tradeService";

/** POST — `{ action: "accept" | "reject" }` by the recipient, `{ action: "withdraw" }` by the proposer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const r = await respondTradeOffer(auth.user.id, id, action);
  if (!r.ok) return fail(r.reason, r.reason === "not_found" ? 404 : r.reason === "forbidden" ? 403 : 409);
  await audit(auth.user.id, `trade.${action}`, "trade", id, null, clientIp(req));
  return ok(r);
}
