import { Locale } from "./i18n";

/**
 * Arabic formatting uses Latin ("Western Arabic") digits, via the `-u-nu-latn` extension.
 *
 * `Intl` defaults ar-EG to Arabic-Indic digits (٢٤٩), which would leave a single card
 * showing its price as "10.1 مليون" and its size as "٢٤٩ م²" — two numeral systems in one
 * component. Egyptian property listings are written in Latin digits, so that is what we
 * pin everywhere rather than letting each call site drift.
 */
const NUMBER_LOCALE: Record<Locale, string> = {
  ar: "ar-EG-u-nu-latn",
  en: "en-EG",
};

const DATE_LOCALE: Record<Locale, string> = {
  ar: "ar-EG-u-nu-latn",
  en: "en-GB",
};

/** Prices are large; Egyptian users read "2.5 مليون" faster than "2,500,000". */
export function formatPrice(value: number, locale: Locale, currency = "EGP"): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  const sym = currencySymbol(currency, locale);
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    const n = m >= 100 ? Math.round(m) : Number(m.toFixed(m >= 10 ? 1 : 2));
    return locale === "ar" ? `${n} مليون ${sym}` : `${n}M ${sym}`;
  }
  if (value >= 1000) {
    const k = Math.round(value / 1000);
    return locale === "ar" ? `${k} ألف ${sym}` : `${k}K ${sym}`;
  }
  return `${Math.round(value)} ${sym}`;
}

export function formatPriceExact(value: number, locale: Locale, currency = "EGP"): string {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} ${currencySymbol(currency, locale)}`;
}

export function currencySymbol(currency: string, locale: Locale): string {
  const map: Record<string, { ar: string; en: string }> = {
    EGP: { ar: "ج.م", en: "EGP" },
    SAR: { ar: "ر.س", en: "SAR" },
    AED: { ar: "د.إ", en: "AED" },
    USD: { ar: "$", en: "USD" },
    KWD: { ar: "د.ك", en: "KWD" },
    QAR: { ar: "ر.ق", en: "QAR" },
  };
  return (map[currency] ?? map.EGP)[locale];
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(value);
}

export function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function daysBetween(from: Date | string, to: Date = new Date()): number {
  const d = typeof from === "string" ? new Date(from) : from;
  return Math.max(0, Math.floor((to.getTime() - d.getTime()) / 86400_000));
}

export function pricePerSqm(price: number, sizeSqm: number): number {
  if (!sizeSqm || sizeSqm <= 0) return 0;
  return price / sizeSqm;
}

/** AQ-000123 style human references. */
export function formatReference(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}
