import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/locale";
import { dirFor } from "@/lib/i18n";
import { getSession } from "@/lib/auth";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Bricolage_Grotesque, IBM_Plex_Sans_Arabic } from "next/font/google";

/**
 * Typefaces (2026-10-26). Self-hosted by next/font, exposed as CSS variables so
 * globals.css owns the stack (`--font-sans`).
 *
 * Bricolage Grotesque sets Latin text and every figure: a grotesk with some ink-trap
 * character and an optical-size axis, so it is compact at 13px and has some bite at
 * 46px. Its tabular figures keep commas and points narrow (Schibsted Grotesk, tried
 * first, spaced "50,000" out to "50 , 000"). IBM Plex Sans Arabic sets the Arabic: a
 * plain, slightly calligraphic sans that stays readable in long Egyptian-Arabic
 * paragraphs. Latin comes first in the stack, so the digits inside Arabic copy come from
 * Bricolage and the Arabic letters fall through to Plex.
 * Cairo, the previous face, is the default on most Arabic sites.
 */
const latin = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-latin",
  display: "swap",
});

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const ar = (await getLocale()) === "ar";
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4100"),
    title: ar
      ? { default: "بروب شوب: عقارات من المالك من غير سماسرة", template: "%s · بروب شوب" }
      : { default: "PropShop: property in Egypt, straight from the owner", template: "%s · PropShop" },
    description: ar
      ? "عقارات من المالك مباشرة، موثقة بمستندات ملكية وصور حقيقية، برسوم إدارية ثابتة بدون عمولة."
      : "Homes straight from their owners, verified with ownership documents and real photos, with flat published fees and no commission.",
    openGraph: { type: "website", siteName: "PropShop" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, session] = await Promise.all([getLocale(), getSession()]);

  return (
    <html lang={locale} dir={dirFor(locale)} className={`${latin.variable} ${arabic.variable}`}>
      {/*
        No <head> font <link>. The fonts are loaded by next/font above, which downloads it at
        BUILD time and serves it from our own origin.

        The previous stylesheet link was a render-blocking request to a third party on
        every page load: slow on a mobile connection, and Google Fonts is blocked or
        throttled in some networks — which for an Arabic-first product means the brand
        typeface silently disappearing. Self-hosting also removes the layout shift as the
        font swaps in.
      */}
      <body>
        <a href="#main" className="sr-only focus:not-sr-only">
          {locale === "ar" ? "انتقل للمحتوى" : "Skip to content"}
        </a>
        {/* One header and footer on every page, the results screen at `/` included. */}
        <SiteHeader locale={locale} session={session} />
        <main id="main">{children}</main>
        <SiteFooter locale={locale} />
      </body>
    </html>
  );
}
