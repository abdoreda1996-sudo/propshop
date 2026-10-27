import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireUser, rateLimit } from "@/lib/api";
import { VIEWABLE_LISTING_WHERE, LISTING_CARD_INCLUDE, toCardVM } from "@/lib/listings";
import { LIST_PAGE } from "@/lib/enums";

/**
 * Saved listings — the heart on every card, web and app.
 *
 *   GET    /api/saved            → { ids, items }   ids for hearts, items as search cards
 *   GET    /api/saved?ids=1      → { ids }          cheap: just the hearts
 *   POST   /api/saved {listingId}
 *   DELETE /api/saved?listingId=…
 *
 * This did not exist: the heart was decorative on both clients and the Saved page could
 * only ever be empty. Saving is idempotent both ways (save twice = saved once).
 * Only viewable listings can be saved; a saved listing that later sells still shows (as
 * sold) so the owner of the list can see what happened to it.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) {
    // The web hearts ask with `quiet=1`: a guest is a normal state there, not an error, and
    // a 401 on every page load was the one red line in the browser console. The app keeps
    // the 401 it was built against.
    if (req.nextUrl.searchParams.get("quiet") && req.nextUrl.searchParams.get("ids")) return ok({ ids: null });
    return auth.response;
  }
  const rows = await prisma.savedListing.findMany({
    where: { userId: auth.user.id },
    select: { listingId: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const ids = rows.map((r) => r.listingId);
  if (req.nextUrl.searchParams.get("ids")) return ok({ ids });
  const listings = await prisma.listing.findMany({
    where: { id: { in: ids.slice(0, LIST_PAGE) }, ...VIEWABLE_LISTING_WHERE },
    include: LISTING_CARD_INCLUDE,
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  listings.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return ok({ ids, items: listings.map(toCardVM) });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (!(await rateLimit(`save:${auth.user.id}`, 120, 60 * 60_000))) return fail("rate_limited", 429);
  const b = await req.json().catch(() => ({}));
  const listingId = typeof b.listingId === "string" ? b.listingId : "";
  const listing = listingId
    ? await prisma.listing.findFirst({ where: { id: listingId, ...VIEWABLE_LISTING_WHERE }, select: { id: true } })
    : null;
  if (!listing) return fail("not_found", 404);
  await prisma.savedListing.upsert({
    where: { userId_listingId: { userId: auth.user.id, listingId } },
    create: { userId: auth.user.id, listingId },
    update: {},
  });
  return ok({ saved: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const listingId = req.nextUrl.searchParams.get("listingId") ?? "";
  await prisma.savedListing.deleteMany({ where: { userId: auth.user.id, listingId } });
  return ok({ saved: false });
}
