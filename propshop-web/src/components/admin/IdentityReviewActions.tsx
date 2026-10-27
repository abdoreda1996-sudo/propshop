"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Locale } from "@/lib/i18n";

/**
 * Approve / reject one pending identity document. When the account has no ID hash yet and
 * this is the card's front, approving asks for the number as read off the card — that
 * reading becomes the hash ownership documents are matched against.
 */
export default function IdentityReviewActions({
  docId,
  locale,
  needsNumber,
}: {
  docId: string;
  locale: Locale;
  needsNumber: boolean;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/kyc/${docId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res) {
      setBusy(false);
      setError(ar ? "مشكلة في الاتصال، جرّب تاني." : "Connection problem, try again.");
      return;
    }
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    if (json.error === "typed_mismatch") {
      setMismatch(true);
      return;
    }
    setError(
      json.error === "national_id_required"
        ? ar ? "اكتب الـ14 رقم زي ما هما على البطاقة." : "Type the 14 digits exactly as on the card."
        : json.error === "not_pending"
          ? ar ? "المستند ده اتراجع خلاص." : "This document was already decided."
          : ar ? "الحفظ فشل. جرّب تاني." : "Saving failed. Please try again.",
    );
  }

  const approve = (confirmMismatch = false) =>
    send({ decision: "approve", ...(needsNumber ? { nationalId } : {}), confirmMismatch });

  if (rejecting) {
    return (
      <div className="mt-2 flex flex-col gap-2">
        <input
          className="input text-[12px]"
          placeholder={ar ? "السبب، 5 حروف على الأقل (هيتبعت للمستخدم)" : "Reason, at least 5 characters (sent to the user)"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || reason.trim().length < 5}
            onClick={() => send({ decision: "reject", reason })}
            className="btn btn-primary px-3 py-1.5 text-[12px]"
          >
            {busy ? "…" : ar ? "تأكيد الرفض" : "Confirm rejection"}
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="btn btn-ghost px-3 py-1.5 text-[12px]">
            {ar ? "رجوع" : "Back"}
          </button>
        </div>
        {error && <p role="alert" className="text-[12px] text-danger-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {needsNumber && (
        <input
          className="input tnum text-[12px]"
          inputMode="numeric"
          dir="ltr"
          maxLength={14}
          value={nationalId}
          onChange={(e) => {
            setNationalId(e.target.value.replace(/\D/g, ""));
            setMismatch(false);
          }}
          placeholder={ar ? "الرقم القومي من البطاقة" : "ID number from the card"}
          aria-label={ar ? "الرقم القومي من البطاقة" : "ID number from the card"}
        />
      )}
      {mismatch && (
        <p className="text-[12px] text-danger-700">
          {ar
            ? "الرقم ده مختلف عن اللي المستخدم كتبه. لو متأكد إن ده اللي على البطاقة، اعتمد على أي حال."
            : "This differs from the number the user typed. If you are sure it is what the card shows, approve anyway."}
        </p>
      )}
      {error && <p className="text-[12px] text-danger-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || (needsNumber && nationalId.length !== 14)}
          onClick={() => approve(mismatch)}
          className="btn btn-accent px-3 py-1.5 text-[12px]"
        >
          {busy ? "…" : mismatch ? (ar ? "اعتمد على أي حال" : "Approve anyway") : ar ? "اعتماد" : "Approve"}
        </button>
        <button type="button" onClick={() => setRejecting(true)} className="btn btn-ghost px-3 py-1.5 text-[12px]">
          {ar ? "رفض" : "Reject"}
        </button>
      </div>
    </div>
  );
}
