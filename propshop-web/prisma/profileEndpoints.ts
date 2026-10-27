/**
 * One request at a time, per endpoint — the cost of each request with NO queueing.
 * On a one-connection database the sum of these per second is the ceiling.
 *   DATABASE_URL=file:./bench.db JWT_SECRET=… npx tsx prisma/profileEndpoints.ts http://localhost:4300
 */
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

const base = process.argv[2] ?? "http://localhost:4300";
const prisma = new PrismaClient();

(async () => {
  const owner = await prisma.user.findFirst({ where: { email: "bench5@load.test" }, select: { id: true, role: true, trustLevel: true, phone: true } });
  const buyer = await prisma.user.findFirst({ where: { email: "bench60000@load.test" }, select: { id: true, role: true, trustLevel: true, phone: true } });
  const sign = (u: NonNullable<typeof owner>) => jwt.sign({ sub: u.id, role: u.role, trustLevel: u.trustLevel, countryCode: "EG", phone: u.phone }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  const to = sign(owner!), tb = sign(buyer!);
  const ref = (await prisma.listing.findFirst({ where: { reference: { startsWith: "AQ-7" } }, select: { reference: true } }))!.reference;
  const H = (t: string) => ({ authorization: `Bearer ${t}` });
  const eps: [string, string, Record<string, string>?][] = [
    ["page /", "/"],
    ["page /search p5", "/search?page=5"],
    ["page /listing", `/listing/${ref}`],
    ["api search p1", "/api/listings?page=1&sort=newest"],
    ["api search p25", "/api/listings?page=25&sort=newest"],
    ["api search best_value", "/api/listings?page=1&sort=best_value"],
    ["api listing", `/api/listings/${ref}`],
    ["api home", "/api/home"],
    ["api trade market", "/api/trade/market"],
    ["api auth/me (owner)", "/api/auth/me", H(to)],
    ["api auth/me (buyer)", "/api/auth/me", H(tb)],
    ["page /dashboard (owner)", "/dashboard", { cookie: `aq_at=${to}` }],
    ["api offers (owner)", "/api/offers", H(to)],
    ["api viewings (owner)", "/api/viewings", H(to)],
    ["api trade matches (owner)", "/api/trade/matches", H(to)],
    ["api trade-offers (owner)", "/api/trade-offers", H(to)],
    ["api conversations (owner)", "/api/conversations", H(to)],
  ];
  for (const [name, path, headers] of eps) {
    const ms: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      const r = await fetch(base + path, { headers });
      await r.arrayBuffer();
      if (i > 0) ms.push(performance.now() - t0); // first = warm-up
      if (r.status >= 400) { console.log(`${name}: HTTP ${r.status}`); break; }
    }
    ms.sort((a, b) => a - b);
    if (ms.length) console.log(`${name.padEnd(28)} median ${ms[Math.floor(ms.length / 2)].toFixed(0).padStart(5)} ms`);
  }
  await prisma.$disconnect();
})();
