"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, Star, Trash2, ChevronRight, ChevronLeft, Upload, Check } from "lucide-react";
import { Locale } from "@/lib/i18n";
import {
  UNIT_TYPES,
  FINISHINGS,
  DELIVERY_STATUSES,
  PURPOSES,
  PAYMENT_TYPES,
  REQUIRED_ROOMS,
  UNIT_TYPE_LABELS,
  FINISHING_LABELS,
  PAYMENT_TYPE_LABELS,
  ROOM_LABELS,
  UnitType,
  Finishing,
  Room,
} from "@/lib/enums";
import { VIEWS } from "@/lib/adminEdit";

type UnitForm = {
  type: string;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  landSqm: number | null;
  floor: number | null;
  building: string | null;
  unitNumber: string | null;
  finishing: string;
  deliveryStatus: string;
  deliveryDate: string | null;
  view: string | null;
};
type ListingForm = {
  titleAr: string | null;
  titleEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  purpose: string;
  paymentType: string;
  remainingToDeveloper: number | null;
  maintenanceDue: number | null;
};
type Media = {
  id: string;
  fileKey: string;
  thumbKey: string | null;
  room: string | null;
  source: string;
  isCover: boolean;
  isVerified: boolean;
};
type Gate = { canPublish: boolean; blocks: { code: string; messageAr: string; messageEn: string }[]; warnings: { code: string; messageAr: string; messageEn: string }[] };

// Listing purpose. Not enums.PURPOSE_LABELS — that map is a BUYER's intent on a request
// (to live in / invest / rent out), a different question with different keys.
const LISTING_PURPOSE_LABELS: Record<string, { ar: string; en: string }> = {
  sale: { ar: "بيع", en: "Sale" },
  rent: { ar: "إيجار", en: "Rent" },
};
const DELIVERY_LABELS: Record<string, { ar: string; en: string }> = {
  ready: { ar: "استلام فوري", en: "Ready" },
  under_construction: { ar: "تحت الإنشاء", en: "Under construction" },
};
const VIEW_LABELS: Record<string, { ar: string; en: string }> = {
  garden: { ar: "حديقة", en: "Garden" },
  pool: { ar: "حمام سباحة", en: "Pool" },
  street: { ar: "شارع", en: "Street" },
  landscape: { ar: "لاندسكيب", en: "Landscape" },
  sea: { ar: "بحر", en: "Sea" },
  open: { ar: "مفتوح", en: "Open" },
};
const ERROR_COPY: Record<string, { ar: string; en: string }> = {
  invalid: { ar: "قيمة غير صحيحة", en: "Invalid value" },
  required: { ar: "مطلوب", en: "Required" },
  out_of_range: { ar: "خارج النطاق المسموح", en: "Out of range" },
  too_long: { ar: "أطول من المسموح", en: "Too long" },
};
const API_ERRORS: Record<string, { ar: string; en: string }> = {
  duplicate_unit: {
    ar: "البيانات دي بتطابق وحدة تانية متسجلة بالفعل (مبنى/دور/رقم/نوع/مساحة). مش هينفع يبقى فيه إعلانين لنفس الوحدة.",
    en: "These details match another registered unit (building/floor/number/type/size). One unit cannot have two listings.",
  },
  forbidden: { ar: "التعديل للأدمن بس.", en: "Only an admin can edit listings." },
  storage_driver_unsupported: {
    ar: "رفع الصور من هنا شغال على التخزين المحلي بس. في الإنتاج الرفع بيروح للـ bucket مباشرة.",
    en: "Uploading here works with local storage only. In production uploads go straight to the bucket.",
  },
  type_not_allowed: { ar: "نوع ملف مش مسموح (JPG / PNG / WEBP / HEIC بس)", en: "File type not allowed (JPG / PNG / WEBP / HEIC only)" },
  too_large: { ar: "الملف أكبر من 15 ميجا", en: "File is larger than 15 MB" },
  not_an_image: { ar: "الملف مش صورة", en: "Not an image" },
  too_many_files: { ar: "أقصى عدد 12 صورة في المرة", en: "At most 12 photos at a time" },
};

/** Numbers travel as strings in the inputs so an empty box is "", not 0. */
const str = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(v));

/**
 * Declared at module level on purpose: a component defined inside the editor is a NEW
 * component type on every render, so React would remount each input on every keystroke
 * and the cursor would drop out of the field after one character.
 */
function Field({
  label,
  err,
  changed,
  changedLabel,
  children,
}: {
  label: string;
  err?: string;
  changed?: boolean;
  changedLabel: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-navy-700">
        {label}
        {changed && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-label={changedLabel} />}
      </span>
      {children}
      {err && <span className="mt-1 block text-[12px] font-semibold text-danger-700">{err}</span>}
    </label>
  );
}

export default function AdminListingEditor({
  locale,
  listingId,
  unitType,
  initial,
  media: initialMedia,
}: {
  locale: Locale;
  listingId: string;
  unitType: string;
  initial: { unit: UnitForm; listing: ListingForm };
  media: Media[];
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const L = (x: { ar: string; en: string } | undefined, fallback = "") => (x ? x[locale] : fallback);

  // ---------- details ----------
  const [unit, setUnit] = useState<Record<keyof UnitForm, string>>(
    () => Object.fromEntries(Object.entries(initial.unit).map(([k, v]) => [k, str(v)])) as Record<keyof UnitForm, string>,
  );
  const [listing, setListing] = useState<Record<keyof ListingForm, string>>(
    () => Object.fromEntries(Object.entries(initial.listing).map(([k, v]) => [k, str(v)])) as Record<keyof ListingForm, string>,
  );
  const [baseline, setBaseline] = useState({ unit, listing });
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ count: number; gate: Gate | null } | null>(null);

  const changedUnit = Object.fromEntries(
    Object.entries(unit).filter(([k, v]) => v !== baseline.unit[k as keyof UnitForm]),
  );
  const changedListing = Object.fromEntries(
    Object.entries(listing).filter(([k, v]) => v !== baseline.listing[k as keyof ListingForm]),
  );
  const changeCount = Object.keys(changedUnit).length + Object.keys(changedListing).length;

  async function saveDetails() {
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    setSaved(null);
    try {
      // Empty string → null, so clearing an optional field really clears it.
      const nul = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));
      const res = await fetch(`/api/admin/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: nul(changedUnit), listing: nul(changedListing) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(json.errors)) {
          setFieldErrors(Object.fromEntries(json.errors.map((e: { field: string; code: string }) => [e.field, L(ERROR_COPY[e.code], e.code)])));
          setSaveError(ar ? "صحّح الحقول المعلّمة." : "Fix the highlighted fields.");
        } else {
          setSaveError(L(API_ERRORS[json.error], json.error ?? (ar ? "الحفظ فشل." : "Save failed.")));
        }
        return;
      }
      setBaseline({ unit, listing });
      setSaved({ count: changeCount, gate: json.gate ?? null });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const u = (k: keyof UnitForm) => ({
    value: unit[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setUnit({ ...unit, [k]: e.target.value }),
  });
  const l = (k: keyof ListingForm) => ({
    value: listing[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setListing({ ...listing, [k]: e.target.value }),
  });

  const inputCls = "input w-full";

  // ---------- photos ----------
  const [media, setMedia] = useState<Media[]>(initialMedia);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadRoom, setUploadRoom] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function mediaCall(method: "PATCH" | "DELETE", body?: unknown, query = "") {
    setPhotoError(null);
    const res = await fetch(`/api/admin/listings/${listingId}/media${query}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setPhotoError(L(API_ERRORS[json.error], json.error ?? "error"));
    return res.ok;
  }

  async function setCover(id: string) {
    setBusyId(id);
    if (await mediaCall("PATCH", { coverMediaId: id })) {
      setMedia((m) => m.map((x) => ({ ...x, isCover: x.id === id })));
      router.refresh();
    }
    setBusyId(null);
  }

  async function move(index: number, delta: number) {
    const j = index + delta;
    if (j < 0 || j >= media.length) return;
    const next = [...media];
    [next[index], next[j]] = [next[j], next[index]];
    setBusyId(media[index].id);
    if (await mediaCall("PATCH", { order: next.map((m) => m.id) })) setMedia(next);
    setBusyId(null);
  }

  async function setRoom(id: string, room: string) {
    setBusyId(id);
    if (await mediaCall("PATCH", { mediaId: id, room: room || null })) {
      setMedia((m) => m.map((x) => (x.id === id ? { ...x, room: room || null } : x)));
    }
    setBusyId(null);
  }

  async function remove(id: string) {
    setBusyId(id);
    if (await mediaCall("DELETE", undefined, `?mediaId=${encodeURIComponent(id)}`)) {
      setConfirmDelete(null);
      // The server may have promoted a new cover; take its word for it.
      router.refresh();
      setMedia((m) => m.filter((x) => x.id !== id));
    }
    setBusyId(null);
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setPhotoError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      if (uploadRoom) form.append("room", uploadRoom);
      const res = await fetch(`/api/admin/listings/${listingId}/media`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (Array.isArray(json.created) && json.created.length) {
        setMedia((m) => [
          ...m,
          ...json.created.map((c: Media) => ({ ...c, source: "upload", isCover: false, isVerified: true })),
        ]);
        router.refresh();
      }
      if (Array.isArray(json.rejected) && json.rejected.length) {
        setPhotoError(
          json.rejected.map((r: { name: string; reason: string }) => `${r.name}: ${L(API_ERRORS[r.reason], r.reason)}`).join(" · "),
        );
      } else if (!res.ok) {
        setPhotoError(L(API_ERRORS[json.error], json.error ?? "upload failed"));
      }
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const PrevIcon = ar ? ChevronRight : ChevronLeft;
  const NextIcon = ar ? ChevronLeft : ChevronRight;

  return (
    <div className="mt-6 space-y-6">
      {/* ---------------- Unit ---------------- */}
      <section className="card p-5">
        <h2 className="text-[16px] font-bold text-ink-900">{ar ? "بيانات الوحدة" : "Unit"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "النوع" : "Type"} err={fieldErrors["unit.type"]} changed={"type" in changedUnit}>
            <select className={inputCls} {...u("type")}>
              {UNIT_TYPES.map((x) => <option key={x} value={x}>{L(UNIT_TYPE_LABELS[x as UnitType], x)}</option>)}
            </select>
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "المساحة (م²)" : "Size (sqm)"} err={fieldErrors["unit.sizeSqm"]} changed={"sizeSqm" in changedUnit}>
            <input className={`${inputCls} tnum`} inputMode="decimal" {...u("sizeSqm")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "مساحة الأرض (م²)" : "Land (sqm)"} err={fieldErrors["unit.landSqm"]} changed={"landSqm" in changedUnit}>
            <input className={`${inputCls} tnum`} inputMode="decimal" {...u("landSqm")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "غرف النوم" : "Bedrooms"} err={fieldErrors["unit.bedrooms"]} changed={"bedrooms" in changedUnit}>
            <input className={`${inputCls} tnum`} inputMode="numeric" {...u("bedrooms")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "الحمامات" : "Bathrooms"} err={fieldErrors["unit.bathrooms"]} changed={"bathrooms" in changedUnit}>
            <input className={`${inputCls} tnum`} inputMode="numeric" {...u("bathrooms")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "الدور" : "Floor"} err={fieldErrors["unit.floor"]} changed={"floor" in changedUnit}>
            <input className={`${inputCls} tnum`} inputMode="numeric" {...u("floor")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "المبنى" : "Building"} err={fieldErrors["unit.building"]} changed={"building" in changedUnit}>
            <input className={inputCls} {...u("building")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "رقم الوحدة" : "Unit number"} err={fieldErrors["unit.unitNumber"]} changed={"unitNumber" in changedUnit}>
            <input className={inputCls} {...u("unitNumber")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "التشطيب" : "Finishing"} err={fieldErrors["unit.finishing"]} changed={"finishing" in changedUnit}>
            <select className={inputCls} {...u("finishing")}>
              {FINISHINGS.map((x) => <option key={x} value={x}>{L(FINISHING_LABELS[x as Finishing], x)}</option>)}
            </select>
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "الاستلام" : "Delivery"} err={fieldErrors["unit.deliveryStatus"]} changed={"deliveryStatus" in changedUnit}>
            <select className={inputCls} {...u("deliveryStatus")}>
              {DELIVERY_STATUSES.map((x) => <option key={x} value={x}>{L(DELIVERY_LABELS[x], x)}</option>)}
            </select>
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "تاريخ الاستلام" : "Delivery date"} err={fieldErrors["unit.deliveryDate"]} changed={"deliveryDate" in changedUnit}>
            <input type="date" className={`${inputCls} tnum`} {...u("deliveryDate")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "الفيو" : "View"} err={fieldErrors["unit.view"]} changed={"view" in changedUnit}>
            <select className={inputCls} {...u("view")}>
              <option value="">—</option>
              {VIEWS.map((x) => <option key={x} value={x}>{L(VIEW_LABELS[x], x)}</option>)}
            </select>
          </Field>
        </div>
      </section>

      {/* ---------------- Listing ---------------- */}
      <section className="card p-5">
        <h2 className="text-[16px] font-bold text-ink-900">{ar ? "تفاصيل الإعلان" : "Listing details"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "السعر (ج.م)" : "Price (EGP)"} err={fieldErrors["listing.price"]} changed={"price" in changedListing}>
            <input className={`${inputCls} tnum`} inputMode="numeric" {...l("price")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "الغرض" : "Purpose"} err={fieldErrors["listing.purpose"]} changed={"purpose" in changedListing}>
            <select className={inputCls} {...l("purpose")}>
              {PURPOSES.map((x) => <option key={x} value={x}>{L(LISTING_PURPOSE_LABELS[x], x)}</option>)}
            </select>
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "طريقة الدفع" : "Payment"} err={fieldErrors["listing.paymentType"]} changed={"paymentType" in changedListing}>
            <select className={inputCls} {...l("paymentType")}>
              {PAYMENT_TYPES.map((x) => <option key={x} value={x}>{L(PAYMENT_TYPE_LABELS[x], x)}</option>)}
            </select>
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "المتبقي للمطور (ج.م)" : "Remaining to developer (EGP)"} err={fieldErrors["listing.remainingToDeveloper"]} changed={"remainingToDeveloper" in changedListing}>
            <input className={`${inputCls} tnum`} inputMode="numeric" placeholder={ar ? "فاضي = مش معروف" : "empty = unknown"} {...l("remainingToDeveloper")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "صيانة مستحقة (ج.م)" : "Maintenance due (EGP)"} err={fieldErrors["listing.maintenanceDue"]} changed={"maintenanceDue" in changedListing}>
            <input className={`${inputCls} tnum`} inputMode="numeric" placeholder={ar ? "فاضي = مش معروف" : "empty = unknown"} {...l("maintenanceDue")} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "العنوان (عربي)" : "Title (Arabic)"} err={fieldErrors["listing.titleAr"]} changed={"titleAr" in changedListing}>
            <input className={inputCls} dir="rtl" maxLength={120} {...l("titleAr")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "العنوان (إنجليزي)" : "Title (English)"} err={fieldErrors["listing.titleEn"]} changed={"titleEn" in changedListing}>
            <input className={inputCls} dir="ltr" maxLength={120} {...l("titleEn")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "الوصف (عربي)" : "Description (Arabic)"} err={fieldErrors["listing.descriptionAr"]} changed={"descriptionAr" in changedListing}>
            <textarea className={`${inputCls} min-h-[140px]`} dir="rtl" maxLength={4000} {...l("descriptionAr")} />
          </Field>
          <Field changedLabel={ar ? "متغيّر" : "changed"} label={ar ? "الوصف (إنجليزي)" : "Description (English)"} err={fieldErrors["listing.descriptionEn"]} changed={"descriptionEn" in changedListing}>
            <textarea className={`${inputCls} min-h-[140px]`} dir="ltr" maxLength={4000} {...l("descriptionEn")} />
          </Field>
        </div>
      </section>

      {/* Save bar — pinned so a long form never hides it. */}
      <div className="sticky bottom-3 z-10 card flex flex-wrap items-center justify-between gap-3 p-3 shadow-lg">
        <div className="text-[13px]">
          {saveError ? (
            <span className="font-semibold text-danger-700">{saveError}</span>
          ) : changeCount > 0 ? (
            <span className="font-semibold text-ink-900">{ar ? `${changeCount} تعديل مش محفوظ` : `${changeCount} unsaved change(s)`}</span>
          ) : saved ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-ok-700">
              <Check size={15} /> {ar ? "اتحفظ" : "Saved"}
            </span>
          ) : (
            <span className="muted">{ar ? "مافيش تعديلات" : "No changes"}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={saving || changeCount === 0}
            onClick={() => { setUnit(baseline.unit); setListing(baseline.listing); setFieldErrors({}); setSaveError(null); }}
          >
            {ar ? "تراجع" : "Discard"}
          </button>
          <button type="button" className="btn btn-primary" disabled={saving || changeCount === 0} onClick={saveDetails}>
            {saving && <Loader2 size={15} className="animate-spin" />}
            {ar ? "احفظ التعديلات" : "Save changes"}
          </button>
        </div>
      </div>

      {/* What the publish gate thinks of the edited listing. */}
      {saved?.gate && (saved.gate.blocks.length > 0 || saved.gate.warnings.length > 0) && (
        <section className="card space-y-2 p-4">
          <p className="text-[13px] font-bold text-ink-900">
            {ar ? "بعد التعديل، فحوصات النشر بتقول:" : "After this edit, the publish checks report:"}
          </p>
          {saved.gate.blocks.map((b) => (
            <div key={b.code} className="border-s-2 border-danger-600 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
              {ar ? b.messageAr : b.messageEn}
            </div>
          ))}
          {saved.gate.warnings.map((w) => (
            <div key={w.code} className="border-s-2 border-ink-400 bg-ink-50 px-3 py-2 text-[13px] text-ink-900">
              {ar ? w.messageAr : w.messageEn}
            </div>
          ))}
        </section>
      )}

      {/* ---------------- Photos ---------------- */}
      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[16px] font-bold text-ink-900">
            {ar ? "الصور" : "Photos"} <span className="tnum muted">({media.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={uploadRoom} onChange={(e) => setUploadRoom(e.target.value)} aria-label={ar ? "الغرفة" : "Room"}>
              <option value="">{ar ? "الغرفة (اختياري)" : "Room (optional)"}</option>
              {REQUIRED_ROOMS.map((r) => <option key={r} value={r}>{L(ROOM_LABELS[r as Room], r)}</option>)}
            </select>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              hidden
              onChange={(e) => upload(e.target.files)}
            />
            <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {ar ? "ارفع صور" : "Upload photos"}
            </button>
          </div>
        </div>
        <p className="mt-1 text-[12px] muted">
          {ar
            ? "الصور اللي بترفعها من هنا بتتسجل كـ «رفع» مش «تصوير من التطبيق»، فمش بتتحسب في الحد الأدنى للصور الموثّقة بالـ GPS."
            : "Photos uploaded here are recorded as uploads, not in-app captures, so they never count toward the GPS-verified photo minimum."}
        </p>
        {photoError && <p className="mt-3 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">{photoError}</p>}

        {media.length === 0 ? (
          <p className="mt-4 text-[13px] muted">{ar ? "مافيش صور." : "No photos."}</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {media.map((m, i) => (
              <li key={m.id} className={`rounded-md border p-2 ${m.isCover ? "border-navy-700" : "border-[var(--border)]"}`}>
                <div className="media-frame aspect-[4/3] rounded-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.thumbKey ?? m.fileKey} alt={m.room ?? ""} className="h-full w-full object-cover" />
                  {m.isCover && (
                    <span className="badge badge-verified absolute start-1 top-1">{ar ? "الغلاف" : "Cover"}</span>
                  )}
                  {busyId === m.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                      <Loader2 size={18} className="animate-spin text-navy-700" />
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px] muted">
                  <span>{m.source}{m.isVerified ? " ✓" : ""}</span>
                  <span className="tnum">#{i + 1}</span>
                </div>
                <select
                  className="input mt-1 w-full text-[12px]"
                  value={m.room ?? ""}
                  disabled={busyId !== null}
                  onChange={(e) => setRoom(m.id, e.target.value)}
                  aria-label={ar ? "الغرفة" : "Room"}
                >
                  <option value="">—</option>
                  {REQUIRED_ROOMS.map((r) => <option key={r} value={r}>{L(ROOM_LABELS[r as Room], r)}</option>)}
                </select>
                <div className="mt-2 flex items-center gap-1">
                  <button type="button" className="btn btn-ghost px-2 py-1" disabled={busyId !== null || i === 0} onClick={() => move(i, -1)} aria-label={ar ? "قدّم" : "Move earlier"}>
                    <PrevIcon size={14} />
                  </button>
                  <button type="button" className="btn btn-ghost px-2 py-1" disabled={busyId !== null || i === media.length - 1} onClick={() => move(i, 1)} aria-label={ar ? "أخّر" : "Move later"}>
                    <NextIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost px-2 py-1"
                    disabled={busyId !== null || m.isCover}
                    onClick={() => setCover(m.id)}
                    title={ar ? "اجعلها الغلاف" : "Make cover"}
                    aria-label={ar ? "اجعلها الغلاف" : "Make cover"}
                  >
                    <Star size={14} className={m.isCover ? "fill-current" : ""} />
                  </button>
                  {confirmDelete === m.id ? (
                    <button type="button" className="btn btn-primary ms-auto px-2 py-1 text-[12px]" disabled={busyId !== null} onClick={() => remove(m.id)}>
                      {ar ? "تأكيد الحذف" : "Confirm"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost ms-auto px-2 py-1 text-danger-700"
                      disabled={busyId !== null}
                      onClick={() => setConfirmDelete(m.id)}
                      aria-label={ar ? "احذف" : "Delete"}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] muted">
          {ar ? "نوع الوحدة" : "Unit type"}: {L(UNIT_TYPE_LABELS[unitType as UnitType], unitType)} ·{" "}
          {ar ? "لو اتمسحت صورة الغلاف بيتختار غلاف جديد تلقائياً." : "Deleting the cover promotes the best remaining photo automatically."}
        </p>
      </section>
    </div>
  );
}
