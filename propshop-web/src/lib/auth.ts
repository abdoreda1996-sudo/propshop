import crypto from "crypto";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { Role, STAFF_ROLES } from "./enums";

const ACCESS_TTL = "30m";
const REFRESH_TTL_DAYS = 30;
export const ACCESS_COOKIE = "aq_at";
export const REFRESH_COOKIE = "aq_rt";

function secret(): string {
  const s = process.env.JWT_SECRET;
  // Fail fast rather than signing production tokens with a default.
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

function refreshSecret(): string {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error("JWT_REFRESH_SECRET is not set");
  return s;
}

/** Claims carried in the access token — role and trust_level per the Phase 0 checklist. */
export type AccessClaims = {
  sub: string;
  role: Role;
  trustLevel: number;
  countryCode: string;
  phone: string;
};

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, secret(), { expiresIn: ACCESS_TTL });
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    return jwt.verify(token, secret()) as AccessClaims;
  } catch {
    return null;
  }
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("hex");
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
  await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
  return jwt.sign({ sub: userId, jti: raw }, refreshSecret(), { expiresIn: `${REFRESH_TTL_DAYS}d` });
}

export async function consumeRefreshToken(token: string): Promise<string | null> {
  let payload: { sub?: string; jti?: string };
  try {
    payload = jwt.verify(token, refreshSecret()) as { sub?: string; jti?: string };
  } catch {
    return null;
  }
  if (!payload.sub || !payload.jti) return null;

  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(payload.jti) } });
  if (!record || record.revokedAt || record.expiresAt < new Date() || record.userId !== payload.sub) return null;

  // Rotate: a refresh token is single-use, so a stolen one is detectable.
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return record.userId;
}

export async function revokeAllRefreshTokens(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// --- OTP -------------------------------------------------------------------

const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** Six-digit numeric code. In dev it is returned to the client instead of sent by SMS. */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function otpExpiry(): Date {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
}

/**
 * Egypt + Gulf country codes (Phase 0 checklist). Returns E.164 or null if unsupported.
 * Egyptian local form `01xxxxxxxxx` is accepted and normalised to +20.
 */
const GULF_PREFIXES = ["+966", "+971", "+965", "+974", "+973", "+968"];

export function normalisePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, "").replace(/^00/, "+");
  if (/^01\d{9}$/.test(cleaned)) return `+20${cleaned.slice(1)}`;
  if (/^\+20 ?1\d{9}$/.test(cleaned)) return cleaned;
  if (/^\+201\d{9}$/.test(cleaned)) return cleaned;
  for (const prefix of GULF_PREFIXES) {
    if (cleaned.startsWith(prefix) && /^\+\d{11,14}$/.test(cleaned)) return cleaned;
  }
  return null;
}

export function countryFromPhone(e164: string): string {
  if (e164.startsWith("+20")) return "EG";
  if (e164.startsWith("+966")) return "SA";
  if (e164.startsWith("+971")) return "AE";
  if (e164.startsWith("+965")) return "KW";
  if (e164.startsWith("+974")) return "QA";
  if (e164.startsWith("+973")) return "BH";
  if (e164.startsWith("+968")) return "OM";
  return "EG";
}

// --- Session helpers for route handlers and server components ---------------

export type SessionUser = {
  id: string;
  role: Role;
  trustLevel: number;
  countryCode: string;
  phone: string;
  fullName: string;
};

/** Reads the session from the cookie (server components, route handlers). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return sessionFromToken(token);
}

/** Reads the session from a request — cookie, or `Authorization: Bearer` for the Flutter app. */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearer ?? req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return sessionFromToken(token);
}

async function sessionFromToken(token: string): Promise<SessionUser | null> {
  const claims = verifyAccessToken(token);
  if (!claims) return null;
  // Re-read the user so a revoked role, a new strike or a block takes effect immediately
  // rather than at token expiry.
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, role: true, trustLevel: true, countryCode: true, phone: true, fullName: true, isBlocked: true },
  });
  if (!user || user.isBlocked) return null;
  return {
    id: user.id,
    role: user.role as Role,
    trustLevel: user.trustLevel,
    countryCode: user.countryCode,
    phone: user.phone,
    fullName: user.fullName,
  };
}

export function isStaff(role: string): boolean {
  return STAFF_ROLES.includes(role as Role);
}

export async function setAuthCookies(userId: string, claims: AccessClaims) {
  const store = await cookies();
  const access = signAccessToken(claims);
  const refresh = await issueRefreshToken(userId);
  const secure = process.env.NODE_ENV === "production";
  store.set(ACCESS_COOKIE, access, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 30 });
  store.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * REFRESH_TTL_DAYS,
  });
  return { access, refresh };
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
