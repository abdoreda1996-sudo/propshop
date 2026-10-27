import { cookies } from "next/headers";
import { DEFAULT_LOCALE, Locale, LOCALE_COOKIE, pickLocale, translator } from "./i18n";
import { Purpose, PURPOSE_COOKIE, purposeFrom } from "./purpose";

/** Server-side locale read. Arabic unless the visitor has toggled to English. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return pickLocale(store.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE);
}

export async function getTranslator() {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}

/** Server-side purpose read: the Buy/Rent choice made in the brand bar. Sale by default. */
export async function getPurpose(): Promise<Purpose> {
  const store = await cookies();
  return purposeFrom(store.get(PURPOSE_COOKIE)?.value);
}
