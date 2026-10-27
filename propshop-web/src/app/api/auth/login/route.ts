import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setAuthCookies, signAccessToken, issueRefreshToken, normalisePhone } from "@/lib/auth";
import { ok, fail, rateLimit, clientIp, audit } from "@/lib/api";
import { Role } from "@/lib/enums";

/**
 * POST /api/auth/login — email/password path, used by staff (admin, reviewer, advisor)
 * and by the demo accounts. Members sign in with a phone OTP instead.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!await rateLimit(`login:${ip}`, 15, 10 * 60_000)) return fail("too_many_requests", 429);

  const body = await req.json().catch(() => ({}));
  const identifier = String(body.email ?? body.phone ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!identifier || !password) return fail("missing_credentials", 422);
  // Per account as well as per IP: an attacker with many addresses must not get many
  // guesses at ONE password. Same shape as the per-phone OTP limit.
  if (!await rateLimit(`login:acct:${identifier}`, 10, 15 * 60_000)) return fail("too_many_requests", 429);

  const phone = normalisePhone(identifier);
  const user = await prisma.user.findFirst({
    where: phone ? { phone } : { email: identifier },
  });

  // Same response whether the account is missing or the password is wrong.
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    return fail("invalid_credentials", 401);
  }
  if (user.isBlocked) return fail("account_blocked", 403);

  const claims = {
    sub: user.id,
    role: user.role as Role,
    trustLevel: user.trustLevel,
    countryCode: user.countryCode,
    phone: user.phone,
  };
  await setAuthCookies(user.id, claims);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user.id, "login", "user", user.id, { via: "password" }, ip);

  return ok({
    user: { id: user.id, fullName: user.fullName, role: user.role, trustLevel: user.trustLevel, phone: user.phone },
    accessToken: signAccessToken(claims),
    refreshToken: await issueRefreshToken(user.id),
  });
}
