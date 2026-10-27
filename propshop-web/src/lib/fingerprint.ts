import crypto from "crypto";

/**
 * unit_fingerprint — the UNIQUE column that makes "one listing per unit" a database
 * guarantee rather than a policy (Section 5, anti-broker rules).
 *
 * Built from the identifying address of the physical unit, normalised so that
 * "Villa 12, B-3" and "villa 12 b3" collapse to the same fingerprint.
 */
export function normaliseToken(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // Arabic-Indic digits
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // Extended Arabic-Indic
    .replace(/[أإآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9؀-ۿ]/g, "");
}

export type FingerprintInput = {
  compoundId?: string | null;
  areaId: string;
  building?: string | null;
  floor?: number | null;
  unitNumber?: string | null;
  type: string;
  sizeSqm: number;
};

export function buildUnitFingerprint(input: FingerprintInput): string {
  const parts = [
    normaliseToken(input.compoundId ?? `area:${input.areaId}`),
    normaliseToken(input.building),
    normaliseToken(input.floor),
    normaliseToken(input.unitNumber),
    normaliseToken(input.type),
    // Size is rounded so a 120 vs 120.4 sqm retype does not defeat the uniqueness check.
    normaliseToken(Math.round(input.sizeSqm)),
  ];
  const raw = parts.join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/** National IDs are never stored raw — only a peppered hash, for match-checking. */
export function hashNationalId(nationalId: string): string {
  const pepper = process.env.NATIONAL_ID_PEPPER ?? "";
  return crypto
    .createHash("sha256")
    .update(normaliseToken(nationalId) + pepper)
    .digest("hex");
}
