"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { UNIT_TYPES, UNIT_TYPE_LABELS, UnitType } from "@/lib/enums";
import { Preference, TRADE_CASH } from "@/lib/trade";
import { CASH_PREF_LABELS } from "./TradePanel";

const str = (v: number | null) => (v === null ? "" : String(v));

/** The owner's switch + "what I want in return". Requirements guide matching; they never block an offer. */
export default function TradeSettingsForm({
  listingId,
  initialOpen,
  initial,
  areas,
  canOpen,
  locale,
}: {
  listingId: string;
  initialOpen: boolean;
  initial: Preference;
  areas: { id: string; nameAr: string; nameEn: string }[];
  /** False when the listing is not live+verified: the switch would have no effect yet. */
  canOpen: boolean;
  locale: Locale;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [open, setOpen] = useState(initialOpen);
  const [types, setTypes] = useState<string[]>(initial.types);
  const [areaIds, setAreaIds] = useState<string[]>(initial.areaIds);
  const [minBedrooms, setMinBedrooms] = useState(str(initial.minBedrooms));
  const [minSizeSqm, setMinSizeSqm] = useState(str(initial.minSizeSqm));
  const [minValue, setMinValue] = useState(str(initial.minValue));
  const [maxValue, setMaxValue] = useState(str(initial.maxValue));
  const [cash, setCash] = useState<string>(initial.cash);
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const flip = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/listings/${listingId}/trade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openToTrade: open,
          preference: { types, areaIds, minBedrooms, minSizeSqm, minValue, maxValue, cash, note },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          j.error === "invalid_fields"
            ? ar ? "راجع الأرقام: فيه قيمة مش صحيحة، أو الحد الأدنى أكبر من الأقصى." : "Check the numbers: a value is not valid, or the minimum is above the maximum."
            : j.error === "listing_closed"
              ? ar ? "الوحدة محجوزة أو اتقفلت، فمينفعش تفتحها للمقايضة." : "This unit is reserved or closed, so it cannot be opened to trade."
              : ar ? "مقدرناش نحفظ. جرّب تاني." : "Could not save. Try again.",
        );
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) =>
    `rounded-md px-2.5 py-1.5 text-[13px] transition ${on ? "bg-brand-50 font-semibold text-ink-900 shadow-[inset_0_0_0_1.5px_var(--color-brand-500)]" : "bg-white text-ink-700 shadow-[inset_0_0_0_1px_#d2d2d7] hover:bg-ink-50"}`;

  return (
    <div className="max-w-3xl space-y-7">
      <label className="flex cursor-pointer items-center justify-between gap-4 border-y border-[var(--border)] py-4">
        <span>
          <span className="block text-[15px] font-bold text-ink-900">{ar ? "الوحدة متاحة للمقايضة" : "Open to trade"}</span>
          <span className="block text-[12.5px] muted">
            {ar
              ? "لما تفتحها، زرار «اعرض مقايضة» بيظهر على صفحة الوحدة، وبتظهر في سوق المقايضة. البيع بيفضل شغال عادي."
              : "When on, an “Offer a trade” button appears on the listing and it shows in the trade market. Selling stays on as usual."}
          </span>
          {!canOpen && (
            <span className="mt-1 block text-[12px] font-semibold text-accent-700">
              {ar ? "هتظهر للناس بعد ما الوحدة تتنشر وتتوثّق." : "It becomes visible once the listing is live and verified."}
            </span>
          )}
        </span>
        <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-500" checked={open} onChange={(e) => setOpen(e.target.checked)} />
      </label>

      <section className={`space-y-5 ${open ? "" : "opacity-60"}`}>
        <h2 className="border-b border-ink-900 pb-2 text-[16px] font-bold text-ink-900">{ar ? "عايز تقايض بإيه؟" : "What do you want in return?"}</h2>
        <p className="-mt-3 text-[12.5px] muted">
          {ar ? "كل ده اختياري. بنستخدمه عشان نوري الناس اللي عندهم وحدة مناسبة، ومش بيمنع حد يعرض عليك." : "All optional. We use it to point people with a fitting unit your way; it never stops anyone making an offer."}
        </p>

        <div>
          <div className="mb-2 text-[12.5px] font-bold text-ink-900">{ar ? "نوع الوحدة" : "Unit type"}</div>
          <div className="flex flex-wrap gap-2">
            {UNIT_TYPES.map((t) => (
              <button key={t} type="button" className={chip(types.includes(t))} onClick={() => flip(types, setTypes, t)} aria-pressed={types.includes(t)}>
                {UNIT_TYPE_LABELS[t as UnitType][locale]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[12.5px] font-bold text-ink-900">{ar ? "المنطقة" : "Area"}</div>
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <button key={a.id} type="button" className={chip(areaIds.includes(a.id))} onClick={() => flip(areaIds, setAreaIds, a.id)} aria-pressed={areaIds.includes(a.id)}>
                {ar ? a.nameAr : a.nameEn}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [ar ? "غرف نوم (أقل حاجة)" : "Min bedrooms", minBedrooms, setMinBedrooms],
            [ar ? "المساحة م² (أقل حاجة)" : "Min size (sqm)", minSizeSqm, setMinSizeSqm],
            [ar ? "القيمة من (ج.م)" : "Value from (EGP)", minValue, setMinValue],
            [ar ? "القيمة لحد (ج.م)" : "Value up to (EGP)", maxValue, setMaxValue],
          ].map(([label, value, set]) => (
            <label key={label as string} className="block">
              <span className="mb-1 block text-[12.5px] font-bold text-ink-900">{label as string}</span>
              <input
                className="input tnum w-full"
                inputMode="numeric"
                value={value as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value.replace(/[^\d,]/g, ""))}
              />
            </label>
          ))}
        </div>

        <div>
          <div className="mb-2 text-[12.5px] font-bold text-ink-900">{ar ? "فرق الفلوس" : "Cash difference"}</div>
          <div className="flex flex-wrap gap-2">
            {TRADE_CASH.map((c) => (
              <button key={c} type="button" className={chip(cash === c)} onClick={() => setCash(c)} aria-pressed={cash === c}>
                {CASH_PREF_LABELS[c][locale]}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-[12.5px] font-bold text-ink-900">{ar ? "ملاحظة (اختياري)" : "Note (optional)"}</span>
          <textarea className="input min-h-[80px] w-full" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
          {busy && <Loader2 size={15} className="animate-spin" />}
          {ar ? "احفظ" : "Save"}
        </button>
        {saved && (
          <span className="text-[13px] font-semibold text-ok-700">{ar ? "اتحفظ" : "Saved"}</span>
        )}
        {error && <span className="text-[13px] font-semibold text-danger-700">{error}</span>}
      </div>
    </div>
  );
}
