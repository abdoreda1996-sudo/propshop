import { NextRequest, NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/api";
import { openNotification } from "@/lib/notifications";
import { safeNextPath } from "@/lib/safeNext";

/**
 * GET /api/notifications/[id]/open — marks the notification read and redirects to what it
 * points at. Links in the dashboard go through here so opening one clears its badge.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const n = await openNotification(auth.user.id, id);
  if (!n) return fail("not_found", 404);
  // Stored hrefs are ours, but they are still only ever followed as same-site paths.
  return NextResponse.redirect(new URL(safeNextPath(n.href, "/dashboard/notifications"), req.url), 303);
}
