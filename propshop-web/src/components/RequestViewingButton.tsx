"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import ModalPortal from "./ModalPortal";
import { VIEWING_WINDOWS, cairoToday } from "@/lib/viewingSlots";

/**
 * REQUEST VIEWING (Section 12).
 *
 * The buyer proposes up to three slots; the owner accepts one, declines, or proposes
 * another. No phone number changes hands to arrange it — that is the point.
 *
 * Slots are the next seven days × the three daily windows (11–2, 2–6, 6–9, Cairo time),
 * one row per day, rather than a calendar widget: picking a button is one tap.
 */
export default function RequestViewingButton({
  listingId,
  locale,
  signedIn,
}: {
  listingId: string;
  locale: Locale;
  signedIn: boolean;
}) {
  const router = useRouter();
  // Signed-out visitors log in and come straight back to THIS unit, not their dashboard.
  const pathname = usePathname();
  const ar = locale === "ar";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  // The next seven Cairo days, starting tomorrow. Day strings are Cairo calendar dates;
  // the server turns {date, window} into the instant, so a buyer abroad still books
  // Cairo's 2 PM.
  const [ty, tm, td] = cairoToday().split("-").map(Number);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(ty, tm - 1, td + i + 1, 12));
    return {
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    };
  });

  function toggle(iso: string) {
    setPicked((prev) =>
      prev.includes(iso) ? prev.filter((p) => p !== iso) : prev.length >= 3 ? prev : [...prev, iso],
    );
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/viewings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          slots: picked.map((k) => {
            const [date, window] = k.split("|");
            return { date, window };
          }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((ar ? json.messageAr : json.messageEn) ?? (ar ? "مش قادرين نبعت الطلب." : "That did not work."));
        return;
      }
      setSent(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <a href={`/login?next=${encodeURIComponent(pathname)}`} className="btn btn-ghost w-full">
        {ar ? "سجّل دخول عشان تطلب معاينة" : "Log in to request a viewing"}
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost w-full">
        {ar ? "اطلب معاينة" : "Request a viewing"}
      </button>

      {open && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-lg bg-white p-5 sm:rounded-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {sent ? (
              <div className="py-2">
                <h3 className="text-[17px] font-bold text-ink-900">
                  {ar ? "طلب المعاينة وصل" : "Viewing request sent"}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed muted">
                  {ar
                    ? "المالك هيأكد ميعاد أو يقترح ميعاد تاني. مش محتاج تدي رقمك."
                    : "The owner will confirm a slot or propose another. You never share your number."}
                </p>
                <button type="button" onClick={() => setOpen(false)} className="btn btn-primary mt-5">
                  {ar ? "تمام" : "Done"}
                </button>
              </div>
            ) : (
              <>
                {/* Title and Send stay pinned while the seven days scroll between them. */}
                <div className="sticky -top-5 z-10 -mx-5 -mt-5 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-white px-5 pb-3 pt-5 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
                  <div>
                    <h3 className="text-[17px] font-bold text-ink-900">{ar ? "اطلب معاينة" : "Request a viewing"}</h3>
                    <p className="mt-1 text-[13px] muted">
                      {ar ? "اختار لحد 3 مواعيد تناسبك." : "Pick up to 3 times that suit you."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={ar ? "إغلاق" : "Close"}
                    className="p-1 text-ink-400 hover:text-ink-900"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {days.map((day) => (
                    <div key={day.date}>
                      <div className="mb-1.5 text-[12.5px] font-semibold text-ink-900">{day.label}</div>
                      <div className="grid grid-cols-3 gap-2">
                        {VIEWING_WINDOWS.map((w) => {
                          const key = `${day.date}|${w.key}`;
                          const on = picked.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggle(key)}
                              aria-pressed={on}
                              className={`tnum rounded-md border px-1.5 py-2 text-[12.5px] font-semibold transition ${
                                on
                                  ? "border-accent-500 bg-accent-50 text-accent-700"
                                  : "border-[var(--border)] text-ink-700 hover:border-navy-300"
                              }`}
                            >
                              {ar ? w.ar : w.en}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sticky -bottom-5 -mx-5 -mb-5 mt-4 border-t border-[var(--border)] bg-white px-5 pb-5 pt-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6 sm:pb-6">
                  {error && (
                    <p className="mb-3 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={busy || picked.length === 0}
                    onClick={send}
                    className="btn btn-primary w-full"
                  >
                    {busy && <Loader2 size={15} className="animate-spin" />}
                    {ar ? "ابعت الطلب" : "Send request"}
                    {picked.length > 0 && <span className="tnum opacity-80">({picked.length}/3)</span>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
