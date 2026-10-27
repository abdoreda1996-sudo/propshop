import Link from "next/link";
import { Locale, t } from "@/lib/i18n";
import { SessionUser, isStaff } from "@/lib/auth";
import LocaleToggle from "./LocaleToggle";
import Logo from "./Logo";
import AccountBox from "./AccountBox";
import GuestBox from "./GuestBox";
import MobileMenu from "./MobileMenu";
import HeaderNav from "./HeaderNav";

/**
 * The one header, on every page including the results screen at `/` (2026-10-26; the home
 * page used to carry its own copy with different links, so the nav changed depending on
 * where you were).
 *
 * Logo and the section links on the start side, the two asks and the account on the end.
 * "List your unit" is the only outlined forest button in the bar; "Request a unit" is a
 * plain link beside it so the two do not compete. Below lg the section links move into
 * the phone menu.
 */
export default async function SiteHeader({
  locale,
  session,
}: {
  locale: Locale;
  session: SessionUser | null;
}) {
  const ar = locale === "ar";

  const links = [
    { href: "/", label: ar ? "الوحدات" : "Homes" },
    { href: "/trade", label: ar ? "مقايضة" : "Trade" },
    { href: "/compounds", label: t("nav_compounds", locale) },
    { href: "/pricing", label: t("nav_pricing", locale) },
    { href: "/how-it-works", label: t("nav_how", locale) },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white">
      <div className="container-page flex h-[60px] items-center gap-3 lg:gap-8">
        <Link href="/" className="shrink-0" aria-label={t("brand", locale)}>
          <Logo locale={locale} height={38} />
        </Link>

        <HeaderNav links={links} />

        <div className="ms-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href="/request"
            className="hidden whitespace-nowrap text-[14px] text-ink-700 underline-offset-4 hover:text-ink-900 hover:underline xl:block"
          >
            {ar ? "اطلب وحدة" : "Request a unit"}
          </Link>
          <Link href="/list" className="btn btn-primary hidden whitespace-nowrap px-3.5 py-2 text-[13.5px] sm:inline-flex">
            {t("nav_sell", locale)}
          </Link>
          {session && isStaff(session.role) && (
            <Link href="/admin" className="hidden whitespace-nowrap text-[14px] text-ink-500 hover:text-ink-900 lg:block">
              {t("nav_admin", locale)}
            </Link>
          )}
          {session ? <AccountBox session={session} locale={locale} /> : <GuestBox locale={locale} />}
          <LocaleToggle locale={locale} />
          <MobileMenu locale={locale} signedIn={!!session} staff={!!session && isStaff(session.role)} className="lg:hidden" />
        </div>
      </div>
    </header>
  );
}
