// Geo helpers. The brief calls for PostGIS; on SQLite we keep the same semantics in TS so
// the calling code does not change when the production Postgres/PostGIS schema is used.
// Each function here has a direct PostGIS equivalent, noted in the doc comment.

export type LngLat = [number, number]; // GeoJSON order: [lng, lat]
export type Ring = LngLat[];

/** ST_Contains(polygon, point) — ray casting, ring assumed closed or not. */
export function pointInRing(point: LngLat, ring: Ring): boolean {
  if (ring.length < 3) return false;
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Accepts a GeoJSON Polygon, its coordinates array, or a bare ring. */
export function pointInPolygonJson(lat: number, lng: number, geomJson: string | null | undefined): boolean | null {
  if (!geomJson) return null; // unknown — caller decides whether to fail open
  let geom: unknown;
  try {
    geom = JSON.parse(geomJson);
  } catch {
    return null;
  }
  const ring = extractOuterRing(geom);
  if (!ring) return null;
  return pointInRing([lng, lat], ring);
}

function extractOuterRing(geom: unknown): Ring | null {
  if (!geom) return null;
  const g = geom as { type?: string; coordinates?: unknown };
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) return (g.coordinates as Ring[])[0] ?? null;
  if (Array.isArray(geom)) {
    const arr = geom as unknown[];
    if (Array.isArray(arr[0]) && typeof (arr[0] as unknown[])[0] === "number") return arr as Ring;
    if (Array.isArray(arr[0])) return (arr as Ring[])[0] ?? null;
  }
  return null;
}

const EARTH_RADIUS_M = 6371000;

/** ST_Distance(geography, geography) — metres between two WGS84 points. */
export function haversineMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/** Square bounding box around a point, for a cheap pre-filter before exact distance. */
export function boundingBox(lat: number, lng: number, radiusMetres: number) {
  const dLat = (radiusMetres / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Builds a square polygon ring around a centre — used by the seed for compound footprints. */
export function squareRing(lat: number, lng: number, halfSideMetres: number): Ring {
  const b = boundingBox(lat, lng, halfSideMetres);
  return [
    [b.minLng, b.minLat],
    [b.maxLng, b.minLat],
    [b.maxLng, b.maxLat],
    [b.minLng, b.maxLat],
    [b.minLng, b.minLat],
  ];
}
