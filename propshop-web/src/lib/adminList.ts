/**
 * Shared plumbing for the back-office action queues: paging, filter parsing, bulk limits.
 *
 * Every queue used a fixed `take` (20–80) with no way past it — at 20,000 listings a month
 * the 21st pending listing was simply invisible. Queues are now paged, filtered by URL
 * params (so a filtered view can be bookmarked or sent to a colleague), and selectable for
 * bulk actions.
 */

export const ADMIN_PAGE_SIZE = 20;
/** Upper bound on one bulk request — a page is 20; 100 covers "select all" on a few pages. */
export const BULK_MAX = 100;

export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a query param, trimmed; undefined when absent or empty. */
export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, 120) : undefined;
}

export function pageOf(sp: SearchParams, pageSize = ADMIN_PAGE_SIZE) {
  const n = Number(param(sp, "page") ?? 1);
  const page = Number.isFinite(n) ? Math.min(10_000, Math.max(1, Math.floor(n))) : 1;
  return { page, skip: (page - 1) * pageSize, take: pageSize, pageSize };
}

/**
 * The "assigned to" filter: `me`, `none` (unassigned), or a staff id. Returns the Prisma
 * fragment for the given column, or {} for "anyone".
 */
export function assigneeWhere(field: string, value: string | undefined, me: string): Record<string, unknown> {
  if (!value) return {};
  if (value === "me") return { [field]: me };
  if (value === "none") return { [field]: null };
  return { [field]: value };
}

/** Only allow a value from a known list (filters come from the URL, i.e. from anyone). */
export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** The current params minus `page`, for building filter/pager links that keep each other. */
export function keepParams(sp: SearchParams, drop: string[] = ["page"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const s = Array.isArray(v) ? v[0] : v;
    if (s && !drop.includes(k)) out[k] = s;
  }
  return out;
}
