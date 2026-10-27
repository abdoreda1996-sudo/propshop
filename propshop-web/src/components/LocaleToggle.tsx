"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Locale, LOCALE_COOKIE } from "@/lib/i18n";

/**
 * Arabic is the default; this flips the cookie and refreshes the server render.
 *
 * `onDark` is for the navy brand bar, where a grey-bordered light button would look
 * like a disabled control.
 */
export default function LocaleToggle({ locale, onDark = false }: { locale: Locale; onDark?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: Locale = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365}`;
        startTransition(() => router.refresh());
      }}
      className={
        onDark
          ? "rounded-md px-2 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/10"
          : "min-h-11 rounded-md px-2 text-[13px] font-semibold text-ink-500 transition hover:bg-ink-50 hover:text-ink-900 sm:min-h-9"
      }
      aria-label={next === "en" ? "Switch to English" : "التبديل إلى العربية"}
    >
      {next === "en" ? "English" : "عربي"}
    </button>
  );
}
