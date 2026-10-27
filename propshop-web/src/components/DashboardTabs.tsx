"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The dashboard's navigation on phones (mobile pass, 2026-10-20): one swipeable row of
 * tabs instead of the ten-row side menu, which filled the whole first screen before any
 * of the page it belongs to.
 *
 * The active tab is scrolled into view, so arriving on "Saved" does not leave it hidden
 * past the right edge of the row.
 */
export default function DashboardTabs({
  items,
  logoutLabel,
}: {
  items: { href: string; label: string; count: number | null; urgent?: boolean }[];
  logoutLabel: string;
}) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // The longest matching prefix wins, so /dashboard/listings/x lights "My properties"
  // and not "Overview".
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Scrolled by the measured offset: scrollIntoView left this RTL row at its start.
  useEffect(() => {
    const tab = activeRef.current;
    const row = tab?.parentElement;
    if (!tab || !row) return;
    const t = tab.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    row.scrollBy({ left: t.left + t.width / 2 - (r.left + r.width / 2) });
  }, [active]);

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border)] [scrollbar-width:none]">
      {items.map((item) => {
        const on = item.href === active;
        return (
          <Link
            key={item.href}
            ref={on ? activeRef : undefined}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[14px] font-semibold transition ${
              on ? "border-accent-500 text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {item.label}
            {item.count !== null && item.count > 0 && (
              <span className={`tnum text-[12px] font-bold ${item.urgent ? "text-accent-600" : "text-ink-500"}`}>
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
      <form action="/api/auth/logout" method="post" className="shrink-0">
        <button type="submit" className="h-11 whitespace-nowrap px-2.5 text-[14px] font-semibold text-ink-500 hover:text-ink-900">
          {logoutLabel}
        </button>
      </form>
    </nav>
  );
}

/** The same destinations as a plain vertical list for the desktop sidebar. */
export function DashboardSideNav({
  items,
}: {
  items: { href: string; label: string; count: number | null; urgent?: boolean }[];
}) {
  const pathname = usePathname();
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="flex flex-col">
      {items.map((item) => {
        const on = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 border-s-2 py-2 ps-3 text-[14px] transition ${
              on
                ? "border-accent-500 font-semibold text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            <span>{item.label}</span>
            {item.count !== null && item.count > 0 && (
              <span className={`tnum -ms-1.5 text-[12px] font-bold ${item.urgent ? "text-accent-600" : "text-ink-500"}`}>
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
