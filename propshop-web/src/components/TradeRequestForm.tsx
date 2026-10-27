"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X, MapPin, Building } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { UNIT_TYPE_GROUPS, UNIT_TYPE_LABELS } from "@/lib/enums";
import { formatNumber } from "@/lib/format";
import { rankByName } from "@/lib/nameSearch";

type Named = { id: string; nameAr: string; nameEn: string };
type Option = { value: string; ar: string; en: string };

export type TradeRequestInitial = {
  types: string[];
  areaIds: string[];
  compoundIds: string[];
  bedrooms: string[];
  bathrooms: string[];
  payment: string[];
  minPrice: number | null;
  maxPrice: number | null;
  description: string | null;
};

const DESCRIPTION_MAX = 500;

/** Arabic-Indic digits and separators typed into a price box still mean a number (as FilterBar). */
function parseAmount(raw: string): number | undefined {
  const western = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d]/g, "");
  if (!western) return undefined;
  const n = Number(western);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * "The unit I want in exchange", asked with the same controls as the browse filters:
 * location (type-ahead over compounds and areas), property type in its groups, bedrooms,
 * bathrooms, price range and payment — then a short description. Saving opens the chosen
 * own unit to trade and lands on the request page, which lists what already fits.
 */
export default function TradeRequestForm({
  requestId,
  initial,
  initialListingId,
  listings,
  areas,
  compounds,
  bedroomOptions,
  bathroomOptions,
  paymentOptions,
  locale,
}: {
  /** Set when editing an existing request. */
  requestId?: string;
  initial: TradeRequestInitial;
  initialListingId: string | null;
  /** The user's own listings they could give in exchange. */
  listings: { id: string; reference: string; titleAr: string | null; titleEn: string | null }[];
  areas: Named[];
  compounds: (Named & { areaId: string })[];
  bedroomOptions: Option[];
  bathroomOptions: Option[];
  paymentOptions: Option[];
  locale: Locale;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const label = (o: { ar: string; en: string }) => (ar ? o.ar : o.en);
  const name = (o: Named) => (ar ? o.nameAr : o.nameEn);

  const [listingId, setListingId] = useState(initialListingId ?? "");
  const [types, setTypes] = useState<string[]>(initial.types);
  const [areaIds, setAreaIds] = useState<string[]>(initial.areaIds);
  const [compoundIds, setCompoundIds] = useState<string[]>(initial.compoundIds);
  const [bedrooms, setBedrooms] = useState<string[]>(initial.bedrooms);
  const [bathrooms, setBathrooms] = useState<string[]>(initial.bathrooms);
  const [payment, setPayment] = useState<string[]>(initial.payment);
  const [minPrice, setMinPrice] = useState(initial.minPrice ? String(initial.minPrice) : "");
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice ? String(initial.maxPrice) : "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flip = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const compoundById = useMemo(() => new Map(compounds.map((c) => [c.id, c])), [compounds]);

  // The type-ahead: compounds first (that is what people type), then areas, each ranked
  // prefix > contains > similar spelling. Already-picked places are left out.
  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const cs = rankByName(compounds.filter((c) => !compoundIds.includes(c.id)), query, (c) => [c.nameAr, c.nameEn], 6).map((c) => ({ kind: "compound" as const, item: c }));
    const as = rankByName(areas.filter((a) => !areaIds.includes(a.id)), query, (a) => [a.nameAr, a.nameEn], 4).map((a) => ({ kind: "area" as const, item: a }));
    return [...cs, ...as];
  }, [query, compounds, areas, compoundIds, areaIds]);

  const pick = (s: (typeof suggestions)[number]) => {
    if (s.kind === "compound") setCompoundIds((l) => [...l, s.item.id]);
    else setAreaIds((l) => [...l, s.item.id]);
    setQuery("");
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(requestId ? `/api/trade/requests/${requestId}` : "/api/trade/requests", {
        method: requestId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listingId || null,
          types,
          areaIds,
          compoundIds,
          bedrooms,
          bathrooms,
          payment,
          minPrice: parseAmount(minPrice) ?? null,
          maxPrice: parseAmount(maxPrice) ?? null,
          description,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const codes: string[] = (j.errors ?? []).map((e: { code: string }) => e.code);
        setError(
          codes.includes("empty")
            ? ar ? "اختار حاجة واحدة على الأقل في الوحدة اللي عايزها (منطقة، نوع، غرف…)." : "Choose at least one thing about the unit you want (location, type, rooms…)."
            : j.error === "invalid_fields"
              ? ar ? "راجع السعر: الحد الأدنى أكبر من الأقصى أو فيه رقم مش صحيح." : "Check the price: the minimum is above the maximum, or a figure is not valid."
              : j.error === "listing_closed"
                ? ar ? "الوحدة دي محجوزة أو اتقفلت. اختار وحدة تانية." : "That unit is reserved or closed. Choose another."
                : ar ? "مقدرناش نحفظ الطلب. جرّب تاني." : "The request could not be saved. Try again.",
        );
        return;
      }
      router.push(`/dashboard/trades/request/${j.id}?saved=1`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const chip = (on: boolean) =>
    `rounded-md px-2.5 py-1.5 text-[13px] transition ${
      on ? "bg-brand-50 font-semibold text-ink-900 shadow-[inset_0_0_0_1.5px_var(--color-brand-500)]" : "bg-white text-ink-700 shadow-[inset_0_0_0_1px_#d2d2d7] hover:bg-ink-50"
    }`;

  /** FilterBar's joined pill row (Any | 1 | 2 | …), multi-select. */
  const pillRow = (title: string, options: Option[], cur: string[], set: (v: string[]) => void) => (
    <fieldset>
      <legend className="pb-2 text-[14px] font-bold text-ink-900">{title}</legend>
      {/* Wrapping buttons, not a joined segmented bar: seven nowrap segments pushed a
          390px phone 19px wide. */}
      <div className="flex flex-wrap gap-1.5">
        {[{ value: "", ar: "الكل", en: "Any" }, ...options].map((o) => {
          const on = o.value ? cur.includes(o.value) : cur.length === 0;
          return (
            <button
              key={o.value || "any"}
              type="button"
              aria-pressed={on}
              onClick={() => (o.value ? flip(cur, set, o.value) : set([]))}
              className={`${chip(on)} min-h-[40px] min-w-[3rem]`}
            >
              {label(o)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );

  const priceInput = (which: "min" | "max", value: string, set: (v: string) => void) => (
    <label className="flex-1">
      <span className="mb-1 block text-[12.5px] font-semibold text-ink-500">{which === "min" ? (ar ? "من" : "Minimum") : ar ? "إلى" : "Maximum"}</span>
      <div className="relative" dir="ltr">
        <input
          inputMode="numeric"
          value={value ? formatNumber(parseAmount(value) ?? 0, "en") : ""}
          onChange={(e) => set(e.target.value)}
          placeholder={which === "min" ? (ar ? "بدون حد أدنى" : "No min") : ar ? "بدون حد أقصى" : "No max"}
          className="tnum h-11 w-full rounded-md bg-white pe-12 ps-3 text-[15px] text-ink-900 shadow-[inset_0_0_0_1px_#d2d2d7] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
        />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-500">{ar ? "ج.م" : "EGP"}</span>
      </div>
    </label>
  );

  // Checked as you type, next to the field, rather than only after pressing save.
  const minN = parseAmount(minPrice);
  const maxN = parseAmount(maxPrice);
  const priceInvalid = minN != null && maxN != null && minN > maxN;

  const placeChips = [
    ...compoundIds.map((id) => ({ id, kind: "compound" as const, n: compoundById.get(id) })),
    ...areaIds.map((id) => ({ id, kind: "area" as const, n: areaById.get(id) })),
  ].filter((p) => p.n);

  return (
    <div className="max-w-3xl space-y-8">
      {listings.length > 0 && (
        <section>
          <label className="block">
            <span className="mb-1 block text-[14px] font-bold text-ink-900">{ar ? "هتقايض بأنهي وحدة من وحداتك؟" : "Which of your units will you trade?"}</span>
            <span className="mb-2 block text-[12.5px] muted">
              {ar ? "الوحدة دي هتتفتح للمقايضة، وهتظهر في السوق بالطلب ده." : "This unit is opened to trade and shown in the market with this request."}
            </span>
            <select className="input w-full" value={listingId} onChange={(e) => setListingId(e.target.value)}>
              <option value="">{ar ? "من غير ما أحدد دلوقتي" : "Not now"}</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.reference} · {(ar ? l.titleAr : l.titleEn) || ""}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      <section className="space-y-6">
        <div>
          <h2 className="border-b border-ink-900 pb-2 text-[16px] font-bold text-ink-900">{ar ? "الوحدة اللي عايزها" : "The unit you want"}</h2>
          <p className="mt-1 text-[12.5px] muted">
            {ar
              ? "نفس فلاتر البحث. أي حاجة مش هتحددها معناها «أي حاجة». هنوريك كل الوحدات المتاحة للمقايضة اللي بتناسبك، ونبعتلك إشعار بأي وحدة جديدة زيها."
              : "The same filters as search; anything you leave empty means “any”. We show every unit open to trade that fits, and notify you of every new one."}
          </p>
        </div>

        {/* Location: type-ahead over compounds and areas. */}
        <fieldset>
          <legend className="pb-2 text-[14px] font-bold text-ink-900">{ar ? "المنطقة والكمبوند" : "Area & compound"}</legend>
          <div className="relative">
            <div className="flex h-11 items-center rounded-md bg-white shadow-[inset_0_0_0_1px_#d2d2d7] focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-500)]">
              <Search size={16} className="ms-3 shrink-0 text-ink-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (suggestions[0]) pick(suggestions[0]);
                  }
                  if (e.key === "Escape") setQuery("");
                }}
                placeholder={ar ? "اكتب اسم الكمبوند أو المنطقة" : "Type a compound or area"}
                aria-label={ar ? "ابحث عن كمبوند أو منطقة" : "Search compounds and areas"}
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls="trade-location-suggestions"
                className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-400"
              />
            </div>
            {query.trim() && (
              <ul
                id="trade-location-suggestions"
                role="listbox"
                className="absolute inset-x-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto rounded-md bg-white py-1 shadow-[0_8px_20px_rgba(0,0,0,0.15)] ring-1 ring-black/5"
              >
                {suggestions.length === 0 ? (
                  <li className="px-4 py-3 text-[13px] muted">{ar ? "مفيش أسماء قريبة من كده." : "No similar names."}</li>
                ) : (
                  suggestions.map((s) => (
                    <li key={`${s.kind}:${s.item.id}`} role="option" aria-selected={false}>
                      <button type="button" onClick={() => pick(s)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-start hover:bg-ink-50">
                        {s.kind === "compound" ? <Building size={15} className="shrink-0 text-ink-500" /> : <MapPin size={15} className="shrink-0 text-ink-500" />}
                        <span className="min-w-0 flex-1 truncate text-[14px] text-ink-900">{name(s.item)}</span>
                        <span className="shrink-0 text-[12px] muted">
                          {s.kind === "compound"
                            ? areaById.get((s.item as Named & { areaId: string }).areaId)
                              ? name(areaById.get((s.item as Named & { areaId: string }).areaId)!)
                              : ar ? "كمبوند" : "Compound"
                            : ar ? "منطقة" : "Area"}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          {placeChips.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {placeChips.map((p) => (
                <span key={`${p.kind}:${p.id}`} className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 py-1 pe-1.5 ps-2.5 text-[13px] font-semibold text-ink-900 shadow-[inset_0_0_0_1.5px_var(--color-brand-500)]">
                  {p.kind === "compound" ? <Building size={13} /> : <MapPin size={13} />}
                  {name(p.n!)}
                  <button
                    type="button"
                    aria-label={ar ? "شيل" : "Remove"}
                    onClick={() => (p.kind === "compound" ? setCompoundIds((l) => l.filter((x) => x !== p.id)) : setAreaIds((l) => l.filter((x) => x !== p.id)))}
                    className="grid h-5 w-5 place-items-center rounded hover:bg-white"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* No typing needed for the common case: the areas, one tap each. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {areas
              .filter((a) => !areaIds.includes(a.id))
              .map((a) => (
                <button key={a.id} type="button" className={chip(false)} onClick={() => setAreaIds((l) => [...l, a.id])}>
                  + {name(a)}
                </button>
              ))}
          </div>
        </fieldset>

        {/* Property type, in the owner's groups. A group's name ticks the whole group. */}
        <fieldset>
          <legend className="pb-2 text-[14px] font-bold text-ink-900">{ar ? "نوع الوحدة" : "Property type"}</legend>
          <div className="space-y-3">
            {UNIT_TYPE_GROUPS.map((g) => {
              const all = g.types.every((t) => types.includes(t));
              return (
                <div key={g.key}>
                  <button
                    type="button"
                    aria-pressed={all}
                    onClick={() => setTypes((cur) => (all ? cur.filter((t) => !g.types.includes(t as never)) : [...new Set([...cur, ...g.types])]))}
                    className="mb-1.5 text-[12.5px] font-bold text-ink-900 hover:underline"
                  >
                    {label(g)}{all ? (ar ? " (الكل)" : " (all)") : ""}
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {g.types.map((t) => (
                      <button key={t} type="button" className={chip(types.includes(t))} aria-pressed={types.includes(t)} onClick={() => flip(types, setTypes, t)}>
                        {label(UNIT_TYPE_LABELS[t])}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>

        {pillRow(ar ? "غرف النوم" : "Bedrooms", bedroomOptions, bedrooms, setBedrooms)}
        {pillRow(ar ? "الحمامات" : "Bathrooms", bathroomOptions, bathrooms, setBathrooms)}

        <fieldset>
          <legend className="pb-2 text-[14px] font-bold text-ink-900">{ar ? "نطاق السعر" : "Price range"}</legend>
          <div className="flex items-end gap-2">
            {priceInput("min", minPrice, setMinPrice)}
            <span className="pb-3 text-ink-500">–</span>
            {priceInput("max", maxPrice, setMaxPrice)}
          </div>
          {priceInvalid && (
            <p role="alert" className="mt-1.5 text-[13px] font-semibold text-danger-700">
              {ar ? "الحد الأدنى أكبر من الأقصى." : "The minimum is above the maximum."}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="pb-2 text-[14px] font-bold text-ink-900">{ar ? "طريقة الدفع" : "Payment"}</legend>
          <div className="flex flex-wrap gap-x-5">
            {paymentOptions.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2.5 py-1.5">
                <input type="checkbox" checked={payment.includes(o.value)} onChange={() => flip(payment, setPayment, o.value)} className="h-[18px] w-[18px] shrink-0 accent-brand-500" />
                <span className="text-[14px] text-ink-900">{label(o)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-[14px] font-bold text-ink-900">{ar ? "وصف قصير (اختياري)" : "Short description (optional)"}</span>
          <textarea
            className="input min-h-[90px] w-full"
            maxLength={DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={ar ? "مثلاً: عايز دور أرضي بجنينة، وممكن أدفع فرق." : "e.g. Ground floor with a garden; I can pay a difference."}
          />
          <span className="tnum mt-1 block text-end text-[12px] muted">
            {formatNumber(description.length, locale)} / {formatNumber(DESCRIPTION_MAX, locale)}
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary min-h-[44px]" disabled={busy || priceInvalid} onClick={save}>
          {busy && <Loader2 size={15} className="animate-spin" />}
          {ar ? "احفظ ووريني الوحدات المناسبة" : "Save and show matching units"}
        </button>
        {error && <span role="alert" className="text-[13px] font-semibold text-danger-700">{error}</span>}
      </div>
    </div>
  );
}
