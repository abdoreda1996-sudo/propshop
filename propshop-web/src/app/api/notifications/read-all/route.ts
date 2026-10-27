import { NextRequest, NextResponse } from "next/server";
import { ok, requireUser } from "@/lib/api";
import { markAllNotificationsRead } from "@/lib/notifications";

/**
 * POST /api/notifications/read-all. JSON for the app; a plain form post from the
 * dashboard (Accept: text/html) is sent back to the notifications page.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const count = await markAllNotificationsRead(auth.user.id);
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    return NextResponse.redirect(new URL("/dashboard/notifications", req.url), 303);
  }
  return ok({ marked: count });
}
