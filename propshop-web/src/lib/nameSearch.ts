/**
 * Name search for pickers (the trade request's compound type-ahead). Pure and free of
 * server imports, so client components can use it.
 */

/**
 * Arabic/Latin-insensitive folding for the compound type-ahead: case, diacritics, the
 * alef/yaa/taa-marbuta variants people type interchangeably, and spacing. "Mivida",
 * "mi vida" and "ميفيدا" each fold to something the matching name contains.
 */
export function foldName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[\s\-_'’.]+/g, "");
}

/**
 * Ranks names for a type-ahead query: prefix matches first, then contains, then names
 * that share most of the query's letters in order (a forgiving "similar" match for typos
 * like "mevida"). Returns the matching items, best first.
 */
export function rankByName<T>(items: T[], query: string, names: (item: T) => string[], limit = 8): T[] {
  const q = foldName(query);
  if (!q) return [];
  const score = (item: T) => {
    let best = 0;
    for (const raw of names(item)) {
      const n = foldName(raw);
      if (!n) continue;
      if (n.startsWith(q)) best = Math.max(best, 3);
      else if (n.includes(q)) best = Math.max(best, 2);
      else if (q.length >= 3 && subsequenceRatio(q, n) >= 0.75) best = Math.max(best, 1);
    }
    return best;
  };
  return items
    .map((item) => ({ item, s: score(item) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.item);
}

/**
 * Share of the query's letters found in order inside the name. A letter the name lacks
 * (a typo) is skipped rather than ending the run, so "mevida" still lines up with "mivida".
 */
function subsequenceRatio(q: string, name: string): number {
  let hits = 0;
  let j = 0;
  for (const ch of q) {
    const at = name.indexOf(ch, j);
    if (at >= 0) {
      hits++;
      j = at + 1;
    }
  }
  return hits / q.length;
}
