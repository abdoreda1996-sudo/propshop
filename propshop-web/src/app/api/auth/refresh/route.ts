import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeRefreshToken, issueRefreshToken, signAccessToken, REFRESH_COOKIE, setAuthCookies } from "@/lib/auth";
import { ok, fail } from "@/lib/api";
import { Role } from "@/lib/enums";

/** POST /api/auth/refresh — rotates the refresh token and mints a new access token. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.refreshToken ?? "") || req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) return fail("missing_refresh_token", 401);

  const userId = await consumeRefreshToken(token);
  if (!userId) return fail("invalid_refresh_token", 401);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.isBlocked) return fail("unauthorized", 401);

  const claims = {
    sub: user.id,
    role: user.role as Role,
    trustLevel: user.trustLevel,
    countryCode: user.countryCode,
    phone: user.phone,
  };
  await setAuthCookies(user.id, claims);

  return ok({ accessToken: signAccessToken(claims), refreshToken: await issueRefreshToken(user.id) });
}
