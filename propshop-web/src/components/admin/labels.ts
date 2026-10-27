import { Locale } from "@/lib/i18n";

/**
 * Display names for values the back office used to print raw ("admin", "allocation").
 * An unknown value falls back to itself, so a new enum member shows up rather than vanishing.
 */

const ROLE_LABELS: Record<string, { ar: string; en: string }> = {
  buyer: { ar: "مشتري", en: "Buyer" },
  owner: { ar: "مالك", en: "Owner" },
  investor: { ar: "مستثمر", en: "Investor" },
  advisor: { ar: "مستشار", en: "Advisor" },
  reviewer: { ar: "مراجع", en: "Reviewer" },
  photographer: { ar: "مصوّر", en: "Photographer" },
  admin: { ar: "أدمن", en: "Admin" },
};

const DOC_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  deed: { ar: "عقد مسجل", en: "Registered deed" },
  contract: { ar: "عقد بيع", en: "Sale contract" },
  allocation: { ar: "خطاب تخصيص", en: "Allocation letter" },
  court_contract: { ar: "عقد صحة توقيع", en: "Court-validated contract" },
  id_front: { ar: "وش البطاقة", en: "ID front" },
  id_back: { ar: "ضهر البطاقة", en: "ID back" },
  selfie: { ar: "سيلفي", en: "Selfie" },
};

export function roleLabel(role: string, locale: Locale): string {
  return ROLE_LABELS[role]?.[locale] ?? role;
}

export function docTypeLabel(type: string, locale: Locale): string {
  return DOC_TYPE_LABELS[type]?.[locale] ?? type;
}

const DOC_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  pending: { ar: "مستني", en: "Pending" },
  approved: { ar: "معتمد", en: "Approved" },
  rejected: { ar: "مرفوض", en: "Rejected" },
};

const MEDIA_SOURCE_LABELS: Record<string, { ar: string; en: string }> = {
  in_app: { ar: "من التطبيق (GPS)", en: "In-app (GPS)" },
  photographer: { ar: "مصوّرنا", en: "Our photographer" },
  upload: { ar: "مرفوعة", en: "Uploaded" },
};

export const OFFER_STATUS_LABELS: Record<string, { ar: string; en: string; tone: string }> = {
  pending: { ar: "مستني رد", en: "Awaiting reply", tone: "badge-neutral" },
  accepted: { ar: "اتقبل", en: "Accepted", tone: "badge-verified" },
  rejected: { ar: "اترفض", en: "Rejected", tone: "badge-above" },
  withdrawn: { ar: "اتسحب", en: "Withdrawn", tone: "badge-neutral" },
  countered: { ar: "اترد عليه بعرض مقابل", en: "Countered", tone: "badge-neutral" },
  expired: { ar: "انتهت مدته", en: "Expired", tone: "badge-neutral" },
};

export const REPORT_REASON_LABELS: Record<string, { ar: string; en: string }> = {
  contacted_by_broker: { ar: "اتصل بيا سمسار", en: "Contacted by a broker" },
  fake_photos: { ar: "صور مش للوحدة", en: "Photos not of this unit" },
  duplicate: { ar: "إعلان مكرر", en: "Duplicate listing" },
  wrong_price: { ar: "السعر مش حقيقي", en: "Price is not real" },
  unreachable: { ar: "مش بيرد", en: "Unreachable" },
  other: { ar: "سبب تاني", en: "Other" },
};

const REPORT_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  open: { ar: "مفتوح", en: "Open" },
  upheld: { ar: "مؤكد", en: "Upheld" },
  dismissed: { ar: "مرفوض", en: "Dismissed" },
};

const pick = (map: Record<string, { ar: string; en: string }>, v: string, locale: Locale) => map[v]?.[locale] ?? v;
export const docStatusLabel = (v: string, l: Locale) => pick(DOC_STATUS_LABELS, v, l);
export const mediaSourceLabel = (v: string, l: Locale) => pick(MEDIA_SOURCE_LABELS, v, l);
export const offerStatusLabel = (v: string, l: Locale) => pick(OFFER_STATUS_LABELS, v, l);
export const reportReasonLabel = (v: string, l: Locale) => pick(REPORT_REASON_LABELS, v, l);
export const reportStatusLabel = (v: string, l: Locale) => pick(REPORT_STATUS_LABELS, v, l);
