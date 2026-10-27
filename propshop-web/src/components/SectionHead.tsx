import Link from "next/link";
import { Locale } from "@/lib/i18n";

/**
 * A section heading: the title, a small count beside it, and an optional "show all" link
 * at the far end of the row.
 *
 * The count is not decoration: it tells the reader how much is behind the link before
 * they follow it.
 */
export default function SectionHead({
  title,
  count,
  href,
  linkLabel,
}: {
  title: string;
  count?: string;
  href?: string;
  linkLabel?: string;
  locale: Locale;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
        <h2 className="section-title">{title}</h2>
        {count ? <p className="tnum text-[13px] text-ink-500">{count}</p> : null}
      </div>

      {href && linkLabel ? (
        <Link
          href={href}
          className="shrink-0 text-[14px] font-semibold text-brand-500 underline-offset-4 hover:underline"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
