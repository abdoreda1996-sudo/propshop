/**
 * End-to-end journey check, run against a live dev server.
 *
 *   npm run dev            # in one terminal
 *   npx tsx prisma/journey.ts
 *
 * Covers the buyer and seller paths the product exists for: offer → counter → accept →
 * deal room → reserve, and ask → viewing → confirm → contact unlock. Plus every
 * permission boundary at each step.
 *
 * SELF-ISOLATING. Earlier versions of this script picked a demo listing, mutated it, and
 * left it reserved with test offers attached — so a second run measured the wreckage of
 * the first. This one creates its own listing and users under a `journey-` prefix and
 * deletes them at the end, whether or not the run passes. Nothing it touches is demo
 * data, so it can be run as often as you like.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { slotFor, cairoToday } from "../src/lib/viewingSlots";

const prisma = new PrismaClient();
const BASE = process.env.AQAR_BASE ?? "http://localhost:4100";

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) {
    pass++;
    console.log("  PASS", msg);
  } else {
    fail++;
    console.log("  FAIL", msg);
  }
};
const section = (s: string) => console.log(`\n--- ${s} ---`);

// --- HTTP helpers -----------------------------------------------------------

async function login(phone: string): Promise<string> {
  const r1 = await fetch(`${BASE}/api/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const body = (await r1.json()) as { devCode?: string; error?: string };
  if (body.error === "too_many_requests") {
    // The OTP limiter is per-IP and in-memory (20 / 15 min). Hitting it here means the
    // limiter works; it just means this script has been run several times in a row.
    throw new Error(
      "OTP rate limit reached for this IP. Wait 15 minutes or restart the dev server to clear the in-memory buckets.",
    );
  }
  if (!body.devCode) throw new Error(`no devCode for ${phone}: ${JSON.stringify(body)}`);
  const devCode = body.devCode;

  const r2 = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code: devCode, fullName: "Journey Tester" }),
  });
  const j = (await r2.json()) as { accessToken?: string };
  if (!j.accessToken) throw new Error(`login failed for ${phone}: ${JSON.stringify(j)}`);
  return j.accessToken;
}

const auth = (t: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });
const post = (p: string, t: string, b: unknown = {}) =>
  fetch(`${BASE}${p}`, { method: "POST", headers: auth(t), body: JSON.stringify(b) });
const get = (p: string, t: string) => fetch(`${BASE}${p}`, { headers: auth(t) });

// --- Fixture ----------------------------------------------------------------

const TAG = `journey-${randomUUID().slice(0, 8)}`;

async function setup() {
  // Reuse the seeded taxonomy — a listing needs a real compound for the publish gate —
  // but everything user-owned is created fresh under TAG.
  const area = await prisma.area.findFirst();
  const compound = await prisma.compound.findFirst({ where: { areaId: area!.id } });
  if (!area || !compound) throw new Error("run `npm run seed` first");

  const mk = (role: string, n: number) =>
    prisma.user.create({
      data: {
        // Egyptian mobiles are +20 1[0125] + 8 digits; normalisePhone rejects anything
        // else. 015 (Etisalat) is unused by the seed, so these cannot collide.
        phone: `+2015${String(Date.now()).slice(-7)}${n}`,
        fullName: `${TAG} ${role}`,
        role,
        trustLevel: 1,
        publicRef: 90000 + Math.floor(Math.random() * 9000) + n,
        phoneVerifiedAt: new Date(),
      },
    });

  const seller = await mk("owner", 1);
  const buyer = await mk("buyer", 2);
  const stranger = await mk("buyer", 3);

  const unit = await prisma.unit.create({
    data: {
      ownerId: seller.id,
      areaId: area.id,
      compoundId: compound.id,
      type: "apartment",
      bedrooms: 3,
      bathrooms: 2,
      sizeSqm: 180,
      finishing: "fully_finished",
      deliveryStatus: "ready",
      unitFingerprint: `${TAG}-fp`,
      lat: compound.centerLat,
      lng: compound.centerLng,
    },
  });

  const listing = await prisma.listing.create({
    data: {
      // Production shape (AQ-), high number so it cannot collide with the seed.
      reference: `AQ-9${Date.now().toString().slice(-5)}`,
      unitId: unit.id,
      purpose: "sale",
      price: 10_000_000,
      paymentType: "cash",
      status: "live",
      trustLevel: 3,
      titleAr: `${TAG} وحدة اختبار`,
      titleEn: `${TAG} test unit`,
      publishedAt: new Date(),
    },
  });

  return { seller, buyer, stranger, listing, unitId: unit.id };
}

async function teardown(ids: { userIds: string[]; listingId: string; unitId: string }) {
  // Children first; SQLite cascades are declared but explicit order keeps this readable.
  await prisma.offer.deleteMany({ where: { listingId: ids.listingId } });
  await prisma.deal.deleteMany({ where: { listingId: ids.listingId } });
  await prisma.message.deleteMany({ where: { conversation: { listingId: ids.listingId } } });
  await prisma.conversation.deleteMany({ where: { listingId: ids.listingId } });
  await prisma.viewingRequest.deleteMany({ where: { listingId: ids.listingId } });
  await prisma.payment.deleteMany({ where: { listingId: ids.listingId } });
  await prisma.listing.deleteMany({ where: { id: ids.listingId } });
  await prisma.unit.deleteMany({ where: { id: ids.unitId } });
  await prisma.otpCode.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
}

// --- The journey ------------------------------------------------------------

async function run() {
  const fx = await setup();
  const listingId = fx.listing.id;
  const price = fx.listing.price;

  try {
    const buyer = await login(fx.buyer.phone);
    const seller = await login(fx.seller.phone);
    const stranger = await login(fx.stranger.phone);

    section("buyer opens a negotiation");
    let r = await post("/api/offers", buyer, { listingId, amount: Number(price) * 0.9, message: "كاش." });
    let j = (await r.json()) as Record<string, unknown>;
    ok(r.status === 201, `offer created (${r.status})`);
    const offerId = j.offerId;

    section("amount validation");
    r = await post("/api/offers", buyer, { listingId, amount: 1 });
    ok(((await r.json()) as Record<string, unknown>).error === "amount_too_low", "lowball rejected");
    r = await post("/api/offers", buyer, { listingId, amount: Number(price) * 2 });
    ok(((await r.json()) as Record<string, unknown>).error === "amount_above_asking", "above-asking rejected");
    r = await post("/api/offers", buyer, { listingId, amount: Number(price) * 0.85 });
    ok(r.status === 422, "one live chain per buyer");
    r = await post("/api/offers", seller, { listingId, amount: Number(price) * 0.9 });
    ok(((await r.json()) as Record<string, unknown>).error === "own_listing", "owner cannot bid on their own unit");

    section("offer permissions");
    r = await post(`/api/offers/${offerId}`, buyer, { action: "accept" });
    ok(((await r.json()) as Record<string, unknown>).error === "not_your_turn", "buyer cannot accept own offer");
    r = await post(`/api/offers/${offerId}`, stranger, { action: "accept" });
    ok(r.status === 403, "outsider gets 403");
    r = await fetch(`${BASE}/api/offers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, amount: 1_000_000 }),
    });
    ok(r.status === 401, "anonymous gets 401");
    r = await post(`/api/offers/${offerId}`, seller, { action: "withdraw" });
    ok(
      ((await r.json()) as Record<string, unknown>).error === "cannot_withdraw_others",
      "seller cannot withdraw the buyer's offer",
    );

    section("counter and accept");
    r = await post(`/api/offers/${offerId}`, seller, { action: "counter", amount: Number(price) * 0.96 });
    j = (await r.json()) as Record<string, unknown>;
    ok(r.ok, "seller countered");
    const counterId = j.offerId;
    r = await post(`/api/offers/${offerId}`, seller, { action: "accept" });
    ok(((await r.json()) as Record<string, unknown>).error === "not_live", "superseded step is dead");
    r = await post(`/api/offers/${counterId}`, seller, { action: "accept" });
    ok(((await r.json()) as Record<string, unknown>).error === "not_your_turn", "seller cannot accept own counter");
    r = await post(`/api/offers/${counterId}`, buyer, { action: "accept" });
    j = (await r.json()) as Record<string, unknown>;
    ok(r.ok && !!j.dealReference, `buyer accepted -> ${j.dealReference}`);
    const dealRef = j.dealReference;
    // The fixture is an apartment sale: 50,000 per side under the 2026-10-02 schedule,
    // fixed onto the deal at acceptance — and the payload carries per-side figures only.
    {
      const d = (await (await get(`/api/deals/${dealRef}`, buyer)).json()) as { fee?: Record<string, number> };
      ok(d.fee?.buyer === 50_000 && d.fee?.seller === 50_000, `deal fee 50,000 per side (got ${JSON.stringify(d.fee)})`);
      ok(d.fee !== undefined && !("total" in d.fee), "no whole-deal total in the payload");
    }

    section("listing closes");
    r = await post("/api/offers", stranger, { listingId, amount: Number(price) * 0.95 });
    ok(((await r.json()) as Record<string, unknown>).error === "listing_not_open", "reserved listing refuses offers");
    const search = (await (await fetch(`${BASE}/api/listings?perPage=100`)).json()) as {
      items: { reference: string }[];
    };
    ok(!search.items.some((i) => i.reference === fx.listing.reference), "left search results");
    const linkRes = await fetch(`${BASE}/api/listings/${fx.listing.reference}`);
    ok(linkRes.status === 200, `link still resolves (got ${linkRes.status})`);

    section("deal room and reservation");
    ok((await post(`/api/deals/${dealRef}/reserve`, seller)).status === 403, "seller cannot reserve");
    ok([403, 404].includes((await post(`/api/deals/${dealRef}/reserve`, stranger)).status), "outsider cannot reserve");
    r = await post(`/api/deals/${dealRef}/reserve`, buyer);
    j = (await r.json()) as Record<string, unknown>;
    ok(r.ok && j.depositStatus === "pending", "reserved; deposit pending, not 'paid'");
    ok((await post(`/api/deals/${dealRef}/reserve`, buyer)).status === 409, "cannot reserve twice");

    section("messaging");
    r = await post("/api/conversations", buyer, { listingId, body: "السعر قابل للتفاوض؟" });
    j = (await r.json()) as Record<string, unknown>;
    const convId = j.id;
    ok(r.status === 201, "conversation created");
    let msgs = (await (await get(`/api/conversations/${convId}/messages`, seller)).json()) as {
      messages: { body: string }[];
    };
    ok(msgs.messages.length === 1, "opening question delivered");
    ok(!("senderName" in (msgs.messages[0] as object)), "no sender name in payload");

    let convs = (await (await get("/api/conversations", seller)).json()) as {
      conversations: { id: string; counterparty: Record<string, unknown> }[];
    };
    let c = convs.conversations.find((x) => x.id === convId)!;
    ok(c.counterparty.fullName === null, "name withheld before a viewing");
    ok(!String(c.counterparty.phone).includes(fx.buyer.phone.slice(-7)), "phone masked");
    ok(typeof c.counterparty.ref === "number", "pseudonymous handle present");

    r = await post(`/api/conversations/${convId}/messages`, buyer, { body: "كلمني على 01012345678" });
    j = (await r.json()) as Record<string, unknown>;
    ok(j.wasRedacted === true, "contact details redacted");
    ok(!String(j.delivered).includes("01012345678"), "number not delivered");
    ok(!!j.notice, "sender told, not silently edited");
    ok((await get(`/api/conversations/${convId}/messages`, stranger)).status === 403, "outsider cannot read thread");

    section("viewings");
    // Viewings are booked in the three daily windows only (2026-09-27), so the journey
    // must use real window starts — an arbitrary clock time is correctly refused.
    const cairoDay = (plus: number) => {
      const [y, m, d] = cairoToday().split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d + plus)).toISOString().slice(0, 10);
    };
    const slot = slotFor(cairoDay(3), "11-14")!.toISOString();
    r = await post("/api/viewings", buyer, { listingId, slots: [slot] });
    j = (await r.json()) as Record<string, unknown>;
    ok(r.status === 201, "viewing requested");
    const vId = j.id;
    ok((await post(`/api/viewings/${vId}`, buyer, { action: "accept", at: slot })).status === 422, "buyer cannot self-confirm");
    ok(
      (await post("/api/viewings", buyer, { listingId, slots: [new Date(Date.now() - 86400_000).toISOString()] }))
        .status === 422,
      "past slot rejected",
    );
    const better = slotFor(cairoDay(4), "14-18")!.toISOString();
    ok((await post(`/api/viewings/${vId}`, seller, { action: "propose", at: better })).ok, "owner proposed another time");
    r = await post(`/api/viewings/${vId}`, buyer, { action: "confirm" });
    j = (await r.json()) as Record<string, unknown>;
    ok(r.ok && j.contactUnlocked === true, "buyer confirmed; contact unlocked");

    section("contact unlocks only after a confirmed viewing");
    convs = (await (await get("/api/conversations", seller)).json()) as typeof convs;
    c = convs.conversations.find((x) => x.id === convId)!;
    ok(c.counterparty.contactUnlocked === true, "thread reports unlocked");
    ok(typeof c.counterparty.fullName === "string", "name released only now");
    ok(String(c.counterparty.phone).includes(fx.buyer.phone.slice(-7)), "real number released only now");

    ok((await post(`/api/viewings/${vId}`, seller, { action: "decline" })).status === 409, "confirmed cannot be declined");
    ok(
      (await post(`/api/viewings/${vId}`, seller, { action: "propose", at: better })).status === 409,
      "confirmed cannot be re-proposed",
    );
    ok((await post(`/api/viewings/${vId}`, seller, { action: "cancel" })).ok, "but it can be cancelled");
    ok((await post(`/api/viewings/${vId}`, seller, { action: "cancel" })).status === 409, "cancelled is terminal");
  } finally {
    await teardown({
      userIds: [fx.seller.id, fx.buyer.id, fx.stranger.id],
      listingId,
      unitId: fx.unitId,
    });
    console.log("\ncleaned up fixture");
  }
}

run()
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
