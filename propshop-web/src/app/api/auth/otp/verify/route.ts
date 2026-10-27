import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  countryFromPhone,
  normalisePhone,
  setAuthCookies,
  sha256,
  OTP_MAX_ATTEMPTS,
  signAccessToken,
  issueRefreshToken,
} from "@/lib/auth";
import { ok, fail, rateLimit, clientIp, audit } from "@/lib/api";
import { Role } from "@/lib/enums";
import { assignPublicRef } from "@/lib/identity";

/**
 * POST /api/auth/otp/verify — consumes the code, creating the account on first login.
 *
 * Returns tokens in the body as well as cookies: the web app uses the cookies, the
 * Flutter client uses the bearer token.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json().catch(() => ({}));

  const phone = normalisePhone(String(body.phone ?? ""));
  const code = String(body.code ?? "").trim();
  const fullName = String(body.fullName ?? "").trim();

  if (!phone) return fail("invalid_phone", 422);
  if (!/^\d{6}$/.test(code)) return fail("invalid_code", 422);
  if (!await rateLimit(`otpv:${phone}`, 10, 15 * 60_000)) return fail("too_many_requests", 429);

  const record = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return fail("code_expired", 410);

  if (record.attempts >= OTP_MAX_ATTEMPTS) return fail("too_many_attempts", 429);

  if (record.codeHash !== sha256(code)) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return fail("code_incorrect", 401);
  }

  let user = await prisma.user.findUnique({ where: { phone } });

  // The code is only consumed once we know the request will succeed. Otherwise a new
  // user who submits a correct code without a name would burn it and have to start over.
  if (!user && fullName.length < 4) return fail("name_required", 422, { isNewUser: true });

  await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

  if (!user) {
    // The name is later matched against the national ID during KYC.
    const countryCode = countryFromPhone(phone);
    user = await prisma.user.create({
      data: {
        phone,
        fullName,
        role: "buyer",
        countryCode,
        countryOfResidence: countryCode,
        preferredCurrency: countryCode === "EG" ? "EGP" : countryCode === "SA" ? "SAR" : "AED",
        phoneVerifiedAt: new Date(),
        trustLevel: 0,
      },
    });

    // The pseudonymous handle counterparties see instead of a name (Section 6). Claimed
    // after creation so a collision retries the handle, never the whole signup.
    const created = user;
    await assignPublicRef(async (ref) => {
      try {
        await prisma.user.update({ where: { id: created.id }, data: { publicRef: ref } });
        return true;
      } catch {
        return false; // unique violation — try another number
      }
    });

    await audit(user.id, "signup", "user", user.id, { via: "otp" }, ip);
  } else {
    if (user.isBlocked) return fail("account_blocked", 403);
    await prisma.user.update({
      where: { id: user.id },
      data: { phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(), lastLoginAt: new Date() },
    });
    await audit(user.id, "login", "user", user.id, { via: "otp" }, ip);
  }

  const claims = {
    sub: user.id,
    role: user.role as Role,
    trustLevel: user.trustLevel,
    countryCode: user.countryCode,
    phone: user.phone,
  };

  await setAuthCookies(user.id, claims);

  return ok({
    user: { id: user.id, fullName: user.fullName, role: user.role, trustLevel: user.trustLevel, phone: user.phone },
    accessToken: signAccessToken(claims),
    refreshToken: await issueRefreshToken(user.id),
  });
}
