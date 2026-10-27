import { NextRequest } from "next/server";
import { ok, fail, requireUser } from "@/lib/api";
import { QUEUE_KEYS, QueueKey, queuePage } from "@/lib/adminQueues";

/**
 * GET /api/admin/queues/[queue]?page=&<filters> — one back-office queue as data, for the
 * app's staff panel: items, total, the filters to offer, the bulk actions THIS user may
 * run, and who can be assigned. Actions go to POST /api/admin/bulk.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ queue: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { queue } = await params;
  if (!(QUEUE_KEYS as readonly string[]).includes(queue)) return fail("not_found", 404);
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const page = await queuePage(queue as QueueKey, sp, auth.user);
  if (!page) return fail("forbidden", 403);
  return ok(page);
}
