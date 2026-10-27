/**
 * Buy or rent, as a site-wide preference.
 *
 * This moved out of the hero search's local state and into a cookie because the choice
 * now lives in the top bar (owner, 2026-09-19). A top-bar control has to govern every
 * search on the page — the header bar, the hero panel, the category links — and component
 * state cannot reach across them. A cookie can, it survives navigation, and the server
 * components that build those links can read it while rendering.
 *
 * It is a preference, never an authorisation: nothing is permitted or hidden on the
 * strength of it, so an arbitrary cookie value is merely ignored rather than dangerous.
 * PURPOSES is still enforced on read so a tampered cookie cannot reach a Prisma `where`.
 */

export const PURPOSES = ["sale", "rent"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const PURPOSE_COOKIE = "aqar_purpose";
export const DEFAULT_PURPOSE: Purpose = "sale";

/** A year: this is a browsing preference, not a session. */
export const PURPOSE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isPurpose(value: string | undefined | null): value is Purpose {
  return !!value && (PURPOSES as readonly string[]).includes(value);
}

/** Read a cookie value into a Purpose, falling back to sale. */
export function purposeFrom(value: string | undefined | null): Purpose {
  return isPurpose(value) ? value : DEFAULT_PURPOSE;
}

export const PURPOSE_LABELS: Record<Purpose, { ar: string; en: string }> = {
  sale: { ar: "للبيع", en: "Buy" },
  rent: { ar: "للإيجار", en: "Rent" },
};
