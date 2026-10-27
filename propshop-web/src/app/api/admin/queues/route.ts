import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api";
import { queuesFor, queueCounts } from "@/lib/adminQueues";

/** GET /api/admin/queues — the queues this staff member may open, with badge counts. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const queues = queuesFor(auth.user.role);
  if (!queues.length) return fail("forbidden", 403);
  return ok({ queues, counts: await queueCounts(auth.user.role) });
}
