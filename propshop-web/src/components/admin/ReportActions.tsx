"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";

/**
 * Upholding a report issues a strike against the reported account; three strikes
 * suspend it. Dismissing costs the reporter nothing — we would rather absorb false
 * reports than discourage real ones.
 */
export default function ReportActions({ reportId, locale }: { reportId: string; locale: Locale }) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<"upheld" | "dismissed" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(status: "upheld" | "dismissed") {
    setBusy(status);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setConfirming(false);
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => ({}));
      setError(ar ? `ماتمش (${j.error ?? res.status}).` : `Did not go through (${j.error ?? res.status}).`);
    } catch {
      setError(ar ? "مشكلة في الاتصال، جرّب تاني." : "Connection problem, try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <span className="text-[13px] text-ink-900">
            {ar ? "هيتسجل إنذار على الحساب. تلات إنذارات بتوقفه. متأكد؟" : "This adds a strike to the account; three strikes suspend it. Sure?"}
          </span>
          <button type="button" disabled={busy !== null} onClick={() => act("upheld")} className="btn btn-primary px-3 py-1.5 text-[13px]">
            {busy === "upheld" && <Loader2 size={13} className="animate-spin" />}
            {ar ? "أيوه، أكّد البلاغ" : "Yes, uphold it"}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => setConfirming(false)} className="btn btn-ghost px-3 py-1.5 text-[13px]">
            {ar ? "رجوع" : "Back"}
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={busy !== null} onClick={() => setConfirming(true)} className="btn btn-ghost px-3 py-1.5 text-[13px] text-danger-700">
            {ar ? "أكّد البلاغ (إنذار)" : "Uphold (strike)"}
          </button>
          <button type="button" disabled={busy !== null} onClick={() => act("dismissed")} className="btn btn-ghost px-3 py-1.5 text-[13px]">
            {busy === "dismissed" && <Loader2 size={13} className="animate-spin" />}
            {ar ? "ارفض البلاغ" : "Dismiss"}
          </button>
        </>
      )}
      {error && <p role="alert" className="w-full text-[13px] font-semibold text-danger-700">{error}</p>}
    </div>
  );
}
