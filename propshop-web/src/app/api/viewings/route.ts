import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { viewingsOfUserWhere } from "@/lib/viewingQueries";
import { ok, fail, requireUser, rateLimit, clientIp, audit } from "@/lib/api";
import { VIEWABLE_LISTING_WHERE } from "@/lib/listings";
import { LIST_PAGE } from "@/lib/enums";
import { parseSlot, describeSlot } from "@/lib/viewingSlots";

/**
 * Viewings (Section 12) — arranged entirely inside the platform.
 *
 * The buyer proposes slots; the owner accepts one, declines, or proposes another. No
 * phone number is exchanged to set it up, which is the whole point: `contactUnlockedAt`
 * on the row is what later permits an exchange, and only once a slot is confirmed.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const me = auth.user.id;

  const rows = await prisma.viewingRequest.findMany({
    where: await viewingsOfUserWhere(me),
    include: {
      listing: {
        select: { id: true, reference: true, titleAr: true, titleEn: true, unit: { select: { ownerId: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_PAGE,
  });

  return ok({
    viewings: rows.map((v) => ({
      id: v.id,
      listing: {
        reference: v.listing.reference,
        titleAr: v.listing.titleAr,
        titleEn: v.listing.titleEn,
      },
      role: v.buyerId === me ? "buyer" : "seller",
      status: v.status,
      slots: JSON.parse(v.slotsJson || "[]") as string[],
      proposedAt: v.proposedAt,
      scheduledAt: v.scheduledAt,
      // Day + window labels in Cairo time, so no client does timezone maths.
      slotViews: (JSON.parse(v.slotsJson || "[]") as string[]).map((s) => describeSlot(s)),
      proposedView: v.proposedAt ? describeSlot(v.proposedAt) : null,
      scheduledView: v.scheduledAt ? describeSlot(v.scheduledAt) : null,
      createdAt: v.createdAt,
    })),
  });
}

/** POST /api/viewings — the buyer proposes up to three slots. */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  if (!await rateLimit(`viewing:${auth.user.id}:${clientIp(req)}`, 10, 60 * 60_000)) {
    return fail("rate_limited", 429);
  }

  const b = await req.json().catch(() => ({}));
  const listingId = typeof b.listingId === "string" ? b.listingId : "";
  // Each slot is {date, window} (or an ISO window start): one of the three daily windows.
  const slots: unknown[] = Array.isArray(b.slots) ? b.slots.slice(0, 3) : [];

  if (!listingId) return fail("listing_required", 422);
  if (slots.length === 0) {
    return fail("slots_required", 422, {
      messageAr: "اختار ميعاد واحد على الأقل.",
      messageEn: "Pick at least one time.",
    });
  }

  // Every slot must be one of the three daily windows and start in the future; a past
  // viewing request is noise the owner has to read and decline.
  const now = Date.now();
  const maybe = slots.map(parseSlot);
  if (maybe.some((d) => d === null)) {
    return fail("slots_invalid", 422, {
      messageAr: "اختار من الفترات المتاحة: 11 ص – 2 م، 2 م – 6 م، أو 6 م – 9 م.",
      messageEn: "Pick one of the available windows: 11 AM – 2 PM, 2 PM – 6 PM or 6 PM – 9 PM.",
    });
  }
  const parsed = [...new Map((maybe as Date[]).map((d) => [d.getTime(), d])).values()];
  if (parsed.some((d) => d.getTime() <= now)) {
    return fail("slots_invalid", 422, {
      messageAr: "المواعيد لازم تكون في المستقبل.",
      messageEn: "Viewing times must be in the future.",
    });
  }

  const listing = await prisma.listing.findFirst({
    where: { AND: [VIEWABLE_LISTING_WHERE, { id: listingId }] },
    select: { id: true, unit: { select: { ownerId: true } } },
  });
  if (!listing) return fail("not_found", 404);

  if (listing.unit.ownerId === auth.user.id) {
    return fail("own_listing", 422, {
      messageAr: "دي وحدتك.",
      messageEn: "This is your own property.",
    });
  }

  // One open request per buyer per listing: re-proposing should replace, not pile up.
  const existing = await prisma.viewingRequest.findFirst({
    where: { listingId, buyerId: auth.user.id, status: { in: ["requested", "proposed"] } },
    select: { id: true },
  });

  const data = { slotsJson: JSON.stringify(parsed.map((d) => d.toISOString())), status: "requested" };
  const viewing = existing
    ? await prisma.viewingRequest.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.viewingRequest.create({
        data: { listingId, buyerId: auth.user.id, ...data },
        select: { id: true },
      });

  await audit(auth.user.id, "viewing.request", "viewing", viewing.id, { listingId, slots: parsed.length });
  return ok({ id: viewing.id }, { status: 201 });
}
