/**
 * Automatic location verification.
 *
 * Every unit on PropShop sits in a compound, and its location IS the compound's — the
 * owner never drops a pin. What an owner can get wrong (or fake) is everything that
 * claims to have been on site: the photos. This check compares each located photo with
 * the compound footprint and reports what does not fit, so a reviewer sees it without
 * having to open a map.
 *
 * Pure function. `locationService.ts` loads the rows, runs this and stores the result on
 * the listing (`locationStatus`, `locationIssuesJson`, `locationCheckedAt`).
 *
 * It does NOT block publishing. The publish gate (listingValidation.ts) already refuses
 * the hard failures; this is the reviewer's early-warning list, and a verdict a human
 * can overrule when a GPS fix was simply poor.
 */

import { haversineMetres, pointInPolygonJson } from "./geo";

/**
 * How far outside the compound boundary a photo may be and still count as taken there.
 *
 * Phone GPS is commonly off by 5–50 m in the open and much worse between towers, and a
 * facade shot is often taken from the road just outside the fence.
 */
export const PHOTO_TOLERANCE_METRES = 300;

/**
 * With no mapped boundary, the only reference is the compound's centre point. Egyptian
 * compounds are routinely 1–3 km across, so the radius has to be generous or every
 * photo in a big compound would be flagged.
 */
export const CENTRE_ONLY_RADIUS_METRES = 1_500;

export type LocationSeverity = "high" | "medium" | "low";

export type LocationIssue = {
  code:
    | "no_compound"
    | "compound_not_mapped"
    | "unit_outside_compound"
    | "photo_outside_compound"
    | "photo_missing_gps"
    | "no_located_photos";
  severity: LocationSeverity;
  messageAr: string;
  messageEn: string;
  mediaId?: string;
  distanceM?: number;
};

export type LocationStatus = "verified" | "issues";

export type LocationResult = {
  status: LocationStatus;
  issues: LocationIssue[];
};

export type LocationSnapshot = {
  unit: { lat: number | null; lng: number | null };
  compound: {
    nameAr: string;
    nameEn: string;
    centerLat: number | null;
    centerLng: number | null;
    geomJson: string | null;
  } | null;
  media: {
    id: string;
    source: string;
    gpsLat: number | null;
    gpsLng: number | null;
  }[];
};

type Ring = [number, number][];

function outerRing(geomJson: string | null): Ring | null {
  if (!geomJson) return null;
  try {
    const g = JSON.parse(geomJson) as unknown;
    const obj = g as { type?: string; coordinates?: unknown };
    if (obj && obj.type === "Polygon" && Array.isArray(obj.coordinates)) return (obj.coordinates as Ring[])[0] ?? null;
    if (Array.isArray(g)) {
      const arr = g as unknown[];
      if (Array.isArray(arr[0]) && typeof (arr[0] as unknown[])[0] === "number") return arr as Ring;
      if (Array.isArray(arr[0])) return (arr as Ring[])[0] ?? null;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Metres from a point to the nearest edge of a ring (0 when inside).
 *
 * Projects onto a local flat plane around the point. At compound scale (a few km) the
 * error is far below GPS noise, and it keeps this dependency-free.
 */
export function distanceToRingMetres(lat: number, lng: number, geomJson: string | null): number | null {
  const ring = outerRing(geomJson);
  if (!ring || ring.length < 3) return null;
  if (pointInPolygonJson(lat, lng, geomJson)) return 0;

  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const project = ([x, y]: [number, number]) => [(x - lng) * mPerDegLng, (y - lat) * mPerDegLat] as const;

  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = project(ring[i]);
    const [bx, by] = project(ring[(i + 1) % ring.length]);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // The point is the origin of the projection.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / len2));
    const px = ax + t * dx;
    const py = ay + t * dy;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}

const has = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * How far a point sits from the compound, and whether that is acceptable.
 * Null when the compound has neither a boundary nor a centre to measure against.
 */
function measure(
  lat: number,
  lng: number,
  compound: NonNullable<LocationSnapshot["compound"]>,
  tolerance: number,
): { distanceM: number; ok: boolean } | null {
  const toRing = distanceToRingMetres(lat, lng, compound.geomJson);
  if (toRing !== null) return { distanceM: Math.round(toRing), ok: toRing <= tolerance };
  if (has(compound.centerLat) && has(compound.centerLng)) {
    const d = haversineMetres(lat, lng, compound.centerLat, compound.centerLng);
    return { distanceM: Math.round(d), ok: d <= CENTRE_ONLY_RADIUS_METRES };
  }
  return null;
}

const ON_SITE_SOURCES = new Set(["in_app", "photographer"]);

export function checkListingLocation(s: LocationSnapshot): LocationResult {
  const issues: LocationIssue[] = [];

  if (!s.compound) {
    issues.push({
      code: "no_compound",
      severity: "high",
      messageAr: "الوحدة مش مربوطة بكمبوند، فمينفعش نحدد موقعها.",
      messageEn: "The unit is not linked to a compound, so its location cannot be set.",
    });
    return { status: "issues", issues };
  }

  const c = s.compound;
  const mapped = !!outerRing(c.geomJson) || (has(c.centerLat) && has(c.centerLng));
  if (!mapped) {
    // The platform's gap, not the owner's. Medium rather than low because nothing could
    // be checked, and "verified" must never be shown for a check that did not run.
    issues.push({
      code: "compound_not_mapped",
      severity: "medium",
      messageAr: `${c.nameAr} مالوش موقع على الخريطة لسه، فالتحقق من الموقع مش ممكن.`,
      messageEn: `${c.nameEn} has no location on the map yet, so the location cannot be checked.`,
    });
  }

  // The unit's point is written from the compound on the server, so this only fires on
  // legacy rows or a tampered write — which is exactly when a reviewer needs to know.
  if (mapped && has(s.unit.lat) && has(s.unit.lng)) {
    const m = measure(s.unit.lat, s.unit.lng, c, 0);
    if (m && !m.ok) {
      issues.push({
        code: "unit_outside_compound",
        severity: "high",
        messageAr: `موقع الوحدة على بعد ${m.distanceM} م من حدود ${c.nameAr}.`,
        messageEn: `The unit's location is ${m.distanceM} m outside ${c.nameEn}.`,
        distanceM: m.distanceM,
      });
    }
  }

  let located = 0;
  for (const media of s.media) {
    const hasGps = has(media.gpsLat) && has(media.gpsLng);
    if (!hasGps) {
      if (ON_SITE_SOURCES.has(media.source)) {
        issues.push({
          code: "photo_missing_gps",
          severity: "medium",
          messageAr: "صورة متصورة من التطبيق من غير إحداثيات GPS.",
          messageEn: "A photo captured in the app carries no GPS coordinates.",
          mediaId: media.id,
        });
      }
      continue;
    }
    located++;
    if (!mapped) continue;
    const m = measure(media.gpsLat as number, media.gpsLng as number, c, PHOTO_TOLERANCE_METRES);
    if (m && !m.ok) {
      issues.push({
        code: "photo_outside_compound",
        severity: "high",
        messageAr: `صورة متصورة على بعد ${m.distanceM} م من ${c.nameAr}.`,
        messageEn: `A photo was taken ${m.distanceM} m from ${c.nameEn}.`,
        mediaId: media.id,
        distanceM: m.distanceM,
      });
    }
  }

  if (s.media.length > 0 && located === 0) {
    issues.push({
      code: "no_located_photos",
      severity: "medium",
      messageAr: "مفيش ولا صورة عليها موقع، فمينفعش نتأكد إن الصور من الوحدة.",
      messageEn: "No photo carries a location, so nothing confirms the photos were taken at the unit.",
    });
  }

  const status: LocationStatus = issues.some((i) => i.severity !== "low") ? "issues" : "verified";
  return { status, issues };
}

/** Compound coordinates for a unit — the only source of a unit's location. */
export function compoundPoint(
  compound: { centerLat: number | null; centerLng: number | null } | null | undefined,
): { lat: number | null; lng: number | null } {
  if (!compound || !has(compound.centerLat) || !has(compound.centerLng)) return { lat: null, lng: null };
  return { lat: compound.centerLat, lng: compound.centerLng };
}
