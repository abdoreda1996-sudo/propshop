import Link from "next/link";
import { List, Map as MapIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getHomeData } from "@/lib/home";
import { formatNumber } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { unitsLabel } from "@/lib/i18n";
import { searchListingCards, SearchParams } from "@/lib/listings";
import { baseFacets, sanitise, whereForSelection, Facet, Selection } from "@/lib/facets";
import FilterBar from "@/components/FilterBar";
import BrowseCard from "@/components/BrowseCard";
import ResultsMap from "@/components/ResultsMap";
import ScrollMemory from "@/components/ScrollMemory";
import HeroBackdrop, { heroWash } from "@/components/HeroBackdrop";
import { resolveHeroCover } from "@/lib/siteHero";

import { localMeta } from "@/lib/seo";
/**
 * Fallback hero photograph, used only when the catalogue has nothing to show.
 *
 * The hero normally fronts itself with a REAL VERIFIED LISTING from the marketplace — see
 * `heroUnit` below. That is the only image that can honestly sit above the sentence
 * "these are real, verified photos of real units"; a stock house there quietly contradicts
 * the page's whole argument.
 *
 * This constant is what shows on an empty catalogue, which in practice means a fresh
 * database. Replace it with owned photography before launch.
 */
const HERO_FALLBACK =
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&h=420&fit=crop&auto=format&q=70";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return localMeta({ ar: "وحدات للبيع من المالك", en: "Homes for sale from their owners" });
}

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Read a repeated query parameter into an array, tolerating the single-value form. */
function many(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  return v ? [v] : [];
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const SORTS: { value: NonNullable<SearchParams["sort"]>; ar: string; en: string }[] = [
  { value: "newest", ar: "الأحدث", en: "Newest" },
  { value: "best_value", ar: "الأفضل مقابل السعر", en: "Best value" },
  { value: "price_asc", ar: "السعر: من الأقل", en: "Price: low to high" },
  { value: "price_desc", ar: "السعر: من الأعلى", en: "Price: high to low" },
];

/**
 * The home page — the faceted results screen.
 *
 * This IS the landing page (owner, 2026-09-22), in the shape Kayak uses: a marketplace
 * opens on its inventory, not on a brochure about itself. The hero still carries the pitch
 * — owner-listed, verified, zero commission — but it sits above real results rather than
 * above links to them.
 *
 * The previous landing page is preserved at /discover, which is the only place the
 * fair-price explainer, the compounds rail and the areas rail are composed together.
 *
 * Kayak Hotels' information architecture: a dense checkbox rail down the left, results as
 * horizontal rows with the price boxed off on the right, and a sort strip above them.
 *
 * ONE SCROLLBAR (owner's requirement). Neither column takes `overflow` or a fixed height,
 * so the page scrolls as a single region. That is also why the rail is not sticky: pinning
 * it would either clip its own bottom or reintroduce the second scroll region it is meant
 * to avoid.
 *
 * Kayak's structure, NOT Kayak's palette. The accent stays PropShop red, which already
 * carries action here; adopting Kayak's orange would break the one rule the whole design
 * system rests on.
 */
export default async function BrowsePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;

  /*
    Follows the visitor's locale, like every other page.

    This was pinned to English while the screen was a parallel experiment beside /search.
    As the site's front door, pinning it would have made an Arabic-first product greet most
    of its visitors in English — so it reads the cookie and mirrors.
  */
  const locale = await getLocale();
  const ar = locale === "ar";

  // Areas and compounds are facets too, but their options come from the catalogue rather
  // than a constant — so they are appended after the static groups.
  const [home, areas, compounds] = await Promise.all([
    // Cached and shared with the home page, so the two can never quote different numbers
    // for the same marketplace.
    getHomeData(),
    prisma.area.findMany({ orderBy: { nameEn: "asc" }, select: { slug: true, nameAr: true, nameEn: true } }),
    // Every compound, not just the busiest: the search field and the Location panel suggest
    // them by name as you type (owner, 2026-10-24), so one missing here cannot be found.
    prisma.compound.findMany({
      orderBy: [{ liveListingCount: "desc" }, { nameEn: "asc" }],
      select: { slug: true, nameAr: true, nameEn: true },
    }),
  ]);

  /*
    Area leads (owner, 2026-09-22), and it is the right call: in this market people decide
    WHERE before they decide anything else, and a filter rail should open with the question
    its users are already asking. Compound follows it, since it is the same question asked
    one level finer.
  */
  const facets: Facet[] = [
    {
      key: "area",
      ar: "المنطقة",
      en: "Area",
      options: areas.map((a) => ({ value: a.slug, ar: a.nameAr, en: a.nameEn })),
    },
    {
      key: "compound",
      ar: "الكمبوند",
      en: "Compound",
      options: compounds.map((c) => ({ value: c.slug, ar: c.nameAr, en: c.nameEn })),
    },
    ...baseFacets(),
  ];

  const raw: Selection = Object.fromEntries(facets.map((f) => [f.key, many(sp[f.key])]));
  const selection = sanitise(facets, raw);

  // list | map. Anything else falls back to the list — the view is in the URL, so it is
  // user-editable, and an unknown value must not blank the results.
  const view = one(sp.view) === "map" ? "map" : "list";

  const sort = (one(sp.sort) as SearchParams["sort"]) ?? "newest";
  const page = Number(one(sp.page) ?? 1) || 1;
  const q = one(sp.q);

  const num = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const minPrice = num(one(sp.minPrice));
  const maxPrice = num(one(sp.maxPrice));

  const facetWhere = whereForSelection(facets, selection);

  const sliderWhere: Record<string, unknown>[] = [];
  if (minPrice !== undefined || maxPrice !== undefined) {
    sliderWhere.push({
      price: { ...(minPrice !== undefined ? { gte: minPrice } : {}), ...(maxPrice !== undefined ? { lte: maxPrice } : {}) },
    });
  }

  const where = sliderWhere.length ? { AND: [facetWhere, ...sliderWhere] } : facetWhere;

  /*
    The map takes a bigger page than the list.

    A map showing only the 20 rows of the current page would be lying about where the
    matches are — someone pans to an empty district and concludes nothing is for sale
    there. It is capped rather than unbounded because every pin is a DOM node, and a few
    hundred is where a map stops feeling immediate.
  */
  const result = await searchListingCards({
    q,
    sort,
    page: view === "map" ? 1 : page,
    perPage: view === "map" ? 300 : 20,
    extraWhere: where,
  });

  /*
    The hero image, taken from the newest live listing that actually has a cover photo.

    From `home`, not from `result`: the hero must not change every time someone ticks a
    filter, and the home payload is cached and unfiltered. Falling through to the constant
    only when the catalogue is empty.
  */
  const heroUnit = home.newest.find((n) => n.photo) ?? null;
  // What the admin chose in /admin/hero; "auto" prefers a virtual tour, then heroUnit.
  const hero = await resolveHeroCover(
    heroUnit?.photo
      ? { photo: heroUnit.photo, credit: { href: heroUnit.href, compoundAr: heroUnit.compoundAr, compoundEn: heroUnit.compoundEn, areaAr: heroUnit.areaAr, areaEn: heroUnit.areaEn } }
      : null,
  );
  const heroCredit = hero.credit;

  const hrefWith = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) for (const val of many(v)) next.append(k, val);
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k);
      if (v !== undefined) next.set(k, v);
    }
    return `/?${next.toString()}`;
  };

  /*
    What is filtering the list right now, as removable chips under the bar: one tap takes
    one filter off, and "Clear all" keeps only the sort and the view. Purpose is not a chip
    (sale is the default); trade is, because it changes the whole list.
  */
  const chipHref = (key: string, value?: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp))
      for (const val of many(v)) if (!(k === key && (value === undefined || val === value))) next.append(k, val);
    next.delete("page");
    const s = next.toString();
    return s ? `/?${s}` : "/";
  };
  const chips: { label: string; href: string }[] = [];
  if (q) chips.push({ label: `“${q}”`, href: chipHref("q") });
  if (minPrice !== undefined || maxPrice !== undefined) {
    const m = (n: number) => (n >= 1_000_000 ? `${formatNumber(n / 1_000_000, locale)}${ar ? " مليون" : "M"}` : formatNumber(n, locale));
    const label =
      minPrice !== undefined && maxPrice !== undefined
        ? `${m(minPrice)} – ${m(maxPrice)}`
        : maxPrice !== undefined
          ? `${ar ? "لحد" : "Up to"} ${m(maxPrice)}`
          : `${ar ? "من" : "From"} ${m(minPrice!)}`;
    const next = new URLSearchParams(chipHref("minPrice").split("?")[1] ?? "");
    next.delete("maxPrice");
    chips.push({ label, href: next.size ? `/?${next}` : "/" });
  }
  for (const f of facets) {
    if (f.key === "purpose") continue;
    for (const v of selection[f.key] ?? []) {
      const o = f.options.find((x) => x.value === v);
      if (!o) continue;
      // Bed and bath labels already say what they count ("3 غرف", "2 baths").
      chips.push({ label: ar ? o.ar : o.en, href: chipHref(f.key, v) });
    }
  }
  const clearAllHref = (() => {
    const next = new URLSearchParams();
    for (const k of ["sort", "view"]) {
      const v = one(sp[k]);
      if (v) next.set(k, v);
    }
    return next.size ? `/?${next}` : "/";
  })();

  const stats = [
    { value: formatNumber(home.liveCount, locale), label: ar ? "وحدة موثقة" : "verified units" },
    { value: formatNumber(home.compoundCount, locale), label: ar ? "كمبوند" : "compounds" },
    { value: formatNumber(home.closedCount, locale), label: ar ? "صفقة اتقفلت" : "deals closed" },
  ];

  return (
    <div className="bg-white">
      <ScrollMemory />
      {/* --- Intro -----------------------------------------------------------
          Kept short: this is a results page, and every pixel here pushes a listing under
          the fold. Headline and the promise on the start side, one real listing's cover
          (what the admin picked in /admin/hero) on the other, captioned with where it is.

          The commission claim is exact and must stay so: "zero commission" alone, above a
          fee both sides do pay, reads as "nobody pays anything", so the fee is named in the
          same line. See src/lib/fees.ts. */}
      <section className="container-page pt-7 sm:pt-12">
        <div className="grid gap-6 md:grid-cols-[1fr_1.05fr] md:items-end md:gap-10">
          <div className="min-w-0 md:pb-2">
            <h1 className="display">
              {ar ? "من المالك مباشرة." : "Straight from the owner."}
              <br />
              <span className="text-ink-400">{ar ? "من غير سماسرة." : "No brokers."}</span>
            </h1>
            <p className="lede mt-4">
              {ar
                ? "كل وحدة هنا معروضة من صاحبها. بنراجع مستند الملكية والصور والموقع قبل ما الإعلان ينزل، ومفيش غير إعلان واحد للوحدة."
                : "Every home here is listed by the person who owns it. We check the ownership document, the photos and the location before the listing goes up, and each property can only be listed once."}
            </p>
            {/* The three things people come here to do: buy (the list below), sell, trade. */}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <a href="#results" className="btn btn-primary min-h-11 flex-1 sm:flex-none">
                {ar ? "شوف الوحدات" : "See the homes"}
              </a>
              <Link href="/list" className="btn btn-ghost min-h-11 flex-1 sm:flex-none">
                {ar ? "اعرض وحدتك" : "List your unit"}
              </Link>
              <Link href="/trade" className="text-[14px] font-semibold text-brand-500 underline underline-offset-4">
                {ar ? "أو قايض وحدتك بوحدة تانية" : "or trade your unit for another"}
              </Link>
            </div>
          </div>

          <figure className="min-w-0">
            <div className="relative isolate aspect-[16/10] w-full overflow-hidden rounded-md bg-navy-50">
              <HeroBackdrop media={hero.media ?? { type: "image", src: HERO_FALLBACK }} position={hero.position} />
              <div aria-hidden className="absolute inset-0 -z-10" style={{ background: heroWash(hero.dim) }} />
            </div>
            {/* Credit the unit in the picture and link to it. A tour cover is a backdrop
                (not clickable), so the caption is the way into it. */}
            {(heroCredit || hero.tourHref) && (
              <figcaption className="mt-2 flex items-center justify-between gap-3 text-[12.5px] text-ink-500">
                <span className="truncate">
                  {heroCredit
                    ? ar
                      ? `${hero.tourHref ? "جولة افتراضية في" : "وحدة معروضة في"} ${heroCredit.compoundAr ?? heroCredit.areaAr}`
                      : `${hero.tourHref ? "Virtual tour," : "Listed in"} ${heroCredit.compoundEn ?? heroCredit.areaEn}`
                    : ar
                      ? "جولة افتراضية"
                      : "Virtual tour"}
                </span>
                {hero.tourHref ? (
                  <a
                    href={hero.tourHref}
                    {...(hero.credit ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                    className="shrink-0 font-semibold text-brand-500 underline-offset-4 hover:underline"
                  >
                    {ar ? "افتح الجولة" : "Open the tour"}
                  </a>
                ) : heroCredit ? (
                  <Link href={heroCredit.href} className="shrink-0 font-semibold text-brand-500 underline-offset-4 hover:underline">
                    {ar ? "شوف الإعلان" : "See the listing"}
                  </Link>
                ) : null}
              </figcaption>
            )}
          </figure>
        </div>

        {/* The promise and the numbers behind it, as one ruled line. */}
        <div className="mt-8 grid gap-4 border-y border-[var(--border)] py-4 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
          <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-ink-700">
            <strong className="font-semibold text-ink-900">{ar ? "مفيش عمولة على أي طرف." : "No commission on either side."}</strong>{" "}
            {ar
              ? "كل طرف بيدفع رسم ثابت حسب نوع الوحدة، معلن من الأول، وبيتدفع بس لو البيعة تمت."
              : "Each side pays one flat fee set by the type of unit, published up front and paid only if the sale goes through."}{" "}
            <Link href="/pricing" className="font-semibold text-brand-500 underline underline-offset-4">
              {ar ? "جدول الرسوم" : "Fee table"}
            </Link>
          </p>
          <dl className="flex divide-x divide-[var(--border)] rtl:divide-x-reverse">
            {stats.map((stat) => (
              <div key={stat.label} className="px-4 first:ps-0 last:pe-0 sm:px-6">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="tnum text-[20px] font-semibold leading-none text-ink-900">{stat.value}</dd>
                <dd className="mt-1 whitespace-nowrap text-[12px] text-ink-500">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div id="results" className="container-page scroll-mt-16 py-4">
        {/*
          Two columns, both in normal flow. No `overflow`, no fixed heights, nothing
          sticky — so the document has exactly one scrollbar and the rail scrolls with the
          results instead of trapping a second scroll region under the cursor.
        */}
        {/* Zillow's search bar (owner, 2026-10-20) replaced the left filter rail. */}
        <FilterBar
          facets={facets}
          selection={selection}
          minPrice={minPrice}
          maxPrice={maxPrice}
          q={q}
          locale={locale}
        />

        {chips.length > 0 && (
          <div className="-mt-1 mb-4 flex flex-wrap items-center gap-2" aria-label={ar ? "الفلاتر المختارة" : "Active filters"}>
            {chips.map((c) => (
              <Link
                key={c.href + c.label}
                href={c.href}
                scroll={false}
                aria-label={ar ? `شيل فلتر ${c.label}` : `Remove filter ${c.label}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-ink-50 px-2.5 text-[13px] text-ink-900 hover:border-ink-400"
              >
                {c.label}
                <span aria-hidden className="text-[15px] leading-none text-ink-400">×</span>
              </Link>
            ))}
            <Link href={clearAllHref} scroll={false} className="px-1 text-[13px] font-semibold text-brand-500 underline underline-offset-4">
              {ar ? "امسح الكل" : "Clear all"}
            </Link>
          </div>
        )}

        <div>
          <section className="min-w-0" aria-label={ar ? "النتائج" : "Results"}>
            {/* Count, view switch and sort, on one ruled line above the rows. */}
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--border)] pb-2.5">
              <div className="text-[14px] text-ink-700">
                <span className="tnum font-semibold text-ink-900">{formatNumber(result.total, locale)}</span>{" "}
                {ar ? unitsLabel(result.total, locale) : result.total === 1 ? "home" : "homes"}
              </div>
              {/* Phones: one swipeable row instead of wrapped lines. */}
              <div className="order-last flex w-full items-center gap-4 overflow-x-auto text-[13px] [scrollbar-width:none] sm:order-none sm:ms-auto sm:w-auto">
                <span className="hidden text-ink-500 sm:inline">{ar ? "ترتيب" : "Sort"}</span>
                {SORTS.map((s) => (
                  <Link
                    key={s.value}
                    href={hrefWith({ sort: s.value, page: undefined })}
                    aria-current={sort === s.value ? "true" : undefined}
                    className={`whitespace-nowrap py-2.5 transition sm:py-1 ${
                      sort === s.value
                        ? "font-semibold text-ink-900 underline decoration-accent-500 decoration-2 underline-offset-[6px]"
                        : "text-ink-500 hover:text-ink-900"
                    }`}
                  >
                    {ar ? s.ar : s.en}
                  </Link>
                ))}
              </div>

              {/* View switch. */}
              <div className="ms-auto flex items-center rounded-md border border-[var(--border)] sm:ms-0">
                {([
                  { key: "list", icon: List, ar: "قائمة", en: "List" },
                  { key: "map", icon: MapIcon, ar: "خريطة", en: "Map" },
                ] as const).map((v) => {
                  const on = view === v.key;
                  return (
                    <Link
                      key={v.key}
                      href={hrefWith({ view: v.key === "list" ? undefined : v.key, page: undefined })}
                      aria-current={on ? "true" : undefined}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold transition first:rounded-s-md last:rounded-e-md sm:py-1.5 ${
                        on ? "bg-ink-900 text-white" : "text-ink-500 hover:text-ink-900"
                      }`}
                    >
                      <v.icon size={13} />
                      {ar ? v.ar : v.en}
                    </Link>
                  );
                })}
              </div>
            </div>

            {result.items.length === 0 ? (
              <div className="py-10">
                <p className="text-[15px] font-semibold text-ink-900">
                  {ar ? "مفيش وحدات مطابقة للفلاتر دي." : "No homes match these filters."}
                </p>
                <p className="mt-1 text-[13.5px] text-ink-500">
                  {chips.length > 0 && (
                    <>
                      <Link href={clearAllHref} className="font-semibold text-brand-500 underline underline-offset-4">
                        {ar ? "امسح الفلاتر" : "Clear the filters"}
                      </Link>
                      {ar ? "، أو " : ", or "}
                    </>
                  )}
                  <Link href="/request" className="font-semibold text-brand-500 underline underline-offset-4">
                    {ar ? "ابعتلنا طلبك وهندوّرلك" : `${chips.length ? "s" : "S"}end us a request and we will look for you`}
                  </Link>
                  .
                </p>
              </div>
            ) : view === "map" ? (
              <ResultsMap items={result.items} locale={locale} />
            ) : (
              <div className="flex flex-col gap-3">
                {result.items.map((row) => (
                  <BrowseCard key={row.id} vm={row} locale={locale} />
                ))}
              </div>
            )}

            {/* Pagination belongs to the list. The map already holds the whole set. */}
            {view === "list" && result.pages > 1 && (
              <nav className="mt-6 flex flex-wrap items-center gap-1" aria-label={ar ? "الصفحات" : "Pages"}>
                {Array.from({ length: Math.min(result.pages, 12) }, (_, i) => i + 1).map((n) => (
                  <Link
                    key={n}
                    href={hrefWith({ page: String(n) })}
                    aria-current={n === page ? "page" : undefined}
                    className={`tnum min-w-11 rounded-md px-2.5 py-2.5 text-center text-[13.5px] transition sm:min-w-9 sm:py-1.5 ${
                      n === page ? "bg-ink-900 font-semibold text-white" : "text-ink-700 hover:bg-ink-50"
                    }`}
                  >
                    {formatNumber(n, locale)}
                  </Link>
                ))}
              </nav>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
