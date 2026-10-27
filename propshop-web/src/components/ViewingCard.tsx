"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { describeSlot } from "@/lib/viewingSlots";

export type Viewing = {
  id: string;
  reference: string;
  title: string;
  role: "buyer" | "seller";
  status: string;
  slots: string[];
  proposedAt: string | null;
  scheduledAt: string | null;
};

const STATUS_COPY: Record<string, { ar: string; en: string; tone: string }> = {
  requested: { ar: "مستني رد", en: "Awaiting reply", tone: "badge-neutral" },
  proposed: { ar: "ميعاد مقترح", en: "Time proposed", tone: "badge-neutral" },
  accepted: { ar: "متأكد", en: "Confirmed", tone: "badge-below" },
  declined: { ar: "اترفض", en: "Declined", tone: "badge-above" },
  cancelled: { ar: "اتلغى", en: "Cancelled", tone: "badge-neutral" },
  completed: { ar: "تمت", en: "Completed", tone: "badge-below" },
};

/**
 * A viewing request, from either side.
 *
 * The owner picks one of the buyer's slots, proposes another, or declines. The buyer can
 * confirm a proposed time or cancel. Nobody types a phone number to do any of it.
 */
export default function ViewingCard({ viewing, locale }: { viewing: Viewing; locale: Locale }) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The Cairo day plus the window ("Tue 3 Oct · 2 PM – 6 PM"), never a raw clock time.
  const fmt = (iso: string) => {
    const v = describeSlot(iso);
    const [y, m, d] = v.date.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return `${day} · ${ar ? v.labelAr : v.labelEn}`;
  };

  async function act(action: string, at?: string) {
    setBusy(action + (at ?? ""));
    setError(null);
    try {
      const res = await fetch(`/api/viewings/${viewing.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, at }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((ar ? json.messageAr : json.messageEn) ?? (ar ? "مش قادرين ننفذ ده." : "That did not work."));
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const status = STATUS_COPY[viewing.status] ?? STATUS_COPY.requested;
  const isSeller = viewing.role === "seller";

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={`/listing/${viewing.reference}`} className="text-[15px] font-semibold text-ink-900 hover:underline">
            {viewing.title}
          </a>
          <p className="mt-1 text-[13px] muted">
            {isSeller ? (ar ? "مشتري طلب معاينة" : "A buyer asked to view") : ar ? "طلب معاينة منك" : "Your viewing request"}
          </p>
        </div>
        <span className={`badge ${status.tone}`}>{ar ? status.ar : status.en}</span>
      </div>

      {viewing.status === "accepted" && viewing.scheduledAt && (
        <div className="mt-3 border-s-2 border-ok-700 ps-3">
          <p className="tnum text-[14px] font-bold text-ok-700">{fmt(viewing.scheduledAt)}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-700">
            {ar
              ? "المعاينة اتأكدت، فبقى ينفع تتبادلوا أرقام التواصل من خلال الرسايل."
              : "The viewing is confirmed, so contact details can now be exchanged in Messages."}
          </p>
        </div>
      )}

      {/* The owner's move: pick one of the buyer's slots, or decline. */}
      {isSeller && viewing.status === "requested" && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-ink-900">
            {ar ? "المواعيد اللي المشتري اقترحها:" : "Times the buyer proposed:"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {viewing.slots.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!!busy}
                onClick={() => act("accept", s)}
                className="btn btn-ghost tnum px-3 py-1.5 text-[13px]"
              >
                {busy === "accept" + s && <Loader2 size={13} className="animate-spin" />}
                {fmt(s)}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => act("decline")}
            className="mt-3 text-[13px] font-semibold text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
          >
            {ar ? "مش متاح في المواعيد دي" : "None of these work"}
          </button>
        </div>
      )}

      {/* The buyer's move: confirm the owner's suggestion. */}
      {!isSeller && viewing.status === "proposed" && viewing.proposedAt && (
        <div className="mt-4">
          <p className="text-[13px] text-ink-900">
            {ar ? "المالك اقترح:" : "The owner proposed:"}{" "}
            <strong className="font-bold">{fmt(viewing.proposedAt)}</strong>
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={!!busy} onClick={() => act("confirm")} className="btn btn-primary">
              {busy === "confirm" && <Loader2 size={14} className="animate-spin" />}
              {ar ? "يناسبني" : "That works"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => act("cancel")} className="btn btn-ghost">
              {ar ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {!isSeller && viewing.status === "requested" && (
        <p className="mt-4 text-[13px] muted">
          {ar ? "مستنيين المالك يأكد ميعاد." : "Waiting for the owner to confirm a time."}
        </p>
      )}

      {error && (
        <p className="mt-3 text-[13px] font-semibold text-danger-700">{error}</p>
      )}
    </div>
  );
}
