import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { searchListingCards, SearchParams, buildWhere } from "@/lib/listings";
import { prisma } from "@/lib/prisma";
import { baseFacets, sanitise, whereForSelection } from "@/lib/facets";

/**
 * GET /api/listings — the public search endpoint, shared by the web site and the
 * Flutter app. It can only ever return publicly visible listings (see lib/listings.ts).
 *
 * `trade=open` narrows to units open to trade. Page 1 also carries `priceBound` — the
 * min/max price of the matches IGNORING the price filter itself — so the app's budget
 * slider has a track that can always be widened again (same rule as the web rail).
 *
 * MULTI-SELECT (2026-10-20). Every filter may be repeated (`?type=villa&type=duplex`), as
 * on the website: values within a filter OR together, filters AND. A filter sent ONCE
 * still takes the original single-value path, so app builds already installed behave
 * exactly as before. `beds` / `baths` are the website's exact-count facets ("5" = 5+,
 * baths "4" = 4+); the older `bedrooms=N` ("at least N") is kept for those builds.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };

  // Repeated values, blanks dropped. One value keeps the single-value path below.
  const all = (k: string) => [...new Set(sp.getAll(k).filter(Boolean))];
  const single = (k: string) => {
    const v = all(k);
    return v.length === 1 ? v[0] : undefined;
  };
  const multi = (k: string) => {
    const v = all(k);
    return v.length > 1 ? v : [];
  };

  // Enum facets go through the website's facet module, which validates the values and
  // owns the predicates (segment, beds "5+", …). beds/baths always do: they are new.
  const facets = baseFacets();
  const selection = sanitise(facets, {
    segment: multi("segment"),
    type: multi("type"),
    delivery: multi("delivery"),
    finishing: multi("finishing"),
    payment: multi("payment"),
    beds: all("beds"),
    baths: all("baths"),
  });
  const extra = [whereForSelection(facets, selection)].filter((w) => Object.keys(w).length > 0);
  // Area and compound options are the catalogue itself, so they are matched directly.
  const areas = multi("area");
  const compounds = multi("compound");
  if (areas.length) extra.push({ unit: { area: { slug: { in: areas } } } });
  if (compounds.length) extra.push({ unit: { compound: { slug: { in: compounds } } } });

  const params: SearchParams = {
    purpose: sp.get("purpose") ?? undefined,
    openToTrade: sp.get("trade") === "open" || undefined,
    withoutOver: sp.get("over") === "none" || undefined,
    // residential | commercial | coastal. Validated inside buildWhere, so an unknown
    // value is ignored rather than narrowing the search to nothing.
    segment: single("segment"),
    areaSlug: single("area"),
    compoundSlug: single("compound"),
    type: single("type"),
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    bedrooms: num("bedrooms"),
    finishing: single("finishing"),
    deliveryStatus: single("delivery"),
    paymentType: single("payment"),
    q: sp.get("q") ?? undefined,
    sort: (sp.get("sort") as SearchParams["sort"]) ?? "newest",
    page: num("page") ?? 1,
    perPage: num("perPage") ?? 24,
    ...(extra.length ? { extraWhere: { AND: extra } } : {}),
  };

  const [result, bounds] = await Promise.all([
    searchListingCards(params),
    params.page === 1
      ? prisma.listing.aggregate({
          where: buildWhere({ ...params, minPrice: undefined, maxPrice: undefined }),
          _min: { price: true },
          _max: { price: true },
        })
      : null,
  ]);
  const priceBound = bounds
    ? { min: Math.floor(bounds._min.price ?? 0), max: Math.ceil(bounds._max.price ?? 0) }
    : undefined;
  return ok({ ...result, ...(priceBound ? { priceBound } : {}) });
}
