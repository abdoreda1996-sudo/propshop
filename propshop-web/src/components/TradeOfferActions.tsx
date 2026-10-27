"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { TRADE_ERROR_COPY } from "@/lib/trade";

/** Accept / reject (recipient) or withdraw (proposer). Accepting asks once more — it reserves units on both sides. */
export default function TradeOfferActions({ id, role, locale }: { id: string; role: "proposer" | "recipient"; locale: Locale }) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "reject" | "withdraw") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/trade-offers/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setError(TRADE_ERROR_COPY[j.error]?.[locale] ?? (locale === "ar" ? "مقدرناش ننفذ ده. جرّب تاني." : "That did not work. Try again."));
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const spin = (k: string) => busy === k && <Loader2 size={13} className="animate-spin" />;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {role === "recipient" ? (
          confirming ? (
            <>
              <button type="button" className="btn btn-primary text-[13px]" disabled={!!busy} onClick={() => act("accept")}>
                {spin("accept")}
                {ar ? "أيوه، اقبل المقايضة" : "Yes, accept the trade"}
              </button>
              <button type="button" className="btn btn-ghost text-[13px]" onClick={() => setConfirming(false)}>
                {ar ? "رجوع" : "Back"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-primary text-[13px]" disabled={!!busy} onClick={() => setConfirming(true)}>
                {ar ? "اقبل" : "Accept"}
              </button>
              <button type="button" className="btn btn-ghost text-[13px]" disabled={!!busy} onClick={() => act("reject")}>
                {spin("reject")}
                {ar ? "ارفض" : "Decline"}
              </button>
            </>
          )
        ) : (
          <button type="button" className="btn btn-ghost text-[13px]" disabled={!!busy} onClick={() => act("withdraw")}>
            {spin("withdraw")}
            {ar ? "اسحب العرض" : "Withdraw"}
          </button>
        )}
      </div>
      {confirming && (
        <p className="mt-2 text-[12px] muted">
          {ar
            ? "القبول بيحجز كل الوحدات في العرض، وبيقفل أي عروض تانية عليها، وبيظهر اسم ورقم كل طرف للتاني."
            : "Accepting reserves every unit in the offer, closes other offers on them, and shows each side the other's name and number."}
        </p>
      )}
      {error && <p className="mt-2 text-[12.5px] font-semibold text-danger-700">{error}</p>}
    </div>
  );
}
