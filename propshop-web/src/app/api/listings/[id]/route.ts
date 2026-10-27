import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser } from "@/lib/api";
import { getListingByReference } from "@/lib/listings";
import { parseJson } from "@/lib/json";
import { toPreference, preferenceView } from "@/lib/tradeService";

/**
 * GET /api/listings/[id] — public listing detail for the Flutter client.
 *
 * `id` accepts either the cuid or the human reference (AQ-100123). It returns exactly
 * what the SSR listing page shows, so the two clients cannot disagree: the three prices,
 * the media, and the price history.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  /*
    Resolve either form to a reference, then let getListingByReference apply the
    visibility rule.

    This used to test `/^AQ-/` to decide whether the parameter was a reference or a cuid,
    which silently 404s any listing whose reference uses a different prefix. The prefix
    is generated in one place (nextReference) and nothing else should have to know it, so
    look the row up by either column instead.
  */
  const row = await prisma.listing.findFirst({
    where: { OR: [{ id }, { reference: id }] },
    select: { reference: true },
  });
  if (!row) return fail("not_found", 404);
  const reference = row.reference;

  const data = await getListingByReference(reference);
  if (!data) return fail("not_found", 404);

  const { listing, fair, developer, verdict, developerGap } = data;
  const installment = parseJson<Record<string, number> | null>(listing.installmentJson, null);

  // Trade block: present only while the unit can actually be traded for.
  const tradeOpen = listing.openToTrade && listing.status === "live";
  const trade = tradeOpen
    ? { open: true, wants: await preferenceView(toPreference(await prisma.tradePreference.findUnique({ where: { listingId: listing.id } }))) }
    : { open: false, wants: null };

  return ok({
    id: listing.id,
    reference: listing.reference,
    titleAr: listing.titleAr,
    titleEn: listing.titleEn,
    descriptionAr: listing.descriptionAr,
    descriptionEn: listing.descriptionEn,
    price: listing.price,
    currency: listing.currency,
    purpose: listing.purpose,
    paymentType: listing.paymentType,
    trustLevel: listing.trustLevel,
    views: listing.views,
    publishedAt: listing.publishedAt,
    unit: {
      type: listing.unit.type,
      bedrooms: listing.unit.bedrooms,
      bathrooms: listing.unit.bathrooms,
      sizeSqm: listing.unit.sizeSqm,
      floor: listing.unit.floor,
      finishing: listing.unit.finishing,
      deliveryStatus: listing.unit.deliveryStatus,
      building: listing.unit.building,
      compoundAr: listing.unit.compound?.nameAr ?? null,
      compoundEn: listing.unit.compound?.nameEn ?? null,
      compoundSlug: listing.unit.compound?.slug ?? null,
      areaAr: listing.unit.area.nameAr,
      areaEn: listing.unit.area.nameEn,
    },
    media: listing.media.map((m) => ({
      id: m.id,
      url: m.fileKey,
      thumb: m.thumbKey,
      room: m.room,
      source: m.source,
      isCover: m.isCover,
    })),
    // Approved virtual tours. kind "video" plays `url` directly; kind "embed" is a hosted
    // player (YouTube / Vimeo) or a 3D / 360° tour (Matterport / Kuula) to open or embed.
    tours: listing.tours,
    // Oldest first, so a chart can render it in order.
    priceHistory: listing.priceHistory.map((h) => ({
      price: h.price,
      kind: h.kind,
      changedAt: h.changedAt,
    })),
    fair: fair
      ? { low: fair.low, mid: fair.mid, high: fair.high, confidence: fair.confidence, sampleSize: fair.sampleSize }
      : null,
    developer: developer
      ? { price: developer.price, source: developer.source, isAvailable: developer.isAvailable }
      : null,
    verdict,
    developerGapPct: developerGap,
    installment,
    status: listing.status,
    trade,
  });
}

/** PATCH /api/listings/[id] — edits a listing while it is still a draft or was rejected. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const listing = await prisma.listing.findUnique({ where: { id }, include: { unit: { select: { ownerId: true } } } });
  if (!listing) return fail("not_found", 404);
  if (listing.unit.ownerId !== auth.user.id) return fail("forbidden", 403);
  if (!["draft", "rejected"].includes(listing.status)) return fail("listing_locked", 409);

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (b.price !== undefined && Number(b.price) > 0) data.price = Number(b.price);
  if (b.withoutOver !== undefined) data.withoutOver = b.withoutOver === true || b.withoutOver === "true";
  if (b.titleAr !== undefined) data.titleAr = String(b.titleAr);
  if (b.titleEn !== undefined) data.titleEn = String(b.titleEn);
  if (b.descriptionAr !== undefined) data.descriptionAr = String(b.descriptionAr);
  if (b.descriptionEn !== undefined) data.descriptionEn = String(b.descriptionEn);
  if (b.installment !== undefined) data.installmentJson = b.installment ? JSON.stringify(b.installment) : null;

  const updated = await prisma.listing.update({ where: { id }, data });
  return ok({ id: updated.id, status: updated.status, price: updated.price });
}
