/**
 * The publish gate (Section 6c — "hard validation, the system must refuse to publish
 * otherwise"). Pure function: the caller loads the listing, its media, the owner's KYC
 * and the compound, and passes a plain snapshot in. Publishing is impossible if any
 * check fails, and every failure names the exact field the owner has to fix.
 */

import { MAX_ACTIVE_LISTINGS_PER_IDENTITY, MIN_PHOTOS, REQUIRED_ROOMS, Room, TRUST } from "./enums";
import { pointInPolygonJson } from "./geo";
import { normaliseToken } from "./fingerprint";

export type CheckSeverity = "block" | "warn";

export type Check = {
  code: string;
  severity: CheckSeverity;
  /** The exact field the owner must fix, e.g. "unit.sizeSqm". Null for account-level checks. */
  field: string | null;
  messageAr: string;
  messageEn: string;
};

export type ValidationSnapshot = {
  owner: {
    trustLevel: number;
    fullName: string;
    nationalIdHash: string | null;
    strikes: number;
    isBlocked: boolean;
    activeListingCount: number;
    /** Admin can raise the cap for a genuine multi-unit owner. */
    listingCapOverride?: number | null;
  };
  unit: {
    type: string;
    sizeSqm: number;
    bedrooms: number;
    building?: string | null;
    unitNumber?: string | null;
    floor?: number | null;
    deliveryStatus: string;
    lat?: number | null;
    lng?: number | null;
    compoundId?: string | null;
  };
  compound: {
    id: string;
    nameEn: string;
    nameAr: string;
    minSizeSqm: number | null;
    maxSizeSqm: number | null;
    allowedUnitTypes: string[];
    geomJson: string | null;
  } | null;
  listing: {
    price: number;
    purpose: string;
    paymentType: string;
    descriptionAr?: string | null;
    descriptionEn?: string | null;
  };
  media: {
    source: string;
    room: string | null;
    gpsLat: number | null;
    gpsLng: number | null;
    capturedAt: Date | null;
    phash: string | null;
    /** Set by the media worker when the pHash collides with another listing or an external portal. */
    duplicateOf?: string | null;
  }[];
  /** Ownership document as extracted by Claude, plus its review status. */
  ownershipDoc: {
    type: string;
    status: string;
    extracted: {
      ownerName?: string | null;
      nationalIdHash?: string | null;
      compoundName?: string | null;
      building?: string | null;
      unitNumber?: string | null;
      sizeSqm?: number | null;
      unitType?: string | null;
      deliveryDate?: string | null;
      documentDate?: string | null;
      isSigned?: boolean | null;
      isPhotocopy?: boolean | null;
      /** Stored but not machine-read (no API key, or the read failed): a person compares it. */
      manualReview?: boolean;
    } | null;
  } | null;
};

export type ValidationResult = {
  canPublish: boolean;
  blocks: Check[];
  warnings: Check[];
  /** Trust level the listing earns if it publishes. */
  trustLevel: number;
};

export function validateForPublish(s: ValidationSnapshot): ValidationResult {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // --- Account level --------------------------------------------------------
  if (s.owner.isBlocked) {
    add({
      code: "owner_blocked",
      severity: "block",
      field: null,
      messageAr: "الحساب موقوف. تواصل مع الدعم.",
      messageEn: "This account is suspended. Contact support.",
    });
  }

  // Trust levels 0-4 in Section 5 describe a LISTING. The account only carries level 1
  // (identity), which is the precondition checked here; level 2 (ownership) is earned by
  // this listing's own document, checked further down, and the resulting listing level is
  // computed by computeTrustLevel below. Requiring level 2 on the account would deadlock
  // every real owner, since nothing grants it.
  if (s.owner.trustLevel < TRUST.IDENTITY) {
    add({
      code: "identity_not_verified",
      severity: "block",
      field: null,
      messageAr: "لازم توثيق هويتك (بطاقة الرقم القومي وسيلفي) قبل نشر أي إعلان.",
      messageEn: "Verify your identity (national ID and a selfie) before publishing any listing.",
    });
  }

  const cap = s.owner.listingCapOverride ?? MAX_ACTIVE_LISTINGS_PER_IDENTITY;
  if (s.owner.activeListingCount >= cap) {
    add({
      code: "listing_cap_reached",
      severity: "block",
      field: null,
      messageAr: `الحد الأقصى ${cap} إعلانات نشطة للهوية الواحدة. اطلب موافقة الإدارة لإضافة المزيد.`,
      messageEn: `A verified identity may hold at most ${cap} active listings. Request admin approval to add more.`,
    });
  }

  // --- Photos are mandatory -------------------------------------------------
  const inAppPhotos = s.media.filter((m) => m.source === "in_app" || m.source === "photographer");
  if (inAppPhotos.length < MIN_PHOTOS) {
    add({
      code: "photos_below_minimum",
      severity: "block",
      field: "media",
      messageAr: `مطلوب ${MIN_PHOTOS} صور على الأقل ملتقطة من داخل التطبيق أو بواسطة مصورنا. عندك ${inAppPhotos.length}.`,
      messageEn: `At least ${MIN_PHOTOS} photos captured in-app or by our photographer are required. You have ${inAppPhotos.length}.`,
    });
  }

  const coveredRooms = new Set(inAppPhotos.map((m) => m.room).filter(Boolean) as Room[]);
  const missingRooms = REQUIRED_ROOMS.filter((r) => !coveredRooms.has(r));
  if (missingRooms.length > 0) {
    add({
      code: "rooms_missing",
      severity: "block",
      field: "media.room",
      messageAr: `ناقص صور لـ: ${missingRooms.join("، ")}`,
      messageEn: `Missing photos for: ${missingRooms.join(", ")}`,
    });
  }

  // Gallery uploads are allowed only after in-app capture is done (Section 6c).
  const uploads = s.media.filter((m) => m.source === "upload");
  if (uploads.length > 0 && inAppPhotos.length < MIN_PHOTOS) {
    add({
      code: "upload_before_capture",
      severity: "block",
      field: "media",
      messageAr: "الصور المرفوعة من المعرض مسموحة بعد استكمال التصوير داخل التطبيق فقط.",
      messageEn: "Gallery uploads are only allowed after in-app capture is complete.",
    });
  }

  const duplicates = s.media.filter((m) => m.duplicateOf);
  if (duplicates.length > 0) {
    add({
      code: "duplicate_photos",
      severity: "block",
      field: "media",
      messageAr: "بعض الصور مطابقة لإعلان آخر أو منشورة على موقع تاني. استخدم صور أصلية.",
      messageEn: "Some photos match another listing or an external portal. Use original photos.",
    });
  }

  const missingGps = inAppPhotos.filter((m) => m.gpsLat === null || m.gpsLng === null);
  if (missingGps.length > 0) {
    add({
      code: "photos_missing_gps",
      severity: "warn",
      field: "media.gps",
      messageAr: "بعض الصور من غير بيانات موقع، الإعلان مش هياخد شارة «صور موثقة».",
      messageEn: "Some photos have no GPS data; the listing will not earn the photo-verified badge.",
    });
  }

  // --- Ownership proof is mandatory and must be valid -----------------------
  const doc = s.ownershipDoc;
  if (!doc) {
    add({
      code: "ownership_doc_missing",
      severity: "block",
      field: "ownershipDoc",
      messageAr: "مطلوب إثبات ملكية: عقد مسجل، عقد بيع موقّع، أو خطاب تخصيص من المطور.",
      messageEn: "Ownership proof is required: registered deed, signed sale contract, or developer allocation letter.",
    });
  } else {
    if (doc.status === "rejected") {
      add({
        code: "ownership_doc_rejected",
        severity: "block",
        field: "ownershipDoc",
        messageAr: "مستند الملكية مرفوض. ارفع مستند صالح.",
        messageEn: "The ownership document was rejected. Upload a valid document.",
      });
    }
    const ex = doc.extracted;
    if (!ex) {
      add({
        code: "ownership_doc_unreadable",
        severity: "block",
        field: "ownershipDoc",
        messageAr: "مش قادرين نقرأ المستند. صوّره واضح وكامل.",
        messageEn: "The document could not be read. Re-upload a clear, complete scan.",
      });
    } else if (ex.manualReview === true) {
      // Nothing was read, so there is nothing to compare. Not a block: the pages are
      // stored, and the reviewer compares them with the typed details before approving.
      add({
        code: "ownership_doc_manual_review",
        severity: "warn",
        field: "ownershipDoc",
        messageAr: "المستند اتحفظ، بس ماتقراش آلياً. فريق المراجعة هيقارنه ببياناتك بنفسه قبل النشر.",
        messageEn: "The document is saved but could not be read automatically. Our review team will compare it with your details by hand before publishing.",
      });
    } else {
      if (ex.isSigned === false) {
        add({
          code: "ownership_doc_unsigned",
          severity: "block",
          field: "ownershipDoc",
          messageAr: "المستند غير موقّع.",
          messageEn: "The document is unsigned.",
        });
      }
      if (ex.isPhotocopy === true) {
        add({
          code: "ownership_doc_photocopy",
          severity: "block",
          field: "ownershipDoc",
          messageAr: "صورة ضوئية لصورة ضوئية غير مقبولة.",
          messageEn: "A photocopy of a photocopy is not accepted.",
        });
      }

      // Name on the document must match the verified national ID.
      if (!namesMatch(ex.ownerName ?? "", s.owner.fullName)) {
        add({
          code: "owner_name_mismatch",
          severity: "block",
          field: "owner.fullName",
          messageAr: `الاسم في المستند (${ex.ownerName ?? "غير معروف"}) مش مطابق للاسم في الهوية (${s.owner.fullName}).`,
          messageEn: `The name on the document (${ex.ownerName ?? "unknown"}) does not match the verified ID (${s.owner.fullName}).`,
        });
      }
      if (
        ex.nationalIdHash &&
        s.owner.nationalIdHash &&
        ex.nationalIdHash !== s.owner.nationalIdHash
      ) {
        add({
          code: "national_id_mismatch",
          severity: "block",
          field: "owner.nationalId",
          messageAr: "رقم البطاقة في المستند مختلف عن الهوية الموثقة.",
          messageEn: "The national ID on the document differs from the verified identity.",
        });
      }

      // Claude's extraction vs what the owner typed — mismatches block publishing.
      if (s.compound && ex.compoundName && !compoundMatches(ex.compoundName, s.compound)) {
        add({
          code: "compound_mismatch",
          severity: "block",
          field: "unit.compoundId",
          messageAr: `الكمبوند في المستند (${ex.compoundName}) مش مطابق للمُدخل (${s.compound.nameAr}).`,
          messageEn: `The compound on the document (${ex.compoundName}) does not match what you entered (${s.compound.nameEn}).`,
        });
      }
      if (ex.unitNumber && s.unit.unitNumber && normaliseToken(ex.unitNumber) !== normaliseToken(s.unit.unitNumber)) {
        add({
          code: "unit_number_mismatch",
          severity: "block",
          field: "unit.unitNumber",
          messageAr: `رقم الوحدة في المستند (${ex.unitNumber}) مش مطابق للمُدخل (${s.unit.unitNumber}).`,
          messageEn: `The unit number on the document (${ex.unitNumber}) does not match what you entered (${s.unit.unitNumber}).`,
        });
      }
      if (ex.building && s.unit.building && normaliseToken(ex.building) !== normaliseToken(s.unit.building)) {
        add({
          code: "building_mismatch",
          severity: "block",
          field: "unit.building",
          messageAr: `رقم المبنى في المستند (${ex.building}) مش مطابق للمُدخل (${s.unit.building}).`,
          messageEn: `The building on the document (${ex.building}) does not match what you entered (${s.unit.building}).`,
        });
      }
      // Size tolerance: contracts and ads round differently, so allow 5%.
      if (ex.sizeSqm && Math.abs(ex.sizeSqm - s.unit.sizeSqm) / ex.sizeSqm > 0.05) {
        add({
          code: "size_mismatch",
          severity: "block",
          field: "unit.sizeSqm",
          messageAr: `المساحة في المستند ${ex.sizeSqm} م² والمُدخل ${s.unit.sizeSqm} م².`,
          messageEn: `The document states ${ex.sizeSqm} sqm but you entered ${s.unit.sizeSqm} sqm.`,
        });
      }
      if (ex.unitType && normaliseToken(ex.unitType) !== normaliseToken(s.unit.type)) {
        add({
          code: "unit_type_mismatch",
          severity: "warn",
          field: "unit.type",
          messageAr: `نوع الوحدة في المستند (${ex.unitType}) مختلف عن المُدخل (${s.unit.type}).`,
          messageEn: `The unit type on the document (${ex.unitType}) differs from what you entered (${s.unit.type}).`,
        });
      }
    }
  }

  // --- Compound cross-checks ------------------------------------------------
  if (s.compound) {
    const { minSizeSqm, maxSizeSqm, allowedUnitTypes, geomJson } = s.compound;
    if (minSizeSqm !== null && maxSizeSqm !== null && (s.unit.sizeSqm < minSizeSqm || s.unit.sizeSqm > maxSizeSqm)) {
      add({
        code: "size_outside_compound_range",
        severity: "block",
        field: "unit.sizeSqm",
        messageAr: `مساحات ${s.compound.nameAr} بين ${minSizeSqm} و${maxSizeSqm} م². راجع المساحة.`,
        messageEn: `Units in ${s.compound.nameEn} range from ${minSizeSqm} to ${maxSizeSqm} sqm. Check the size.`,
      });
    }
    if (allowedUnitTypes.length > 0 && !allowedUnitTypes.includes(s.unit.type)) {
      add({
        code: "type_not_in_compound",
        severity: "block",
        field: "unit.type",
        messageAr: `${s.compound.nameAr} مافيهوش وحدات من نوع ${s.unit.type}.`,
        messageEn: `${s.compound.nameEn} does not contain ${s.unit.type} units.`,
      });
    }
    if (s.unit.lat !== null && s.unit.lat !== undefined && s.unit.lng !== null && s.unit.lng !== undefined) {
      const inside = pointInPolygonJson(s.unit.lat, s.unit.lng, geomJson);
      if (inside === false) {
        add({
          code: "outside_compound_polygon",
          severity: "block",
          field: "unit.location",
          messageAr: "الموقع المحدد خارج حدود الكمبوند.",
          messageEn: "The pinned location falls outside the compound boundary.",
        });
      }
    }
  }

  // --- Listing basics -------------------------------------------------------
  if (!(s.listing.price > 0)) {
    add({
      code: "price_invalid",
      severity: "block",
      field: "listing.price",
      messageAr: "أدخل سعر صحيح.",
      messageEn: "Enter a valid price.",
    });
  }
  if (!s.listing.descriptionAr && !s.listing.descriptionEn) {
    add({
      code: "description_missing",
      severity: "warn",
      field: "listing.descriptionAr",
      messageAr: "أضف وصف للوحدة لزيادة عدد المشاهدات.",
      messageEn: "Add a description to get more views.",
    });
  }

  const blocks = checks.filter((c) => c.severity === "block");
  const warnings = checks.filter((c) => c.severity === "warn");

  return {
    canPublish: blocks.length === 0,
    blocks,
    warnings,
    trustLevel: computeTrustLevel(s, blocks.length === 0),
  };
}

/**
 * Trust level earned by a listing (Section 5). Level 2 is the minimum for public
 * visibility; level 3 needs GPS-stamped photos; level 4 is a manual field visit.
 */
export function computeTrustLevel(s: ValidationSnapshot, passed: boolean): number {
  if (!passed) return Math.min(s.owner.trustLevel, TRUST.IDENTITY);
  let level: number = TRUST.OWNERSHIP; // the gate passed, so this unit has valid ownership proof
  const stamped = s.media.filter(
    (m) => (m.source === "in_app" || m.source === "photographer") && m.gpsLat !== null && m.capturedAt !== null,
  );
  if (stamped.length >= MIN_PHOTOS) level = TRUST.PHOTO_VERIFIED;
  if (s.owner.trustLevel >= TRUST.SITE_VERIFIED) level = TRUST.SITE_VERIFIED; // ops set this after a field visit
  return level;
}

/**
 * Arabic names carry honorifics and variable spacing. Compare on normalised tokens and
 * require every token of the shorter name to appear in the longer one.
 */
export function namesMatch(a: string, b: string): boolean {
  const tokens = (v: string) =>
    v
      .split(/\s+/)
      .map((t) => normaliseToken(t))
      .filter((t) => t.length > 1 && !HONORIFICS.has(t));
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  const hits = shorter.filter((t) => longerSet.has(t)).length;
  // At least three name parts must match, or all of them when the name is shorter.
  return hits >= Math.min(3, shorter.length);
}

const HONORIFICS = new Set(["mr", "mrs", "eng", "dr", "السيد", "السيده", "مهندس", "دكتور", "الاستاذ", "استاذ"]);

function compoundMatches(extractedName: string, compound: { nameAr: string; nameEn: string }): boolean {
  const e = normaliseToken(extractedName);
  const ar = normaliseToken(compound.nameAr);
  const en = normaliseToken(compound.nameEn);
  return e.includes(ar) || ar.includes(e) || e.includes(en) || en.includes(e);
}
