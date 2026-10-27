"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Locale, t } from "@/lib/i18n";

/**
 * Buyer-side reporting (Section 5): "I was contacted by a broker" in one tap, feeding
 * the strike system. Kept deliberately prominent rather than hidden in a menu.
 */
const REASONS = [
  { key: "contacted_by_broker", ar: "اتصل بيا سمسار مش المالك", en: "A broker contacted me, not the owner" },
  { key: "fake_photos", ar: "الصور مش للوحدة دي", en: "The photos are not of this unit" },
  { key: "duplicate", ar: "الوحدة دي معروضة أكتر من مرة", en: "This unit is listed more than once" },
  { key: "wrong_price", ar: "السعر الحقيقي مختلف", en: "The real price is different" },
  { key: "unreachable", ar: "مش بيرد", en: "Unreachable" },
  { key: "other", ar: "سبب آخر", en: "Something else" },
];

export default function ReportListingButton({
  listingId,
  locale,
  signedIn,
}: {
  listingId: string;
  locale: Locale;
  signedIn: boolean;
}) {
  const ar = locale === "ar";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].key);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, reason, detail }),
      });
      if (res.ok) setDone(true);
      else setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="mt-5 inline-block text-[13px] font-semibold text-ink-500 underline underline-offset-4 hover:text-ink-900"
      >
        {t("report_broker", locale)}
      </a>
    );
  }

  if (done) {
    return (
      <p className="mt-5 text-[13px] font-semibold text-ok-700">
        {ar
          ? "وصلنا بلاغك. فريق الجودة هيراجعه، والحساب بيتحط عليه علامة لو البلاغ صح."
          : "Your report was received. Our QA team reviews it, and the account is struck if it is upheld."}
      </p>
    );
  }

  return (
    <div className="mt-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[13px] font-semibold text-ink-500 underline underline-offset-4 transition hover:text-ink-900"
        >
          {t("report_broker", locale)}
        </button>
      ) : (
        <form onSubmit={submit} className="max-w-[34rem] rounded-md border border-[var(--border)] p-4">
          <h3 className="text-[15px] font-bold text-ink-900">{t("report_listing", locale)}</h3>
          <fieldset className="mt-3 space-y-2">
            <legend className="sr-only">{ar ? "السبب" : "Reason"}</legend>
            {REASONS.map((r) => (
              <label key={r.key} className="flex items-start gap-2.5 text-[14px] text-ink-900">
                <input
                  type="radio"
                  name="reason"
                  value={r.key}
                  checked={reason === r.key}
                  onChange={() => setReason(r.key)}
                  className="mt-1"
                />
                {ar ? r.ar : r.en}
              </label>
            ))}
          </fieldset>
          <label htmlFor="report-detail" className="label mt-3">
            {ar ? "تفاصيل إضافية (اختياري)" : "More detail (optional)"}
          </label>
          <textarea
            id="report-detail"
            className="textarea"
            rows={2}
            placeholder={ar ? "مثلاً: اتصل بيا من رقم ..." : "For example: they called me from ..."}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          {error && (
            <p className="mt-2 text-[13px] font-semibold text-danger-700">
              {ar ? "البلاغ ماتبعتش. جرّب تاني." : "The report did not go through. Try again."}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? t("loading", locale) : t("submit", locale)}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              {t("cancel", locale)}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
