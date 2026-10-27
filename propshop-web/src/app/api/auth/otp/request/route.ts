import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, normalisePhone, otpExpiry, sha256, countryFromPhone } from "@/lib/auth";
import { ok, fail, rateLimit, clientIp } from "@/lib/api";

/**
 * POST /api/auth/otp/request — sends a login/signup code.
 *
 * In development the code is returned in the response so the flow is testable without
 * an SMS gateway. In production it is only ever sent over SMS.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const body = await req.json().catch(() => ({}));

  const phone = normalisePhone(String(body.phone ?? ""));
  if (!phone) return fail("invalid_phone", 422);

  // Two limits: per phone (stops code-bombing one number) and per IP (stops enumeration).
  if (!await rateLimit(`otp:phone:${phone}`, 5, 15 * 60_000)) return fail("too_many_requests", 429);
  if (!await rateLimit(`otp:ip:${ip}`, 20, 15 * 60_000)) return fail("too_many_requests", 429);

  const code = generateOtp();
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, fullName: true } });

  await prisma.otpCode.create({
    data: {
      userId: user?.id ?? null,
      phone,
      codeHash: sha256(code),
      purpose: user ? "login" : "signup",
      expiresAt: otpExpiry(),
    },
  });

  // TODO(phase-1): hand off to the SMS provider here.
  if (process.env.NODE_ENV !== "production") {
    console.log(`[otp] ${phone} -> ${code}`);
  }

  return ok({
    sent: true,
    isNewUser: !user,
    countryCode: countryFromPhone(phone),
    phone,
    // OTP_DEV_ECHO=1: show the code on screen on a TEST deployment with no SMS provider,
    // so testers can sign up. It means phone numbers are not verified there — never set
    // it on a real deployment.
    ...(process.env.NODE_ENV !== "production" || process.env.OTP_DEV_ECHO === "1" ? { devCode: code } : {}),
  });
}
