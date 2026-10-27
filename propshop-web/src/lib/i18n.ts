/**
 * i18n — Arabic (RTL) is the default, English is a toggle. All copy lives here, never
 * inline in components (Section 8).
 */

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
export const LOCALE_COOKIE = "aq_locale";

export function dirFor(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

type Dict = Record<string, { ar: string; en: string }>;

const dict: Dict = {
  // Brand & nav
  brand: { ar: "بروب شوب", en: "PropShop" },
  tagline: {
    ar: "سوق العقارات الموثق بدون سماسرة",
    en: "Egypt's broker-free, verified property marketplace",
  },
  nav_compounds: { ar: "الكمبوندات", en: "Compounds" },
  nav_pricing: { ar: "الرسوم", en: "Pricing" },
  nav_how: { ar: "إزاي بنشتغل", en: "How it works" },
  nav_sell: { ar: "اعرض وحدتك", en: "List your unit" },
  nav_login: { ar: "تسجيل الدخول", en: "Sign in" },
  nav_dashboard: { ar: "حسابي", en: "My account" },
  nav_logout: { ar: "تسجيل الخروج", en: "Sign out" },
  nav_admin: { ar: "لوحة التحكم", en: "Back office" },

  hero_cta_browse: { ar: "تصفح الوحدات", en: "Browse homes" },

  // Trust
  verified_badge: { ar: "موثق", en: "Verified" },
  direct_from_owner: { ar: "من المالك مباشرة", en: "Direct from owner" },
  days_on_market: { ar: "يوم في السوق", en: "days on market" },
  verified_on: { ar: "تاريخ التوثيق", en: "Verified on" },
  price_history: { ar: "تاريخ السعر", en: "Price history" },
  response_time: { ar: "متوسط وقت الرد", en: "Average response time" },
  no_cold_calls: { ar: "من غير مكالمات مزعجة", en: "No cold calls" },
  no_commission: { ar: "من غير عمولة", en: "No commission" },

  // Fair price
  asking_price: { ar: "السعر المطلوب", en: "Asking price" },
  fair_price: { ar: "السعر العادل التقديري", en: "PropShop Fair Price" },
  developer_price: { ar: "سعر المطور اليوم", en: "Developer price today" },
  below_fair: { ar: "أقل من السعر العادل", en: "Below fair price" },
  above_fair: { ar: "أعلى من السعر العادل", en: "Above fair price" },
  within_fair: { ar: "في نطاق السعر العادل", en: "Within fair price" },
  cheaper_than_developer: { ar: "أرخص من المطور بـ", en: "Cheaper than developer by" },
  confidence: { ar: "درجة الثقة", en: "Confidence" },
  confidence_low: { ar: "منخفضة", en: "Low" },
  confidence_medium: { ar: "متوسطة", en: "Medium" },
  confidence_high: { ar: "عالية", en: "High" },
  fair_price_disclaimer: {
    ar: "تقدير استرشادي محسوب من بيانات السوق، وليس تقييماً عقارياً معتمداً ولا يصلح لأغراض التمويل أو التقاضي.",
    en: "An indicative estimate computed from market data. It is not a certified valuation and must not be relied on for financing or legal purposes.",
  },
  insufficient_data: { ar: "بيانات غير كافية لحساب تقدير", en: "Not enough data for an estimate" },

  // Listing page
  request_this_unit: { ar: "اطلب الوحدة دي", en: "Request this unit" },
  save_unit: { ar: "حفظ", en: "Save" },
  report_listing: { ar: "بلّغ عن الإعلان", en: "Report listing" },
  report_broker: { ar: "اتصل بيا سمسار", en: "I was contacted by a broker" },
  unit_details: { ar: "تفاصيل الوحدة", en: "Unit details" },
  size: { ar: "المساحة", en: "Size" },
  bedrooms: { ar: "غرف النوم", en: "Bedrooms" },
  bathrooms: { ar: "الحمامات", en: "Bathrooms" },
  floor: { ar: "الدور", en: "Floor" },
  finishing: { ar: "التشطيب", en: "Finishing" },
  delivery: { ar: "الاستلام", en: "Delivery" },
  payment_type: { ar: "طريقة الدفع", en: "Payment" },
  ready_to_move: { ar: "استلام فوري", en: "Ready to move" },
  under_construction: { ar: "تحت الإنشاء", en: "Under construction" },
  sqm: { ar: "م²", en: "sqm" },
  per_sqm: { ar: "للمتر", en: "per sqm" },

  // Requests
  request_created: { ar: "تم استلام طلبك", en: "Your request was received" },
  request_sla: {
    ar: "هنجمعلك الوحدات الموثقة اللي تناسب طلبك، وتتابع حالته من حسابك. مفيش أرقام بتتبادل قبل تأكيد المعاينة.",
    en: "We gather the verified units that fit your request, and you follow its status from your account. No phone numbers are exchanged before a viewing is confirmed.",
  },
  request_status: { ar: "حالة الطلب", en: "Request status" },
  my_requests: { ar: "طلباتي", en: "My requests" },
  open_request_cta: { ar: "مش لاقي وحدة مناسبة؟ ابعتلنا طلبك", en: "Cannot find the right unit? Send us your brief" },
  budget: { ar: "الميزانية", en: "Budget" },
  timeline: { ar: "الإطار الزمني", en: "Timeline" },
  purpose: { ar: "الغرض", en: "Purpose" },
  purpose_live: { ar: "سكن", en: "To live in" },
  purpose_invest: { ar: "استثمار", en: "Investment" },
  purpose_rent_out: { ar: "تأجير", en: "To rent out" },

  // Owner flow
  list_unit: { ar: "اعرض وحدتك", en: "List your unit" },
  step_identity: { ar: "توثيق الهوية", en: "Verify identity" },
  step_unit: { ar: "بيانات الوحدة", en: "Unit details" },
  step_ownership: { ar: "إثبات الملكية", en: "Ownership proof" },
  step_photos: { ar: "الصور", en: "Photos" },
  step_price: { ar: "السعر والنشر", en: "Price & publish" },
  publish: { ar: "انشر الإعلان", en: "Publish listing" },
  submit_for_review: { ar: "إرسال للمراجعة", en: "Submit for review" },
  cannot_publish: { ar: "مش هينفع ننشر الإعلان لحد ما تظبط ده:", en: "This listing cannot be published until you fix:" },
  warnings_title: { ar: "ملاحظات (مش مانعة النشر)", en: "Notes (these do not block publishing)" },

  // Statuses
  status_draft: { ar: "مسودة", en: "Draft" },
  status_pending_review: { ar: "تحت المراجعة", en: "Under review" },
  status_live: { ar: "منشور", en: "Live" },
  status_reserved: { ar: "محجوز", en: "Reserved" },
  status_sold: { ar: "تم البيع", en: "Sold" },
  status_paused: { ar: "موقوف مؤقتاً", en: "Paused" },
  status_closed: { ar: "مغلق", en: "Closed" },
  status_rejected: { ar: "مرفوض", en: "Rejected" },
  status_expired: { ar: "منتهي", en: "Expired" },

  // Auth
  phone: { ar: "رقم الموبايل", en: "Mobile number" },
  full_name: { ar: "الاسم بالكامل", en: "Full name" },
  send_otp: { ar: "أرسل كود التحقق", en: "Send verification code" },
  enter_otp: { ar: "أدخل كود التحقق", en: "Enter verification code" },
  verify: { ar: "تحقق", en: "Verify" },
  signup: { ar: "إنشاء حساب", en: "Create account" },

  // Search
  filters: { ar: "الفلاتر", en: "Filters" },
  price_range: { ar: "نطاق السعر", en: "Price range" },
  apply: { ar: "تطبيق", en: "Apply" },
  clear: { ar: "مسح", en: "Clear" },
  results_count: { ar: "وحدة موثقة", en: "verified units" },
  no_results: { ar: "مافيش نتائج مطابقة", en: "No matching results" },
  sort_newest: { ar: "الأحدث", en: "Newest" },
  sort_price_asc: { ar: "السعر: من الأقل", en: "Price: low to high" },
  sort_price_desc: { ar: "السعر: من الأعلى", en: "Price: high to low" },
  sort_best_value: { ar: "الأفضل مقابل السعر", en: "Best value vs fair price" },

  // Footer
  footer_pricing_note: {
    ar: "كل الرسوم ثابتة ومعلنة على صفحة الرسوم. مفيش عمولة ولا رسوم مخفية.",
    en: "All fees are flat and published on the pricing page. No commission, no hidden fees.",
  },
  footer_rights: { ar: "جميع الحقوق محفوظة", en: "All rights reserved" },
  footer_methodology: { ar: "منهجية المؤشر", en: "Index methodology" },
  footer_terms: { ar: "الشروط والأحكام", en: "Terms" },
  footer_privacy: { ar: "الخصوصية", en: "Privacy" },

  // Generic
  loading: { ar: "جاري التحميل…", en: "Loading…" },
  save: { ar: "حفظ", en: "Save" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  next: { ar: "التالي", en: "Next" },
  back: { ar: "رجوع", en: "Back" },
  submit: { ar: "إرسال", en: "Submit" },
  approve: { ar: "اعتماد", en: "Approve" },
  reject: { ar: "رفض", en: "Reject" },
  egp: { ar: "ج.م", en: "EGP" },
};

export type TranslationKey = keyof typeof dict;

export function t(key: TranslationKey | string, locale: Locale): string {
  const entry = dict[key as TranslationKey];
  if (!entry) return String(key);
  return entry[locale];
}

/** Curried helper for components: `const tr = translator(locale)`. */
export function translator(locale: Locale) {
  return (key: TranslationKey | string) => t(key, locale);
}

/**
 * Governorate names. `Area.city` is stored in English only, so an Arabic page would
 * otherwise print "Cairo" under an Arabic area name. Unknown values fall through
 * unchanged rather than being dropped — a missing city is worse than an English one.
 */
const CITY_AR: Record<string, string> = {
  Cairo: "القاهرة",
  Giza: "الجيزة",
  Alexandria: "الإسكندرية",
  "Red Sea": "البحر الأحمر",
  "South Sinai": "جنوب سيناء",
  Matrouh: "مطروح",
};

export function cityName(city: string, locale: Locale): string {
  return locale === "ar" ? (CITY_AR[city] ?? city) : city;
}

/**
 * "وحدة / وحدتين / وحدات" — Arabic marks 1, 2, 3-10 and 11+ differently, and "7 وحدة"
 * reads as broken Arabic to a native speaker. Same rule as relativeDays() on the card.
 */
export function unitsLabel(n: number, locale: Locale): string {
  if (locale !== "ar") return n === 1 ? "unit" : "units";
  if (n === 1) return "وحدة";
  if (n === 2) return "وحدتين";
  if (n >= 3 && n <= 10) return "وحدات";
  return "وحدة";
}

export function pickLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "ar";
}
