/**
 * True acquisition cost (Section 5).
 *
 * A resale buyer in Egypt does not pay the asking price. They pay the asking price, plus
 * whatever the seller still owes the developer, plus maintenance arrears, plus transfer
 * and registration costs. Every portal shows the first number and leaves the buyer to
 * discover the rest late — which is where deals collapse.
 *
 * Two rules run through this file:
 *   1. An estimate is never presented as a fact. Each line says where it came from.
 *   2. A number we do not have is omitted, not guessed. A total built on invented
 *      developer dues would be worse than no total at all.
 */

import { Locale } from "./i18n";
import { feePerSide, splitFee } from "./fees";

/** Where a number came from — shown per line, so nothing is mistaken for confirmed. */
export type CostSource = "listing" | "owner_declared" | "estimate";

export type CostLine = {
  key: string;
  labelAr: string;
  labelEn: string;
  amount: number;
  source: CostSource;
  /** Shown under the line when it needs a caveat. */
  noteAr?: string;
  noteEn?: string;
};

export type TrueCost = {
  lines: CostLine[];
  total: number;
  /** True when any line is an estimate, so the total must be labelled approximate. */
  hasEstimates: boolean;
  /** True when we lack data the buyer should chase before committing. */
  incomplete: boolean;
  missingAr: string[];
  missingEn: string[];
};

/**
 * Egyptian property registration (الشهر العقاري) is broadly 2.5% of the declared value,
 * capped. This is the published statutory rate, not a platform invention — but the
 * declared value is usually not the sale price, so it is explicitly an estimate.
 */
export const REGISTRATION_RATE = 0.025;
export const REGISTRATION_CAP = 2_000;

/**
 * The deal fee comes from src/lib/fees.ts — fixed by unit type (rent: by monthly rent),
 * never a percentage. Do not hard-code a number here; fees.ts is the single source of
 * truth and the pricing page renders the same schedule.
 */

export type CostInput = {
  price: number;
  /** The success fee depends on these (fees.ts) — required so a sheet can never quote the wrong tier. */
  unitType: string;
  purpose: string;
  /** Remaining developer instalments, when the owner has declared them. */
  remainingInstallments?: number | null;
  /** Outstanding maintenance / HOA dues, when declared. */
  maintenanceDue?: number | null;
  /** The platform's flat admin fee for a completed deal. */
  adminFee?: number;
  /** Set false when the owner has not told us either way. */
  installmentsKnown?: boolean;
  maintenanceKnown?: boolean;
};

export function computeTrueCost(input: CostInput): TrueCost {
  const lines: CostLine[] = [];
  const missingAr: string[] = [];
  const missingEn: string[] = [];

  lines.push({
    key: "price",
    labelAr: "سعر الوحدة",
    labelEn: "Property price",
    amount: input.price,
    source: "listing",
  });

  if (input.remainingInstallments && input.remainingInstallments > 0) {
    lines.push({
      key: "installments",
      labelAr: "أقساط متبقية للمطور",
      labelEn: "Remaining developer instalments",
      amount: input.remainingInstallments,
      source: "owner_declared",
      noteAr: "حسب كلام المالك، وبيتأكد منها وقت مراجعة المستندات.",
      noteEn: "As declared by the owner; checked during document review.",
    });
  } else if (input.installmentsKnown === false) {
    missingAr.push("الأقساط المتبقية للمطور");
    missingEn.push("Remaining developer instalments");
  }

  if (input.maintenanceDue && input.maintenanceDue > 0) {
    lines.push({
      key: "maintenance",
      labelAr: "مستحقات صيانة متأخرة",
      labelEn: "Outstanding maintenance",
      amount: input.maintenanceDue,
      source: "owner_declared",
      noteAr: "حسب إفادة المالك.",
      noteEn: "As declared by the owner.",
    });
  } else if (input.maintenanceKnown === false) {
    missingAr.push("مستحقات الصيانة");
    missingEn.push("Maintenance dues");
  }

  const registration = Math.min(input.price * REGISTRATION_RATE, REGISTRATION_CAP);
  lines.push({
    key: "registration",
    labelAr: "رسوم الشهر العقاري (تقديري)",
    labelEn: "Registration fees (estimated)",
    amount: registration,
    source: "estimate",
    noteAr: "2.5% من القيمة المُقرّة بحد أقصى 2,000 ج.م. القيمة المُقرّة غالباً أقل من سعر البيع.",
    noteEn: "2.5% of the declared value, capped at EGP 2,000. The declared value is usually below the sale price.",
  });

  /*
    Fixed by unit type (and, for rent, by the monthly rent) — not a percentage, and for a
    sale it does not move with the price at all. See fees.ts.

    THIS SHEET IS THE BUYER'S, so it carries what the BUYER pays. The seller pays the same
    amount separately; that is the seller's cost, not part of the buyer's acquisition
    price, so it is named in the note — per side, never as a deal total (display rule).

    `input.adminFee`, when supplied, is a Deal's recorded WHOLE-DEAL total, fixed at
    acceptance, so it is halved to reach one side.
  */
  const buyerShare = input.adminFee !== undefined
    ? splitFee(input.adminFee).buyer
    : feePerSide({ purpose: input.purpose, unitType: input.unitType, amount: input.price });
  if (buyerShare > 0) {
    const rent = input.purpose === "rent";
    lines.push({
      key: "admin_fee",
      labelAr: "رسم بروب شوب الإداري (على المشتري)",
      labelEn: "PropShop admin fee (buyer's side)",
      amount: buyerShare,
      source: "listing",
      noteAr: rent
        ? "رسم ثابت حسب قيمة الإيجار الشهري. المالك بيدفع نفس الرسم على حدة. مش نسبة، ومفيش عمولة من أي طرف."
        : "رسم ثابت حسب نوع الوحدة، مش بيزيد لما السعر يزيد. البائع بيدفع نفس الرسم على حدة. مش نسبة، ومفيش عمولة من أي طرف.",
      noteEn: rent
        ? "A fixed fee set by the monthly rent. The owner pays the same fee separately. Not a percentage, and no commission from either side."
        : "A fixed fee set by the unit type; it does not rise with the price. The seller pays the same fee separately. Not a percentage, and no commission from either side.",
    });
  }

  return {
    lines,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    hasEstimates: lines.some((l) => l.source === "estimate"),
    incomplete: missingAr.length > 0,
    missingAr,
    missingEn,
  };
}

export const SOURCE_LABELS: Record<CostSource, { ar: string; en: string }> = {
  listing: { ar: "مؤكد", en: "Confirmed" },
  owner_declared: { ar: "إفادة المالك", en: "Owner declared" },
  estimate: { ar: "تقديري", en: "Estimated" },
};

export function sourceLabel(source: CostSource, locale: Locale): string {
  return SOURCE_LABELS[source][locale];
}
