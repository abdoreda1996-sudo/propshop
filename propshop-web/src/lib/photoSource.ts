import { haversineMetres } from "./geo";

/**
 * Whether a photo that CLAIMS in-app capture keeps that source.
 *
 * Shared by the URL-registration route and the byte-upload route so the two can never
 * apply different rules. An "in_app" photo must carry GPS, and the GPS must be near the
 * unit; otherwise it is demoted to "upload", which cannot satisfy the photo minimum.
 *
 * "photographer" is NEVER accepted from a client. Both routes are owner routes, and a
 * photographer photo counts toward the minimum without any GPS — so trusting the claim
 * let an owner skip the on-site check entirely. Real photographer photos are written by
 * the staff booking-delivery path, which does not come through here.
 */
export const MAX_GPS_DRIFT_METRES = 500;

export type PhotoSource = "in_app" | "photographer" | "upload";

export function classifyPhotoSource(
  claimed: unknown,
  gps: { lat: number | null; lng: number | null },
  unit: { lat: number | null; lng: number | null },
): PhotoSource {
  if (claimed !== "in_app") return "upload";
  const hasGps = gps.lat !== null && gps.lng !== null;
  const nearUnit =
    hasGps && unit.lat !== null && unit.lng !== null
      ? haversineMetres(gps.lat as number, gps.lng as number, unit.lat, unit.lng) <= MAX_GPS_DRIFT_METRES
      : hasGps; // no unit pin yet — accept the GPS we were given
  return nearUnit ? "in_app" : "upload";
}
