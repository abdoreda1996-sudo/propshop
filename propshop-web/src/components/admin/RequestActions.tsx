"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Locale } from "@/lib/i18n";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, RequestStatus } from "@/lib/enums";

/**
 * Advisor actions on a queued request. "Log first response" is the action that actually
 * satisfies the 24-hour SLA, so it is the primary button until it has been used.
 */
export default function RequestActions({
  requestId,
  locale,
  status,
  hasResponded,
}: {
  requestId: string;
  locale: Locale;
  status: string;
  hasResponded: boolean;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setOpen(false);
        setNote("");
        router.refresh();
        return;
      }
      const j = await res.json().catch(() => ({}));
      setError(ar ? `ماتحفظش (${j.error ?? res.status}).` : `Not saved (${j.error ?? res.status}).`);
    } catch {
      setError(ar ? "مشكلة في الاتصال، جرّب تاني." : "Connection problem, try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--border)] pt-4">
      {!hasResponded ? (
        <div>
          {!open ? (
            <button type="button" onClick={() => setOpen(true)} className="btn btn-accent text-[13px]">
              {ar ? "سجّل أول رد" : "Log first response"}
            </button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="input text-[13px]"
                placeholder={ar ? "اتكلمتوا في إيه؟" : "What did you discuss?"}
                aria-label={ar ? "ملخص أول رد" : "Summary of the first response"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ action: "first_response", note })}
                className="btn btn-accent shrink-0 text-[13px]"
              >
                {busy ? "…" : ar ? "حفظ" : "Save"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost shrink-0 text-[13px]">
                {ar ? "إلغاء" : "Cancel"}
              </button>
            </div>
          )}
          <p className="mt-2 text-[12px] muted">
            {ar
              ? "رقم المشتري بيظهر بعد تسجيل أول رد."
              : "The buyer's number is revealed once the first response is logged."}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[12px] font-semibold muted" htmlFor={`st-${requestId}`}>
            {ar ? "الحالة" : "Status"}
          </label>
          <select
            id={`st-${requestId}`}
            className="select w-auto text-[13px]"
            value={status}
            disabled={busy}
            onChange={(e) => act({ action: "status", status: e.target.value })}
          >
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REQUEST_STATUS_LABELS[s as RequestStatus][locale]}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[13px] font-semibold text-danger-700">{error}</p>}
    </div>
  );
}
