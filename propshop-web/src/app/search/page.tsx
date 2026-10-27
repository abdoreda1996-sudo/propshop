import { redirect, permanentRedirect } from "next/navigation";
import { retiredSearchTarget } from "@/lib/searchRedirect";

/**
 * /search — retired, redirects to the site root.
 *
 * The two screens answered the same question with different code: /search was the original
 * results page, and the faceted rebuild — briefly at /browse, now at `/` — replaced it.
 * Keeping both was how the codebase would have ended up with two answers to "what matches
 * these filters" and a bug fixed in only one of them.
 *
 * This file stays rather than being deleted because /search is linked from the header
 * categories, from anything already indexed, and from every bookmark anyone has made. A
 * 404 would break all of them; a redirect carries them across.
 *
 * Page loads are answered by src/proxy.ts without rendering; this handles in-app
 * navigations. The translation lives in src/lib/searchRedirect.ts.
 */

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function RetiredSearchPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const pairs: [string, string][] = Object.entries(sp).flatMap(([k, raw]) =>
    (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map((v): [string, string] => [k, v]),
  );
  const { target, permanent } = retiredSearchTarget(pairs);
  if (permanent) permanentRedirect(target);
  redirect(target);
}
