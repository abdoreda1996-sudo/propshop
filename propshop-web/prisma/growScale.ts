/**
 * Grows a COPY of the database to the target scale for load testing.
 *
 *   DATABASE_URL=file:./bench.db npx tsx prisma/growScale.ts
 *
 * Refuses to run against dev.db. Shapes the data like the real thing rather than piling
 * rows onto a few units: 200,000 users, ~12,000 owners holding 20,000 units (max 3 each,
 * the listing cap), one live listing per unit, and per-user activity — offers, viewings,
 * trades, conversations, saved listings — so every per-user query has real fan-out.
 *
 * Load-test logins: bench{n}@load.test / password123 (n = 0…199,999).
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("bench")) {
  console.error(`refusing to grow ${url || "(default)"} — point DATABASE_URL at a bench copy`);
  process.exit(1);
}
const prisma = new PrismaClient();

const USERS = 200_000;
const OWNERS = 12_000;
const UNITS = 20_000;
const OFFERS = 30_000;
const VIEWINGS = 20_000;
const TRADE_OPEN = 2_000;
const TRADE_OFFERS = 3_000;
const CONVERSATIONS = 10_000;
const MESSAGES_PER_CONV = 5;
const SAVED = 40_000;

const id = () => "g" + randomBytes(12).toString("hex");
const pick = <T>(a: readonly T[], i: number) => a[i % a.length];
const TYPES = ["apartment", "apartment", "apartment", "villa", "townhouse", "duplex", "studio", "chalet"] as const;
const FINISH = ["core_shell", "semi_finished", "fully_finished", "furnished"] as const;
const ROOMS = ["living", "bedroom", "kitchen", "bathroom", "facade", "view"] as const;

async function batched<T>(label: string, total: number, make: (i: number) => T, write: (rows: T[]) => Promise<unknown>, size = 2000) {
  for (let i = 0; i < total; i += size) {
    const rows: T[] = [];
    for (let j = i; j < Math.min(total, i + size); j++) rows.push(make(j));
    await write(rows);
    process.stdout.write(`\r  ${label} ${Math.min(total, i + size)}/${total}`);
  }
  process.stdout.write("\n");
}

async function main() {
  if ((await prisma.user.count({ where: { email: { endsWith: "@load.test" } } })) > 0) {
    console.log("already grown");
    return;
  }
  const t0 = Date.now();
  const hash = await bcrypt.hash("password123", 10); // one hash for all load users
  const compounds = await prisma.compound.findMany({ select: { id: true, areaId: true, centerLat: true, centerLng: true, minSizeSqm: true } });
  const photo = await prisma.listingMedia.findFirst({ select: { fileKey: true, thumbKey: true } });

  const userIds: string[] = Array.from({ length: USERS }, id);
  const startRef = 300_000 + (await prisma.user.count());
  await batched("users", USERS, (i) => ({
    id: userIds[i],
    phone: `+2012${String(10_000_000 + i).slice(-8)}`,
    email: `bench${i}@load.test`,
    passwordHash: hash,
    fullName: `Load User ${i}`,
    role: i < OWNERS ? "owner" : "buyer",
    trustLevel: i < OWNERS ? 2 : 0,
    publicRef: startRef + i,
  }), (rows) => prisma.user.createMany({ data: rows }));

  const unitIds: string[] = Array.from({ length: UNITS }, id);
  const listingIds: string[] = Array.from({ length: UNITS }, id);
  const ownerOf = (u: number) => userIds[u % OWNERS]; // 12k owners, ≤2 units each
  await batched("units", UNITS, (i) => {
    const c = pick(compounds, i);
    return {
      id: unitIds[i],
      ownerId: ownerOf(i),
      compoundId: c.id,
      areaId: c.areaId,
      unitFingerprint: "bench" + unitIds[i],
      building: `B${i % 40}`,
      floor: i % 12,
      unitNumber: String(i),
      type: pick(TYPES, i),
      bedrooms: 1 + (i % 5),
      bathrooms: 1 + (i % 3),
      sizeSqm: (c.minSizeSqm ?? 90) + (i % 150),
      finishing: pick(FINISH, i),
      deliveryStatus: i % 4 === 0 ? "under_construction" : "ready",
      lat: c.centerLat,
      lng: c.centerLng,
    };
  }, (rows) => prisma.unit.createMany({ data: rows }));

  await batched("listings", UNITS, (i) => ({
    id: listingIds[i],
    reference: `AQ-${700_000 + i}`,
    unitId: unitIds[i],
    purpose: i % 7 === 0 ? "rent" : "sale",
    price: i % 7 === 0 ? 20_000 + (i % 90) * 1000 : 3_000_000 + (i % 400) * 75_000,
    paymentType: pick(["cash", "installments", "resale_installments"] as const, i),
    status: "live",
    trustLevel: 3,
    titleAr: `وحدة ${i}`,
    titleEn: `Unit ${i}`,
    publishedAt: new Date(Date.now() - (i % 180) * 86_400_000),
    expiresAt: new Date(Date.now() + 40 * 86_400_000),
    openToTrade: i < TRADE_OPEN,
    locationStatus: "verified",
  }), (rows) => prisma.listing.createMany({ data: rows }));

  // Two photos per listing (cover + one more) — enough for every card/detail query shape.
  await batched("media", UNITS * 2, (k) => ({
    id: id(),
    listingId: listingIds[k >> 1],
    fileKey: photo?.fileKey ?? "https://picsum.photos/1200/800",
    thumbKey: photo?.thumbKey ?? null,
    source: "in_app",
    room: pick(ROOMS, k),
    isVerified: true,
    isCover: k % 2 === 0,
    sortOrder: k % 2,
  }), (rows) => prisma.listingMedia.createMany({ data: rows }), 4000);

  await batched("trade prefs", TRADE_OPEN, (i) => ({
    id: id(),
    listingId: listingIds[i],
    typesJson: JSON.stringify([pick(TYPES, i + 3)]),
    areaIdsJson: "[]",
    cash: pick(["either", "i_pay", "i_receive", "none"] as const, i),
  }), (rows) => prisma.tradePreference.createMany({ data: rows }));

  const buyer = (i: number) => userIds[OWNERS + (i * 7919) % (USERS - OWNERS)];
  const now = Date.now();
  await batched("offers", OFFERS, (i) => {
    const l = (i * 13) % UNITS;
    return {
      id: id(),
      listingId: listingIds[l],
      buyerId: buyer(i),
      sellerId: ownerOf(l),
      direction: i % 3 === 0 ? "seller" : "buyer",
      amount: 3_000_000 + (i % 300) * 50_000,
      status: pick(["pending", "pending", "rejected", "countered", "withdrawn"] as const, i),
      expiresAt: new Date(now + ((i % 20) - 5) * 86_400_000),
    };
  }, (rows) => prisma.offer.createMany({ data: rows }));

  await batched("viewings", VIEWINGS, (i) => ({
    id: id(),
    listingId: listingIds[(i * 17) % UNITS],
    buyerId: buyer(i + 1),
    slotsJson: JSON.stringify([new Date(now + 3 * 86_400_000).toISOString()]),
    status: pick(["requested", "proposed", "accepted", "declined", "completed", "cancelled"] as const, i),
    scheduledAt: i % 6 === 2 ? new Date(now + ((i % 10) - 3) * 86_400_000) : null,
  }), (rows) => prisma.viewingRequest.createMany({ data: rows }));

  await batched("trade offers", TRADE_OFFERS, (i) => {
    const target = i % TRADE_OPEN;
    return {
      id: id(),
      reference: `TR-${800_000 + i}`,
      targetListingId: listingIds[target],
      proposerId: ownerOf(TRADE_OPEN + i),
      recipientId: ownerOf(target),
      status: pick(["pending", "rejected", "withdrawn", "pending"] as const, i),
      expiresAt: new Date(now + ((i % 14) - 3) * 86_400_000),
    };
  }, (rows) => prisma.tradeOffer.createMany({ data: rows }));
  const tos = await prisma.tradeOffer.findMany({ where: { reference: { startsWith: "TR-8" } }, select: { id: true, reference: true } });
  await prisma.tradeOfferUnit.createMany({
    data: tos.map((t) => ({ id: id(), tradeOfferId: t.id, listingId: listingIds[TRADE_OPEN + (Number(t.reference.slice(3)) - 800_000)] })),
  });

  const convIds = Array.from({ length: CONVERSATIONS }, id);
  await batched("conversations", CONVERSATIONS, (i) => {
    const l = (i * 23) % UNITS;
    return { id: convIds[i], listingId: listingIds[l], ownerId: ownerOf(l), buyerId: buyer(i + 2) };
  }, (rows) => prisma.conversation.createMany({ data: rows }));
  await batched("messages", CONVERSATIONS * MESSAGES_PER_CONV, (k) => {
    const c = k % CONVERSATIONS;
    const l = (c * 23) % UNITS;
    return {
      id: id(),
      conversationId: convIds[c],
      senderId: k % 2 ? ownerOf(l) : buyer(c + 2),
      body: "رسالة تجريبية",
      readAt: k % 3 === 0 ? null : new Date(),
    };
  }, (rows) => prisma.message.createMany({ data: rows }), 5000);

  await batched("saved", SAVED, (i) => ({ id: id(), userId: buyer(i * 3), listingId: listingIds[(i * 31) % UNITS] }),
    (rows) => prisma.savedListing.createMany({ data: rows }));

  console.log(`grown in ${Math.round((Date.now() - t0) / 1000)}s:`, {
    users: await prisma.user.count(),
    listings: await prisma.listing.count({ where: { status: "live" } }),
    offers: await prisma.offer.count(),
    viewings: await prisma.viewingRequest.count(),
    trades: await prisma.tradeOffer.count(),
    messages: await prisma.message.count(),
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
