/**
 * Seed — a demo market that exercises every business rule in the brief.
 * Run: npm run seed
 */
import { seedTrades } from "./seedTrades";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_AREAS, SEED_COMPOUNDS } from "./compounds";
import { squareRing } from "../src/lib/geo";
import { buildUnitFingerprint, hashNationalId } from "../src/lib/fingerprint";
import { recomputeAllFairPrices } from "../src/lib/fairPriceService";
import { refreshCompoundCounts } from "../src/lib/catalogue";
import { slaDueFrom } from "../src/lib/sla";
import { REQUIRED_ROOMS } from "../src/lib/enums";
import { photoFor } from "./photos";
import { dealFeeTotalFor, PHOTOGRAPHY_FEE } from "../src/lib/fees";

/** Unit types where the buyer is buying the building, so the facade sells it. */
const WHOLE_PROPERTY = new Set(["villa", "townhouse", "duplex", "chalet"]);

const prisma = new PrismaClient();

// Deterministic PRNG so re-seeding produces the same demo market.
let seedState = 20260913;
function rnd(): number {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function between(min: number, max: number): number {
  return min + rnd() * (max - min);
}
function intBetween(min: number, max: number): number {
  return Math.floor(between(min, max + 1));
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400_000);
}

const OWNER_NAMES = [
  "أحمد محمود عبد الرحمن", "منى سعيد الشربيني", "كريم حسام الدين فتحي", "نورهان علي زكي",
  "محمد إبراهيم القاضي", "سارة مصطفى النجار", "عمرو خالد سليمان", "هبة فاروق عبد العزيز",
  "طارق سمير حجازي", "دينا وليد المنسي", "يوسف عادل بدران", "ريهام أشرف صابر",
  "هشام نبيل الديب", "ملك تامر رشدي", "إسلام جمال عبد الله", "نادية رفعت الأيوبي",
];
const BUYER_NAMES = [
  "مصطفى عبد الحميد", "أميرة صلاح", "زياد أنور", "ياسمين حاتم",
  "شريف عبد اللطيف", "لبنى مجدي", "أدهم رأفت", "جيهان عصام",
];

async function main() {
  console.log("Clearing…");
  // Order matters: children before parents.
  await prisma.$transaction([
    prisma.servicePayment.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.serviceVendor.deleteMany(),
    prisma.advisorMessage.deleteMany(),
    prisma.advisorSession.deleteMany(),
    prisma.dealEvent.deleteMany(),
    prisma.dealDocument.deleteMany(),
    prisma.deal.deleteMany(),
    prisma.offer.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.viewingRequest.deleteMany(),
    prisma.requestEvent.deleteMany(),
    prisma.request.deleteMany(),
    prisma.savedListing.deleteMany(),
    prisma.fairPriceEstimate.deleteMany(),
    prisma.priceHistory.deleteMany(),
    prisma.listingMedia.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.photoBooking.deleteMany(),
    prisma.kycDocument.deleteMany(),
    prisma.listing.deleteMany(),
    prisma.unit.deleteMany(),
    prisma.developerPriceList.deleteMany(),
    prisma.indexSnapshot.deleteMany(),
    prisma.compound.deleteMany(),
    prisma.area.deleteMany(),
    prisma.strike.deleteMany(),
    prisma.report.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.otpCode.deleteMany(),
    prisma.feeConfig.deleteMany(),
    prisma.fxRate.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // --- Fees (published on the public pricing page — no commission anywhere) ---
  console.log("Fees…");
  await prisma.feeConfig.createMany({
    data: [
      // TWO FEES ONLY (owner, 2026-09-19). Listing is free — there is no listing fee, no
      // featured-placement fee and no membership. See src/lib/fees.ts.
      { key: "photo_package", label: "Photography package", amount: PHOTOGRAPHY_FEE, notes: "Optional. Professional shoot + floor sketch + 360 tour, watermarked. Owners who shoot in-app pay nothing." },
      {
        key: "deal_fee",
        label: "Deal admin fee",
        // Banded by transaction value — see src/lib/fees.ts, which is the source of
        // truth. This row records the ENTRY band so the fee table has a floor figure;
        // the live amount is always computed from the schedule, never read from here.
        amount: 50000,
        notes: "Banded by transaction value (50k / 100k / 250k / 400k / 500k). Charged at deposit stage. Split between buyer and owner by agreement.",
      },
    ],
  });

  await prisma.fxRate.createMany({
    data: [
      { quote: "SAR", rate: 0.078 },
      { quote: "AED", rate: 0.076 },
      { quote: "USD", rate: 0.0207 },
      { quote: "KWD", rate: 0.0064 },
      { quote: "QAR", rate: 0.0754 },
    ],
  });

  // --- Areas & compounds ----------------------------------------------------
  console.log("Areas & compounds…");
  const areaIds: Record<string, string> = {};
  for (const a of SEED_AREAS) {
    const created = await prisma.area.create({
      data: {
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        slug: a.slug,
        city: a.city,
        isCoastal: "isCoastal" in a && a.isCoastal === true,
        centerLat: a.lat,
        centerLng: a.lng,
        geomJson: JSON.stringify({ type: "Polygon", coordinates: [squareRing(a.lat, a.lng, 9000)] }),
      },
    });
    areaIds[a.slug] = created.id;
  }

  const compoundIds: Record<string, string> = {};
  for (const c of SEED_COMPOUNDS) {
    const created = await prisma.compound.create({
      data: {
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        slug: c.slug,
        developer: c.developer,
        areaId: areaIds[c.area],
        centerLat: c.lat,
        centerLng: c.lng,
        // ~1.6km square footprint; the publish gate rejects pins outside it.
        geomJson: JSON.stringify({ type: "Polygon", coordinates: [squareRing(c.lat, c.lng, 800)] }),
        minSizeSqm: c.minSizeSqm,
        maxSizeSqm: c.maxSizeSqm,
        unitTypesJson: JSON.stringify(c.types),
        metadataJson: JSON.stringify({ sqmBenchmark: c.sqmBenchmark }),
      },
    });
    compoundIds[c.slug] = created.id;
  }

  // --- Staff & members ------------------------------------------------------
  console.log("Users…");
  const hash = await bcrypt.hash("password123", 10);
  const mk = (
    phone: string,
    fullName: string,
    role: string,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.user.create({
      data: {
        phone,
        fullName,
        role,
        passwordHash: hash,
        phoneVerifiedAt: new Date(),
        trustLevel: role === "owner" ? 2 : 1,
        ...extra,
      },
    });

  const admin = await mk("+201000000001", "عبد الرحمن عبد الله", "admin", { email: "admin@aqarsale.com", trustLevel: 4 });
  const reviewer = await mk("+201000000002", "مراجع التوثيق", "reviewer", { email: "reviewer@aqarsale.com", trustLevel: 4 });
  const advisors = [
    await mk("+201000000003", "مستشار — أحمد", "advisor", { email: "advisor1@aqarsale.com", trustLevel: 4 }),
    await mk("+201000000004", "مستشار — مريم", "advisor", { email: "advisor2@aqarsale.com", trustLevel: 4 }),
    // Gulf desk (pillar C): Sun–Thu, GMT+3
    await mk("+966500000001", "مستشار الخليج — سيف", "advisor", { email: "advisor.gulf@aqarsale.com", trustLevel: 4, countryCode: "SA", countryOfResidence: "SA", preferredCurrency: "SAR" }),
  ];
  await mk("+201000000005", "مصور — محمود", "photographer", { email: "photo@aqarsale.com", trustLevel: 4 });

  const owners = [];
  for (let i = 0; i < OWNER_NAMES.length; i++) {
    owners.push(
      await mk(`+2011000000${String(i + 10).padStart(2, "0")}`, OWNER_NAMES[i], "owner", {
        email: `owner${i + 1}@aqarsale.com`,
        nationalIdHash: hashNationalId(`2880101${String(100000 + i)}`),
        trustLevel: 2,
      }),
    );
  }

  const buyers = [];
  for (let i = 0; i < BUYER_NAMES.length; i++) {
    // Two of the buyers are diaspora, to exercise remote-buyer mode.
    const diaspora = i === 6 || i === 7;
    buyers.push(
      await mk(diaspora ? `+9715000000${i}` : `+2012000000${String(i + 10).padStart(2, "0")}`, BUYER_NAMES[i], "buyer", {
        email: `buyer${i + 1}@aqarsale.com`,
        countryOfResidence: diaspora ? "AE" : "EG",
        preferredCurrency: diaspora ? "AED" : "EGP",
        preferredChannel: diaspora ? "whatsapp" : "in_app",
      }),
    );
  }
  const investor = await mk("+201300000001", "مستثمر — عمر الشناوي", "investor", { email: "investor@aqarsale.com" });

  // --- Listings -------------------------------------------------------------
  console.log("Units & listings…");
  const FINISHINGS = ["semi_finished", "fully_finished", "furnished", "core_shell"] as const;
  const VIEWS = ["garden", "pool", "landscape", "open", "street"] as const;
  let listingCounter = 0;
  const createdListings: { id: string; compoundSlug: string; type: string; price: number; sizeSqm: number; purpose: string }[] = [];

  for (const c of SEED_COMPOUNDS) {
    const count = intBetween(4, 7);
    for (let n = 0; n < count; n++) {
      listingCounter += 1;
      const owner = owners[listingCounter % owners.length];
      /*
        Office and retail used to be filtered out here, so the seed never produced a single
        commercial unit. That was invisible until the Commercial segment tab shipped and
        rendered permanently empty. They are now generated, but sparsely — roughly one in
        five units in a compound that offers them — because that is the real mix in an
        Egyptian compound, where a few ground-floor shops sit under a lot of flats.
      */
      const residentialTypes = c.types.filter((t) => t !== "office" && t !== "retail");
      const commercialTypes = c.types.filter((t) => t === "office" || t === "retail");
      const wantsCommercial = commercialTypes.length > 0 && rnd() < 0.2;
      const type = wantsCommercial
        ? pick(commercialTypes)
        : pick(residentialTypes.length ? residentialTypes : c.types);

      const isCommercial = type === "office" || type === "retail";
      const isHouse = type === "villa" || type === "townhouse";
      const sizeSqm = Math.round(
        between(
          Math.max(c.minSizeSqm, isHouse ? 200 : c.minSizeSqm),
          Math.min(c.maxSizeSqm, isHouse ? c.maxSizeSqm : Math.min(c.maxSizeSqm, 330)),
        ),
      );
      // Commercial space is measured in floor area, not bedrooms. One WC per ~120sqm is
      // the ordinary fit-out, and zero bedrooms is the honest value rather than a fudge.
      const bedrooms = isCommercial || type === "studio" ? 0 : Math.max(1, Math.min(6, Math.round(sizeSqm / 60)));
      const bathrooms = isCommercial
        ? Math.max(1, Math.min(4, Math.round(sizeSqm / 120)))
        : Math.max(1, Math.min(5, bedrooms));
      const finishing = pick(FINISHINGS);
      const deliveryStatus = rnd() > 0.35 ? "ready" : "under_construction";
      const floor = isHouse ? 0 : intBetween(0, 8);
      const view = pick(VIEWS);
      const purpose = rnd() > 0.22 ? "sale" : "rent";

      // Price from the compound benchmark, nudged by the same factors the fair-price
      // engine uses, plus owner-specific noise so some units sit above/below fair value.
      const finishingMul = { core_shell: 0.82, semi_finished: 0.91, fully_finished: 1.0, furnished: 1.12 }[finishing];
      const deliveryMul = deliveryStatus === "ready" ? 1 : 0.88;
      const viewMul = { garden: 1.06, pool: 1.05, landscape: 1.04, open: 1.0, street: 0.96 }[view];
      const noise = between(0.86, 1.16);
      const salePrice = Math.round((c.sqmBenchmark * sizeSqm * finishingMul * deliveryMul * viewMul * noise) / 50000) * 50000;
      // Rent is roughly a 6% gross yield, monthly.
      const price = purpose === "rent" ? Math.round((salePrice * 0.06) / 12 / 500) * 500 : salePrice;

      const paymentType =
        purpose === "rent" ? "cash" : deliveryStatus === "under_construction" ? pick(["installments", "resale_installments"]) : pick(["cash", "cash", "resale_installments"]);

      const building = isHouse ? null : `B${intBetween(1, 14)}`;
      const unitNumber = isHouse ? `V${intBetween(1, 180)}` : `${intBetween(1, 9)}0${intBetween(1, 6)}`;
      const lat = c.lat + between(-0.004, 0.004);
      const lng = c.lng + between(-0.004, 0.004);

      const unit = await prisma.unit.create({
        data: {
          ownerId: owner.id,
          compoundId: compoundIds[c.slug],
          areaId: areaIds[c.area],
          unitFingerprint: buildUnitFingerprint({
            compoundId: compoundIds[c.slug],
            areaId: areaIds[c.area],
            building,
            floor,
            unitNumber,
            type,
            sizeSqm,
          }),
          building,
          floor,
          unitNumber,
          type,
          bedrooms,
          bathrooms,
          sizeSqm,
          landSqm: isHouse ? Math.round(sizeSqm * between(1.1, 1.9)) : null,
          finishing,
          deliveryStatus,
          deliveryDate: deliveryStatus === "under_construction" ? new Date(Date.now() + intBetween(200, 900) * 86400_000) : null,
          view,
          lat,
          lng,
        },
      });

      const publishedDaysAgo = intBetween(1, 150);
      // A few listings deliberately sit in the review pipeline so the admin queue is not empty.
      const status = listingCounter % 17 === 0 ? "pending_review" : listingCounter % 29 === 0 ? "closed" : "live";
      const trustLevel = status === "live" ? (rnd() > 0.3 ? 3 : 2) : 1;

      const listing = await prisma.listing.create({
        data: {
          reference: `AQ-${String(100000 + listingCounter)}`,
          unitId: unit.id,
          purpose,
          price,
          paymentType,
          installmentJson:
            paymentType === "cash"
              ? null
              : JSON.stringify({
                  downPayment: Math.round(price * 0.15),
                  monthly: Math.round((price * 0.85) / (7 * 12) / 500) * 500,
                  years: 7,
                  remainingToDeveloper: paymentType === "resale_installments" ? Math.round(price * between(0.2, 0.5)) : 0,
                }),
          status,
          trustLevel,
          publishedAt: status === "live" || status === "closed" ? daysAgo(publishedDaysAgo) : null,
          expiresAt: status === "live" ? new Date(Date.now() + 60 * 86400_000) : null,
          closedAt: status === "closed" ? daysAgo(intBetween(1, 20)) : null,
          closeReason: status === "closed" ? (purpose === "sale" ? "sold" : "rented") : null,
          titleAr: arabicHeadline({ type, finishing, deliveryStatus, view, compound: c.nameAr, floor, isHouse }),
          titleEn: enHeadline({ type, finishing, deliveryStatus, view, compound: c.nameEn, floor, isHouse }),
          descriptionAr: `وحدة ${arabicFinishing(finishing)} في ${c.nameAr}، مساحة ${sizeSqm} م²${bedrooms ? `، ${bedrooms} غرف نوم و${bathrooms} حمام` : ""}. ${deliveryStatus === "ready" ? "استلام فوري" : "تحت الإنشاء"}. الإعلان من المالك مباشرة وموثق بمستند ملكية وصور ملتقطة داخل التطبيق.`,
          descriptionEn: `${enFinishing(finishing)} ${enType(type).toLowerCase()} in ${c.nameEn}, ${sizeSqm} sqm${bedrooms ? `, ${bedrooms} bedrooms and ${bathrooms} bathrooms` : ""}. ${deliveryStatus === "ready" ? "Ready to move." : "Under construction."} Listed directly by the owner, with verified ownership documents and in-app captured photos.`,
          views: status === "live" ? intBetween(20, 1400) : intBetween(5, 80),
          createdAt: daysAgo(publishedDaysAgo + 3),
        },
      });

      createdListings.push({ id: listing.id, compoundSlug: c.slug, type, price, sizeSqm, purpose });

      // Media — 6 required rooms plus a couple of extras, all in-app with GPS.
      //
      // One is flagged as the cover (src/lib/cover.ts). A villa buyer is buying the
      // building, so the facade leads; an apartment's facade is a shared block that looks
      // like every other block in the compound, so the living room leads. Randomised
      // around that because real owners do not all choose alike, and a results page where
      // every card is the same room reads as stock photography.
      const coverRoll = rnd();
      const coverRoom = WHOLE_PROPERTY.has(type)
        ? coverRoll < 0.6
          ? "facade"
          : coverRoll < 0.8
            ? "living"
            : "view"
        : coverRoll < 0.55
          ? "living"
          : coverRoll < 0.8
            ? "view"
            : "kitchen";
      const mediaData = REQUIRED_ROOMS.map((room, idx) => ({
        listingId: listing.id,
        // Room-appropriate photography: the "kitchen" shot is a kitchen.
        fileKey: photoFor(room, listingCounter + idx).full,
        thumbKey: photoFor(room, listingCounter + idx).thumb,
        phash: `${listingCounter.toString(16).padStart(4, "0")}${idx.toString(16)}${Math.floor(rnd() * 1e10).toString(16)}`,
        gpsLat: lat + between(-0.0004, 0.0004),
        gpsLng: lng + between(-0.0004, 0.0004),
        capturedAt: daysAgo(publishedDaysAgo + 4),
        source: rnd() > 0.75 ? "photographer" : "in_app",
        room,
        isVerified: true,
        isWatermarked: true,
        isCover: room === coverRoom,
        sortOrder: idx,
      }));
      await prisma.listingMedia.createMany({ data: mediaData });

      // Financial obligations that transfer with the unit (Section 5, True Cost).
      //
      // Deliberately mixed: some owners have declared everything, some have declared
      // nothing. The cost panel has to handle both, and a seed where every unit is
      // fully declared would hide the "not yet known" path entirely.
      if (rnd() > 0.25) {
        const onInstalments = deliveryStatus !== "ready" || rnd() > 0.6;
        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            remainingToDeveloper: onInstalments ? Math.round((price * between(0.05, 0.25)) / 1000) * 1000 : 0,
            maintenanceDue: rnd() > 0.7 ? Math.round(between(20000, 160000) / 1000) * 1000 : 0,
            obligationsDeclaredAt: daysAgo(publishedDaysAgo),
          },
        });
      }

      // Price history — some owners have cut their ask, which the listing page shows.
      const history = [{ listingId: listing.id, price, kind: "ask", changedAt: daysAgo(publishedDaysAgo) }];
      if (rnd() > 0.6 && status === "live") {
        history.unshift({
          listingId: listing.id,
          price: Math.round((price * between(1.04, 1.15)) / 50000) * 50000,
          kind: "ask",
          changedAt: daysAgo(publishedDaysAgo + 30),
        });
      }
      if (status === "closed") {
        history.push({ listingId: listing.id, price: Math.round(price * between(0.9, 0.99)), kind: "closed", changedAt: daysAgo(intBetween(1, 20)) });
      }
      await prisma.priceHistory.createMany({ data: history });

      // Ownership doc + ID docs, extracted and approved.
      await prisma.kycDocument.createMany({
        data: [
          {
            userId: owner.id,
            listingId: listing.id,
            type: pick(["contract", "deed", "allocation"]),
            fileKey: `docs/${listing.id}/ownership.pdf`,
            status: status === "pending_review" ? "pending" : "approved",
            reviewerId: status === "pending_review" ? null : reviewer.id,
            reviewedAt: status === "pending_review" ? null : daysAgo(publishedDaysAgo + 1),
            extractedJson: JSON.stringify({
              ownerName: owner.fullName,
              compoundName: c.nameAr,
              building,
              unitNumber,
              sizeSqm,
              unitType: type,
              isSigned: true,
              isPhotocopy: false,
              documentDate: daysAgo(intBetween(400, 2000)).toISOString().slice(0, 10),
            }),
          },
        ],
      });

      // Listing admin fee, paid.
      if (status !== "pending_review") {
        await prisma.payment.create({
          data: {
            userId: owner.id,
            listingId: listing.id,
            purpose: "listing_fee",
            provider: "paymob",
            amount: 750,
            status: "paid",
            providerRef: `PMB-${listingCounter}${intBetween(1000, 9999)}`,
            paidAt: daysAgo(publishedDaysAgo + 1),
          },
        });
      }
    }
  }
  console.log(`  ${createdListings.length} listings`);

  // --- Developer price lists (ops-maintained, every row carries source + date) ---
  console.log("Developer price lists…");
  for (const c of SEED_COMPOUNDS) {
    // Developers sell primary above resale; that gap is the buyer-side hook.
    for (const unitType of c.types.slice(0, 3)) {
      const sizeMin = Math.round(c.minSizeSqm);
      const sizeMax = Math.round(Math.min(c.maxSizeSqm, c.minSizeSqm * 2.2));
      const midSize = (sizeMin + sizeMax) / 2;
      await prisma.developerPriceList.create({
        data: {
          compoundId: compoundIds[c.slug],
          unitType,
          sizeMin,
          sizeMax,
          bedrooms: Math.max(1, Math.round(midSize / 60)),
          cashPrice: Math.round((c.sqmBenchmark * 1.18 * midSize) / 50000) * 50000,
          installmentJson: JSON.stringify({ downPaymentPct: 10, years: 8, quarterly: true }),
          deliveryDate: new Date(Date.now() + intBetween(300, 1400) * 86400_000),
          isAvailable: rnd() > 0.25,
          source: `${c.developer} price sheet (ZONE)`,
          effectiveDate: daysAgo(intBetween(5, 40)),
        },
      });
    }
  }

  // --- Fair price estimates, via the same service the app uses --------------
  console.log("Fair price estimates…");
  const fairStats = await recomputeAllFairPrices();
  console.log(`  computed ${fairStats.computed}, skipped ${fairStats.skipped} (too few comparables)`);

  // --- Denormalised catalogue counters --------------------------------------
  // Compound.liveListingCount is maintained incrementally by onListingVisibilityChanged(),
  // which the seed bypasses by writing listings directly. Without this the counter stays
  // at 0 on a freshly seeded database and the home page's compounds rail — gated on
  // `liveListingCount > 0` — renders nothing until the nightly repair job happens to run.
  console.log("Catalogue counters…");
  const counted = await refreshCompoundCounts();
  console.log(`  ${counted} compounds counted`);

  const liveListings = await prisma.listing.findMany({ where: { status: "live" }, include: { unit: true } });

  // --- Buyer requests, across the whole SLA spectrum ------------------------
  console.log("Requests…");
  const requestable = liveListings.slice(0, 40);
  const statuses = ["received", "assigned", "contacted", "viewing_scheduled", "offer", "deal", "closed"];
  for (let i = 0; i < 18; i++) {
    const buyer = buyers[i % buyers.length];
    const isUnitRequest = i % 3 !== 0;
    const listing = requestable[i % requestable.length];
    // Spread the queue across the SLA spectrum so the advisor view is realistic:
    // fresh requests still inside the window, two urgent, two already breached.
    const breached = i === 1 || i === 2;
    const urgent = i === 3 || i === 4;
    const awaitingResponse = i < 8;
    const hoursAgo = breached ? 30 : urgent ? 21 : awaitingResponse ? intBetween(1, 10) : intBetween(24, 24 * 12);
    const createdAt = new Date(Date.now() - hoursAgo * 3600_000);
    const status = awaitingResponse ? (i === 0 ? "received" : "assigned") : pick(statuses);
    const advisor = status === "received" ? null : advisors[i % advisors.length];
    const slaBase = createdAt;

    const request = await prisma.request.create({
      data: {
        reference: `RQ-${String(100000 + i + 1)}`,
        type: isUnitRequest ? "unit" : "open",
        listingId: isUnitRequest ? listing.id : null,
        buyerId: buyer.id,
        profileJson: JSON.stringify({
          purpose: pick(["live", "invest", "rent_out"]),
          budgetMin: Math.round(Number(listing.price) * 0.8),
          budgetMax: Math.round(Number(listing.price) * 1.15),
          areas: [pick(SEED_AREAS).slug],
          bedrooms: intBetween(2, 4),
          paymentType: pick(["cash", "installments", "resale_installments"]),
          timeline: pick(["immediate", "3_months", "6_months"]),
        }),
        assignedAdvisorId: advisor?.id ?? null,
        assignedAt: advisor ? new Date(slaBase.getTime() + 4 * 60_000) : null,
        slaDueAt: slaDueFrom(slaBase),
        // Requests still inside (or past) their window have not been answered yet — that
        // is what the countdown and the escalation job act on.
        firstResponseAt: awaitingResponse ? null : new Date(slaBase.getTime() + intBetween(20, 800) * 60_000),
        slaBreachedAt: breached ? new Date(slaBase.getTime() + 24 * 3600_000) : null,
        escalatedAt: breached ? new Date(slaBase.getTime() + 24 * 3600_000) : null,
        status,
        createdAt,
      },
    });

    await prisma.requestEvent.create({
      data: { requestId: request.id, actorId: buyer.id, event: "created", note: isUnitRequest ? "Unit request" : "Open request", createdAt },
    });
    if (advisor) {
      await prisma.requestEvent.create({
        data: { requestId: request.id, actorId: advisor.id, event: "assigned", createdAt: new Date(slaBase.getTime() + 4 * 60_000) },
      });
    }
    if (breached) {
      await prisma.requestEvent.create({
        data: { requestId: request.id, event: "sla_breached", note: "Escalated to manager; apology sent to buyer.", createdAt: new Date(slaBase.getTime() + 24 * 3600_000) },
      });
    }
  }

  // --- Saved listings, a report, a deal -------------------------------------
  for (let i = 0; i < 12; i++) {
    await prisma.savedListing.create({
      data: { userId: buyers[i % buyers.length].id, listingId: liveListings[(i * 7) % liveListings.length].id },
    }).catch(() => {});
  }

  await prisma.report.create({
    data: {
      reporterId: buyers[0].id,
      targetUserId: owners[3].id,
      listingId: liveListings[5].id,
      reason: "contacted_by_broker",
      detail: "اتصل بيا حد قال إنه مسوق للوحدة مش المالك.",
      status: "open",
    },
  });

  // Pseudonymous handles (Section 6). Seeded users need one or every counterparty
  // renders as "مشتري موثق" with no number.
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  let refSeq = 1000;
  for (const u of allUsers) {
    await prisma.user.update({ where: { id: u.id }, data: { publicRef: refSeq++ } });
  }

  const dealListing = liveListings[3];
  const sellerOf = async (listingId: string) => {
    const row = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { unit: { select: { ownerId: true } } },
    });
    return row!.unit.ownerId;
  };
  const dealSellerId = await sellerOf(dealListing.id);

  const offer = await prisma.offer.create({
    data: {
      listingId: dealListing.id,
      buyerId: buyers[1].id,
      sellerId: dealSellerId,
      direction: "buyer",
      amount: Math.round(Number(dealListing.price) * 0.95),
      status: "accepted",
      respondedAt: daysAgo(6),
    },
  });
  /*
    Live negotiations, so the offers inbox is not empty on first run and every state the
    UI renders has an example: a fresh offer waiting on the seller, a seller counter
    waiting on the buyer, and a rejected chain.
  */
  const negotiationListings = liveListings.slice(6, 9);
  for (let i = 0; i < negotiationListings.length; i++) {
    const nl = negotiationListings[i];
    const nsSeller = await sellerOf(nl.id);
    const nsBuyer = buyers[i % buyers.length];
    if (nsBuyer.id === nsSeller) continue;

    const opening = await prisma.offer.create({
      data: {
        listingId: nl.id,
        buyerId: nsBuyer.id,
        sellerId: nsSeller,
        direction: "buyer",
        amount: Math.round(Number(nl.price) * 0.88),
        message: "جاهز أتحرك بسرعة، كاش.",
        currency: "EGP",
        expiresAt: new Date(Date.now() + 7 * 86400_000),
        status: i === 0 ? "pending" : i === 1 ? "countered" : "rejected",
        respondedAt: i === 0 ? null : daysAgo(1),
        createdAt: daysAgo(3),
      },
    });

    // The middle one has a seller counter outstanding, so the buyer has a move to make.
    if (i === 1) {
      await prisma.offer.create({
        data: {
          listingId: nl.id,
          buyerId: nsBuyer.id,
          sellerId: nsSeller,
          direction: "seller",
          amount: Math.round(Number(nl.price) * 0.95),
          message: "أقل حاجة أقدر أنزلها.",
          currency: "EGP",
          parentOfferId: opening.id,
          expiresAt: new Date(Date.now() + 5 * 86400_000),
          status: "pending",
          createdAt: daysAgo(1),
        },
      });
    }
  }

  const deal = await prisma.deal.create({
    data: {
      reference: "DL-100001",
      listingId: dealListing.id,
      buyerId: buyers[1].id,
      sellerId: dealSellerId,
      agreedPrice: offer.amount,
      offerId: offer.id,
      advisorId: advisors[0].id,
      stage: "deposit_held",
      adminFee: dealFeeTotalFor(
        await prisma.listing
          .findUniqueOrThrow({ where: { id: dealListing.id }, select: { purpose: true, unit: { select: { type: true } } } })
          .then((l) => ({ purpose: l.purpose, unitType: l.unit.type, amount: Number(offer.amount) })),
      ),
      depositAmount: 250000,
      depositStatus: "held",
      depositProviderRef: "ESCROW-DEMO-0001",
      checklistJson: JSON.stringify([
        { key: "ownership_chain", label: "سلسلة الملكية", done: true },
        { key: "developer_clearance", label: "خطاب إخلاء طرف من المطور", done: false },
        { key: "utilities", label: "المرافق", done: false },
        { key: "hoa_dues", label: "مستحقات الصيانة", done: false },
      ]),
    },
  });
  await prisma.dealEvent.createMany({
    data: [
      { dealId: deal.id, event: "offer_accepted", actorId: advisors[0].id },
      { dealId: deal.id, event: "deposit_held", note: "Deposit held with licensed partner.", actorId: advisors[0].id },
    ],
  });

  // --- Service vendors (finishing & furnishing) -----------------------------
  await prisma.serviceVendor.createMany({
    data: [
      { name: "Concept Contracting", category: "finishing", rating: 4.6, areasJson: JSON.stringify(["new-cairo", "mostakbal-city"]) },
      { name: "Beit El Mobilia", category: "furnishing", rating: 4.4, areasJson: JSON.stringify(["new-cairo", "6th-october", "sheikh-zayed"]) },
      { name: "Studio Rakeen", category: "interior_design", rating: 4.8, areasJson: JSON.stringify(["new-cairo", "sheikh-zayed"]) },
      { name: "October Finishing Works", category: "finishing", rating: 4.1, areasJson: JSON.stringify(["6th-october", "sheikh-zayed"]) },
    ],
  });

  // --- PropShop Index — immutable monthly snapshots ------------------------
  console.log("Index snapshots…");
  const now = new Date();
  for (let monthsBack = 5; monthsBack >= 0; monthsBack--) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    for (const c of SEED_COMPOUNDS) {
      for (const unitType of ["apartment", "villa"]) {
        if (!c.types.includes(unitType)) continue;
        const sample = intBetween(4, 26);
        if (sample < 8) continue; // minimum sample rule — below this we publish area level only
        // Gentle month-on-month drift so the index charts are readable.
        const drift = 1 + (5 - monthsBack) * between(0.012, 0.026);
        const askSqm = Math.round(c.sqmBenchmark * drift);
        await prisma.indexSnapshot.create({
          data: {
            period,
            compoundId: compoundIds[c.slug],
            areaId: areaIds[c.area],
            unitType,
            purpose: "sale",
            medianAskSqm: askSqm,
            medianCloseSqm: Math.round(askSqm * between(0.93, 0.985)),
            sampleSize: sample,
            rentYield: Number(between(0.048, 0.082).toFixed(4)),
            devGapPct: Number(between(6, 24).toFixed(2)),
          },
        }).catch(() => {});
      }
    }
  }

  const counts = {
    users: await prisma.user.count(),
    compounds: await prisma.compound.count(),
    listings: await prisma.listing.count(),
    live: await prisma.listing.count({ where: { status: "live" } }),
    media: await prisma.listingMedia.count(),
    requests: await prisma.request.count(),
    fairPrice: await prisma.fairPriceEstimate.count(),
    devPrices: await prisma.developerPriceList.count(),
    index: await prisma.indexSnapshot.count(),
  };
  console.log("Done:", counts);
  console.log("\nDemo logins (password123):");
  console.log("  admin@aqarsale.com     admin");
  console.log("  reviewer@aqarsale.com  verification queue");
  console.log("  advisor1@aqarsale.com  advisor queue (24h SLA)");
  console.log("  owner1@aqarsale.com    owner with live listings");
  console.log("  buyer1@aqarsale.com    buyer with requests");
  console.log("  investor@aqarsale.com  opportunities desk");
  void admin;
  void investor;
}


/**
 * A card headline should add information, not repeat the spec row beside it. These read
 * like the descriptive first line a real owner writes.
 */
function arabicHeadline(u: {
  type: string; finishing: string; deliveryStatus: string; view: string | null;
  compound: string; floor: number | null; isHouse: boolean;
}): string {
  const viewAr: Record<string, string> = {
    garden: "على الحديقة", pool: "على حمام السباحة", landscape: "على اللاندسكيب",
    sea: "على البحر", open: "بإطلالة مفتوحة", street: "على الشارع",
  };
  const bits: string[] = [];
  if (u.finishing === "furnished") bits.push("مفروشة بالكامل");
  else if (u.finishing === "fully_finished") bits.push("تشطيب سوبر لوكس");
  else if (u.finishing === "core_shell") bits.push("على المحارة");
  if (u.view && viewAr[u.view]) bits.push(viewAr[u.view]);
  if (!u.isHouse && u.floor !== null && u.floor <= 0) bits.push("دور أرضي بحديقة");
  if (u.deliveryStatus === "ready") bits.push("استلام فوري");
  else bits.push("تحت الإنشاء");
  return `${bits.join(" · ")} في ${u.compound}`;
}

function enHeadline(u: {
  type: string; finishing: string; deliveryStatus: string; view: string | null;
  compound: string; floor: number | null; isHouse: boolean;
}): string {
  const viewEn: Record<string, string> = {
    garden: "garden view", pool: "pool view", landscape: "landscape view",
    sea: "sea view", open: "open view", street: "street view",
  };
  const bits: string[] = [];
  if (u.finishing === "furnished") bits.push("Fully furnished");
  else if (u.finishing === "fully_finished") bits.push("Super lux finishing");
  else if (u.finishing === "core_shell") bits.push("Core and shell");
  if (u.view && viewEn[u.view]) bits.push(viewEn[u.view]);
  if (!u.isHouse && u.floor !== null && u.floor <= 0) bits.push("ground floor with garden");
  bits.push(u.deliveryStatus === "ready" ? "ready to move" : "under construction");
  const head = bits.join(" · ");
  return `${head.charAt(0).toUpperCase()}${head.slice(1)} in ${u.compound}`;
}

function enType(t: string) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function arabicFinishing(f: string) {
  return { core_shell: "على المحارة", semi_finished: "نصف تشطيب", fully_finished: "تشطيب كامل", furnished: "مفروشة" }[f] ?? f;
}
function enFinishing(f: string) {
  return { core_shell: "Core & shell", semi_finished: "Semi-finished", fully_finished: "Fully finished", furnished: "Furnished" }[f] ?? f;
}

main()
  // Demo trade listings go in last: they need live, verified listings to exist.
  .then(async () => console.log(`opened ${await seedTrades(prisma)} demo units to trade`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
