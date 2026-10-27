/**
 * Claude integration (Section 8). Three jobs in Phase 0:
 *   1. Ownership-document extraction (vision → structured JSON) for the publish gate.
 *   2. National-ID extraction for KYC level 1.
 *   3. Listing description generation in AR/EN.
 *
 * Every call returns a typed result and degrades to a clearly-labelled stub when
 * ANTHROPIC_API_KEY is unset, so the whole flow is testable without an API key.
 * Extraction output is evidence for a human reviewer, never an auto-approval.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { hashNationalId } from "./fingerprint";

const MODEL = "claude-opus-5";

function client(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// --- Ownership documents ----------------------------------------------------

/**
 * The fields the publish gate compares against what the owner typed. Every field is
 * nullable: a missing field means "not legible on the document", which is very different
 * from a wrong value, and the gate treats them differently.
 */
const OwnershipExtraction = z.object({
  documentType: z
    .enum(["registered_deed", "sale_contract", "allocation_letter", "court_contract", "other", "unreadable"])
    .describe("Which kind of ownership document this is"),
  ownerName: z.string().nullable().describe("Full owner name exactly as written, in Arabic if the document is Arabic"),
  nationalId: z.string().nullable().describe("Egyptian national ID number, 14 digits, if present"),
  compoundName: z.string().nullable().describe("Compound or project name"),
  developerName: z.string().nullable(),
  building: z.string().nullable().describe("Building number or code"),
  unitNumber: z.string().nullable(),
  floor: z.number().nullable(),
  sizeSqm: z.number().nullable().describe("Unit area in square metres"),
  unitType: z
    .enum(["apartment", "villa", "townhouse", "duplex", "studio", "chalet", "office", "retail", "twinhouse", "ground_apartment", "penthouse", "unknown"])
    .describe("Unit type stated on the document"),
  deliveryDate: z.string().nullable().describe("Delivery or handover date, ISO yyyy-mm-dd if present"),
  documentDate: z.string().nullable().describe("Date the document was signed or registered, ISO yyyy-mm-dd"),
  isSigned: z.boolean().nullable().describe("Whether the document carries signatures or an official stamp"),
  isPhotocopy: z.boolean().nullable().describe("True if this is a degraded scan of a scan rather than an original"),
  legibilityNotes: z.string().nullable().describe("Anything unclear, obscured, or suspicious a reviewer should look at"),
});

export type OwnershipExtraction = z.infer<typeof OwnershipExtraction>;

const OWNERSHIP_SYSTEM = `You extract structured data from Egyptian real-estate ownership documents for a verification queue.

Documents are usually Arabic and may be photographs of paper: skewed, shadowed, or partly cut off. They include registered deeds (عقد مسجل / عقد ابتدائي مشهر), sale contracts with a developer (عقد بيع), developer allocation letters (خطاب تخصيص), and court-registered contracts (عقد صحة توقيع).

Rules:
- Transcribe values exactly as written. Do not translate names, do not normalise spellings, do not correct what looks like a typo.
- Use null for any field you cannot read with confidence. A guess is worse than a null here: a null sends the document to a human, a wrong value can wrongly block or wrongly approve an owner.
- Convert Arabic-Indic digits (٠-٩) to Latin digits in numeric fields.
- isPhotocopy is true only when the image is clearly a copy of a copy — heavy artefacts, lost midtones, visible rescan moiré — not merely a low-resolution photo.
- isSigned reflects whether signatures or official stamps are present, not whether they look genuine. Authenticity is a human judgement.
- Put anything a reviewer should look at into legibilityNotes: erasures, mismatched fonts, inconsistent dates, obscured fields.

You are producing evidence for a human reviewer, not an approval decision.`;

export type ExtractionResult<T> =
  | { ok: true; data: T; stub: false }
  | { ok: true; data: T; stub: true }
  | { ok: false; error: string };

/**
 * Extracts an ownership document. `images` are base64 payloads with their media type —
 * a document may be several pages.
 */
export async function extractOwnershipDocument(
  images: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }[],
): Promise<ExtractionResult<OwnershipExtraction>> {
  const anthropic = client();
  if (!anthropic) return { ok: true, data: stubOwnership(), stub: true };
  if (images.length === 0) return { ok: false, error: "no_images" };

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: OWNERSHIP_SYSTEM,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
            })),
            {
              type: "text" as const,
              text: "Extract the ownership details from this document. Use null for anything you cannot read confidently.",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(OwnershipExtraction) },
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "refused" };
    }
    if (!response.parsed_output) return { ok: false, error: "unparsed" };

    return { ok: true, data: response.parsed_output, stub: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "extraction_failed" };
  }
}

/**
 * Shapes the extraction for the publish gate, which compares hashes rather than raw IDs
 * so a national ID is never persisted in the clear.
 */
export function toValidationExtract(e: OwnershipExtraction) {
  return {
    ownerName: e.ownerName,
    nationalIdHash: e.nationalId ? hashNationalId(e.nationalId) : null,
    compoundName: e.compoundName,
    building: e.building,
    unitNumber: e.unitNumber,
    sizeSqm: e.sizeSqm,
    unitType: e.unitType === "unknown" ? null : e.unitType,
    deliveryDate: e.deliveryDate,
    documentDate: e.documentDate,
    isSigned: e.isSigned,
    isPhotocopy: e.isPhotocopy,
  };
}

// --- National ID ------------------------------------------------------------

const IdExtraction = z.object({
  fullName: z.string().nullable().describe("Full name in Arabic exactly as printed"),
  nationalId: z.string().nullable().describe("14-digit national ID number"),
  address: z.string().nullable(),
  expiryDate: z.string().nullable().describe("ISO yyyy-mm-dd"),
  isExpired: z.boolean().nullable(),
  side: z.enum(["front", "back", "unclear"]),
  legibilityNotes: z.string().nullable(),
});

export type IdExtraction = z.infer<typeof IdExtraction>;

export async function extractNationalId(
  images: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }[],
): Promise<ExtractionResult<IdExtraction>> {
  const anthropic = client();
  if (!anthropic) {
    return {
      ok: true,
      stub: true,
      data: { fullName: null, nationalId: null, address: null, expiryDate: null, isExpired: null, side: "unclear", legibilityNotes: "Stub — ANTHROPIC_API_KEY not configured." },
    };
  }

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system:
        "You read Egyptian national ID cards for a KYC queue. Transcribe exactly as printed; never guess. Use null for anything not clearly legible. Convert Arabic-Indic digits to Latin digits. You produce evidence for a human reviewer, not an approval.",
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
            })),
            { type: "text" as const, text: "Extract the identity details from this ID card." },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(IdExtraction) },
    });

    if (response.stop_reason === "refusal") return { ok: false, error: "refused" };
    if (!response.parsed_output) return { ok: false, error: "unparsed" };
    return { ok: true, data: response.parsed_output, stub: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "extraction_failed" };
  }
}

// --- Listing descriptions ---------------------------------------------------

const Description = z.object({
  titleAr: z.string(),
  titleEn: z.string(),
  descriptionAr: z.string(),
  descriptionEn: z.string(),
});

export type GeneratedDescription = z.infer<typeof Description>;

export async function generateDescription(unit: {
  compoundName: string;
  areaName: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  finishing: string;
  deliveryStatus: string;
  view?: string | null;
  floor?: number | null;
  purpose: string;
}): Promise<ExtractionResult<GeneratedDescription>> {
  const anthropic = client();
  if (!anthropic) {
    // Deterministic fallback so the wizard still produces usable copy offline.
    const ar = `${unit.type} ${unit.sizeSqm} م² في ${unit.compoundName}، ${unit.areaName}. ${unit.bedrooms} غرف نوم و${unit.bathrooms} حمام.`;
    const en = `${unit.sizeSqm} sqm ${unit.type} in ${unit.compoundName}, ${unit.areaName}. ${unit.bedrooms} bedrooms, ${unit.bathrooms} bathrooms.`;
    return {
      ok: true,
      stub: true,
      data: { titleAr: ar.slice(0, 80), titleEn: en.slice(0, 80), descriptionAr: ar, descriptionEn: en },
    };
  }

  try {
    const response = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: `You write property listing copy for PropShop, a broker-free Egyptian marketplace where every unit is ownership-verified.

House style: calm, factual, institutional — it should read like a bank, not a classifieds site.
- No hype, no urgency, no exclamation marks, no "غنيمة", "فرصة لا تعوض", "اتصل الآن".
- No invented facts. Describe only what you are given. No claims about schools, yields, appreciation, or neighbours.
- No price claims and no comparison to other units.
- Arabic in clear Egyptian-standard prose. English as a faithful equivalent, not a literal translation.
- Titles under 80 characters. Descriptions 2-4 sentences.`,
      messages: [
        {
          role: "user",
          content: `Write listing copy for this unit:\n${JSON.stringify(unit, null, 2)}`,
        },
      ],
      output_config: { format: zodOutputFormat(Description) },
    });

    if (response.stop_reason === "refusal") return { ok: false, error: "refused" };
    if (!response.parsed_output) return { ok: false, error: "unparsed" };
    return { ok: true, data: response.parsed_output, stub: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "generation_failed" };
  }
}

/** Clearly-labelled placeholder so a reviewer can never mistake a stub for a real read. */
function stubOwnership(): OwnershipExtraction {
  return {
    documentType: "unreadable",
    ownerName: null,
    nationalId: null,
    compoundName: null,
    developerName: null,
    building: null,
    unitNumber: null,
    floor: null,
    sizeSqm: null,
    unitType: "unknown",
    deliveryDate: null,
    documentDate: null,
    isSigned: null,
    isPhotocopy: null,
    legibilityNotes: "Stub extraction — ANTHROPIC_API_KEY is not configured, so no document was read.",
  };
}
