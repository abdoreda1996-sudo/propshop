import { NextRequest } from "next/server";
import { clearAuthCookies, getSessionFromRequest, revokeAllRefreshTokens } from "@/lib/auth";
import { ok } from "@/lib/api";

export async function POST(req: NextRequest) {
  const user = await getSessionFromRequest(req);
  if (user) await revokeAllRefreshTokens(user.id);
  await clearAuthCookies();
  return ok({ signedOut: true });
}
