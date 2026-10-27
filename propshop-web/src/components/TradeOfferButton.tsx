"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { X, Loader2, Check } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { formatPriceExact } from "@/lib/format";
import { MAX_TRADE_UNITS, TRADE_ERROR_COPY, TradeCash } from "@/lib/trade";
import ModalPortal from "./ModalPortal";

export type MyTradeUnit = {
  id: string;
  reference: string;
  title: string;
  price: number;
  currency: string;
  thumb: string | null;
  /** Fits the target owner's stated requirements on its own. */
  matches: boolean;
};

/**
 * "Offer a trade" — pick 1–3 of your own verified units, optionally add a cash difference
 * either way, send. No message box: like sale offers, the terms ARE the message, and a
 * free-text field is where phone numbers and brokers creep back in.
 */
export default function TradeOfferButton({
  targetListingId,
  targetPrice,
  currency,
  cashPref,
  myUnits,
  signedIn,
  locale,
}: {
  targetListingId: string;
  targetPrice: number;
  currency: string;
  cashPref: TradeCash;
  myUnits: MyTradeUnit[];
  signedIn: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  // The cash direction the owner allows decides what the form offers.
  const defaultPayer = cashPref === "i_pay" ? "recipient" : "proposer";
  const [cash, setCash] = useState("");
  const [payer, setPayer] = useState<"proposer" | "recipient">(defaultPayer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <a href={`/login?next=${encodeURIComponent(pathname)}`} className="btn btn-ghost w-full">
        {ar ? "سجّل دخول عشان تعرض مقايضة" : "Log in to offer a trade"}
      </a>
    );
  }

  const pickedUnits = myUnits.filter((u) => picked.includes(u.id));
  const offeredValue = pickedUnits.reduce((s, u) => s + u.price, 0);
  const cashNum = Number(cash.replace(/,/g, "")) || 0;
  const gap = targetPrice - offeredValue; // > 0: the proposer's units are worth less
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_TRADE_UNITS ? p : [...p, id]));

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trade-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetListingId, unitListingIds: picked, cashAmount: cashNum, cashPayer: cashNum > 0 ? payer : null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(TRADE_ERROR_COPY[j.error]?.[locale] ?? j.error ?? "error");
        return;
      }
      setSent(j.reference);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        {ar ? "اعرض مقايضة" : "Offer a trade"}
      </button>

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => !busy && setOpen(false)}
          >
            <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg sm:p-6" onClick={(e) => e.stopPropagation()}>
              {sent ? (
                <div className="py-2">
                  <h3 className="text-[17px] font-bold text-ink-900">{ar ? "عرض المقايضة اتبعت" : "Trade offer sent"}</h3>
                  <p className="tnum mt-1 text-[13px] muted">{sent}</p>
                  <p className="mt-2 text-[14px] muted">
                    {ar ? "المالك هيقبل أو يرفض. تابع العرض من «المقايضة» في حسابك." : "The owner will accept or decline. Track it under Trades in your account."}
                  </p>
                  <button type="button" onClick={() => setOpen(false)} className="btn btn-primary mt-5">
                    {ar ? "تمام" : "Done"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[17px] font-bold text-ink-900">{ar ? "اعرض مقايضة" : "Offer a trade"}</h3>
                      <p className="mt-1 text-[13px] muted">
                        {ar ? `اختار لحد ${MAX_TRADE_UNITS} وحدات من وحداتك الموثّقة.` : `Choose up to ${MAX_TRADE_UNITS} of your verified units.`}
                      </p>
                    </div>
                    <button type="button" onClick={() => setOpen(false)} aria-label={ar ? "إغلاق" : "Close"} className="p-1 text-ink-400 hover:text-ink-900">
                      <X size={20} />
                    </button>
                  </div>

                  {myUnits.length === 0 ? (
                    <div className="mt-5 border-t border-[var(--border)] pt-4 text-[14px] text-ink-900">
                      {ar
                        ? "مفيش عندك وحدات منشورة وموثّقة تقدر تعرضها. اعرض وحدتك الأول، وبعد التوثيق تقدر تقايض بيها."
                        : "You have no live, verified units to offer. List your unit first; once it is verified you can trade with it."}
                      <a href="/list" className="btn btn-primary mt-3">{ar ? "اعرض وحدتك" : "List your unit"}</a>
                    </div>
                  ) : (
                    <>
                      <ul className="mt-4 space-y-2">
                        {myUnits.map((u) => {
                          const on = picked.includes(u.id);
                          return (
                            <li key={u.id}>
                              <button
                                type="button"
                                onClick={() => toggle(u.id)}
                                aria-pressed={on}
                                className={`flex w-full items-center gap-3 rounded-md border p-2 text-start transition ${on ? "border-accent-500 bg-accent-50" : "border-[var(--border)] hover:border-navy-300"}`}
                              >
                                <span className="media-frame h-14 w-20 shrink-0 rounded">
                                  {u.thumb && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={u.thumb} alt="" className="h-full w-full object-cover" />
                                  )}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13.5px] font-semibold text-ink-900">{u.title}</span>
                                  <span className="tnum block text-[12px] muted">
                                    {u.reference} · {formatPriceExact(u.price, locale, u.currency)}
                                  </span>
                                  {u.matches && (
                                    <span className="mt-0.5 block text-[12px] font-semibold text-ok-700">
                                      {ar ? "بتناسب طلب المالك" : "Fits what the owner wants"}
                                    </span>
                                  )}
                                </span>
                                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${on ? "border-accent-500 bg-accent-500" : "border-ink-400"}`}>
                                  {on && <Check size={14} className="text-white" />}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>

                      {/* Cash difference */}
                      <div className="mt-5 border-t border-[var(--border)] pt-4">
                        <div className="text-[13px] font-bold text-ink-900">{ar ? "فرق الفلوس (اختياري)" : "Cash difference (optional)"}</div>
                        {picked.length > 0 && (
                          <p className="tnum mt-1 text-[12px] muted">
                            {ar ? "قيمة وحداتك" : "Your units"} {formatPriceExact(offeredValue, locale, currency)} · {ar ? "الوحدة المطلوبة" : "This unit"}{" "}
                            {formatPriceExact(targetPrice, locale, currency)}
                          </p>
                        )}
                        {/* Say WHICH way the gap runs — a bare number let someone offer a
                            more valuable unit and pay cash on top. */}
                        {picked.length > 0 && gap !== 0 && (
                          <p className={`tnum mt-1 text-[12.5px] font-semibold ${gap > 0 ? "text-ink-900" : "text-ok-700"}`}>
                            {gap > 0
                              ? ar
                                ? `وحداتك أقل بـ ${formatPriceExact(gap, locale, currency)}، وعادةً إنت اللي بتدفع الفرق.`
                                : `Your units are ${formatPriceExact(gap, locale, currency)} less, so usually you pay the difference.`
                              : ar
                                ? `وحداتك أعلى بـ ${formatPriceExact(-gap, locale, currency)}، وعادةً المالك هو اللي بيدفع الفرق.`
                                : `Your units are worth ${formatPriceExact(-gap, locale, currency)} more, so usually the owner pays the difference.`}
                          </p>
                        )}
                        {picked.length > 0 && gap < 0 && cashNum > 0 && payer === "proposer" && (
                          <p className="mt-1 text-[12px] font-semibold text-danger-700">
                            {ar ? "انتبه: وحداتك أغلى، وإنت كمان هتدفع فلوس فوقها." : "Heads up: your units are worth more, and you are also paying cash on top."}
                          </p>
                        )}
                        {cashPref === "none" ? (
                          <p className="mt-2 text-[12.5px] muted">{ar ? "المالك عايز مقايضة من غير فلوس." : "The owner wants a straight swap, no cash."}</p>
                        ) : (
                          <>
                            <label htmlFor="trade-cash" className="label mt-3">
                              {ar ? "المبلغ بالجنيه" : "Amount in EGP"}
                            </label>
                            <input
                              id="trade-cash"
                              className="input tnum w-full"
                              inputMode="numeric"
                              placeholder={ar ? "سيبه فاضي لو مفيش فرق" : "Leave empty for none"}
                              value={cash}
                              onChange={(e) => setCash(e.target.value.replace(/[^\d,]/g, ""))}
                            />
                            {cashNum > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2 text-[13px]">
                                {cashPref !== "i_pay" && (
                                  <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={payer === "proposer"} onChange={() => setPayer("proposer")} />
                                    {ar ? "أنا هدفع الفرق" : "I pay the difference"}
                                  </label>
                                )}
                                {cashPref !== "i_receive" && (
                                  <label className="flex items-center gap-1.5">
                                    <input type="radio" checked={payer === "recipient"} onChange={() => setPayer("recipient")} />
                                    {ar ? "المالك يدفعلي الفرق" : "The owner pays me"}
                                  </label>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {error && <p className="mt-3 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">{error}</p>}

                      <button type="button" disabled={busy || picked.length === 0} onClick={send} className="btn btn-primary mt-4 w-full">
                        {busy && <Loader2 size={15} className="animate-spin" />}
                        {ar ? "ابعت عرض المقايضة" : "Send trade offer"}
                      </button>
                      <p className="mt-2 text-[12px] muted">
                        {ar ? "العرض صالح 14 يوم. لو اتقبل، الوحدات بتتحجز والفريق بيتابع معاكم الأوراق." : "Valid for 14 days. If accepted, the units are reserved and our team follows up on the paperwork."}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
