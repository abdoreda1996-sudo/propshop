"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Locale } from "@/lib/i18n";

/**
 * The phone menu (mobile pass, owner 2026-10-20: "most users will use it from mobile").
 *
 * Below the breakpoint where the headers drop their links, Pricing, How it works, the
 * price index and the rest had NO way in at all — the bar kept only the logo, language and
 * account. This puts every one of them behind one button instead of squeezing them back in.
 *
 * Closes on navigation (the path changing), on the backdrop and on Escape, and locks the
 * page scroll while open so a swipe inside the sheet does not scroll the results behind it.
 */
export default function MobileMenu({
  locale,
  signedIn,
  staff = false,
  className = "",
}: {
  locale: Locale;
  signedIn: boolean;
  staff?: boolean;
  /** Visibility per breakpoint, from the header it sits in (e.g. "lg:hidden"). */
  className?: string;
}) {
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close when the route changes underneath the sheet (adjusted during render, not in an
  // effect, so the closed state paints with the new page rather than one frame after it).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    { href: "/", label: ar ? "الوحدات" : "Homes" },
    { href: "/trade", label: ar ? "مقايضة" : "Trade" },
    { href: "/compounds", label: ar ? "الكمبوندات" : "Compounds" },
    { href: "/pricing", label: ar ? "الرسوم" : "Pricing" },
    { href: "/how-it-works", label: ar ? "إزاي بنشتغل" : "How it works" },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ar ? "القائمة" : "Menu"}
        aria-expanded={open}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink-900 hover:bg-ink-50 ${className}`}
      >
        <Menu size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={ar ? "القائمة" : "Menu"}>
          <button
            type="button"
            aria-label={ar ? "اقفل" : "Close"}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <nav className="absolute inset-y-0 end-0 flex w-[min(320px,86vw)] flex-col overflow-y-auto border-s border-[var(--border)] bg-white">
            <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
              <span className="text-[15px] font-bold text-ink-900">{ar ? "القائمة" : "Menu"}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={ar ? "اقفل" : "Close"}
                className="grid h-11 w-11 place-items-center rounded-md hover:bg-ink-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2 p-4">
              <Link href="/list" className="btn btn-primary h-11 flex-1 text-[14px]">
                {ar ? "اعرض وحدتك" : "List your unit"}
              </Link>
              <Link href="/request" className="btn btn-ghost h-11 flex-1 text-[14px]">
                {ar ? "اطلب وحدة" : "Request a unit"}
              </Link>
            </div>

            <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {signedIn && (
                <li>
                  <Link href="/dashboard" className="block px-5 py-3.5 text-[15px] font-semibold text-ink-900 hover:bg-ink-50">
                    {ar ? "حسابي" : "My account"}
                  </Link>
                </li>
              )}
              {staff && (
                <li>
                  <Link href="/admin" className="block px-5 py-3.5 text-[15px] font-semibold text-ink-900 hover:bg-ink-50">
                    {ar ? "لوحة التحكم" : "Back office"}
                  </Link>
                </li>
              )}
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={pathname === l.href ? "page" : undefined}
                    className="block border-s-2 border-transparent px-5 py-3.5 text-[15px] text-ink-900 hover:bg-ink-50 aria-[current=page]:border-accent-500 aria-[current=page]:font-semibold"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </>
  );
}
