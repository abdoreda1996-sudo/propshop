import Link from "next/link";
import { Locale, t } from "@/lib/i18n";

/**
 * Zero dark patterns (Section 11): the pricing page is linked from the footer of every
 * screen, and the no-commission promise is restated here rather than buried.
 */
export default function SiteFooter({ locale }: { locale: Locale }) {
  const ar = locale === "ar";

  const columns = [
    {
      title: ar ? "للمشترين" : "Buying",
      links: [
        { href: "/", label: ar ? "كل الوحدات" : "All homes" },
        { href: "/request", label: ar ? "ابعتلنا طلبك" : "Send us a request" },
        { href: "/trade", label: ar ? "مقايضة" : "Trade" },
      ],
    },
    {
      title: ar ? "للملّاك" : "Selling",
      links: [
        { href: "/list", label: t("nav_sell", locale) },
        { href: "/pricing", label: t("nav_pricing", locale) },
        { href: "/virtual-tour", label: ar ? "جولة افتراضية" : "Virtual tour" },
      ],
    },
    {
      title: ar ? "السوق" : "Market",
      links: [
        { href: "/compounds", label: t("nav_compounds", locale) },
        { href: "/discover", label: ar ? "المناطق والأسعار" : "Areas and prices" },
      ],
    },
    {
      title: ar ? "عننا" : "About",
      links: [
        { href: "/how-it-works", label: t("nav_how", locale) },
        { href: "/legal/terms", label: t("footer_terms", locale) },
        { href: "/legal/privacy", label: t("footer_privacy", locale) },
      ],
    },
  ];

  return (
    <footer className="mt-16 border-t border-ink-900 bg-white text-ink-700">
      <div className="container-page grid grid-cols-2 gap-x-8 gap-y-8 py-10 md:grid-cols-[1.6fr_repeat(4,1fr)]">
        <div className="col-span-2 max-w-xs md:col-span-1">
          <div className="text-[17px] font-bold text-accent-500">{t("brand", locale)}</div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{t("footer_pricing_note", locale)}</p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <div className="text-[13px] font-semibold text-ink-900">{col.title}</div>
            <ul className="mt-1.5 md:mt-2.5 md:space-y-1.5">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="block py-2 text-[14px] text-ink-500 transition hover:text-ink-900 md:inline md:py-0 md:text-[13.5px]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="container-page flex flex-col gap-2 border-t border-[var(--border)] py-5 text-[12px] leading-relaxed text-ink-500 md:flex-row md:justify-between md:gap-10">
        <p className="shrink-0">
          © {new Date().getFullYear()} {t("brand", locale)}
        </p>
        <p className="max-w-3xl">
          {ar
            ? "«السعر العادل» ومؤشر بروب شوب أرقام استرشادية محسوبة من بيانات السوق، مش تقييم عقاري معتمد. خدمة الفرص الاستثمارية معلومات عن السوق ومفيهاش أي وعد بعائد."
            : "Fair Price estimates and the PropShop Index are indicative figures computed from market data, not certified valuations. The opportunities desk is market information and carries no promise of returns."}
        </p>
      </div>
    </footer>
  );
}
