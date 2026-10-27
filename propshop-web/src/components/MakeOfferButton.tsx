"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import ModalPortal from "./ModalPortal";
import { formatPriceExact } from "@/lib/format";

/**
 * MAKE AN OFFER (Section 8) — the primary action on every listing.
 *
 * ONE number, and nothing else required. A buyer arrives knowing what they will pay, and
 * every field between them and sending it costs offers. Expiry and terms are optional and
 * collapsed by default (progressive disclosure, Section 28.4).
 *
 * The free-text "message to the owner" box was REMOVED (owner, 2026-09-23), alongside the
 * ask-the-owner thread on the listing page. An offer is now a number and its terms —
 * which is what the other side actually has to accept or counter. The API still accepts a
 * `message`, so nothing server-side had to change and existing offers keep theirs.
 */
export default function MakeOfferButton({
  listingId,
  price,
  currency,
  locale,
  signedIn,
  disabled,
}: {
  listingId: string;
  price: number;
  currency: string;
  locale: Locale;
  signedIn: boolean;
  /** True when the listing is reserved or sold — the button explains instead of lying. */
  disabled?: boolean;
}) {
  const router = useRouter();
  // Signed-out visitors log in and come straight back to THIS unit, not their dashboard.
  const pathname = usePathname();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const [amount, setAmount] = useState("");
  const [expiryDays, setExpiryDays] = useState("7");
  const [paymentType, setPaymentType] = useState("cash");

  const numeric = Number(amount.replace(/\D/g, ""));
  const aboveAsk = numeric > price;
  const gap = numeric > 0 ? Math.round(((price - numeric) / price) * 100) : 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const expiresAt =
        expiryDays === "none"
          ? null
          : new Date(Date.now() + Number(expiryDays) * 86400_000).toISOString();

      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, amount: numeric, expiresAt, paymentType }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          (ar ? json.messageAr : json.messageEn) ??
            (ar ? "مش قادرين نبعت العرض دلوقتي." : "We could not send that offer."),
        );
        return;
      }
      setDone(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <button type="button" disabled className="btn btn-primary w-full opacity-60">
        {ar ? "الوحدة محجوزة" : "Property reserved"}
      </button>
    );
  }

  if (!signedIn) {
    return (
      <a href={`/login?next=${encodeURIComponent(pathname)}`} className="btn btn-primary w-full">
        {ar ? "سجّل دخول عشان تقدّم عرض" : "Log in to make an offer"}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary w-full">
        {ar ? "قدّم عرضك" : "Make an offer"}
      </button>

      {open && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-lg bg-white p-5 sm:rounded-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <div className="py-2">
                <h3 className="text-[18px] font-bold text-ink-900">
                  {ar ? "عرضك وصل للمالك" : "Your offer is with the owner"}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed muted">
                  {ar
                    ? "هتلاقي رد المالك في صفحة العروض. ممكن يقبل، يرفض، أو يبعتلك سعر تاني."
                    : "You will find the owner's reply under Offers. They can accept, decline, or counter with another price."}
                </p>
                <a href="/dashboard/offers" className="btn btn-primary mt-5">
                  {ar ? "شوف عروضي" : "View my offers"}
                </a>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[18px] font-bold text-ink-900">
                      {ar ? "قدّم عرضك" : "Make an offer"}
                    </h3>
                    <p className="mt-1 text-[13px] muted">
                      {ar ? "السعر المطلوب" : "Asking price"}{" "}
                      <span className="tnum font-bold text-ink-900">
                        {formatPriceExact(price, locale, currency)}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={ar ? "إغلاق" : "Close"}
                    className="p-1 text-ink-400 hover:text-ink-900"
                  >
                    <X size={20} />
                  </button>
                </div>

                <label htmlFor="offer-amount" className="label mt-5">
                  {ar ? "عرضك بالجنيه" : "Your offer (EGP)"}
                </label>
                <input
                  id="offer-amount"
                  autoFocus
                  inputMode="numeric"
                  value={amount ? Number(amount.replace(/\D/g, "")).toLocaleString("en-US") : ""}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={ar ? "مثلاً 12,500,000" : "e.g. 12,500,000"}
                  aria-invalid={aboveAsk || undefined}
                  className="input tnum h-[56px] text-[22px] font-bold"
                />

                {/* Live feedback beats a rejection after submitting. */}
                {numeric > 0 && !aboveAsk && (
                  <p className="mt-2 text-[13px] muted">
                    {gap > 0
                      ? ar
                        ? `أقل من السعر المطلوب بـ ${gap}%`
                        : `${gap}% below the asking price`
                      : ar
                        ? "بنفس السعر المطلوب"
                        : "At the asking price"}
                  </p>
                )}
                {aboveAsk && (
                  <p className="mt-2 text-[13px] font-semibold text-danger-700">
                    {ar ? "ده أعلى من السعر المطلوب. راجع الرقم." : "That is above the asking price. Check the figure."}
                  </p>
                )}

                {/* Progressive disclosure: most buyers never open this. */}
                <button
                  type="button"
                  onClick={() => setShowTerms((v) => !v)}
                  className="mt-3 text-[13px] font-semibold text-brand-500 underline underline-offset-4"
                >
                  {showTerms
                    ? ar
                      ? "إخفاء التفاصيل"
                      : "Hide details"
                    : ar
                      ? "تفاصيل إضافية (مدة العرض، طريقة الدفع)"
                      : "More details (offer validity, payment)"}
                </button>

                {showTerms && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="offer-expiry" className="label">{ar ? "العرض ساري لمدة" : "Offer valid for"}</label>
                      <select
                        id="offer-expiry"
                        className="select"
                        value={expiryDays}
                        onChange={(e) => setExpiryDays(e.target.value)}
                      >
                        <option value="3">{ar ? "3 أيام" : "3 days"}</option>
                        <option value="7">{ar ? "7 أيام" : "7 days"}</option>
                        <option value="14">{ar ? "14 يوم" : "14 days"}</option>
                        <option value="none">{ar ? "من غير مدة" : "No expiry"}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="offer-payment" className="label">{ar ? "طريقة الدفع" : "Payment"}</label>
                      <select
                        id="offer-payment"
                        className="select"
                        value={paymentType}
                        onChange={(e) => setPaymentType(e.target.value)}
                      >
                        <option value="cash">{ar ? "كاش" : "Cash"}</option>
                        <option value="installments">{ar ? "تقسيط" : "Instalments"}</option>
                      </select>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="mt-4 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  disabled={busy || numeric <= 0 || aboveAsk}
                  onClick={submit}
                  className="btn btn-primary mt-5 w-full"
                >
                  {busy && <Loader2 size={16} className="animate-spin" />}
                  {ar ? "ابعت العرض" : "Send offer"}
                </button>

                <p className="mt-3 text-[12px] leading-relaxed muted">
                  {ar
                    ? "العرض مش ملزم قانوناً. المالك يقدر يقبل أو يرفض أو يبعتلك سعر تاني."
                    : "An offer is not legally binding. The owner can accept, decline, or counter."}
                </p>
              </>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
