/**
 * Where a retired /search URL now lives: the root, with the old parameters translated.
 *
 * Shared by src/proxy.ts (which answers page loads without rendering anything — this used
 * to cost a full dynamic render, ~240 ms, just to send a redirect) and by
 * src/app/search/page.tsx (the fallback for in-app navigations). One translation, so the
 * two can't disagree.
 *
 * PARAMETER TRANSLATION: the new facets are multi-select and named for their groups, so a
 * few old single-value names are renamed on the way through. Anything unrecognised is
 * passed along untouched — an unknown parameter costs nothing, while silently dropping one
 * loses the filter someone actually asked for.
 */

/** Old name → new name. Same meaning, different group label on the new screen. */
const RENAMED: Record<string, string> = {
  bedrooms: "beds",
};

export function retiredSearchTarget(params: Iterable<[string, string]>): { target: string; permanent: boolean } {
  const next = new URLSearchParams();
  for (const [key, value] of params) {
    if (!value) continue;
    /*
      `bedrooms=3` meant "3 or more" on the old screen; `beds` is an exact multi-select.
      Expanding it to 3,4,5 preserves what the link promised — "5" is the 5-or-more option,
      so the range stays open-ended at the top.
    */
    if (key === "bedrooms") {
      const floor = Number(value);
      if (Number.isFinite(floor) && floor >= 0) {
        for (let n = Math.max(0, Math.trunc(floor)); n <= 5; n++) next.append("beds", String(n));
        continue;
      }
    }
    next.append(RENAMED[key] ?? key, value);
  }
  const query = next.toString();
  /*
    Permanent only for the bare URL, where the meaning is stable: /search IS the root now.
    A filtered URL gets a temporary one — the translation above may be refined, and
    cementing it in every crawler's cache would make a later correction unreachable.
  */
  return { target: query ? `/?${query}` : "/", permanent: !query };
}
