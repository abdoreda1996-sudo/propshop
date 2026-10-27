"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { formatPriceExact } from "@/lib/format";
import { identityLabel, PublicIdentity } from "@/lib/identity";

export type ChainStep = {
  id: string;
  direction: "buyer" | "seller";
  amount: number;
  message: string | null;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

export type Chain = {
  listing: {
    id: string;
    reference: string;
    titleAr: string | null;
    titleEn: string | null;
    price: number;
    currency: string;
    status: string;
  };
  role: "buyer" | "seller";
  status: string;
  awaiting: "buyer" | "seller" | null;
  latestAmount: number;
  counterparty: PublicIdentity;
  steps: ChainStep[];
};

const STATUS_COPY: Record<string, { ar: string; en: string; tone: string }> = {
  pending: { ar: "مستني رد", en: "Awaiting reply", tone: "badge-neutral" },
  accepted: { ar: "اتقبل", en: "Accepted", tone: "badge-below" },
  rejected: { ar: "اترفض", en: "Declined", tone: "badge-above" },
  withdrawn: { ar: "اتسحب", en: "Withdrawn", tone: "badge-neutral" },
  countered: { ar: "فيه رد بسعر تاني", en: "Countered", tone: "badge-neutral" },
  expired: { ar: "انتهت مدته", en: "Expired", tone: "badge-neutral" },
};

/**
 * One negotiation, with its history folded inside.
 *
 * The screen answers "whose move is it" before anything else — a seller with six offers
 * needs to find the two waiting on them, not read twelve rows of history.
 */
export default function OfferChainCard({ chain, locale }: { chain: Chain; locale: Locale }) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countering, setCountering] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const live = chain.steps.find((s) => s.status === "pending") ?? null;
  const myMove = chain.awaiting === chain.role;
  const title = (ar ? chain.listing.titleAr : chain.listing.titleEn) || chain.listing.reference;
  const status = STATUS_COPY[chain.status] ?? STATUS_COPY.pending;

  async function act(action: "accept" | "reject" | "withdraw" | "counter", amount?: number) {
    if (!live) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/offers/${live.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((ar ? json.messageAr : json.messageEn) ?? (ar ? "مش قادرين ننفذ ده." : "That did not work."));
        return;
      }
      if (action === "accept" && json.dealReference) {
        router.push(`/deal/${json.dealReference}`);
        return;
      }
      setCountering(false);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={`/listing/${chain.listing.reference}`} className="text-[15px] font-bold text-ink-900 hover:underline">
            {title}
          </a>
          <p className="mt-1 text-[13px] muted">
            {identityLabel(chain.counterparty, locale)}
            {" · "}
            {ar ? "السعر المطلوب" : "Asking"}{" "}
            <span className="tnum">{formatPriceExact(chain.listing.price, locale, chain.listing.currency)}</span>
          </p>
        </div>
        <span className={`badge ${status.tone}`}>{ar ? status.ar : status.en}</span>
      </div>

      {/* The number that matters, and whose move it is. */}
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tnum text-[24px] font-bold text-ink-900">
          {formatPriceExact(chain.latestAmount, locale, chain.listing.currency)}
        </span>
        {chain.steps.length > 1 && (
          <span className="tnum text-[12px] muted">
            {ar ? `${chain.steps.length} خطوات تفاوض` : `${chain.steps.length} rounds`}
          </span>
        )}
        {live?.expiresAt && (
          <span className="tnum text-[12px] muted">
            {ar ? "ينتهي" : "expires"}{" "}
            {new Date(live.expiresAt).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB")}
          </span>
        )}
      </div>

      {live?.message && (
        <p className="mt-3 border-s-2 border-[var(--border)] ps-3 text-[13px] leading-relaxed text-ink-700">{live.message}</p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">{error}</p>
      )}

      {/* Actions only when it is genuinely this user's move. */}
      {live && myMove && !countering && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act("accept")}
            className="btn btn-primary flex-1 sm:flex-none"
          >
            {busy === "accept" && <Loader2 size={15} className="animate-spin" />}
            {ar ? "اقبل" : "Accept"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => setCountering(true)} className="btn btn-ghost">
            {ar ? "اعرض سعر تاني" : "Counter"}
          </button>
          <button type="button" disabled={!!busy} onClick={() => act("reject")} className="btn btn-ghost">
            {ar ? "ارفض" : "Decline"}
          </button>
        </div>
      )}

      {live && !myMove && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-[13px] muted">
            {ar ? "مستنيين رد الطرف التاني." : "Waiting for the other side to reply."}
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act("withdraw")}
            className="text-[13px] font-semibold text-brand-500 underline underline-offset-4"
          >
            {ar ? "اسحب العرض" : "Withdraw"}
          </button>
        </div>
      )}

      {countering && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <label className="label">{ar ? "السعر اللي تقبله" : "Your counter"}</label>
          <input
            autoFocus
            inputMode="numeric"
            className="input tnum text-[18px] font-bold"
            value={counterAmount ? Number(counterAmount.replace(/\D/g, "")).toLocaleString("en-US") : ""}
            onChange={(e) => setCounterAmount(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={!!busy || !counterAmount}
              onClick={() => act("counter", Number(counterAmount.replace(/\D/g, "")))}
              className="btn btn-primary"
            >
              {busy === "counter" && <Loader2 size={15} className="animate-spin" />}
              {ar ? "ابعت" : "Send"}
            </button>
            <button type="button" onClick={() => setCountering(false)} className="btn btn-ghost">
              {ar ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {chain.steps.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="mt-4 text-[13px] font-semibold text-brand-500 underline underline-offset-4"
          >
            {showHistory ? (ar ? "إخفاء التفاوض" : "Hide history") : ar ? "شوف كل خطوات التفاوض" : "Show history"}
          </button>

          {showHistory && (
            <ol className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
              {chain.steps.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="muted">
                    {s.direction === "buyer" ? (ar ? "المشتري" : "Buyer") : ar ? "المالك" : "Owner"}
                    {" · "}
                    {new Date(s.createdAt).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB")}
                  </span>
                  <span className="tnum font-bold text-ink-900">
                    {formatPriceExact(s.amount, locale, chain.listing.currency)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
