import { Locale } from "@/lib/i18n";
import { LOGO_FULL_VIEWBOX, LOGO_MARK, LOGO_WORD } from "./logoPaths";

/**
 * The PropShop logo: a house-shaped price tag with the stacked PROP / SHOP wordmark.
 * Paths come from packages/shared/brand/build_logo.py, which also generates the app's
 * BrandLogo, so the site and the app draw the identical mark.
 *
 * The wordmark is the brand's own and is not translated; `locale` only sets the
 * accessible name.
 */
export default function Logo({
  locale,
  className = "",
  onDark = false,
  height = 34,
}: {
  locale: Locale;
  className?: string;
  /** White on dark grounds (photos); rust everywhere else (owner, 2026-10-11). */
  onDark?: boolean;
  /** Rendered height in px; the width follows the logo's proportions. */
  height?: number;
}) {
  return (
    <svg
      viewBox={LOGO_FULL_VIEWBOX}
      role="img"
      aria-label={locale === "ar" ? "بروب شوب" : "PropShop"}
      style={{ height }}
      className={`w-auto ${onDark ? "text-white" : "text-accent-500"} ${className}`}
      fill="currentColor"
    >
      <path fillRule="evenodd" d={LOGO_MARK} />
      <path fillRule="evenodd" d={LOGO_WORD} />
    </svg>
  );
}
