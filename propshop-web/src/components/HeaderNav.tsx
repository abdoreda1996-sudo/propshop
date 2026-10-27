"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The header's section links, with the current section marked by a rust underline.
 * A client component only because the layout cannot read the pathname.
 */
export default function HeaderNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="hidden min-w-0 items-stretch gap-5 self-stretch lg:flex">
      {links.map((l) => {
        const on = l.href === "/" ? pathname === "/" : pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center whitespace-nowrap border-b-2 pt-0.5 text-[14px] transition ${
              on ? "border-accent-500 font-semibold text-ink-900" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
