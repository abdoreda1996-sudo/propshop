// Enum-like domain constants. SQLite has no enums, so these are the single source of
// truth for every string column in schema.prisma.

export const ROLES = ["buyer", "owner", "investor", "advisor", "reviewer", "photographer", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Staff roles see the back office. */
export const STAFF_ROLES: Role[] = ["advisor", "reviewer", "photographer", "admin"];

export const UNIT_TYPES = [
  "apartment", "villa", "townhouse", "duplex", "studio", "chalet", "office", "retail",
  "twinhouse", "ground_apartment", "penthouse",
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/**
 * How property types are grouped in the filters and pickers (owner, 2026-10-24).
 * "villa" is the standalone villa. Chalet sits at the end of apartments: left out of
 * every group it vanished from the type filter, and existing chalet listings could no
 * longer be found.
 */
export const UNIT_TYPE_GROUPS: { key: string; ar: string; en: string; types: UnitType[] }[] = [
  { key: "villas", ar: "فيلات", en: "Villas", types: ["townhouse", "twinhouse", "villa"] },
  { key: "apartments", ar: "شقق", en: "Apartments", types: ["studio", "apartment", "duplex", "ground_apartment", "penthouse", "chalet"] },
  { key: "commercial", ar: "تجاري", en: "Commercial", types: ["office", "retail"] },
];

export const FINISHINGS = ["core_shell", "semi_finished", "fully_finished", "furnished"] as const;
export type Finishing = (typeof FINISHINGS)[number];

export const DELIVERY_STATUSES = ["ready", "under_construction"] as const;
export const PURPOSES = ["sale", "rent"] as const;
export const PAYMENT_TYPES = ["cash", "installments", "resale_installments"] as const;

export const LISTING_STATUSES = [
  "draft",
  "pending_review",
  "live",
  "reserved",
  "sold",
  "paused",
  "closed",
  "rejected",
  "expired",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** Legal transitions for the listing state machine (Phase 0 checklist). */
export const LISTING_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  draft: ["pending_review"],
  pending_review: ["live", "rejected", "draft"],
  // "reserved" is entered by accepting an offer, not by the owner editing a dropdown.
  live: ["reserved", "paused", "closed", "expired"],
  // A reservation that lapses or a deal that falls through returns the unit to market.
  reserved: ["live", "sold", "closed"],
  sold: [],
  paused: ["live", "closed", "expired"],
  // Fix and resubmit: the owner edits a rejected listing in place and sends it back.
  rejected: ["draft", "pending_review"],
  expired: ["draft", "pending_review"],
  closed: [],
};

/**
 * Statuses a buyer may ever see.
 *
 * A reserved or sold unit stays readable — its page shows 🔒 محجوزة / تم البيع. Hiding it
 * would break every link a buyer already holds and would quietly erase the evidence that
 * deals actually complete here, which is the marketplace's main proof of life.
 */
export const VIEWABLE_STATUSES: ListingStatus[] = ["live", "reserved", "sold"];

/** Statuses that appear in search, counters and market data: only what can be bought. */
export const SEARCHABLE_STATUSES: ListingStatus[] = ["live"];

export function canTransition(from: string, to: string): boolean {
  const allowed = LISTING_TRANSITIONS[from as ListingStatus];
  return Array.isArray(allowed) && allowed.includes(to as ListingStatus);
}

/** Trust levels — Section 5. A listing is only public at level 2 or higher. */
export const TRUST = {
  DRAFT: 0,
  IDENTITY: 1,
  OWNERSHIP: 2,
  PHOTO_VERIFIED: 3,
  SITE_VERIFIED: 4,
} as const;

export const MIN_PUBLIC_TRUST = TRUST.OWNERSHIP;

export const TRUST_LABELS: Record<number, { ar: string; en: string }> = {
  0: { ar: "مسودة", en: "Draft" },
  1: { ar: "هوية موثقة", en: "Identity verified" },
  2: { ar: "ملكية موثقة", en: "Ownership verified" },
  3: { ar: "صور موثقة", en: "Photo verified" },
  4: { ar: "معاينة ميدانية", en: "Site verified" },
};

export const REQUEST_STATUSES = [
  "received",
  "assigned",
  "contacted",
  "viewing_scheduled",
  "offer",
  "deal",
  "closed",
  "cancelled",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const DEAL_STAGES = [
  "offer_accepted",
  "deposit_held",
  "due_diligence",
  "contract_signing",
  "balance_handover",
  "closed",
  "cancelled",
] as const;

export const OWNERSHIP_DOC_TYPES = ["deed", "contract", "allocation", "court_contract"] as const;

/** Anti-broker rule: one verified identity may hold at most this many active listings. */
export const MAX_ACTIVE_LISTINGS_PER_IDENTITY = 3;

/** Section 6c: photos are mandatory, minimum 6, covering these rooms. */
export const MIN_PHOTOS = 6;
export const REQUIRED_ROOMS = ["living", "bedroom", "kitchen", "bathroom", "facade", "view"] as const;
export type Room = (typeof REQUIRED_ROOMS)[number];

export const ROOM_LABELS: Record<Room, { ar: string; en: string }> = {
  living: { ar: "الريسبشن", en: "Living area" },
  bedroom: { ar: "غرفة النوم", en: "Bedroom" },
  kitchen: { ar: "المطبخ", en: "Kitchen" },
  bathroom: { ar: "الحمام", en: "Bathroom" },
  facade: { ar: "واجهة المبنى", en: "Building / facade" },
  view: { ar: "الإطلالة أو البلكونة", en: "View or balcony" },
};

/** Requests must get a human response within 24 hours (Section 6c). */
export const SLA_HOURS = 24;

export const CURRENCIES = ["EGP", "SAR", "AED", "USD", "KWD", "QAR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const UNIT_TYPE_LABELS: Record<UnitType, { ar: string; en: string }> = {
  apartment: { ar: "شقة", en: "Apartment" },
  villa: { ar: "فيلا مستقلة", en: "Standalone villa" },
  townhouse: { ar: "تاون هاوس", en: "Townhouse" },
  twinhouse: { ar: "توين هاوس", en: "Twin house" },
  duplex: { ar: "دوبلكس", en: "Duplex" },
  studio: { ar: "استوديو", en: "Studio" },
  ground_apartment: { ar: "شقة أرضي", en: "Ground apartment" },
  penthouse: { ar: "بنتهاوس", en: "Penthouse" },
  chalet: { ar: "شاليه", en: "Chalet" },
  office: { ar: "مكتب إداري", en: "Office" },
  retail: { ar: "محل تجاري", en: "Retail" },
};

export const FINISHING_LABELS: Record<Finishing, { ar: string; en: string }> = {
  core_shell: { ar: "على المحارة", en: "Core & shell" },
  semi_finished: { ar: "نصف تشطيب", en: "Semi finished" },
  fully_finished: { ar: "تشطيب كامل", en: "Fully finished" },
  furnished: { ar: "مفروش", en: "Furnished" },
};

export const PAYMENT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  cash: { ar: "كاش", en: "Cash" },
  installments: { ar: "تقسيط", en: "Installments" },
  resale_installments: { ar: "ريسيل بأقساط متبقية", en: "Resale with remaining installments" },
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, { ar: string; en: string }> = {
  received: { ar: "تم الاستلام", en: "Received" },
  assigned: { ar: "تم التعيين لمستشار", en: "Assigned to advisor" },
  contacted: { ar: "تم التواصل", en: "Contacted" },
  viewing_scheduled: { ar: "تم تحديد معاينة", en: "Viewing scheduled" },
  offer: { ar: "عرض سعر", en: "Offer" },
  deal: { ar: "صفقة جارية", en: "Deal in progress" },
  closed: { ar: "مغلق", en: "Closed" },
  cancelled: { ar: "ملغي", en: "Cancelled" },
};

/** Buyer intent and timing, as captured on a request. */
export const PURPOSE_LABELS: Record<string, { ar: string; en: string }> = {
  live: { ar: "سكن", en: "To live in" },
  invest: { ar: "استثمار", en: "Investment" },
  rent_out: { ar: "تأجير", en: "To rent out" },
};

export const TIMELINE_LABELS: Record<string, { ar: string; en: string }> = {
  immediate: { ar: "في أقرب وقت", en: "As soon as possible" },
  "3_months": { ar: "خلال 3 شهور", en: "Within 3 months" },
  "6_months": { ar: "خلال 6 شهور", en: "Within 6 months" },
  browsing: { ar: "لسه بيتفرج", en: "Just looking" },
};

/*
 * Query page sizes.
 *
 * Every list that grows with user activity is capped. Without a cap these queries work
 * perfectly at demo size and degrade silently as the product succeeds — a busy account
 * accumulates offers, deals and saved units without limit, and each row carries joins.
 *
 * These are caps, not pagination. Where a user genuinely needs to see beyond them, the
 * screen must gain paging; the cap exists so that a missing pager is a visible gap rather
 * than an unbounded query.
 */

/** Per-user lists: offers, deals, viewings, saved units. */
export const LIST_PAGE = 50;

/** Messages loaded for one thread — the most recent window. */
export const THREAD_PAGE = 100;
