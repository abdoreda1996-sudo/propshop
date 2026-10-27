/**
 * Market segments: residential, commercial, coastal.
 *
 * These are the top-level tabs on the home search. They are DERIVED, not stored: a
 * segment is a reading of facts the listing already carries, so there is no third
 * source of truth to drift and no backfill when the rule changes.
 *
 *   coastal      the unit's AREA is flagged coastal (Area.isCoastal)
 *   commercial   the unit's TYPE is one people buy to trade from
 *   residential  everything else
 *
 * WHY COASTAL IS AN AREA PROPERTY AND NOT A UNIT TYPE
 *
 * The obvious rule is "a chalet is coastal". It is wrong in both directions: a two-
 * bedroom apartment in Marassi is a coastal property to everyone who shops for one, and
 * a chalet is a building shape that also exists inland. What actually makes a property
 * coastal in this market is WHERE it is — so the flag lives on Area, is set once per
 * area by ops, and every unit in that area inherits it. Adding a new coastal area needs
 * no code change.
 *
 * ORDER MATTERS. Coastal is evaluated FIRST, so a retail unit in El Gouna reads as
 * coastal rather than commercial. That is deliberate: someone browsing the coastal tab
 * is shopping by destination, and a shop in Gouna belongs in that market. The segments
 * therefore partition the inventory — every listing is in exactly one, and the three
 * tab counts sum to the total.
 */

import { Prisma } from "@prisma/client";

export const SEGMENTS = ["residential", "commercial", "coastal"] as const;
export type Segment = (typeof SEGMENTS)[number];

/**
 * Unit types bought to trade from rather than live in.
 *
 * Kept deliberately small. A "studio" is a home, not an office, however often it gets
 * used as one.
 */
export const COMMERCIAL_TYPES = ["office", "retail"] as const;

export function isSegment(value: string | undefined | null): value is Segment {
  return !!value && (SEGMENTS as readonly string[]).includes(value);
}

export const SEGMENT_LABELS: Record<Segment, { ar: string; en: string }> = {
  residential: { ar: "سكني", en: "Residential" },
  commercial: { ar: "تجاري", en: "Commercial" },
  coastal: { ar: "ساحلي", en: "Coastal" },
};

/**
 * Which segment a listing falls in, given its unit.
 *
 * The in-memory twin of segmentWhere(). Both exist because the same rule has to run in
 * SQL for filtering and in TypeScript for labelling a card, and a test asserts they
 * agree — that agreement is the whole reason this is one module rather than a `where`
 * written inline at each call site.
 */
export function segmentOf(unit: { type: string; area?: { isCoastal: boolean } | null }): Segment {
  if (unit.area?.isCoastal) return "coastal";
  if ((COMMERCIAL_TYPES as readonly string[]).includes(unit.type)) return "commercial";
  return "residential";
}

/**
 * The SQL mirror of segmentOf(), as a UNIT predicate.
 *
 * Unit-level rather than listing-level on purpose: buildWhere() assembles one
 * `Prisma.UnitWhereInput` from every unit-shaped filter and reuses it inside the free-text
 * OR branch. A listing-level fragment would have to be merged into that OR by hand at each
 * arm, and the arm that got missed would silently return the wrong segment.
 *
 * Residential and commercial both exclude coastal areas, which is what keeps the three
 * segments disjoint — without that, a villa in Hacienda Bay would appear under both
 * residential and coastal, and the tab counts would sum to more than the catalogue.
 */
export function segmentUnitWhere(segment: Segment): Prisma.UnitWhereInput {
  switch (segment) {
    case "coastal":
      return { area: { isCoastal: true } };
    case "commercial":
      return { area: { isCoastal: false }, type: { in: [...COMMERCIAL_TYPES] } };
    case "residential":
      return { area: { isCoastal: false }, type: { notIn: [...COMMERCIAL_TYPES] } };
  }
}

/** The same predicate lifted to a Listing, for counts and other non-search callers. */
export function segmentWhere(segment: Segment): Prisma.ListingWhereInput {
  return { unit: segmentUnitWhere(segment) };
}
