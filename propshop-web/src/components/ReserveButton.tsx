"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Locale } from "@/lib/i18n";
import ModalPortal from "./ModalPortal";
import { formatPriceExact } from "@/lib/format";
import { RESERVATION_HOLD_HOURS } from "@/lib/deals";

/**
 * RESERVE (Section 9).
 *
 * The sheet states the amount, the refund rule, the hold length and what happens next
 * BEFORE the button, because those are the four things a buyer is owed before parting
 * with money — and because burying them is the behaviour this marketplace exists to
 * replace.
 *
 * No funds move in this build. The copy says exactly that rather than simulating a
 * successful payment, which would be a lie the user could not detect.
 */
const DEPOSIT_FRACTION = 0.01;
const DEPOSIT_MIN = 25_000;
const DEPOSIT_MAX = 250_000;

export default function ReserveButton({
  dealReference,
  price,
  locale,
}: {
  dealReference: string;
  price: number;
  locale: Locale;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = Math.min(Math.max(Math.round(price * DEPOSIT_FRACTION), DEPOSIT_MIN), DEPOSIT_MAX);

  async function reserve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealReference}/reserve`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((ar ? json.messageAr : json.messageEn) ?? (ar ? "مش قادرين نكمل." : "That did not work."));
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary w-full">
        {ar ? "احجز الوحدة" : "Reserve the property"}
      </button>

      {open && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-lg bg-white p-5 sm:rounded-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[18px] font-bold text-ink-900">{ar ? "حجز الوحدة" : "Reserve the property"}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={ar ? "إغلاق" : "Close"}
                className="p-1 text-ink-400 hover:text-ink-900"
              >
                <X size={20} />
              </button>
            </div>

            {/* The four facts, before the button. */}
            <dl className="facts mt-4 text-[14px]">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="muted">{ar ? "مقدم الحجز" : "Reservation deposit"}</dt>
                <dd className="tnum text-[17px] font-bold text-ink-900">
                  {formatPriceExact(deposit, locale)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="muted">{ar ? "مدة الحجز" : "Hold period"}</dt>
                <dd className="tnum font-bold text-ink-900">
                  {RESERVATION_HOLD_HOURS} {ar ? "ساعة" : "hours"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="muted">{ar ? "قابل للاسترداد؟" : "Refundable?"}</dt>
                <dd className="font-bold text-ok-700">
                  {ar ? "أيوه، لو المستندات مامرّتش" : "Yes, if documents fail"}
                </dd>
              </div>
            </dl>

            <ul className="mt-4 list-disc space-y-1.5 ps-5 text-[13px] leading-relaxed text-ink-700">
              <li>
                {ar
                  ? "الوحدة بتتقفل باسمك ومابتستقبلش عروض تانية طول مدة الحجز."
                  : "The unit is held for you and accepts no other offers during the hold."}
              </li>
              <li>
                {ar
                  ? "لو المستندات مامرّتش في المراجعة، المقدم بيترد بالكامل."
                  : "If the documents fail review, the deposit is refunded in full."}
              </li>
              <li>
                {ar
                  ? "لو رجعت في كلامك بعد ما المستندات تعدي، المقدم مابيترجعش."
                  : "If you withdraw after documents pass, the deposit is not returned."}
              </li>
            </ul>

            <p className="mt-4 border-t border-[var(--border)] pt-3 text-[12px] leading-relaxed muted">
              {ar
                ? "مهم: الربط بجهة الدفع المرخّصة لسه تحت التنفيذ. الزرار ده بيسجّل نيّة الحجز ويقفل الوحدة، ومش بيسحب أي فلوس دلوقتي."
                : "Important: the licensed payment provider is not connected yet. This records your reservation and holds the unit. It does not take any money today."}
            </p>

            {error && (
              <p className="mt-4 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">{error}</p>
            )}

            <button type="button" disabled={busy} onClick={reserve} className="btn btn-primary mt-5 w-full">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {ar ? "أكّد الحجز" : "Confirm reservation"}
            </button>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
