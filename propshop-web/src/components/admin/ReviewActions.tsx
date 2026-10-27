"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Locale } from "@/lib/i18n";

/** Approve / reject a pending listing. Approval re-runs the gate server-side. */
export default function ReviewActions({
  listingId,
  locale,
  canPublish,
}: {
  listingId: string;
  locale: Locale;
  canPublish: boolean;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/listings/${listingId}/publish`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(
        json.validation?.blocks?.length
          ? ar
            ? "الفحص الآلي رفض النشر. راجع الموانع فوق."
            : "The automated gate refused publishing. See the blocking checks above."
          : (json.error ?? "failed"),
      );
      router.refresh();
      return;
    }
    router.refresh();
  }

  async function reject() {
    if (reason.trim().length < 5) return;
    setBusy(true);
    const res = await fetch(`/api/listings/${listingId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (res.ok) {
      setRejecting(false);
      setReason("");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(ar ? `الرفض ماتمش (${j.error ?? res.status}).` : `Rejection failed (${j.error ?? res.status}).`);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      {error && <p className="mb-3 text-[13px] text-danger-700">{error}</p>}

      {rejecting ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input text-[13px]"
            placeholder={ar ? "سبب الرفض، 5 حروف على الأقل (هيتبعت للمالك)" : "Reason, at least 5 characters (sent to the owner)"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || reason.trim().length < 5}
            onClick={reject}
            className="btn btn-primary shrink-0 text-[13px]"
          >
            {ar ? "تأكيد الرفض" : "Confirm rejection"}
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="btn btn-ghost shrink-0 text-[13px]">
            {ar ? "إلغاء" : "Cancel"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !canPublish}
            onClick={approve}
            className="btn btn-accent text-[13px]"
            title={canPublish ? undefined : ar ? "فيه موانع لسه" : "Blocking checks remain"}
          >
            {busy ? "…" : ar ? "اعتماد ونشر" : "Approve & publish"}
          </button>
          <button type="button" onClick={() => setRejecting(true)} className="btn btn-ghost text-[13px]">
            {ar ? "رفض" : "Reject"}
          </button>
          {!canPublish && (
            <span className="self-center text-[12px] muted">
              {ar ? "النشر مقفول لحد ما الموانع تتحل." : "Publishing is locked until the blocking checks clear."}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
