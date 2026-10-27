import { NextRequest } from "next/server";
import { ok, fail, requireUser, audit, clientIp } from "@/lib/api";
import { getHeroConfig, heroOptions, parseHeroInput, saveHeroConfig } from "@/lib/siteHero";

/**
 * The home hero cover (admin only — it is the first thing every visitor sees).
 *
 *   GET → { config, tours, photos }   the current setting plus what can be picked
 *   PUT { source, tourId?, linkUrl?, mediaId?, uploadUrl?, uploadKind?, uploadPoster?, dim, position }
 *
 * Uploads go to ./upload first; the URL it returns is then saved here with source "upload".
 */

export async function GET(req: NextRequest) {
  const auth = await requireUser(req, ["admin"]);
  if ("response" in auth) return auth.response;
  const [config, options] = await Promise.all([getHeroConfig(), heroOptions()]);
  return ok({ config, ...options });
}

export async function PUT(req: NextRequest) {
  const auth = await requireUser(req, ["admin"]);
  if ("response" in auth) return auth.response;
  const body = await req.json().catch(() => ({}));
  const parsed = parseHeroInput(body);
  if (!parsed.ok) return fail(parsed.reason, 422);
  await saveHeroConfig(parsed.config, auth.user.id);
  await audit(auth.user.id, "site.hero_update", "site", "home_hero", { source: parsed.config.source }, clientIp(req));
  return ok({ config: parsed.config });
}
