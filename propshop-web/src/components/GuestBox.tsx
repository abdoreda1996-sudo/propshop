import Link from "next/link";
import { Locale } from "@/lib/i18n";

/**
 * The signed-out visitor's corner of the chrome — the counterpart of AccountBox: one box
 * holding "Log in" and "Sign up". Both open /login, because signing up IS the phone-OTP
 * sign-in (a new number is asked for a name); `mode=signup` only changes the heading.
 *
 * `compact` fits the home page's 46px bars; the default fits SiteHeader's 62px one.
 */
export default function GuestBox({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const ar = locale === "ar";
  const size = compact ? "text-[12.5px]" : "text-[14px]";

  // Two plain links: the outlined forest button in the bar is "list your unit", and a
  // second outlined button here made the header read as a row of pills.
  return (
    <div className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap ${size}`}>
      <Link href="/login" className="flex min-h-11 items-center font-semibold text-ink-900 underline-offset-4 hover:underline sm:min-h-0">
        {ar ? "دخول" : "Log in"}
      </Link>
      <span aria-hidden className="h-4 w-px bg-ink-200" />
      <Link href="/login?mode=signup" className="flex min-h-11 items-center text-ink-500 underline-offset-4 hover:text-ink-900 hover:underline sm:min-h-0">
        {ar ? "حساب جديد" : "Sign up"}
      </Link>
    </div>
  );
}
