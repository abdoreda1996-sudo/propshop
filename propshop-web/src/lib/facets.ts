/**
 * The faceted filter vocabulary for /browse.
 *
 * ONE definition per facet, read by BOTH the left-hand nav that renders the checkboxes and
 * the query that turns them into SQL. A facet whose label lives in the component and whose
 * predicate lives in the query is a facet that eventually filters by something other than
 * what it says — so both come from here.
 *
 * ── HOW SELECTION WORKS ────────────────────────────────────────────────────
 *
 * Every facet is multi-select and lives in the URL as a repeated query parameter
 * (`?type=apartment&type=villa`), so the whole screen is a server component with no client
 * state, every filtered view is linkable, and the back button works.
 *
 * NOTHING SELECTED MEANS NO RESTRICTION. So does *everything* selected — both show the
 * whole catalogue. That is why `whereForSelection` skips a group once every option is
 * ticked rather than emitting an IN clause listing all of them: same rows, one less
 * predicate. The "All" and "Clear" links in the nav therefore produce identical RESULTS
 * and different STATE, which is the honest behaviour for a checkbox group — "All" shows
 * you everything is included, "Clear" resets the group.
 */

import { Prisma } from "@prisma/client";
import { UNIT_TYPES, UNIT_TYPE_LABELS, FINISHINGS, DELIVERY_STATUSES, PAYMENT_TYPES, PURPOSES } from "./enums";
import { SEGMENTS, SEGMENT_LABELS, segmentUnitWhere, Segment } from "./segments";

export type FacetOption = {
  /** The value that travels in the URL. */
  value: string;
  ar: string;
  en: string;
};

export type Facet = {
  /** The query-parameter name. Short, because these stack up in the URL. */
  key: string;
  ar: string;
  en: string;
  options: FacetOption[];
  /** Collapsed by default in the nav — long or secondary groups. */
  collapsed?: boolean;
  /**
   * Filters results but is not drawn in the nav. `purpose` is driven by the header's
   * sale/rent switch, so it must keep working without a second control for it.
   */
  hidden?: boolean;
};

/* ── Numeric bands ──────────────────────────────────────────────────────────
 *
 * Price and size are continuous, so they are offered as bands rather than sliders: a
 * checkbox list can be multi-selected, read at a glance, and linked to. The bounds are
 * inclusive-low / exclusive-high so adjacent bands cannot double-count a listing.
 */

export type Band = { value: string; ar: string; en: string; min?: number; max?: number };

export const PRICE_BANDS: Band[] = [
  { value: "lt5", ar: "أقل من 5 مليون", en: "Under 5M", max: 5_000_000 },
  { value: "5-10", ar: "5 – 10 مليون", en: "5 – 10M", min: 5_000_000, max: 10_000_000 },
  { value: "10-20", ar: "10 – 20 مليون", en: "10 – 20M", min: 10_000_000, max: 20_000_000 },
  { value: "20-40", ar: "20 – 40 مليون", en: "20 – 40M", min: 20_000_000, max: 40_000_000 },
  { value: "gt40", ar: "أكثر من 40 مليون", en: "Over 40M", min: 40_000_000 },
];

export const SIZE_BANDS: Band[] = [
  { value: "lt100", ar: "أقل من 100 م²", en: "Under 100 m²", max: 100 },
  { value: "100-150", ar: "100 – 150 م²", en: "100 – 150 m²", min: 100, max: 150 },
  { value: "150-250", ar: "150 – 250 م²", en: "150 – 250 m²", min: 150, max: 250 },
  { value: "250-400", ar: "250 – 400 م²", en: "250 – 400 m²", min: 250, max: 400 },
  { value: "gt400", ar: "أكثر من 400 م²", en: "Over 400 m²", min: 400 },
];

/**
 * Where the asking price sits against the estimated mid, as a fraction.
 *
 * Deliberately NOT the same measure as the card's "below / above fair price" badge, which
 * compares against the fair RANGE (low..high) and cannot be expressed in SQL without
 * joining the latest estimate per listing. This filters on `Listing.valueGapPct`, which is
 * denormalised and indexed, and the labels say "estimated average" rather than "fair
 * price" so the filter never claims to be the badge.
 */
export const VALUE_BANDS: Band[] = [
  { value: "much_below", ar: "أرخص بـ 10% أو أكثر", en: "10%+ below average", max: -0.1 },
  { value: "below", ar: "أرخص من المتوسط", en: "Below average", min: -0.1, max: 0 },
  { value: "above", ar: "أغلى من المتوسط", en: "Above average", min: 0, max: 0.1 },
  { value: "much_above", ar: "أغلى بـ 10% أو أكثر", en: "10%+ above average", min: 0.1 },
];

export const BEDROOM_OPTIONS: FacetOption[] = [
  { value: "0", ar: "استوديو", en: "Studio" },
  { value: "1", ar: "غرفة", en: "1 bed" },
  { value: "2", ar: "غرفتين", en: "2 beds" },
  { value: "3", ar: "3 غرف", en: "3 beds" },
  { value: "4", ar: "4 غرف", en: "4 beds" },
  { value: "5", ar: "5 غرف أو أكثر", en: "5+ beds" },
];

export const BATHROOM_OPTIONS: FacetOption[] = [
  { value: "1", ar: "حمام", en: "1 bath" },
  { value: "2", ar: "حمامين", en: "2 baths" },
  { value: "3", ar: "3 حمامات", en: "3 baths" },
  { value: "4", ar: "4 حمامات أو أكثر", en: "4+ baths" },
];

export const VIEW_OPTIONS: FacetOption[] = [
  { value: "garden", ar: "على الحديقة", en: "Garden" },
  { value: "pool", ar: "على حمام السباحة", en: "Pool" },
  { value: "landscape", ar: "على اللاندسكيب", en: "Landscape" },
  { value: "open", ar: "إطلالة مفتوحة", en: "Open" },
  { value: "street", ar: "على الشارع", en: "Street" },
];

const TYPE_LABELS: Record<string, { ar: string; en: string }> = UNIT_TYPE_LABELS;

const FINISHING_LABELS: Record<string, { ar: string; en: string }> = {
  core_shell: { ar: "على المحارة", en: "Core & shell" },
  semi_finished: { ar: "نصف تشطيب", en: "Semi-finished" },
  fully_finished: { ar: "تشطيب كامل", en: "Fully finished" },
  furnished: { ar: "مفروشة", en: "Furnished" },
};

const DELIVERY_LABELS: Record<string, { ar: string; en: string }> = {
  ready: { ar: "استلام فوري", en: "Ready to move" },
  under_construction: { ar: "تحت الإنشاء", en: "Under construction" },
};

const PAYMENT_LABELS: Record<string, { ar: string; en: string }> = {
  cash: { ar: "كاش", en: "Cash" },
  installments: { ar: "تقسيط", en: "Instalments" },
  resale_installments: { ar: "ريسيل بأقساط", en: "Resale with instalments" },
};

const PURPOSE_LABELS: Record<string, { ar: string; en: string }> = {
  sale: { ar: "للبيع", en: "For sale" },
  rent: { ar: "للإيجار", en: "For rent" },
};

const bandOptions = (bands: Band[]): FacetOption[] =>
  bands.map((b) => ({ value: b.value, ar: b.ar, en: b.en }));

const labelled = (values: readonly string[], labels: Record<string, { ar: string; en: string }>): FacetOption[] =>
  values.map((v) => ({ value: v, ar: labels[v]?.ar ?? v, en: labels[v]?.en ?? v }));

/**
 * The facet list, in nav order.
 *
 * Ordered by how often someone actually narrows by them: purpose and segment decide which
 * market you are in, then the concrete things people search on, then the long tail.
 * Areas and compounds are appended at runtime because they come from the database.
 */
export function baseFacets(): Facet[] {
  return [
    { key: "purpose", ar: "نوع العرض", en: "Listing type", options: labelled(PURPOSES, PURPOSE_LABELS), hidden: true },
    // "Trade" in the sidebar's Buy / Rent / Trade switch: units whose owner opened them to
    // trade, whatever their purpose (a listing can be for sale AND open to trade).
    { key: "trade", ar: "مقايضة", en: "Trade", options: [{ value: "open", ar: "مفتوح للمقايضة", en: "Open to trade" }], hidden: true },
    // "Units without over price", a checkbox in the Filters panel: ?over=none.
    { key: "over", ar: "بدون أوفر", en: "Without over", options: [{ value: "none", ar: "بدون أوفر", en: "Without over" }], hidden: true },
    {
      key: "segment",
      ar: "السوق",
      en: "Market",
      options: SEGMENTS.map((s) => ({ value: s, ar: SEGMENT_LABELS[s].ar, en: SEGMENT_LABELS[s].en })),
    },
    { key: "type", ar: "نوع الوحدة", en: "Property type", options: labelled(UNIT_TYPES, TYPE_LABELS) },
    // Hidden: the sidebar's budget slider replaced the band checkboxes (owner, 2026-10-08).
    // Kept as a group so existing ?price= links still filter.
    { key: "price", ar: "السعر", en: "Price", options: bandOptions(PRICE_BANDS), hidden: true },
    { key: "beds", ar: "غرف النوم", en: "Bedrooms", options: BEDROOM_OPTIONS },
    { key: "delivery", ar: "الاستلام", en: "Delivery", options: labelled(DELIVERY_STATUSES, DELIVERY_LABELS) },
    { key: "finishing", ar: "التشطيب", en: "Finishing", options: labelled(FINISHINGS, FINISHING_LABELS) },
    { key: "payment", ar: "طريقة الدفع", en: "Payment", options: labelled(PAYMENT_TYPES, PAYMENT_LABELS) },
    { key: "baths", ar: "الحمامات", en: "Bathrooms", options: BATHROOM_OPTIONS, collapsed: true },
  ];
}

/** The URL parameter names this screen owns, so pagination and sort can be preserved. */
export const FACET_KEYS = [
  "purpose", "trade", "over", "segment", "type", "price", "beds",
  "delivery", "finishing", "payment", "baths",
  "area", "compound",
] as const;

export type Selection = Record<string, string[]>;

/** Keep only values the facet actually offers — the URL is user-editable. */
export function sanitise(facets: Facet[], raw: Selection): Selection {
  const out: Selection = {};
  for (const facet of facets) {
    const allowed = new Set(facet.options.map((o) => o.value));
    const picked = (raw[facet.key] ?? []).filter((v) => allowed.has(v));
    if (picked.length) out[facet.key] = [...new Set(picked)];
  }
  return out;
}

/** True when every option in the group is ticked — equivalent to no filter at all. */
export function isAllSelected(facet: Facet, selection: Selection): boolean {
  const picked = selection[facet.key] ?? [];
  return picked.length > 0 && picked.length === facet.options.length;
}

function bandPredicate(bands: Band[], values: string[], field: string): Prisma.ListingWhereInput[] {
  return values
    .map((v) => bands.find((b) => b.value === v))
    .filter((b): b is Band => !!b)
    .map((b) => {
      const range: Record<string, number> = {};
      if (b.min !== undefined) range.gte = b.min;
      if (b.max !== undefined) range.lt = b.max;
      return { [field]: range } as Prisma.ListingWhereInput;
    });
}

/**
 * Turn a sanitised selection into a Prisma predicate.
 *
 * Groups AND together (type AND price AND beds); options within a group OR together
 * (apartment OR villa). That is what a faceted filter means everywhere, and getting it
 * backwards produces an empty result set for every multi-select, which reads as "no
 * matches" rather than as a bug.
 */
export function whereForSelection(facets: Facet[], selection: Selection): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [];

  for (const facet of facets) {
    const picked = selection[facet.key] ?? [];
    // One option, so "everything picked" below would wrongly read as no restriction.
    if (facet.key === "trade") {
      if (picked.includes("open")) and.push({ openToTrade: true });
      continue;
    }
    if (facet.key === "over") {
      if (picked.includes("none")) and.push({ withoutOver: true });
      continue;
    }
    // Nothing picked, or everything picked: no restriction either way.
    if (!picked.length || picked.length === facet.options.length) continue;

    switch (facet.key) {
      case "purpose":
        and.push({ purpose: { in: picked } });
        break;
      case "payment":
        and.push({ paymentType: { in: picked } });
        break;
      case "segment":
        and.push({ OR: picked.map((s) => ({ unit: segmentUnitWhere(s as Segment) })) });
        break;
      case "type":
        and.push({ unit: { type: { in: picked } } });
        break;
      case "area":
        and.push({ unit: { area: { slug: { in: picked } } } });
        break;
      case "compound":
        and.push({ unit: { compound: { slug: { in: picked } } } });
        break;
      case "delivery":
        and.push({ unit: { deliveryStatus: { in: picked } } });
        break;
      case "finishing":
        and.push({ unit: { finishing: { in: picked } } });
        break;
      case "beds": {
        // "5" is 5-or-more, so it becomes a range rather than an exact match.
        const exact = picked.filter((v) => v !== "5").map(Number);
        const clauses: Prisma.UnitWhereInput[] = [];
        if (exact.length) clauses.push({ bedrooms: { in: exact } });
        if (picked.includes("5")) clauses.push({ bedrooms: { gte: 5 } });
        and.push({ OR: clauses.map((unit) => ({ unit })) });
        break;
      }
      case "baths": {
        const exact = picked.filter((v) => v !== "4").map(Number);
        const clauses: Prisma.UnitWhereInput[] = [];
        if (exact.length) clauses.push({ bathrooms: { in: exact } });
        if (picked.includes("4")) clauses.push({ bathrooms: { gte: 4 } });
        and.push({ OR: clauses.map((unit) => ({ unit })) });
        break;
      }
      case "price":
        and.push({ OR: bandPredicate(PRICE_BANDS, picked, "price") });
        break;
    }
  }

  return and.length ? { AND: and } : {};
}

/** How many groups are narrowing the results — for the "clear all" affordance. */
export function activeGroupCount(facets: Facet[], selection: Selection): number {
  return facets.filter((f) => {
    if (f.hidden) return false;
    const picked = selection[f.key] ?? [];
    return picked.length > 0 && picked.length !== f.options.length;
  }).length;
}
