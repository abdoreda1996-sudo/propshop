"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { Locale, t } from "@/lib/i18n";
import { prepareImage, imageReadMessage } from "@/lib/imageUpload";

type Step = { type: string; label: string; done: boolean; rejectReason?: string | null };

/**
 * KYC level 1 upload. The app captures with its own camera (liveness needs a camera we
 * control); the web path takes a picked photo, shrinks it in the browser (a raw phone
 * photo is over the 4.5 MB request cap) and sends it like the app does.
 */
export default function VerifyIdentityForm({
  locale,
  fullName,
  steps,
  claudeConfigured,
}: {
  locale: Locale;
  fullName: string;
  steps: Step[];
  claudeConfigured: boolean;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>(steps.filter((s) => s.done).map((s) => s.type));
  const [nationalId, setNationalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  async function upload(type: string, file: File | undefined) {
    if (!file) return;
    setBusy(type);
    setError(null);
    try {
      let image;
      try {
        image = await prepareImage(file);
      } catch (err) {
        setError(
          imageReadMessage(err, ar, {
            ar: "مش قادرين نقرأ الصورة دي. جرّب صورة JPG أو PNG، أو صوّر من الكاميرا مباشرة.",
            en: "We couldn't read that image. Try a JPG or PNG, or take the photo with the camera.",
          }),
        );
        return;
      }
      const res = await fetch("/api/kyc/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, nationalId, images: [image] }), // the server picks the storage key
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(uploadError(res.status, json.error));
        return;
      }
      if (json.nameMismatch) {
        setError(
          ar
            ? "الاسم على البطاقة مش مطابق لاسم الحساب. لو الاسم في حسابك غلط، عدّله من الإعدادات."
            : "The name on the ID doesn't match your account name. If your account name is wrong, change it in settings.",
        );
        return;
      }
      // Stored but not machine-readable: a reviewer reads it by hand. Not an error — the
      // upload counts — but retaking a sharper photo is the faster way through.
      if (json.manualReview) setManual(true);
      setDone((d) => (d.includes(type) ? d : [...d, type]));
      router.refresh();
    } catch {
      setError(ar ? "الرفع فشل. اتأكد من الإنترنت وجرّب تاني." : "Upload failed. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function uploadError(status: number, code: unknown): string {
    if (code === "national_id_required") return ar ? "اكتب رقم البطاقة الأول." : "Enter your ID number first.";
    if (status === 413 || code === "too_large") return ar ? "الصورة كبيرة جداً. جرّب صورة تانية." : "That image is too large. Try another photo.";
    if (code === "not_an_image" || code === "type_not_allowed")
      return ar ? "الملف ده مش صورة نقدر نقراها. اختار JPG أو PNG." : "That file isn't an image we can read. Pick a JPG or PNG.";
    if (code === "extraction_failed")
      return ar
        ? "مقدرناش نقرأ البطاقة من الصورة. صوّرها تاني في مكان منوّر ومن غير انعكاس."
        : "We couldn't read the ID from that photo. Retake it in good light, without glare.";
    return ar ? "الرفع فشل. جرّب تاني." : "Upload failed. Please try again.";
  }

  const allDone = steps.every((s) => done.includes(s.type));
  const locked = !!busy || nationalId.length !== 14;

  return (
    <div className="mt-6 max-w-xl">
      <div>
        <label className="label" htmlFor="v-name">
          {t("full_name", locale)}
        </label>
        <input id="v-name" className="input" value={fullName} readOnly />
        <p className="mt-1.5 text-[12px] muted">
          {ar
            ? "لازم يطابق الاسم في البطاقة بالظبط. لو مختلف، عدّله من الإعدادات قبل ما ترفع."
            : "This must match the name on your ID exactly. If it differs, change it in settings before uploading."}
        </p>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="v-nid">
          {ar ? "رقم البطاقة" : "National ID number"}
        </label>
        <input
          id="v-nid"
          className="input tnum"
          inputMode="numeric"
          dir="ltr"
          maxLength={14}
          value={nationalId}
          onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
          placeholder={ar ? "14 رقم" : "14 digits"}
        />
        {nationalId.length !== 14 && (
          <p className="mt-1.5 text-[12px] muted">
            {ar ? "اكتب رقم البطاقة (14 رقم) عشان تقدر ترفع الصور." : "Enter your 14-digit ID number to enable the uploads."}
          </p>
        )}
      </div>

      <ul className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {steps.map((s) => {
          const isDone = done.includes(s.type);
          return (
            <li
              key={s.type}
              className="flex items-center justify-between gap-3 py-3"
            >
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2.5 text-[14px] font-medium text-ink-900">
                  {isDone && <Check size={15} className="text-ok-700" aria-label={ar ? "اترفعت" : "Uploaded"} />}
                  {s.label}
                </span>
                {!isDone && s.rejectReason && (
                  <span className="text-[12px] text-danger-700">
                    {ar ? "اترفضت: " : "Rejected: "}
                    {s.rejectReason}
                  </span>
                )}
              </span>
              {!isDone && (
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {/* Camera: on a phone `capture` opens it directly (and hands over a JPEG,
                      never HEIC). The selfie is camera-only, as in the app. */}
                  <PickButton
                    disabled={locked}
                    busy={busy === s.type}
                    capture={s.type === "selfie" ? "user" : "environment"}
                    label={ar ? "صوّر" : "Camera"}
                    onFile={(f) => void upload(s.type, f)}
                    loading={t("loading", locale)}
                  />
                  {s.type !== "selfie" && (
                    <PickButton
                      disabled={locked}
                      busy={false}
                      label={ar ? "اختار صورة" : "Choose photo"}
                      onFile={(f) => void upload(s.type, f)}
                      loading={t("loading", locale)}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-3 text-[13px] text-danger-700">{error}</p>}

      {manual && !error && (
        <p className="mt-3 border-s-2 border-accent-500 ps-3 text-[13px] text-ink-700">
          {ar
            ? "استلمنا الصورة بس مقدرناش نقرا البطاقة آلياً، فهتتراجع يدوياً. لو عايز توثيق أسرع، صوّرها تاني في مكان منوّر ومن غير انعكاس."
            : "We have the photo but couldn't read the card automatically, so it will be reviewed by hand. For a faster check, retake it in good light without glare."}
        </p>
      )}

      {allDone && (
        <p className="mt-5 border-s-2 border-ok-700 ps-3 text-[13px] font-semibold text-ok-700">
          {ar
            ? "استلمنا مستنداتك. فريق التوثيق هيراجعها خلال يوم عمل."
            : "We have your documents. The verification team reviews them within one business day."}
        </p>
      )}

      <p className="mt-5 text-[12px] leading-relaxed muted">
        {ar
          ? "صوّر البطاقة في مكان منوّر والكلام واضح. تطبيق بروب شوب بيصوّر السيلفي من الكاميرا مباشرة عشان نتأكد إنه حي."
          : "Photograph the card in good light with the text sharp. The PropShop app takes the selfie straight from the camera so it can be checked for liveness."}
        {!claudeConfigured &&
          (ar
            ? " القراءة الآلية للبطاقة متوقفة حالياً، فالمراجعة هتكون يدوية."
            : " Automatic ID reading is off at the moment, so review will be done by hand.")}
      </p>
    </div>
  );
}

/** One file picker styled as a button. `capture` asks a phone for its camera. */
function PickButton({
  disabled,
  busy,
  capture,
  label,
  loading,
  onFile,
}: {
  disabled: boolean;
  busy: boolean;
  capture?: "user" | "environment";
  label: string;
  loading: string;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <label
      aria-disabled={disabled}
      className={`btn btn-ghost px-3 py-1.5 text-[12px] ${disabled ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
    >
      {busy ? loading : label}
      <input
        type="file"
        accept="image/*"
        {...(capture ? { capture } : {})}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // let the same file be picked again after an error
          onFile(file);
        }}
      />
    </label>
  );
}
