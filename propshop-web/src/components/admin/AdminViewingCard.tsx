"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { VIEWING_WINDOWS, describeSlot, cairoToday } from "@/lib/viewingSlots";
import { roleLabel } from "@/components/admin/labels";

export type AdminViewing = {
  id: string;
  listingId: string;
  reference: string;
  title: string;
  compound: string | null;
  buyer: { name: string; phone: string; ref: number | null };
  owner: { name: string; phone: string };
  /** False → the phones above are masked. They unmask for the assigned staff member. */
  phonesVisible: boolean;
  status: string;
  slots: string[];
  proposedAt: string | null;
  scheduledAt: string | null;
  contactUnlocked: boolean;
  outcome: string | null;
  buyerNote: string | null;
  assignedStaffId: string | null;
  createdAt: string;
  notes: { id: string; body: string; author: string; createdAt: string }[];
};

const STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  requested: { ar: "مستني رد المالك", en: "Awaiting owner", tone: "badge-neutral" },
  proposed: { ar: "المالك اقترح ميعاد", en: "Owner proposed a time", tone: "badge-neutral" },
  accepted: { ar: "متأكدة", en: "Confirmed", tone: "badge-verified" },
  declined: { ar: "اترفضت", en: "Declined", tone: "badge-above" },
  cancelled: { ar: "اتلغت", en: "Cancelled", tone: "badge-neutral" },
  completed: { ar: "تمت", en: "Completed", tone: "badge-verified" },
};
const OUTCOME: Record<string, { ar: string; en: string }> = {
  attended: { ar: "حضر", en: "Attended" },
  no_show: { ar: "محضرش", en: "No-show" },
};
const ERRORS: Record<string, { ar: string; en: string }> = {
  already_settled: { ar: "المعاينة دي اتقفلت خلاص.", en: "This viewing is already closed." },
  slot_invalid: { ar: "اختار يوم وفترة من الفترات المتاحة.", en: "Pick a day and one of the windows." },
  slot_in_past: { ar: "الميعاد لازم يكون في المستقبل.", en: "The time must be in the future." },
  not_confirmed: { ar: "لازم المعاينة تكون متأكدة الأول.", en: "The viewing must be confirmed first." },
  not_yet_happened: { ar: "ميعاد المعاينة لسه مجاش.", en: "The viewing time has not come yet." },
  staff_invalid: { ar: "الشخص ده مش من الفريق.", en: "That person is not assignable staff." },
  forbidden: { ar: "مش مسموحلك.", en: "Not allowed." },
};

export default function AdminViewingCard({
  viewing: v,
  staff,
  locale,
  nowIso,
}: {
  viewing: AdminViewing;
  staff: { id: string; fullName: string; role: string }[];
  locale: Locale;
  nowIso: string;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [day, setDay] = useState("");
  const [win, setWin] = useState<string>(VIEWING_WINDOWS[0].key);
  const [note, setNote] = useState("");

  const closed = ["declined", "cancelled", "completed"].includes(v.status);
  const passed = v.status === "accepted" && !!v.scheduledAt && v.scheduledAt <= nowIso;

  function label(at: string) {
    const s = describeSlot(at);
    const d = new Date(`${s.date}T12:00:00Z`).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return `${d} · ${ar ? s.labelAr : s.labelEn}`;
  }

  async function call(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/viewings/${v.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[json.error]?.[locale] ?? json.error ?? "error");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  // An ISO slot string is already a window start; the API accepts it as-is.
  const confirmAt = (iso: string) => call(`slot:${iso}`, { action: "confirm", slot: iso });

  const tomorrow = (() => {
    const [y, m, d] = cairoToday().split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  })();

  const st = STATUS[v.status] ?? { ar: v.status, en: v.status, tone: "badge-neutral" };

  return (
    <div className="card p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/listings/${v.listingId}`} className="tnum text-[15px] font-bold text-ink-900 underline underline-offset-4">
              {v.reference}
            </Link>
            <span className={`badge ${st.tone}`}>{st[locale]}</span>
            {passed && <span className="badge badge-above">{ar ? "الميعاد عدّى، سجّل اللي حصل" : "Time passed. Record what happened"}</span>}
            {v.outcome && <span className="badge badge-neutral">{OUTCOME[v.outcome]?.[locale] ?? v.outcome}</span>}
          </div>
          <p className="mt-1 truncate text-[14px] font-semibold text-ink-900">{v.title}</p>
          {v.compound && <p className="text-[12px] muted">{v.compound}</p>}
        </div>
        <p className="text-[12px] muted">
          {ar ? "اتطلبت" : "Requested"} {new Date(v.createdAt).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB")}
        </p>
      </div>

      {/* Parties — staff only. */}
      <div className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="border-s border-[var(--border)] ps-3">
          <div className="text-[12px] font-bold muted">{ar ? "المشتري" : "Buyer"}</div>
          <div className="font-semibold text-ink-900">
            {v.buyer.name} {v.buyer.ref && <span className="tnum muted">#{v.buyer.ref}</span>}
          </div>
          {v.phonesVisible ? (
            <a href={`tel:${v.buyer.phone}`} dir="ltr" className="tnum inline-flex items-center gap-1 text-navy-700 hover:underline">
              {v.buyer.phone}
            </a>
          ) : (
            <span dir="ltr" className="tnum inline-flex items-center gap-1 muted">
              {v.buyer.phone}
            </span>
          )}
        </div>
        <div className="border-s border-[var(--border)] ps-3">
          <div className="text-[12px] font-bold muted">{ar ? "المالك" : "Owner"}</div>
          <div className="font-semibold text-ink-900">{v.owner.name}</div>
          {v.phonesVisible ? (
            <a href={`tel:${v.owner.phone}`} dir="ltr" className="tnum inline-flex items-center gap-1 text-navy-700 hover:underline">
              {v.owner.phone}
            </a>
          ) : (
            <span dir="ltr" className="tnum inline-flex items-center gap-1 muted">
              {v.owner.phone}
            </span>
          )}
        </div>
      </div>
      {!v.phonesVisible && (
        <p className="mt-1.5 text-[12px] muted">
          {ar ? "الأرقام بتظهر لما المعاينة تتسند ليك." : "Numbers show once the viewing is assigned to you."}
        </p>
      )}
      {v.buyerNote && <p className="mt-2 text-[12px] muted">“{v.buyerNote}”</p>}

      {/* Times */}
      <div className="mt-4">
        {v.scheduledAt && (
          <p className="flex items-center gap-2 text-[14px] font-bold text-ok-700">
            {label(v.scheduledAt)}
          </p>
        )}
        {!closed && (
          <>
            <div className="mt-2 text-[12px] font-bold text-navy-700">
              {ar ? "مواعيد المشتري (اضغط على واحد عشان تأكده)" : "Buyer's times (click one to confirm it)"}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {v.slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy !== null || s === v.scheduledAt}
                  onClick={() => confirmAt(s)}
                  className={`tnum rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold transition ${
                    s === v.scheduledAt ? "border-ok-700 text-ok-700" : "border-[var(--border)] text-ink-700 hover:border-navy-300"
                  }`}
                >
                  {busy === `slot:${s}` && <Loader2 size={12} className="me-1 inline animate-spin" />}
                  {label(s)}
                </button>
              ))}
              {v.proposedAt && v.status === "proposed" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => confirmAt(v.proposedAt!)}
                  className="tnum rounded-md border border-navy-300 bg-navy-50 px-2.5 py-1.5 text-[12.5px] font-semibold text-navy-700"
                >
                  {ar ? "اقتراح المالك: " : "Owner's proposal: "}
                  {label(v.proposedAt)}
                </button>
              )}
            </div>

            {/* Any other time — still one of the three daily windows. */}
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-[12px]">
                <span className="mb-1 block font-bold text-navy-700">
                  {v.status === "accepted" ? (ar ? "غيّر الميعاد" : "Move to") : ar ? "ميعاد تاني" : "Another time"}
                </span>
                <input type="date" min={tomorrow} value={day} onChange={(e) => setDay(e.target.value)} className="input tnum w-auto" />
              </label>
              <select value={win} onChange={(e) => setWin(e.target.value)} className="input w-auto" aria-label={ar ? "الفترة" : "Window"}>
                {VIEWING_WINDOWS.map((w) => (
                  <option key={w.key} value={w.key}>
                    {ar ? w.ar : w.en}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null || !day}
                onClick={() => call("custom", { action: "confirm", slot: { date: day, window: win } }).then((okk) => okk && setDay(""))}
              >
                {busy === "custom" && <Loader2 size={14} className="animate-spin" />}
                {ar ? "أكّد الميعاد" : "Confirm time"}
              </button>
            </div>
            {!v.contactUnlocked && (
              <p className="mt-1.5 text-[12px] muted">
                {ar
                  ? "تأكيد الميعاد بيفتح الأسماء والأرقام للطرفين، زي ما بيحصل لما المالك يأكد."
                  : "Confirming shows both sides each other's name and number, as when the owner confirms."}
              </p>
            )}
          </>
        )}
      </div>

      {/* Outcome / cancel */}
      {!closed && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
          {passed && (
            <>
              <button type="button" className="btn btn-ghost text-[13px]" disabled={busy !== null} onClick={() => call("attended", { action: "complete", outcome: "attended" })}>
                {busy === "attended" && <Loader2 size={13} className="animate-spin" />}
                {ar ? "حضر" : "Attended"}
              </button>
              <button type="button" className="btn btn-ghost text-[13px]" disabled={busy !== null} onClick={() => call("no_show", { action: "complete", outcome: "no_show" })}>
                {busy === "no_show" && <Loader2 size={13} className="animate-spin" />}
                {ar ? "محضرش" : "No-show"}
              </button>
            </>
          )}
          {confirmCancel ? (
            <>
              <button type="button" className="btn btn-primary text-[13px]" disabled={busy !== null} onClick={() => call("cancel", { action: "cancel" })}>
                {busy === "cancel" && <Loader2 size={13} className="animate-spin" />}
                {ar ? "أيوه، الغيها" : "Yes, cancel it"}
              </button>
              <button type="button" className="btn btn-ghost text-[13px]" onClick={() => setConfirmCancel(false)}>
                {ar ? "لأ" : "No"}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost text-[13px] text-danger-700" disabled={busy !== null} onClick={() => setConfirmCancel(true)}>
              {ar ? "إلغاء المعاينة" : "Cancel viewing"}
            </button>
          )}
        </div>
      )}

      {/* Assign */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-bold text-navy-700">{ar ? "مسندة لـ" : "Assigned to"}</span>
        <select
          className="input w-auto"
          value={v.assignedStaffId ?? ""}
          disabled={busy !== null}
          onChange={(e) => call("assign", { action: "assign", staffId: e.target.value || null })}
        >
          <option value="">{ar ? "محدش" : "Nobody"}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} ({roleLabel(s.role, locale)})
            </option>
          ))}
        </select>
        {busy === "assign" && <Loader2 size={14} className="animate-spin" />}
      </div>

      {error && <p className="mt-3 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">{error}</p>}

      {/* Internal notes */}
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-2 text-[13px] font-bold text-navy-700">
          {ar ? "ملاحظات داخلية (للفريق بس)" : "Internal notes (staff only)"}
        </div>
        <div className="mt-2 flex gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            className="input min-h-[44px] flex-1"
            placeholder={ar ? "مثلاً: المالك طلب نكلمه قبلها بساعة" : "e.g. owner asked for a call an hour before"}
          />
          <button
            type="button"
            className="btn btn-ghost self-start"
            disabled={busy !== null || !note.trim()}
            onClick={() => call("note", { action: "note", body: note }).then((okk) => okk && setNote(""))}
          >
            {busy === "note" && <Loader2 size={13} className="animate-spin" />}
            {ar ? "أضف" : "Add"}
          </button>
        </div>
        {v.notes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {v.notes.map((n) => (
              <li key={n.id} className="border-s-2 border-ink-200 py-0.5 ps-3 text-[13px]">
                <p className="whitespace-pre-wrap text-ink-900">{n.body}</p>
                <p className="mt-1 text-[12px] muted">
                  {n.author} · {new Date(n.createdAt).toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: "Africa/Cairo" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
