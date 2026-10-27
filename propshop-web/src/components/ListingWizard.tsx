"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { Locale, t } from "@/lib/i18n";
import {
  DELIVERY_STATUSES,
  FINISHINGS,
  FINISHING_LABELS,
  PAYMENT_TYPES,
  PAYMENT_TYPE_LABELS,
  UNIT_TYPES,
  UNIT_TYPE_LABELS,
  REQUIRED_ROOMS,
  ROOM_LABELS,
  MIN_PHOTOS,
  Finishing,
  UnitType,
  Room,
} from "@/lib/enums";
import CompoundLocationMap from "@/components/CompoundLocationMap";
import { formatPriceExact } from "@/lib/format";
import { prepareImage, imageReadMessage } from "@/lib/imageUpload";

type Area = { id: string; slug: string; nameAr: string; nameEn: string };
type Compound = {
  id: string;
  areaId: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  developer: string;
  minSizeSqm: number | null;
  maxSizeSqm: number | null;
  unitTypes: string[];
  centerLat: number | null;
  centerLng: number | null;
  geomJson: string | null;
};

type CapturedPhoto = { id: string; room: string | null; fileKey: string; thumbKey: string | null };

type Check = { code: string; severity: string; field: string | null; messageAr: string; messageEn: string };
type Validation = { canPublish: boolean; blocks: Check[]; warnings: Check[]; trustLevel: number };

/*
  The unit details used to be one 13-field screen, which on a phone was a long scroll with
  the only message at the bottom. They are now three short steps, grouped as in the app: compound and unit type / size, rooms, building,
  unit number, floor, finishing, delivery / price, payment, "without over"
  held in client state and sent to POST /api/listings/draft once, at the end of the third:
  the draft API (also used by the app) still receives every field together.
*/
const STEPS = ["unit", "size", "money", "ownership", "photos", "price"] as const;
type Step = (typeof STEPS)[number];
type DetailStep = "unit" | "size" | "money";
const DETAIL_STEPS: DetailStep[] = ["unit", "size", "money"];

/** Which details step owns each draft field, so a server-side error lands on its field. */
const FIELD_STEP: Record<string, DetailStep> = {
  areaId: "unit",
  compoundId: "unit",
  type: "unit",
  building: "size",
  unitNumber: "size",
  floor: "size",
  sizeSqm: "size",
  bedrooms: "size",
  bathrooms: "size",
  finishing: "size",
  deliveryStatus: "size",
  price: "money",
  paymentType: "money",
  purpose: "money",
};

export default function ListingWizard({
  locale,
  areas,
  compounds,
  fees,
  remainingSlots,
  resume,
}: {
  locale: Locale;
  areas: Area[];
  compounds: Compound[];
  /** Photography is the only fee the wizard can quote — listing is free. */
  fees: { photo: { amount: number } | null };
  remainingSlots: number;
  /**
   * Continue an existing draft (/dashboard/listings/[id]) instead of starting one. The
   * unit step is already done; the wizard opens on the first unfinished step.
   */
  resume?: {
    listingId: string;
    reference: string;
    compoundId: string | null;
    capturedRooms: Room[];
    photos: CapturedPhoto[];
    coverId: string | null;
    docUploaded: boolean;
    /** The gate's verdict, computed server-side, so it shows immediately. */
    validation: Validation | null;
  };
}) {
  const router = useRouter();
  const ar = locale === "ar";

  const resumeStep: Step | null = resume
    ? !resume.docUploaded
      ? "ownership"
      : REQUIRED_ROOMS.some((r) => !resume.capturedRooms.includes(r))
        ? "photos"
        : "price"
    : null;
  const [step, setStep] = useState<Step>(resumeStep ?? "unit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(resume?.listingId ?? null);
  const [reference, setReference] = useState<string | null>(resume?.reference ?? null);
  const [validation, setValidation] = useState<Validation | null>(resume?.validation ?? null);
  const [capturedRooms, setCapturedRooms] = useState<Room[]>(resume?.capturedRooms ?? []);
  // The registered photos, so the owner can choose which one fronts the listing.
  const [photos, setPhotos] = useState<CapturedPhoto[]>(resume?.photos ?? []);
  const [coverId, setCoverId] = useState<string | null>(resume?.coverId ?? null);
  const [docUploaded, setDocUploaded] = useState(resume?.docUploaded ?? false);
  const [submitted, setSubmitted] = useState(false);
  // Shown after an upload the automatic reader could not handle: stored, not refused.
  const [docNotice, setDocNotice] = useState<string | null>(null);
  // Inline errors, keyed by draft field name.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    purpose: "sale",
    compoundId: resume?.compoundId ?? "",
    areaId: "",
    building: "",
    floor: "",
    unitNumber: "",
    type: "apartment",
    bedrooms: "3",
    bathrooms: "2",
    sizeSqm: "",
    finishing: "fully_finished",
    deliveryStatus: "ready",
    view: "garden",
    price: "",
    paymentType: "cash",
    titleAr: "",
    descriptionAr: "",
  });

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    // Changing a field clears its own error; the others stay until they are fixed.
    setFieldErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };
  // "بدون أوفر": the owner sells at the original contract price, no premium on top.
  const [withoutOver, setWithoutOver] = useState(false);

  const selectedCompound = compounds.find((c) => c.id === form.compoundId) ?? null;
  const availableCompounds = form.areaId ? compounds.filter((c) => c.areaId === form.areaId) : compounds;

  // The compound's known ranges, shown inline so the owner sees the constraint before
  // the gate rejects them for it.
  const sizeHint =
    selectedCompound?.minSizeSqm && selectedCompound?.maxSizeSqm
      ? ar
        ? `مساحات ${selectedCompound.nameAr} بين ${selectedCompound.minSizeSqm} و${selectedCompound.maxSizeSqm} م²`
        : `Units in ${selectedCompound.nameEn} range from ${selectedCompound.minSizeSqm} to ${selectedCompound.maxSizeSqm} sqm`
      : null;

  async function createDraft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listings/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          areaId: form.areaId || selectedCompound?.areaId,
          compoundId: form.compoundId || null,
          floor: form.floor === "" ? null : Number(form.floor),
          bedrooms: Number(form.bedrooms),
          bathrooms: Number(form.bathrooms),
          sizeSqm: Number(form.sizeSqm),
          price: Number(form.price),
          withoutOver,
          // No lat/lng: the server takes the unit's location from the compound.
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A field the server refused is marked on its own step, and the owner is taken there.
        const fields: string[] = json.error === "invalid_fields" && Array.isArray(json.fields) ? json.fields : [];
        if (fields.length) {
          const msg = ar ? "راجع القيمة دي." : "Check this value.";
          setFieldErrors(Object.fromEntries(fields.map((f) => [f, msg])));
          const first = DETAIL_STEPS.find((st) => fields.some((f) => FIELD_STEP[f] === st));
          if (first) setStep(first);
        }
        setError(draftError(json, ar));
        return;
      }
      setFieldErrors({});
      setListingId(json.listingId);
      setReference(json.reference);
      setStep("ownership");
    } catch {
      setError(ar ? "مفيش اتصال. اتأكد من النت وجرّب تاني." : "No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revalidate(id: string) {
    const res = await fetch(`/api/listings/${id}/validate`);
    if (res.ok) setValidation(await res.json());
  }


  /** Demo capture: registers a photo for a room the way the mobile app would. */
  async function simulateCapture(room: Room) {
    if (!listingId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileKey: `https://picsum.photos/seed/${listingId}-${room}/1200/800`,
          thumbKey: `https://picsum.photos/seed/${listingId}-${room}/600/400`,
          room,
          source: "in_app",
          gpsLat: selectedCompound?.centerLat ?? 30.02,
          gpsLng: selectedCompound?.centerLng ?? 31.49,
          capturedAt: new Date().toISOString(),
          phash: `${listingId.slice(0, 8)}${room}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      // Only tick the room off when the server actually stored the photo; a failed
      // request used to mark it captured anyway and the gate then disagreed with the list.
      if (!res.ok) {
        setError(ar ? "الصورة ماتسجلتش. جرّب تاني." : "The photo was not saved. Please try again.");
        return;
      }
      const made: CapturedPhoto[] = Array.isArray(json?.created) ? json.created : [];
      if (made.length > 0) setPhotos((p) => [...p, ...made]);
      setCapturedRooms((r) => (r.includes(room) ? r : [...r, room]));
      await revalidate(listingId);
    } catch {
      setError(ar ? "مفيش اتصال. اتأكد من النت وجرّب تاني." : "No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Choose the cover. Optimistic: the picker is a preference, and a failed request just
   * means the server keeps its automatic choice (src/lib/cover.ts) — nothing is lost.
   */
  async function chooseCover(mediaId: string) {
    if (!listingId) return;
    setCoverId(mediaId);
    await fetch(`/api/listings/${listingId}/media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverMediaId: mediaId }),
    }).catch(() => {});
  }

  /**
   * Ownership document: the owner picks photos of its pages, the browser shrinks them (a
   * raw phone photo is over the 4.5 MB request cap) and they go up as `images`, the same
   * contract as the app. Up to 4 pages keeps the request well under the cap.
   */
  async function uploadOwnershipDoc(files: File[]) {
    if (!listingId || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let images;
      try {
        images = await Promise.all(files.slice(0, 4).map(prepareImage));
      } catch (err) {
        setError(
          imageReadMessage(err, ar, {
            ar: "مش قادرين نقرأ الصورة دي. ارفع صور المستند JPG أو PNG، أو صوّره من الكاميرا.",
            en: "We couldn't read that image. Upload the document pages as JPG or PNG, or photograph them.",
          }),
        );
        return;
      }
      const res = await fetch(`/api/listings/${listingId}/ownership-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "contract", images }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDocUploaded(true);
        setDocNotice(
          json.manualReview
            ? ar
              ? "المستند اتحفظ. ماقدرناش نقراه آلياً، ففريق المراجعة هيقارنه ببياناتك بنفسه. تقدر تكمّل."
              : "The document is saved. We could not read it automatically, so our review team will check it against your details by hand. You can carry on."
            : null,
        );
        await revalidate(listingId);
      } else {
        setError(
          json.error === "too_large"
            ? ar
              ? "الصورة كبيرة قوي. صوّر الصفحة تاني أو ارفع صورة أصغر."
              : "That image is too large. Photograph the page again or upload a smaller image."
            : json.error === "not_an_image" || json.error === "type_not_allowed"
              ? ar
                ? "ارفع صور المستند JPG أو PNG."
                : "Upload the document pages as JPG or PNG."
              : ar
                ? "رفع المستند فشل. جرّب تاني."
                : "The document upload failed. Please try again.",
        );
      }
    } catch {
      setError(ar ? "الرفع فشل. اتأكد من الإنترنت وجرّب تاني." : "Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!listingId) return;
    setBusy(true);
    setError(null);
    try {
      // The last step's price, title and description were never sent anywhere; save them
      // on the draft first so what the owner typed here is what the reviewer sees.
      const edits: Record<string, unknown> = {};
      if (Number(form.price) > 0) edits.price = Number(form.price);
      if (form.titleAr.trim()) edits.titleAr = form.titleAr.trim();
      if (form.descriptionAr.trim()) edits.descriptionAr = form.descriptionAr.trim();
      if (Object.keys(edits).length) {
        await fetch(`/api/listings/${listingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(edits),
        }).catch(() => {});
      }
      const res = await fetch(`/api/listings/${listingId}/submit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        if (json.validation) setValidation(json.validation);
        setError(ar ? "فيه حاجات لازم تتظبط قبل النشر." : "Some things must be fixed before publishing.");
        return;
      }
      setSubmitted(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // What each details step still needs, said next to its button and under each field
  // instead of leaving "Next" silently disabled.
  const missingFor = (st: DetailStep): { field: keyof typeof form; label: string }[] => {
    const need: { field: keyof typeof form; label: string; ok: boolean }[] =
      st === "unit"
        ? [{ field: "compoundId", label: ar ? "الكمبوند" : "compound", ok: !!form.compoundId }]
        : st === "size"
          ? [
              { field: "sizeSqm", label: ar ? "المساحة" : "size", ok: Number(form.sizeSqm) > 0 },
              { field: "bedrooms", label: ar ? "عدد الأوض" : "bedrooms", ok: form.bedrooms !== "" },
              { field: "bathrooms", label: ar ? "عدد الحمامات" : "bathrooms", ok: form.bathrooms !== "" },
            ]
          : [{ field: "price", label: ar ? "السعر" : "price", ok: Number(form.price) > 0 }];
    return need.filter((n) => !n.ok);
  };

  /** "Next" on a details step: mark what is missing, or move on (the last one saves the draft). */
  function nextFrom(st: DetailStep) {
    setError(null);
    const miss = missingFor(st);
    if (miss.length > 0) {
      const msg = ar ? "مطلوب" : "Required";
      setFieldErrors((e) => ({ ...e, ...Object.fromEntries(miss.map((m) => [m.field, msg])) }));
      document.getElementById(`f-${miss[0].field}`)?.focus();
      return;
    }
    if (st === "unit") setStep("size");
    else if (st === "size") setStep("money");
    else void createDraft();
  }

  const stepIndex = STEPS.indexOf(step);
  const back = (to: Step) => (
    <button type="button" onClick={() => { setError(null); setStep(to); }} className="btn btn-ghost">
      {t("back", locale)}
    </button>
  );

  const stepLabels: Record<Step, string> = {
    unit: ar ? "الكمبوند والنوع" : "Compound and type",
    size: ar ? "المساحة والتفاصيل" : "Size and details",
    money: ar ? "السعر والدفع" : "Price and payment",
    ownership: t("step_ownership", locale),
    photos: t("step_photos", locale),
    price: ar ? "المراجعة والنشر" : "Review and publish",
  };

  /** "Next", "Back" and what is still missing, shared by the three details steps. */
  const detailsNav = (st: DetailStep, prev: Step | null) => {
    const miss = missingFor(st);
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => nextFrom(st)} className="btn btn-primary">
          {busy ? t("loading", locale) : t("next", locale)}
        </button>
        {prev && back(prev)}
        {miss.length > 0 && (
          <p className="w-full text-[13px] muted sm:w-auto">
            {ar ? `ناقص: ${miss.map((m) => m.label).join("، ")}` : `Still needed: ${miss.map((m) => m.label).join(", ")}`}
          </p>
        )}
      </div>
    );
  };

  if (submitted) {
    return (
      <div className="border-y border-[var(--border)] py-8">
        <h1 className="text-[24px] font-bold text-ok-700">
          {ar ? "تم إرسال الإعلان للمراجعة" : "Submitted for review"}
        </h1>
        <p className="tnum mt-1 text-sm muted">{reference}</p>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-700">
          {ar
            ? "الإعلان عدّى كل الفحوصات الآلية ودلوقتي مع فريق المراجعة. هيتنشر خلال يوم عمل، وهنبعتلك إشعار."
            : "Your listing cleared every automated check and is now with our review team. It goes live within one business day and we will notify you."}
        </p>
        <div className="mt-6 flex gap-2">
          <Link href="/dashboard/listings" className="btn btn-primary">
            {ar ? "إعلاناتي" : "My listings"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold leading-tight text-ink-900">{t("list_unit", locale)}</h1>
      <p className="mt-1 text-sm muted">
        {ar
          ? `فاضلك ${remainingSlots} إعلان نشط. كل إعلان لازم يعدي توثيق الملكية والصور قبل ما ينشر.`
          : `You have ${remainingSlots} active listing slot(s) left. Every listing must pass ownership and photo verification before it publishes.`}
      </p>

      {/* Stepper */}
      <p className="mt-6 text-[13px] font-semibold text-ink-900" aria-live="polite">
        {ar
          ? `خطوة ${stepIndex + 1} من ${STEPS.length}: ${stepLabels[step]}`
          : `Step ${stepIndex + 1} of ${STEPS.length}: ${stepLabels[step]}`}
      </p>
      <ol className="mt-2 flex flex-wrap gap-2" aria-label={ar ? "الخطوات" : "Steps"}>
        {STEPS.map((s, i) => {
          const done = STEPS.indexOf(step) > i;
          const active = step === s;
          return (
            <li
              key={s}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-semibold ${
                active
                  ? "border-ink-900 bg-ink-900 text-white"
                  : done
                    ? "border-ok-50 bg-ok-50 text-ok-700"
                    : "border-[var(--border)] text-[var(--text-muted)]"
              }`}
            >
              {done ? <Check size={14} /> : <span className="tnum">{i + 1}</span>}
              {/* Six labels do not fit a phone; there the current one is in the line above. */}
              <span className={active ? "" : "sr-only sm:not-sr-only"}>{stepLabels[s]}</span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div role="alert" className="mt-5 rounded-md border border-danger-100 bg-danger-50 p-4 text-[14px] text-danger-700">{error}</div>
      )}

      {/* --- Steps 1 to 3: the unit, in three short screens --------------- */}
      {step === "unit" && (
        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-[18px] font-bold text-ink-900">{stepLabels.unit}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="f-areaId" label={ar ? "المنطقة" : "Area"} error={fieldErrors.areaId}>
              <select
                id="f-areaId"
                className="select"
                value={form.areaId}
                onChange={(e) => {
                  set("areaId", e.target.value);
                  set("compoundId", "");
                }}
              >
                <option value="">{ar ? "اختر المنطقة" : "Select an area"}</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {ar ? a.nameAr : a.nameEn}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id="f-compoundId"
              label={ar ? "الكمبوند" : "Compound"}
              hint={ar ? "بنعتمد على قائمة كمبوندات معتمدة، مش عناوين مكتوبة بإيد." : "We use a curated compound list, not free-text addresses."}
              error={fieldErrors.compoundId}
            >
              <select
                id="f-compoundId"
                className="select"
                value={form.compoundId}
                aria-invalid={!!fieldErrors.compoundId}
                onChange={(e) => {
                  const c = compounds.find((x) => x.id === e.target.value);
                  set("compoundId", e.target.value);
                  if (c) set("areaId", c.areaId);
                }}
              >
                <option value="">{ar ? "اختر الكمبوند" : "Select a compound"}</option>
                {availableCompounds.map((c) => (
                  <option key={c.id} value={c.id}>
                    {ar ? c.nameAr : c.nameEn} · {c.developer}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="f-type" label={ar ? "نوع الوحدة" : "Unit type"} error={fieldErrors.type}>
              <select id="f-type" className="select" value={form.type} onChange={(e) => set("type", e.target.value)}>
                {(selectedCompound?.unitTypes.length ? selectedCompound.unitTypes : UNIT_TYPES).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_TYPE_LABELS[u as UnitType]?.[locale] ?? u}
                  </option>
                ))}
              </select>
            </Field>

          </div>

          {selectedCompound && (
            <div className="mt-5">
              <div className="mb-2 text-[13px] font-semibold text-ink-900">
                {ar ? "موقع الوحدة" : "Unit location"}
              </div>
              <CompoundLocationMap
                locale={locale}
                name={ar ? selectedCompound.nameAr : selectedCompound.nameEn}
                centerLat={selectedCompound.centerLat}
                centerLng={selectedCompound.centerLng}
                geomJson={selectedCompound.geomJson}
              />
            </div>
          )}

          {detailsNav("unit", null)}
        </div>
      )}

      {step === "size" && (
        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-[18px] font-bold text-ink-900">{stepLabels.size}</h2>
          {/* Two-up even on a phone: the short numeric fields pair naturally, which halves the scroll. */}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field id="f-sizeSqm" label={t("size", locale)} hint={sizeHint} error={fieldErrors.sizeSqm} className="col-span-2">
              <input
                id="f-sizeSqm"
                className="input tnum"
                inputMode="numeric"
                value={form.sizeSqm}
                aria-invalid={!!fieldErrors.sizeSqm}
                onChange={(e) => set("sizeSqm", e.target.value.replace(/\D/g, ""))}
                placeholder="165"
              />
            </Field>
            <Field id="f-bedrooms" label={t("bedrooms", locale)} error={fieldErrors.bedrooms}>
              <input id="f-bedrooms" className="input tnum" inputMode="numeric" value={form.bedrooms} aria-invalid={!!fieldErrors.bedrooms} onChange={(e) => set("bedrooms", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field id="f-bathrooms" label={t("bathrooms", locale)} error={fieldErrors.bathrooms}>
              <input id="f-bathrooms" className="input tnum" inputMode="numeric" value={form.bathrooms} aria-invalid={!!fieldErrors.bathrooms} onChange={(e) => set("bathrooms", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field id="f-building" label={ar ? "المبنى" : "Building"} error={fieldErrors.building}>
              <input id="f-building" className="input" value={form.building} onChange={(e) => set("building", e.target.value)} placeholder="B7" />
            </Field>
            <Field id="f-unitNumber" label={ar ? "رقم الوحدة" : "Unit number"} error={fieldErrors.unitNumber}>
              <input id="f-unitNumber" className="input" value={form.unitNumber} onChange={(e) => set("unitNumber", e.target.value)} placeholder="304" />
            </Field>
            <Field id="f-floor" label={t("floor", locale)} error={fieldErrors.floor} className="col-span-2">
              <input id="f-floor" className="input tnum" inputMode="numeric" value={form.floor} onChange={(e) => set("floor", e.target.value.replace(/[^\d-]/g, ""))} />
            </Field>
            <Field id="f-finishing" label={t("finishing", locale)} error={fieldErrors.finishing} className="col-span-2 sm:col-span-1">
              <select id="f-finishing" className="select" value={form.finishing} onChange={(e) => set("finishing", e.target.value)}>
                {FINISHINGS.map((f) => (
                  <option key={f} value={f}>
                    {FINISHING_LABELS[f as Finishing][locale]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="f-deliveryStatus" label={t("delivery", locale)} error={fieldErrors.deliveryStatus} className="col-span-2 sm:col-span-1">
              <select id="f-deliveryStatus" className="select" value={form.deliveryStatus} onChange={(e) => set("deliveryStatus", e.target.value)}>
                {DELIVERY_STATUSES.map((d) => (
                  <option key={d} value={d}>
                    {d === "ready" ? t("ready_to_move", locale) : t("under_construction", locale)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {detailsNav("size", "unit")}
        </div>
      )}

      {step === "money" && (
        <div className="card mt-5 p-5 sm:p-6">
          <h2 className="text-[18px] font-bold text-ink-900">{stepLabels.money}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              id="f-price"
              label={t("asking_price", locale)}
              hint={Number(form.price) > 0 ? `= ${formatPriceExact(Number(form.price), locale)}` : ar ? "بالجنيه المصري" : "In Egyptian pounds"}
              error={fieldErrors.price}
            >
              <input
                id="f-price"
                className="input tnum"
                inputMode="numeric"
                autoComplete="off"
                value={form.price}
                aria-invalid={!!fieldErrors.price}
                onChange={(e) => set("price", e.target.value.replace(/\D/g, ""))}
                placeholder="9800000"
              />
            </Field>
            <Field id="f-paymentType" label={t("payment_type", locale)} error={fieldErrors.paymentType}>
              <select id="f-paymentType" className="select" value={form.paymentType} onChange={(e) => set("paymentType", e.target.value)}>
                {PAYMENT_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_TYPE_LABELS[p][locale]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* "Without over" (owner, 2026-10-11): selling at the original contract price. */}
          <label
            className={`mt-5 flex cursor-pointer items-start gap-3 rounded-md border p-4 transition ${
              withoutOver ? "border-accent-500 bg-accent-50" : "border-[var(--border)] hover:bg-ink-50"
            }`}
          >
            <input
              type="checkbox"
              checked={withoutOver}
              onChange={(e) => setWithoutOver(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-accent-500)]"
            />
            <span>
              <span className="block text-[15px] font-bold text-ink-900">{ar ? "بدون أوفر" : "Without over"}</span>
              <span className="mt-0.5 block text-[13px] text-ink-500">
                {ar
                  ? "هبيع بسعر التعاقد الأصلي، من غير أي زيادة (أوفر). الوحدة هتظهر في فلتر «وحدات بدون أوفر»."
                  : "I'll sell at the original contract price, with no premium (over) on top. The unit shows under the “Units without over price” filter."}
              </span>
            </span>
          </label>

          <p className="mt-4 text-[12px] muted">
            {ar ? "لما تدوس «التالي» بيانات الوحدة هتتحفظ كمسودة." : "Pressing Next saves the unit details as a draft."}
          </p>

          {detailsNav("money", "size")}
        </div>
      )}

      {/* --- Step 2: ownership proof ----------------------------------- */}
      {step === "ownership" && (
        <div className="card mt-5 p-6">
          <h2 className="text-[18px] font-bold text-ink-900">{t("step_ownership", locale)}</h2>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed muted">
            {ar
              ? "مقبول: عقد مسجل، عقد بيع موقّع مع المطور، خطاب تخصيص، أو عقد صحة توقيع. الاسم في المستند لازم يطابق بطاقتك، وبيانات الوحدة لازم تطابق اللي كتبته."
              : "Accepted: a registered deed, a signed sale contract with the developer, an allocation letter, or a court-registered contract. The name on the document must match your ID, and the unit details must match what you entered."}
          </p>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed muted">
            {ar
              ? "بنقرأ المستند آلياً ونقارنه بالبيانات اللي دخّلتها. لو فيه اختلاف، هنوريك الحقل اللي محتاج تعديل بالظبط."
              : "We read the document automatically and compare it with what you entered. If anything differs, we show you the exact field to fix."}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <label
              aria-disabled={busy || docUploaded}
              className={`btn btn-primary ${busy || docUploaded ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
            >
              {docUploaded
                ? ar ? "تم رفع المستند" : "Document uploaded"
                : busy ? t("loading", locale) : ar ? "ارفع مستند الملكية" : "Upload ownership document"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={busy || docUploaded}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = ""; // let the same file be picked again after an error
                  void uploadOwnershipDoc(files);
                }}
              />
            </label>
            {/* On a phone, `capture` opens the camera straight away — and the camera hands
                the browser a JPEG, which sidesteps HEIC. On desktop it is a plain picker. */}
            {!docUploaded && (
              <label
                aria-disabled={busy}
                className={`btn btn-ghost ${busy ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
              >
                {ar ? "صوّر بالكاميرا" : "Take a photo"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    void uploadOwnershipDoc(files);
                  }}
                />
              </label>
            )}
            <button type="button" disabled={busy} onClick={() => setStep("photos")} className="btn btn-ghost">
              {docUploaded ? t("next", locale) : ar ? "كمّل وارفعه بعدين" : "Continue, upload it later"}
            </button>
          </div>
          {docNotice && (
            <p role="status" className="mt-4 max-w-xl border-s-2 border-accent-500 ps-3 text-[13px] leading-relaxed text-ink-900">
              {docNotice}
            </p>
          )}
          {reference && (
            <p className="mt-4 text-[12px] muted">
              {ar ? `بيانات الوحدة اتحفظت كمسودة (${reference}).` : `The unit details are saved as a draft (${reference}).`}
            </p>
          )}
        </div>
      )}

      {/* --- Step 3: photos -------------------------------------------- */}
      {step === "photos" && (
        <div className="card mt-5 p-6">
          <h2 className="text-[18px] font-bold text-ink-900">{t("step_photos", locale)}</h2>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed muted">
            {ar
              ? `مطلوب ${MIN_PHOTOS} صور على الأقل، متصورة من داخل تطبيق بروب شوب بموقع وتوقيت، أو بواسطة مصورنا. ده اللي بيمنع الصور المنقولة من مواقع تانية.`
              : `At least ${MIN_PHOTOS} photos are required, captured inside the PropShop app with GPS and a timestamp, or shot by our photographer. This is what stops photos being lifted from other portals.`}
          </p>

          {/* Two ways to get the photos, as two plain rows rather than two boxes. */}
          <dl className="mt-5 max-w-2xl border-y border-[var(--border)] text-[13px]">
            <div className="grid gap-1 border-b border-[var(--border)] py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="font-semibold text-ink-900">{ar ? "صوّر من التطبيق" : "Capture in the app"}</dt>
              <dd className="muted">
                {ar ? "افتح تطبيق بروب شوب على موبايلك وكمّل التصوير." : "Open the PropShop mobile app and finish the capture there."}
              </dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="font-semibold text-ink-900">{ar ? "احجز مصور" : "Book a photographer"}</dt>
              <dd className="muted">
                {fees.photo
                  ? ar
                    ? `تصوير احترافي ورسم مساحي وجولة 360 بـ ${formatPriceExact(fees.photo.amount, locale)}. `
                    : `A professional shoot, floor sketch and 360° tour for ${formatPriceExact(fees.photo.amount, locale)}. `
                  : ""}
                {listingId && (
                  <Link href={`/dashboard/listings/${listingId}/tour`} className="font-semibold text-brand-500 underline underline-offset-4">
                    {ar ? "احجز ميعاد" : "Book a time"}
                  </Link>
                )}
              </dd>
            </div>
          </dl>

          {/* Room checklist — the six the gate requires. */}
          <div className="mt-6">
            <h3 className="text-[13px] font-bold text-ink-900">
              {ar ? "الغرف المطلوبة" : "Required rooms"}
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {REQUIRED_ROOMS.map((room) => {
                const done = capturedRooms.includes(room);
                return (
                  <li
                    key={room}
                    className={`flex items-center justify-between gap-3 rounded-md border p-3 text-[13px] ${
                      done ? "border-ok-50 bg-ok-50" : "border-[var(--border)]"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium text-ink-900">
                      {done ? <Check size={14} className="text-ok-700" /> : <span className="h-3.5 w-3.5 rounded-full border border-ink-400" aria-hidden />}
                      {ROOM_LABELS[room][locale]}
                    </span>
                    {!done && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => simulateCapture(room)}
                        className="btn btn-ghost px-3 py-1.5 text-[12px]"
                      >
                        {ar ? "محاكاة تصوير" : "Simulate capture"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[12px] muted">
              {ar
                ? "«محاكاة تصوير» للتجربة بس. في النسخة الحقيقية الصور بتيجي من كاميرا التطبيق ببيانات موقع حقيقية."
                : "“Simulate capture” is for testing only. In production, photos come from the app camera with real GPS data."}
            </p>
          </div>

          {/* Cover picker. The results page shows one photo per unit, and the owner is
              the only person who knows which one actually sells theirs. Skipping this is
              fine: approveListing picks the best candidate automatically. */}
          {photos.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[13px] font-bold text-ink-900">
                {ar ? "صورة الغلاف" : "Cover photo"}
              </h3>
              <p className="mt-1 text-[12px] muted">
                {ar
                  ? "دي الصورة اللي هتظهر للمشتري في نتائج البحث. اختار أحسن صورة للوحدة."
                  : "This is the photo buyers see in search results. Pick the one that shows the unit best."}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {photos.map((ph) => {
                  const isCover = coverId === ph.id;
                  return (
                    <button
                      key={ph.id}
                      type="button"
                      onClick={() => chooseCover(ph.id)}
                      aria-pressed={isCover}
                      title={ph.room ? ROOM_LABELS[ph.room as Room]?.[locale] : undefined}
                      className={`media-frame aspect-[4/3] w-full ring-offset-1 ${
                        isCover ? "ring-2 ring-brand-500" : "ring-0"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ph.thumbKey ?? ph.fileKey}
                        alt={ph.room ? (ROOM_LABELS[ph.room as Room]?.[locale] ?? "") : ""}
                        className="h-full w-full object-cover"
                      />
                      {isCover && (
                        <span className="badge badge-accent absolute bottom-1 start-1 gap-1">
                          {ar ? "الغلاف" : "Cover"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => setStep("price")} className="btn btn-primary">
              {t("next", locale)}
            </button>
            {back("ownership")}
          </div>
        </div>
      )}

      {/* --- Step 4: publish gate -------------------------------------- */}
      {step === "price" && (
        <div className="card mt-5 p-6">
          <h2 className="text-[18px] font-bold text-ink-900">{stepLabels.price}</h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t("asking_price", locale)}>
              <input className="input tnum" inputMode="numeric" value={form.price} onChange={(e) => set("price", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={ar ? "عنوان الإعلان" : "Listing title"}>
              <input className="input" value={form.titleAr} onChange={(e) => set("titleAr", e.target.value)} />
            </Field>
          </div>
          <Field label={ar ? "وصف الوحدة" : "Description"} className="mt-4">
            <textarea className="textarea" rows={4} value={form.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} />
          </Field>

          {/*
            Listing is free. Say so here, at the last step before an owner commits — this
            is the moment they expect to be asked for money, and not being asked is the
            single most persuasive thing the product can do.
          */}
          <p className="mt-4 border-s-2 border-ok-700 ps-3 text-[13px] leading-relaxed text-ink-700">
            {ar
              ? "نشر الإعلان مجاني. مفيش رسم إعلان ولا اشتراك. بناخد رسم نجاح ثابت حسب نوع الوحدة بس لما تتباع، والمبلغ معلن على صفحة الرسوم."
              : "Publishing is free. No listing fee and no subscription. We charge a fixed success fee by unit type only when the unit sells, and the amount is on the pricing page."}
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() => listingId && revalidate(listingId)}
            className="btn btn-ghost mt-5 text-[13px]"
          >
            {ar ? "افحص الإعلان" : "Run the checks"}
          </button>

          {/* The gate, shown in full with the exact field to fix. */}
          {validation && (
            <div className="mt-5 space-y-2">
              {validation.blocks.length === 0 && validation.warnings.length === 0 && (
                <p className="rounded-md bg-ok-50 p-3 text-[13px] text-ok-700">
                  {ar ? "كل الفحوصات عدّت." : "All checks passed."}
                </p>
              )}
              {validation.blocks.length > 0 && (
                <p className="text-[13px] font-bold text-danger-700">{t("cannot_publish", locale)}</p>
              )}
              {validation.blocks.map((b) => (
                <div key={b.code} className="rounded-md border-s-2 border-danger-600 bg-danger-50 p-3 text-[13px] text-danger-700">
                  <span>{ar ? b.messageAr : b.messageEn}</span>
                </div>
              ))}
              {validation.warnings.length > 0 && (
                <p className="pt-2 text-[13px] font-bold text-ink-900">{t("warnings_title", locale)}</p>
              )}
              {validation.warnings.map((w) => (
                <div key={w.code} className="rounded-md border-s-2 border-ink-400 bg-ink-50 p-3 text-[13px] text-ink-900">
                  <span>{ar ? w.messageAr : w.messageEn}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || (validation !== null && !validation.canPublish)}
              onClick={submitForReview}
              className="btn btn-primary"
            >
              {busy ? t("loading", locale) : t("submit_for_review", locale)}
            </button>
            {back("photos")}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One labelled control. No margin of its own: inside the two-column grid the grid gap does
 * the spacing (a `mt-4 first:mt-0` here used to push the second column 16px below the
 * first on the opening row), and a Field outside the grid passes its own margin.
 */
function Field({
  id,
  label,
  hint,
  error,
  className = "",
  children,
}: {
  id?: string;
  label: string;
  hint?: string | null;
  error?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[12px] font-semibold text-danger-700">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-[12px] muted">{hint}</p>
      )}
    </div>
  );
}

function draftError(json: { error?: string; existingReference?: string }, ar: boolean): string {
  switch (json.error) {
    case "duplicate_unit":
      return ar
        ? `الوحدة دي معروضة بالفعل${json.existingReference ? ` (${json.existingReference})` : ""}. إعلان واحد لكل وحدة.`
        : `This unit is already listed${json.existingReference ? ` (${json.existingReference})` : ""}. One listing per unit.`;
    case "cap_reached":
      return ar ? "وصلت للحد الأقصى للإعلانات النشطة." : "You have reached the active listing limit.";
    case "blocked":
      return ar ? "الحساب موقوف." : "This account is suspended.";
    case "invalid_fields":
      return ar ? "فيه بيانات ناقصة أو غير صحيحة." : "Some fields are missing or invalid.";
    default:
      return ar ? "حصلت مشكلة ومقدرناش نحفظ. جرّب تاني." : "Something went wrong and nothing was saved. Please try again.";
  }
}
