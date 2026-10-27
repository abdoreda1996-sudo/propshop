import type { Metadata } from "next";
import { getLocale } from "./locale";

/**
 * Page metadata in the visitor's language. Pages used to export a static Arabic title,
 * so English visitors saw Arabic in the browser tab and in shared links.
 */
export async function localMeta(
  title: { ar: string; en: string },
  description?: { ar: string; en: string },
): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: title[locale],
    ...(description ? { description: description[locale] } : {}),
  };
}
