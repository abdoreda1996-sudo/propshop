import Link from "next/link";
import type { ReactNode } from "react";
import { Locale } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";

/**
 * Small, plain building blocks shared by the back-office pages, so every queue has the
 * same heading, tab strip, notice and empty state instead of each page inventing one.
 */

export function AdminTitle({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-[var(--border)] pb-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-ink-900">{title}</h1>
        {intro ? <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-ink-500">{intro}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

/** An underlined tab strip. Scrolls sideways on a phone instead of wrapping into rows. */
export function AdminTabs({
  tabs,
  locale,
}: {
  tabs: { href: string; label: string; count?: number; active: boolean; alert?: boolean }[];
  locale: Locale;
}) {
  return (
    <nav className="-mb-px mt-3 flex gap-5 overflow-x-auto border-b border-[var(--border)] text-[13px] [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={`flex shrink-0 items-baseline gap-1.5 border-b-2 py-2.5 transition ${
            t.active ? "border-accent-500 font-semibold text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900"
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`tnum text-[12px] ${t.alert && t.count > 0 ? "font-semibold text-danger-700" : "text-ink-500"}`}>
              {formatNumber(t.count, locale)}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** A one-line notice above a queue. `tone="danger"` for SLA breaches and the like. */
export function AdminNotice({ tone = "plain", children, action }: { tone?: "plain" | "danger"; children: ReactNode; action?: ReactNode }) {
  const cls = tone === "danger" ? "border-danger-600 bg-danger-50 text-danger-700" : "border-ink-900 bg-ink-50 text-ink-900";
  return (
    <div className={`mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-s-2 px-4 py-3 text-[13px] ${cls}`}>
      <div className="min-w-0 flex-1">{children}</div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="mt-6 border-y border-[var(--border)] py-8 text-[14px] text-ink-500">{children}</p>;
}

/** Table header cell / body cell classes, so every admin table has the same density. */
export const TH = "px-3 py-2 text-start font-semibold";
export const THEAD_ROW = "border-b border-ink-900 text-[12px] text-ink-500";
