import { permanentRedirect } from "next/navigation";

/**
 * /browse — moved to the site root.
 *
 * The faceted results screen is now the main design (owner, 2026-09-22), so it lives at `/`
 * and this path forwards to it. One canonical URL per screen: the alternative — serving the
 * same page from two addresses — is the duplication that retiring /search was meant to end,
 * and it splits a page's search standing across two URLs for no benefit.
 *
 * Kept rather than deleted because /browse was linked from the chrome and shared during
 * review. Query parameters carry across untouched: the facets, sort, view and paging are
 * all named the same at the root.
 */
export default async function MovedBrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const next = new URLSearchParams();

  for (const [key, raw] of Object.entries(sp)) {
    const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const value of values) if (value) next.append(key, value);
  }

  const query = next.toString();
  permanentRedirect(query ? `/?${query}` : "/");
}
