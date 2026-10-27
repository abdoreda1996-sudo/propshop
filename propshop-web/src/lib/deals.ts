/**
 * The Deal Room (Section 11) — the workspace created when an offer is accepted.
 *
 * A deal is a checklist with money attached. The stage machine below is the whole
 * product: it tells both sides what has happened, what is happening, and what is next,
 * in that order and in plain language.
 *
 * On payments (Section 10): this platform does NOT hold funds. Every money stage records
 * an intent and a provider reference, and the actual movement is expected to happen at a
 * licensed escrow/payment provider. Nothing here should ever render as "paid" unless a
 * provider confirmed it — see `PROVIDER_PENDING`.
 */

import { Locale } from "./i18n";

export const DEAL_STAGES = [
  "offer_accepted",
  "reserved",
  "due_diligence",
  "contract_signing",
  "transfer",
  "completed",
  "cancelled",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

/** The happy path, in order. "cancelled" is reachable from anywhere and is not on it. */
export const DEAL_PATH: DealStage[] = [
  "offer_accepted",
  "reserved",
  "due_diligence",
  "contract_signing",
  "transfer",
  "completed",
];

export const STAGE_LABELS: Record<DealStage, { ar: string; en: string }> = {
  offer_accepted: { ar: "العرض اتقبل", en: "Offer accepted" },
  reserved: { ar: "الوحدة اتحجزت", en: "Property reserved" },
  due_diligence: { ar: "مراجعة المستندات", en: "Document review" },
  contract_signing: { ar: "توقيع العقد", en: "Contract signing" },
  transfer: { ar: "نقل الملكية", en: "Ownership transfer" },
  completed: { ar: "تمت الصفقة", en: "Completed" },
  cancelled: { ar: "اتلغت", en: "Cancelled" },
};

/** One line of plain language per stage: what actually happens now. */
export const STAGE_EXPLAINER: Record<DealStage, { ar: string; en: string }> = {
  offer_accepted: {
    ar: "اتفقتوا على السعر. الخطوة الجاية إن المشتري يدفع مقدم الحجز عشان الوحدة تتقفل باسمه.",
    en: "You have agreed a price. Next, the buyer pays the reservation deposit so the unit is held.",
  },
  reserved: {
    ar: "الوحدة محجوزة ومش بتستقبل عروض تانية. دلوقتي بنراجع المستندات.",
    en: "The unit is held and no longer takes other offers. Documents are being reviewed.",
  },
  due_diligence: {
    ar: "بنتأكد من سلسلة الملكية ومستحقات المطور والصيانة قبل أي توقيع.",
    en: "We check the ownership chain, developer dues and maintenance before anything is signed.",
  },
  contract_signing: {
    ar: "العقد جاهز للتوقيع من الطرفين.",
    en: "The contract is ready for both parties to sign.",
  },
  transfer: {
    ar: "إجراءات نقل الملكية شغالة مع المطور/الشهر العقاري.",
    en: "The ownership transfer is in progress with the developer or registry.",
  },
  completed: { ar: "الصفقة اكتملت ونقل الملكية تم.", en: "The deal is complete and ownership transferred." },
  cancelled: { ar: "الصفقة اتلغت.", en: "This deal was cancelled." },
};

export type TimelineStep = {
  stage: DealStage;
  label: { ar: string; en: string };
  state: "done" | "current" | "upcoming";
};

/**
 * The timeline both sides see. Everything before the current stage is done, everything
 * after is upcoming — no percentages, no spinners, just position.
 */
export function timeline(stage: string): TimelineStep[] {
  if (stage === "cancelled") {
    return [{ stage: "cancelled", label: STAGE_LABELS.cancelled, state: "current" }];
  }
  const index = DEAL_PATH.indexOf(stage as DealStage);
  const at = index === -1 ? 0 : index;
  return DEAL_PATH.map((s, i) => ({
    stage: s,
    label: STAGE_LABELS[s],
    state: i < at ? "done" : i === at ? "current" : "upcoming",
  }));
}

export function stageProgress(stage: string): { done: number; total: number } {
  const index = DEAL_PATH.indexOf(stage as DealStage);
  return { done: index === -1 ? 0 : index, total: DEAL_PATH.length - 1 };
}

/** Legal stage transitions. A deal only ever moves forward, or to cancelled. */
export const DEAL_TRANSITIONS: Record<DealStage, DealStage[]> = {
  offer_accepted: ["reserved", "cancelled"],
  reserved: ["due_diligence", "cancelled"],
  due_diligence: ["contract_signing", "cancelled"],
  contract_signing: ["transfer", "cancelled"],
  transfer: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canAdvance(from: string, to: string): boolean {
  const allowed = DEAL_TRANSITIONS[from as DealStage];
  return Array.isArray(allowed) && allowed.includes(to as DealStage);
}

/**
 * Nothing in this build actually moves money.
 *
 * The UI must say so rather than implying a payment succeeded. When a licensed provider
 * is integrated this flag goes away and `depositStatus` becomes the source of truth.
 */
export const PROVIDER_PENDING = true;

/** How long a paid reservation holds the unit. */
export const RESERVATION_HOLD_HOURS = 48;

export type Countdown = { expired: boolean; hours: number; minutes: number; seconds: number };

/** Remaining reservation time, for the countdown in Section 9. */
export function countdown(until: Date | null, now: Date = new Date()): Countdown | null {
  if (!until) return null;
  const ms = until.getTime() - now.getTime();
  if (ms <= 0) return { expired: true, hours: 0, minutes: 0, seconds: 0 };
  return {
    expired: false,
    hours: Math.floor(ms / 3600_000),
    minutes: Math.floor((ms % 3600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
  };
}

/**
 * The due-diligence checklist. These are the four things that actually sink Egyptian
 * resale deals, so they are the four the Deal Room tracks by default.
 */
export const DEFAULT_CHECKLIST = [
  { key: "ownership_chain", labelAr: "سلسلة الملكية", labelEn: "Ownership chain", done: false },
  { key: "developer_clearance", labelAr: "خطاب إخلاء طرف من المطور", labelEn: "Developer clearance", done: false },
  { key: "utilities", labelAr: "المرافق", labelEn: "Utilities", done: false },
  { key: "hoa_dues", labelAr: "مستحقات الصيانة", labelEn: "Maintenance dues", done: false },
];

export type ChecklistItem = { key: string; labelAr?: string; labelEn?: string; label?: string; done: boolean };

export function checklistLabel(item: ChecklistItem, locale: Locale): string {
  if (locale === "ar") return item.labelAr ?? item.label ?? item.key;
  return item.labelEn ?? item.label ?? item.key;
}

/** Event codes recorded on the deal timeline, with human copy. */
export const DEAL_EVENT_COPY: Record<string, { ar: string; en: string }> = {
  offer_accepted: { ar: "العرض اتقبل", en: "Offer accepted" },
  reservation_intent: { ar: "طلب حجز الوحدة", en: "Reservation requested" },
  reservation_confirmed: { ar: "تأكيد الحجز", en: "Reservation confirmed" },
  documents_submitted: { ar: "المستندات اترفعت", en: "Documents submitted" },
  stage_advanced: { ar: "الصفقة اتقدمت خطوة", en: "Deal advanced" },
  cancelled: { ar: "الصفقة اتلغت", en: "Deal cancelled" },
};
