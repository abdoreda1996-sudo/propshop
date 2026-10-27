import { UNIT_TYPES, FINISHINGS, DELIVERY_STATUSES, PURPOSES, PAYMENT_TYPES, REQUIRED_ROOMS } from "./enums";

/**
 * Back-office editing of a listing and its unit — the rules, kept pure so they can be
 * tested without a database.
 *
 * WHAT AN ADMIN CAN CHANGE
 * The unit's physical facts, the listing's commercial details, and its photos.
 *
 * WHAT THEY CANNOT — compound and area. A unit's location is its compound's (the
 * location check forces unit coords to the compound and checks photo GPS against its
 * polygon). Moving a unit to another compound is not an edit, it is a different unit:
 * it would invalidate the location verification, the fingerprint and the fair-price
 * comparables at once. That is a relist, not a form field.
 *
 * Only fields present in the body are touched, so a form that sends one field cannot
 * blank the others. An explicit `null` clears an optional field; it never clears a
 * required one.
 */

export const VIEWS = ["garden", "pool", "street", "landscape", "sea", "open"] as const;

export type EditError = { field: string; code: "invalid" | "required" | "out_of_range" | "too_long" };

export type UnitPatch = Partial<{
  type: string;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  landSqm: number | null;
  floor: number | null;
  building: string | null;
  unitNumber: string | null;
  finishing: string;
  deliveryStatus: string;
  deliveryDate: Date | null;
  view: string | null;
}>;

export type ListingPatch = Partial<{
  titleAr: string | null;
  titleEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  purpose: string;
  paymentType: string;
  remainingToDeveloper: number | null;
  maintenanceDue: number | null;
}>;

export type ParsedEdit =
  | { ok: true; unit: UnitPatch; listing: ListingPatch }
  | { ok: false; errors: EditError[] };

/** Fields whose change alters the unit fingerprint (see fingerprint.ts). */
export const FINGERPRINT_FIELDS = ["building", "floor", "unitNumber", "type", "sizeSqm"] as const;

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 4000;
const TEXT_MAX = 40;

export function parseAdminEdit(body: unknown): ParsedEdit {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const u = (b.unit && typeof b.unit === "object" ? b.unit : {}) as Record<string, unknown>;
  const l = (b.listing && typeof b.listing === "object" ? b.listing : {}) as Record<string, unknown>;
  const errors: EditError[] = [];
  const unit: UnitPatch = {};
  const listing: ListingPatch = {};

  const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

  function oneOf(o: Record<string, unknown>, k: string, allowed: readonly string[], field: string, nullable = false) {
    if (!has(o, k)) return undefined;
    const v = o[k];
    if ((v === null || v === "") && nullable) return null;
    if (typeof v !== "string" || !allowed.includes(v)) {
      errors.push({ field, code: v === null || v === "" ? "required" : "invalid" });
      return undefined;
    }
    return v;
  }

  function num(
    o: Record<string, unknown>,
    k: string,
    field: string,
    opts: { min: number; max: number; int?: boolean; nullable?: boolean },
  ) {
    if (!has(o, k)) return undefined;
    const v = o[k];
    if (v === null || v === "") {
      if (opts.nullable) return null;
      errors.push({ field, code: "required" });
      return undefined;
    }
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    if (!Number.isFinite(n) || (opts.int && !Number.isInteger(n))) {
      errors.push({ field, code: "invalid" });
      return undefined;
    }
    if (n < opts.min || n > opts.max) {
      errors.push({ field, code: "out_of_range" });
      return undefined;
    }
    return n;
  }

  function text(o: Record<string, unknown>, k: string, field: string, max: number) {
    if (!has(o, k)) return undefined;
    const v = o[k];
    if (v === null) return null;
    if (typeof v !== "string") {
      errors.push({ field, code: "invalid" });
      return undefined;
    }
    const t = v.trim();
    if (t.length > max) {
      errors.push({ field, code: "too_long" });
      return undefined;
    }
    return t === "" ? null : t;
  }

  const set = <T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined) => {
    if (value !== undefined) target[key] = value;
  };

  // --- unit ---
  set(unit, "type", oneOf(u, "type", UNIT_TYPES, "unit.type") as string | undefined);
  set(unit, "finishing", oneOf(u, "finishing", FINISHINGS, "unit.finishing") as string | undefined);
  set(unit, "deliveryStatus", oneOf(u, "deliveryStatus", DELIVERY_STATUSES, "unit.deliveryStatus") as string | undefined);
  set(unit, "view", oneOf(u, "view", VIEWS, "unit.view", true));
  set(unit, "bedrooms", num(u, "bedrooms", "unit.bedrooms", { min: 0, max: 20, int: true }) as number | undefined);
  set(unit, "bathrooms", num(u, "bathrooms", "unit.bathrooms", { min: 0, max: 20, int: true }) as number | undefined);
  set(unit, "sizeSqm", num(u, "sizeSqm", "unit.sizeSqm", { min: 10, max: 100_000 }) as number | undefined);
  set(unit, "landSqm", num(u, "landSqm", "unit.landSqm", { min: 1, max: 1_000_000, nullable: true }));
  set(unit, "floor", num(u, "floor", "unit.floor", { min: -3, max: 200, int: true, nullable: true }));
  set(unit, "building", text(u, "building", "unit.building", TEXT_MAX));
  set(unit, "unitNumber", text(u, "unitNumber", "unit.unitNumber", TEXT_MAX));
  if (has(u, "deliveryDate")) {
    const v = u.deliveryDate;
    if (v === null || v === "") unit.deliveryDate = null;
    else {
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) errors.push({ field: "unit.deliveryDate", code: "invalid" });
      else unit.deliveryDate = d;
    }
  }

  // --- listing ---
  set(listing, "titleAr", text(l, "titleAr", "listing.titleAr", TITLE_MAX));
  set(listing, "titleEn", text(l, "titleEn", "listing.titleEn", TITLE_MAX));
  set(listing, "descriptionAr", text(l, "descriptionAr", "listing.descriptionAr", DESCRIPTION_MAX));
  set(listing, "descriptionEn", text(l, "descriptionEn", "listing.descriptionEn", DESCRIPTION_MAX));
  set(listing, "purpose", oneOf(l, "purpose", PURPOSES, "listing.purpose") as string | undefined);
  set(listing, "paymentType", oneOf(l, "paymentType", PAYMENT_TYPES, "listing.paymentType") as string | undefined);
  // EGP 1,000 floor catches a typo'd "13800" for 13.8M rent-or-sale alike; 5bn ceiling a stray zero.
  set(listing, "price", num(l, "price", "listing.price", { min: 1_000, max: 5_000_000_000 }) as number | undefined);
  set(listing, "remainingToDeveloper", num(l, "remainingToDeveloper", "listing.remainingToDeveloper", { min: 0, max: 5_000_000_000, nullable: true }));
  set(listing, "maintenanceDue", num(l, "maintenanceDue", "listing.maintenanceDue", { min: 0, max: 5_000_000_000, nullable: true }));

  return errors.length ? { ok: false, errors } : { ok: true, unit, listing };
}

/**
 * Field-level before/after for the audit log — only what actually changed, so the trail
 * reads "price 13.8M → 13.2M" and not a dump of the whole row.
 */
export function diffFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(patch)) {
    const from = before[k] ?? null;
    const a = from instanceof Date ? from.toISOString() : from;
    const b = to instanceof Date ? to.toISOString() : (to ?? null);
    if (a !== b) out[k] = { from: a, to: b };
  }
  return out;
}

/** Rooms an admin can tag a photo with — the publish gate's six. */
export function isRoom(v: unknown): v is (typeof REQUIRED_ROOMS)[number] {
  return typeof v === "string" && (REQUIRED_ROOMS as readonly string[]).includes(v);
}
