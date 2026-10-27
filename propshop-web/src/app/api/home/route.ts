import { ok } from "@/lib/api";
import { getHomeData } from "@/lib/home";

/**
 * GET /api/home — the discover payload for the Flutter app.
 *
 * Same function the website's home page calls, so the two clients cannot show different
 * counters or a different set of featured compounds.
 */
export const revalidate = 300;

export async function GET() {
  return ok(await getHomeData());
}
