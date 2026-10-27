"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { VIEWING_WINDOWS, describeSlot, cairoToday } from "@/lib/viewingSlots";

export type OwnerBooking = {
  reference: string | null;
  status: string;
  preferredAt: string | null;
  scheduledAt: string | null;
  feeAmount: number | null;
  cancelReason: string | null;
  photographer: { fullName: string } | null;
};

const STATUS: Record<string, { ar: string; en: string }> = {
  requested: { ar: "طلبك وصل. فريقنا هيكلمك يحدد الميعاد", en: "Request received. Our team will call you to set the time" },
  scheduled: { ar: "اتحدد ميعاد التصوير", en: "Shoot scheduled" },
  shot: { ar: "اتصورت، والجولة بتتجهز", en: "Shot. Your tour is being prepared" },
  delivered: { ar: "الجولة اتسلمت وظاهرة على إعلانك", en: "Delivered. The tour is live on your listing" },
  cancelled: { ar: "الحجز اتلغى", en: "Booking cancelled" },
};
const ERRORS: Record<string, { ar: string; en: string }> = {
  slot_invalid: { ar: "اختار يوم وفترة.", en: "Pick a day and a window." },
  slot_in_past: { ar: "الميعاد لازم يكون في المستقبل.", en: "The time must be in the future." },
  already_booked: { ar: "فيه حجز مفتوح للإعلان ده بالفعل.", en: "There is already an open booking for this listing." },
  listing_closed: { ar: "الإعلان ده مقفول.", en: "This listing is closed." },
  rate_limited: { ar: "محاولات كتير. استنى شوية.", en: "Too many attempts. Wait a little." },
};

/**
 * The owner books PropShop's professional photography + 360° virtual tour shoot for a
 * listing, follows its status, and can cancel before the shoot. Staff arrange it in
 * /admin/bookings; the finished tour lands on the listing automatically.
 */
export default function TourBookingCard({
  listingId,
  booking,
  fee,
  bookable,
  locale,
}: {
  listingId: string;
  booking: OwnerBooking | null;
  fee: number | null;
  bookable: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [day, setDay] = useState("");
  const [win, setWin] = useState<string>(VIEWING_WINDOWS[0].key);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tomorrow = (() => {
    const [y, m, d] = cairoToday().split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  })();
  const label = (at: string) => {
    const s = describeSlot(at);
    const d = new Date(`${s.date}T12:00:00Z`).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
    return `${d} · ${ar ? s.labelAr : s.labelEn}`;
  };
  const money = (n: number) => `${n.toLocaleString("en-US")} ${ar ? "ج.م" : "EGP"}`;

  async function send(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/listings/${listingId}/tour-booking`, {
        method,
        headers: method === "POST" ? { "content-type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify({ slot: { date: day, window: win }, note }) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(ERRORS[j.error]?.[locale] ?? j.error ?? "error");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const open = booking && ["requested", "scheduled", "shot"].includes(booking.status);

  return (
    <div className="card p-5">
      <div>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-ink-900">{ar ? "احجز تصوير احترافي وجولة 360°" : "Book a professional shoot and 360° tour"}</h2>
          <p className="mt-1 text-[13px] leading-6 muted">
            {ar
              ? "مصوّر من بروب شوب بييجي الوحدة، يصوّر صور احترافية وجولة افتراضية 360°، وبنحطها على إعلانك بنفسنا."
              : "A PropShop photographer visits the unit, shoots professional photos and a 360° virtual tour, and we put it on your listing for you."}
            {fee !== null && !open && (
              <>
                {" "}
                <strong className="text-ink-900">{money(fee)}</strong>
              </>
            )}
          </p>
        </div>
      </div>

      {open && booking ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4 text-[14px]">
          <p className="font-bold text-ink-900">
            {STATUS[booking.status]?.[locale]} {booking.reference && <span className="tnum text-[12px] muted">· {booking.reference}</span>}
          </p>
          {booking.scheduledAt ? (
            <p className="mt-2 font-semibold text-ok-700">
              {ar ? "الميعاد: " : "Booked for "}
              {label(booking.scheduledAt)}
            </p>
          ) : (
            booking.preferredAt && (
              <p className="mt-2 text-ink-700">
                {ar ? "الميعاد اللي طلبته: " : "Your preferred time: "}
                {label(booking.preferredAt)}
              </p>
            )
          )}
          {booking.photographer && (
            <p className="mt-1 text-[13px] muted">
              {ar ? "المصوّر: " : "Photographer: "}
              {booking.photographer.fullName}
            </p>
          )}
          {booking.feeAmount !== null && (
            <p className="mt-1 text-[13px] muted">
              {ar ? "السعر: " : "Price: "}
              {money(booking.feeAmount)}
            </p>
          )}
          {["requested", "scheduled"].includes(booking.status) && (
            <button type="button" className="btn btn-ghost mt-3 text-[13px] text-danger-600" disabled={busy} onClick={() => window.confirm(ar ? "تلغي الحجز؟" : "Cancel the booking?") && send("DELETE")}>
              {ar ? "إلغاء الحجز" : "Cancel booking"}
            </button>
          )}
        </div>
      ) : bookable ? (
        <div className="mt-4 space-y-3">
          {booking?.status === "delivered" && <p className="text-[13px] text-ok-700">{STATUS.delivered[locale]}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[12px]">
              <span className="mb-1 block font-semibold text-ink-900">{ar ? "اليوم اللي يناسبك" : "A day that suits you"}</span>
              <input type="date" min={tomorrow} value={day} onChange={(e) => setDay(e.target.value)} className="input tnum w-auto" />
            </label>
            <select value={win} onChange={(e) => setWin(e.target.value)} className="input w-auto" aria-label={ar ? "الفترة" : "Window"}>
              {VIEWING_WINDOWS.map((w) => (
                <option key={w.key} value={w.key}>
                  {ar ? w.ar : w.en}
                </option>
              ))}
            </select>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="input w-full" placeholder={ar ? "ملاحظة للمصوّر (اختياري)، مثلاً: الشقة في الدور التالت" : "Note for the photographer (optional), e.g. third floor"} />
          <button type="button" className="btn btn-primary" disabled={busy || !day} onClick={() => send("POST")}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {ar ? "احجز التصوير" : "Book the shoot"}
          </button>
          <p className="text-[12px] muted">{ar ? "ده الميعاد اللي يناسبك، وفريقنا هيكلمك يأكده." : "This is your preferred time. Our team will call you to confirm it."}</p>
        </div>
      ) : (
        <p className="mt-3 text-[13px] muted">{ar ? "الإعلان ده مقفول." : "This listing is closed."}</p>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-danger-600">{error}</p>}
    </div>
  );
}
