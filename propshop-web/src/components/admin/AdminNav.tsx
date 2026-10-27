"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck, Inbox, Flag, Building2, LayoutDashboard, Users, MapPinOff, CalendarDays, Handshake, Repeat, Camera, Image as ImageIcon } from "lucide-react";

// By name: a component cannot cross from the server layout to this client island.
const ICONS = { ShieldCheck, Inbox, Flag, Building2, LayoutDashboard, Users, MapPinOff, CalendarDays, Handshake, Repeat, Camera, ImageIcon };
export type AdminNavIcon = keyof typeof ICONS;
export type AdminNavItem = { href: string; label: string; icon: AdminNavIcon; count: number | null; alert?: number };

/**
 * The back-office sidebar. A client island only so it can mark the page you are on;
 * the counts are computed by the server layout.
 *
 * On a phone it is a sideways-scrolling strip above the page instead of a column, so
 * the queue itself starts near the top of the screen.
 */
export default function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  // On a phone the strip scrolls sideways; bring the current page into view.
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const nav = navRef.current;
    if (el && nav && nav.scrollWidth > nav.clientWidth) el.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);
  const isActive = (href: string) => {
    if (href.includes("?")) return false;
    return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav ref={navRef} aria-label="Back office" className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 [scrollbar-width:none] lg:mx-0 lg:block lg:overflow-visible lg:px-0">
      {items.map((item) => {
        const on = isActive(item.href);
        const Icon = ICONS[item.icon];
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[13.5px] transition lg:whitespace-normal ${
              on ? "bg-ink-100 font-semibold text-ink-900" : "text-ink-700 hover:bg-ink-50 hover:text-ink-900"
            }`}
          >
            <Icon size={15} className={on ? "text-accent-500" : "text-ink-500"} />
            <span className="lg:flex-1">{item.label}</span>
            {item.alert ? <span className="tnum text-[12px] font-semibold text-danger-700">{item.alert}</span> : null}
            {item.count ? <span className="tnum text-[12px] text-ink-500">{item.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
