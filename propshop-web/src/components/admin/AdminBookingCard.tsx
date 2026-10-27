"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { VIEWING_WINDOWS, describeSlot, cairoToday } from "@/lib/viewingSlots";
import TourManager, { ManagedTour } from "@/components/TourManager";
import { roleLabel } from "@/components/admin/labels";

export type AdminBooking = {
  id: string;
  reference: string;
  listingId: string;
  listingRef: string;
  title: string;
  compound: string | null;
  owner: { name: string; phone: string };
  status: string;
  preferredAt: string | null;
  scheduledAt: string | null;
  ownerNote: string | null;
  cancelReason: string | null;
  fee: number | null;
  photographerId: string | null;
  photographerName: string | null;
  createdAt: string;
  notes: { id: string; body: string; author: string; createdAt: string }[];
  tours: ManagedTour[];
};

const STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  requested: { ar: "طلب جديد", en: "New request", tone: "badge-neutral" },
  scheduled: { ar: "اتحدد ميعاد", en: "Scheduled", tone: "badge-verified" },
  shot: { ar: "اتصورت، مستنية التسليم", en: "Shot, awaiting delivery", tone: "badge-neutral" },
  delivered: { ar: "اتسلمت", en: "Delivered", tone: "badge-verified" },
  cancelled: { ar: "اتلغت", en: "Cancelled", tone: "badge-above" },
};
const ERRORS: Record<string, { ar: string; en: string }> = {
  invalid_transition: { ar: "الحجز مش في حالة تسمح بده.", en: "The booking isn't in a state that allows this." },
  slot_invalid: { ar: "اختار يوم وفترة من الفترات المتاحة.", en: "Pick a day and one of the windows." },
  slot_in_past: { ar: "الميعاد لازم يكون في المستقبل.", en: "The time must be in the future." },
  reason_required: { ar: "اكتب سبب الإلغاء.", en: "Give a reason for cancelling." },
  staff_invalid: { ar: "الشخص ده مش مصوّر.", en: "That person can't be sent to shoot." },
  forbidden: { ar: "مش مسموحلك.", en: "Not allowed." },
};

/** One tour-shoot booking in /admin/bookings. Arrangers get every control; a photographer gets their shoot's. */
export default function AdminBookingCard({
  booking: b,
  staff,
  locale,
  nowIso,
  canArrange,
  isMine,
}: {
  booking: AdminBooking;
  staff: { id: string; fullName: string; role: string }[];
  locale: Locale;
  nowIso: string;
  canArrange: boolean;
  isMine: boolean;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [win, setWin] = useState<string>(VIEWING_WINDOWS[0].key);
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const open = ["requested", "scheduled", "shot"].includes(b.status);
  const passed = b.status === "scheduled" && !!b.scheduledAt && b.scheduledAt <= nowIso;
  const canRecord = canArrange || isMine;

  function label(at: string) {
    const s = describeSlot(at);
    const d = new Date(`${s.date}T12:00:00Z`).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });
    return `${d} · ${ar ? s.labelAr : s.labelEn}`;
  }

  async function call(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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

  const tomorrow = (() => {
    const [y, m, d] = cairoToday().split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  })();
  const st = STATUS[b.status] ?? { ar: b.status, en: b.status, tone: "badge-neutral" };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tnum text-[15px] font-bold text-ink-900">{b.reference}</span>
            <span className={`badge ${st.tone}`}>{st[locale]}</span>
            {passed && <span className="badge badge-above">{ar ? "الميعاد عدّى، سجّل اللي حصل" : "Shoot time passed. Record what happened"}</span>}
          </div>
          <p className="mt-1 truncate text-[14px] font-semibold text-ink-900">
            {canArrange ? (
              <Link href={`/admin/listings/${b.listingId}`} className="underline underline-offset-4">
                {b.listingRef}
              </Link>
            ) : (
              <span className="tnum">{b.listingRef}</span>
            )}{" "}
            · {b.title}
          </p>
          {b.compound && <p className="text-[12px] muted">{b.compound}</p>}
        </div>
        <div className="text-end text-[12px] muted">
          <p>
            {ar ? "اتطلب" : "Requested"} {new Date(b.createdAt).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB")}
          </p>
          {b.fee !== null && (
            <p className="tnum mt-0.5 font-semibold text-ink-900">
              {b.fee.toLocaleString("en-US")} {ar ? "ج.م" : "EGP"}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="border-s border-[var(--border)] ps-3">
          <div className="text-[12px] font-bold muted">{ar ? "المالك" : "Owner"}</div>
          <div className="font-semibold text-ink-900">{b.owner.name}</div>
          <a href={`tel:${b.owner.phone}`} dir="ltr" className="tnum inline-flex items-center gap-1 text-navy-700 hover:underline">
            {b.owner.phone}
          </a>
        </div>
        <div className="border-s border-[var(--border)] ps-3">
          <div className="text-[12px] font-bold muted">{ar ? "المصوّر" : "Photographer"}</div>
          <div className="font-semibold text-ink-900">{b.photographerName ?? (ar ? "لسه محدش" : "Not yet")}</div>
        </div>
      </div>
      {b.ownerNote && <p className="mt-2 text-[12px] muted">“{b.ownerNote}”</p>}
      {b.status === "cancelled" && b.cancelReason && (
        <p className="mt-2 text-[12px] text-danger-700">
          {ar ? "سبب الإلغاء: " : "Cancelled: "}
          {b.cancelReason === "cancelled_by_owner" ? (ar ? "المالك لغاه" : "cancelled by the owner") : b.cancelReason}
        </p>
      )}

      {/* Times */}
      <div className="mt-4 space-y-1.5 text-[14px]">
        {b.preferredAt && (
          <p className="text-ink-700">
            {ar ? "ميعاد المالك المفضّل: " : "Owner's preferred time: "}
            <span className="font-semibold">{label(b.preferredAt)}</span>
          </p>
        )}
        {b.scheduledAt && (
          <p className="flex items-center gap-2 font-bold text-ok-700">
            {label(b.scheduledAt)}
          </p>
        )}
      </div>

      {canArrange && ["requested", "scheduled"].includes(b.status) && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          {b.preferredAt && b.status === "requested" && b.preferredAt > nowIso && (
            <button type="button" className="btn btn-primary text-[13px]" disabled={busy !== null} onClick={() => call("pref", { action: "schedule", slot: b.preferredAt })}>
              {busy === "pref" && <Loader2 size={13} className="animate-spin" />}
              {ar ? "أكّد ميعاد المالك" : "Confirm owner's time"}
            </button>
          )}
          <label className="text-[12px]">
            <span className="mb-1 block font-bold text-navy-700">{b.status === "scheduled" ? (ar ? "غيّر الميعاد" : "Move to") : ar ? "ميعاد تاني" : "Another time"}</span>
            <input type="date" min={tomorrow} value={day} onChange={(e) => setDay(e.target.value)} className="input tnum w-auto" />
          </label>
          <select value={win} onChange={(e) => setWin(e.target.value)} className="input w-auto" aria-label={ar ? "الفترة" : "Window"}>
            {VIEWING_WINDOWS.map((w) => (
              <option key={w.key} value={w.key}>
                {ar ? w.ar : w.en}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" disabled={busy !== null || !day} onClick={() => call("custom", { action: "schedule", slot: { date: day, window: win } }).then((k) => k && setDay(""))}>
            {busy === "custom" && <Loader2 size={14} className="animate-spin" />}
            {ar ? "حدد الميعاد" : "Set time"}
          </button>
        </div>
      )}

      {/* Progress */}
      {open && canRecord && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
          {b.status === "scheduled" && (
            <button type="button" className="btn btn-ghost text-[13px]" disabled={busy !== null} onClick={() => call("shot", { action: "shot" })}>
              {busy === "shot" && <Loader2 size={13} className="animate-spin" />}
              {ar ? "اتصورت" : "Mark shot"}
            </button>
          )}
          {["scheduled", "shot"].includes(b.status) && (
            <button type="button" className="btn btn-ghost text-[13px]" disabled={busy !== null} onClick={() => call("delivered", { action: "delivered" })}>
              {busy === "delivered" && <Loader2 size={13} className="animate-spin" />}
              {ar ? "اتسلمت" : "Mark delivered"}
            </button>
          )}
          {canArrange &&
            (cancelling ? (
              <>
                <input value={reason} onChange={(e) => setReason(e.target.value)} className="input w-auto min-w-[200px]" placeholder={ar ? "سبب الإلغاء" : "Reason"} />
                <button type="button" className="btn btn-primary text-[13px]" disabled={busy !== null || !reason.trim()} onClick={() => call("cancel", { action: "cancel", reason })}>
                  {ar ? "الغي الحجز" : "Cancel booking"}
                </button>
                <button type="button" className="btn btn-ghost text-[13px]" onClick={() => setCancelling(false)}>
                  {ar ? "رجوع" : "Back"}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-ghost text-[13px] text-danger-700" disabled={busy !== null} onClick={() => setCancelling(true)}>
                {ar ? "إلغاء الحجز" : "Cancel booking"}
              </button>
            ))}
        </div>
      )}

      {/* Deliver: the finished tour goes straight onto the listing, approved — and closes this booking. */}
      {canRecord && ["scheduled", "shot"].includes(b.status) && (
        <details className="mt-4 rounded-md border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-[13px] font-bold text-navy-700">
            {ar ? "سلّم الجولة وارفعها على الإعلان" : "Deliver the tour to the listing"}
          </summary>
          <p className="mt-2 text-[12px] muted">
            {ar ? "أول ما تضيف الجولة هتظهر على الإعلان والحجز هيتقفل كـ«اتسلمت»." : "Once you add it, it goes live on the listing and this booking is marked delivered."}
          </p>
          <div className="mt-3">
            <TourManager listingId={b.listingId} initial={b.tours} locale={locale} canReview={false} canDelete={false} addsApproved />
          </div>
        </details>
      )}

      {canArrange && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-bold text-navy-700">{ar ? "المصوّر" : "Photographer"}</span>
          <select className="input w-auto" value={b.photographerId ?? ""} disabled={busy !== null || !open} onChange={(e) => call("assign", { action: "assign", staffId: e.target.value || null })}>
            <option value="">{ar ? "محدش" : "Nobody"}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({roleLabel(s.role, locale)})
              </option>
            ))}
          </select>
          {busy === "assign" && <Loader2 size={14} className="animate-spin" />}
        </div>
      )}

      {error && <p className="mt-3 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">{error}</p>}

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-2 text-[13px] font-bold text-navy-700">
          {ar ? "ملاحظات داخلية (للفريق بس)" : "Internal notes (staff only)"}
        </div>
        {canRecord && (
          <div className="mt-2 flex gap-2">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className="input min-h-[44px] flex-1" placeholder={ar ? "مثلاً: البواب محتاج اسم المصوّر" : "e.g. the doorman needs the photographer's name"} />
            <button type="button" className="btn btn-ghost self-start" disabled={busy !== null || !note.trim()} onClick={() => call("note", { action: "note", body: note }).then((k) => k && setNote(""))}>
              {busy === "note" && <Loader2 size={13} className="animate-spin" />}
              {ar ? "أضف" : "Add"}
            </button>
          </div>
        )}
        {b.notes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {b.notes.map((n) => (
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
