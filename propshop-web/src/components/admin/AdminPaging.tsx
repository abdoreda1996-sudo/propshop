import Link from "next/link";
import { Locale } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";

/**
 * Server-rendered pager and filter bar for the back-office queues. Plain links and a GET
 * form — they work without JavaScript and every view is a shareable URL.
 */

export function Pager({
  basePath,
  params,
  page,
  total,
  pageSize,
  locale,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  total: number;
  pageSize: number;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams({ ...params, ...(p > 1 ? { page: String(p) } : {}) });
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  // A window around the current page plus first/last — a jump to page 37 of 40 is common.
  const nums = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label={ar ? "الصفحات" : "Pages"}>
      <span className="tnum text-[13px] muted">
        {formatNumber(from, locale)}–{formatNumber(to, locale)} {ar ? "من" : "of"} {formatNumber(total, locale)}
      </span>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {page > 1 && (
            <Link href={href(page - 1)} className="btn btn-ghost px-2.5 py-1 text-[13px]">
              {ar ? "السابق" : "Previous"}
            </Link>
          )}
          {nums.map((n, i) => (
            <span key={n} className="flex items-center gap-1">
              {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 muted">…</span>}
              <Link
                href={href(n)}
                aria-current={n === page ? "page" : undefined}
                className={`tnum rounded-md px-2.5 py-1 text-[13px] ${n === page ? "bg-ink-900 font-semibold text-white" : "text-ink-700 hover:bg-ink-100"}`}
              >
                {formatNumber(n, locale)}
              </Link>
            </span>
          ))}
          {page < pages && (
            <Link href={href(page + 1)} className="btn btn-ghost px-2.5 py-1 text-[13px]">
              {ar ? "التالي" : "Next"}
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}

export type FilterField =
  | { kind: "search"; name: string; placeholder: string }
  | { kind: "select"; name: string; label: string; options: { value: string; label: string }[] };

export function FilterBar({
  basePath,
  fields,
  values,
  keep = {},
  locale,
}: {
  basePath: string;
  fields: FilterField[];
  /** Current values, by field name. */
  values: Record<string, string | undefined>;
  /** Params to carry through the form untouched (e.g. the active tab). */
  keep?: Record<string, string>;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const active = fields.filter((f) => values[f.name]).length;
  return (
    <form action={basePath} method="get" className="mt-4 flex flex-wrap items-end gap-2">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) =>
        f.kind === "search" ? (
          <input
            key={f.name}
            name={f.name}
            defaultValue={values[f.name] ?? ""}
            placeholder={f.placeholder}
            className="input min-w-[min(100%,200px)] flex-1 py-2 text-[13px]"
          />
        ) : (
          <label key={f.name} className="text-[12px]">
            <span className="mb-1 block text-ink-500">{f.label}</span>
            <select name={f.name} defaultValue={values[f.name] ?? ""} className="input w-auto max-w-[14rem] py-2 text-[13px]">
              <option value="">{ar ? "الكل" : "All"}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ),
      )}
      <button className="btn btn-primary py-2 text-[13px]">
        {ar ? "طبّق" : "Apply"}
      </button>
      {active > 0 && (
        <Link
          href={(() => {
            const q = new URLSearchParams(keep).toString();
            return q ? `${basePath}?${q}` : basePath;
          })()}
          className="self-center px-1 text-[13px] text-ink-500 underline underline-offset-4 hover:text-ink-900"
        >
          {ar ? `امسح الفلاتر (${active})` : `Clear filters (${active})`}
        </Link>
      )}
    </form>
  );
}
