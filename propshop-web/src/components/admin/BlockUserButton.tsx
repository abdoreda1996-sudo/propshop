"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";

const ERRORS: Record<string, { ar: string; en: string }> = {
  reason_required: { ar: "اكتب السبب.", en: "Enter a reason." },
  cannot_block_self: { ar: "مينفعش توقف حسابك.", en: "You cannot block yourself." },
  cannot_block_admin: { ar: "مينفعش توقف أدمن.", en: "Admins cannot be blocked." },
  already_blocked: { ar: "الحساب موقوف بالفعل.", en: "Already blocked." },
  not_blocked: { ar: "الحساب مش موقوف.", en: "Not blocked." },
  forbidden: { ar: "للأدمن بس.", en: "Admin only." },
};

/**
 * Block / unblock one account. Blocking asks for a reason inline (no browser dialog) and
 * says plainly what will happen — it is not a quiet flag.
 */
export default function BlockUserButton({ userId, blocked, locale }: { userId: string; blocked: boolean; locale: Locale }) {
  const router = useRouter();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function send(action: "block" | "unblock") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[j.error]?.[locale] ?? j.error ?? "error");
        return;
      }
      if (action === "block") {
        setResult(
          ar
            ? `اتوقف. ${j.pausedListingIds?.length ?? 0} إعلان اتوقف، ${j.offersWithdrawn ?? 0} عرض اتسحب، ${j.viewingsCancelled ?? 0} معاينة اتلغت${j.openDeals ? `. فيه ${j.openDeals} صفقة شغالة محتاجة متابعة` : ""}.`
            : `Blocked. ${j.pausedListingIds?.length ?? 0} listing(s) paused, ${j.offersWithdrawn ?? 0} offer(s) withdrawn, ${j.viewingsCancelled ?? 0} viewing(s) cancelled${j.openDeals ? `. ${j.openDeals} open deal(s) need follow-up` : ""}.`,
        );
      } else {
        setResult(ar ? `اترفع الإيقاف. ${j.restoredListingIds?.length ?? 0} إعلان رجع.` : `Unblocked. ${j.restoredListingIds?.length ?? 0} listing(s) restored.`);
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <div className="min-w-[160px]">
        <button type="button" className="btn btn-ghost px-2.5 py-1 text-[12px]" disabled={busy} onClick={() => send("unblock")}>
          {busy && <Loader2 size={12} className="animate-spin" />}
          {ar ? "ارفع الإيقاف" : "Unblock"}
        </button>
        {error && <p className="mt-1 text-[12px] font-semibold text-danger-700">{error}</p>}
        {result && <p className="mt-1 text-[12px] text-ok-700">{result}</p>}
      </div>
    );
  }

  return (
    <div className="min-w-[160px]">
      {!open ? (
        <button type="button" className="btn btn-ghost px-2.5 py-1 text-[12px] text-danger-700" onClick={() => setOpen(true)}>
          {ar ? "إيقاف" : "Block"}
        </button>
      ) : (
        <div className="w-[240px] space-y-1.5">
          <p className="text-[12px] leading-snug muted">
            {ar
              ? "هيتقفل دخوله، إعلاناته المنشورة هتتوقف، عروضه هتتسحب ومعايناته هتتلغي."
              : "Signs them out, pauses their live listings, withdraws their offers and cancels their viewings."}
          </p>
          <input
            className="input w-full text-[12px]"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder={ar ? "السبب (مطلوب)" : "Reason (required)"}
            autoFocus
          />
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-primary px-2.5 py-1 text-[12px]" disabled={busy || !reason.trim()} onClick={() => send("block")}>
              {busy && <Loader2 size={12} className="animate-spin" />}
              {ar ? "أكّد الإيقاف" : "Confirm block"}
            </button>
            <button type="button" className="btn btn-ghost px-2.5 py-1 text-[12px]" onClick={() => { setOpen(false); setError(null); }}>
              {ar ? "رجوع" : "Back"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-[12px] font-semibold text-danger-700">{error}</p>}
      {result && <p className="mt-1 text-[12px] text-ok-700">{result}</p>}
    </div>
  );
}
