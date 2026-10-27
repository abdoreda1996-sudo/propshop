/**
 * The WhatsApp intake line.
 *
 * ONE place the number lives. It comes from the environment rather than the source, so it
 * can change without a deploy and so a staging build cannot quietly send owners to the
 * production line.
 *
 *   NEXT_PUBLIC_WHATSAPP_NUMBER=201XXXXXXXXX
 *
 * Digits only, with the country code and no leading `+` — that is the form wa.me expects,
 * and the one place people get it wrong.
 *
 * DELIBERATELY NO DEFAULT. A placeholder number would either dial a stranger or fail
 * silently, and on the screen where an owner hands us their property either is worse than
 * the honest "not connected yet" the UI shows while this is unset.
 */

const RAW = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";

/** Digits only — tolerates a pasted `+20 100 123 4567`. */
export const WHATSAPP_NUMBER = RAW.replace(/\D/g, "");

export const WHATSAPP_CONFIGURED = WHATSAPP_NUMBER.length >= 8;

/**
 * What the visitor is opening the conversation about.
 *
 * The prefilled message is the only thing that tells the advisor which queue a chat belongs
 * to — someone listing a unit and someone booking a shoot need different first replies, and
 * a single generic "hello" makes the advisor ask a question the click already answered.
 */
export type WhatsappTopic = "listing" | "photography";

export const WHATSAPP_PREFILL: Record<WhatsappTopic, { ar: string; en: string }> = {
  listing: {
    ar: "السلام عليكم، حابب أعرض وحدتي على بروب شوب.",
    en: "Hello, I'd like to list my property on PropShop.",
  },
  photography: {
    ar: "السلام عليكم، حابب أحجز تصوير احترافي وجولة افتراضية 360 لوحدتي.",
    en: "Hello, I'd like to book the professional photography and 360 virtual tour for my property.",
  },
};

/**
 * A wa.me link with the opening message already typed.
 *
 * Returns null when no number is configured, so every call site has to decide what to show
 * instead — rather than rendering a dead link that looks live.
 */
export function whatsappHref(locale: "ar" | "en", topic: WhatsappTopic = "listing"): string | null {
  if (!WHATSAPP_CONFIGURED) return null;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_PREFILL[topic][locale])}`;
}
