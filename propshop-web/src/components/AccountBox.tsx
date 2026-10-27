import Link from "next/link";
import { Locale, t } from "@/lib/i18n";
import { SessionUser } from "@/lib/auth";

/**
 * The signed-in visitor's corner of the chrome: "Welcome Ahmed" with "Dashboard" under it,
 * the whole box one link to /dashboard. Shared by SiteHeader and the home page's two navs
 * so every page greets the same way.
 *
 * First name only — full names here run to four parts and the bar has no room for them.
 * `compact` fits the home page's 46px bars; the default fits SiteHeader's 62px one.
 */
export default function AccountBox({
  session,
  locale,
  compact = false,
}: {
  session: SessionUser;
  locale: Locale;
  compact?: boolean;
}) {
  // "عبد الرحمن" / "Abdel Rahman" are one name in two words — "Welcome عبد" would be wrong.
  const parts = session.fullName.trim().split(/\s+/);
  const firstName =
    parts.length > 1 && /^(عبد|ابو|أبو|abd|abdel|abdul|abu)$/i.test(parts[0])
      ? `${parts[0]} ${parts[1]}`
      : parts[0] || session.fullName;

  return (
    <Link
      href="/dashboard"
      title={session.fullName}
      className="flex min-w-0 flex-col rounded-md px-2 py-1 leading-tight text-ink-900 transition hover:bg-ink-50"
    >
      <span className={`max-w-[9rem] truncate font-semibold ${compact ? "text-[12.5px]" : "text-[13px]"}`}>{firstName}</span>
      <span className={`muted ${compact ? "text-[12px]" : "text-[12px]"}`}>{t("nav_dashboard", locale)}</span>
    </Link>
  );
}
