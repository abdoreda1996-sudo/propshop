"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { Facet, Selection } from "@/lib/facets";
import { formatNumber } from "@/lib/format";
import { Locale, unitsLabel } from "@/lib/i18n";
import { UNIT_TYPE_GROUPS } from "@/lib/enums";

/**
 * The search bar above the results, in Zillow's shape (owner, 2026-10-20): one row holding
 * a search field, a rounded dropdown button per question, and one solid action at the end.
 * It replaced the left-hand filter rail.
 *
 * Zillow's DESIGN, our filters and our palette. A button that is filtering takes the light
 * forest fill and a 2px forest ring (Zillow's blue, in our action colour) and says what it
 * is filtering by, so the row reads as a summary of the search without opening anything.
 *
 * Each panel works on a DRAFT and only touches the URL on Apply, as Zillow's do: ticking
 * five compounds should be one navigation, not five re-renders under the cursor. Clicking
 * outside or Escape discards the draft.
 *
 * The URL stays the single source of truth, so every view is still linkable and walkable
 * with the back button. `page` is always dropped on a change — page 7 of the old result set
 * is usually empty.
 *
 * Panels are positioned against the WHOLE BAR rather than inside their button: on a phone
 * the button row scrolls sideways, and a scrolling container clips anything absolutely
 * positioned inside it.
 */

type PanelKey = "purpose" | "price" | "location" | "rooms" | "type" | "more";

// Payment moved into the Price panel (owner, 2026-10-24).
const MORE_KEYS = ["segment", "delivery", "finishing"] as const;

/** Cash vs instalments in the Price panel. "Instalments" also covers resale-with-instalments. */
const PAYMENT_CHOICES = [
  { key: "cash", values: ["cash"], ar: "كاش", en: "Cash" },
  { key: "installments", values: ["installments", "resale_installments"], ar: "تقسيط", en: "Installments" },
] as const;

/** Labels short enough to sit inside a pill in both languages; the facet's own is the long form. */
const PILL_LABELS: Record<string, Record<string, { ar: string; en: string }>> = {
  beds: {
    "0": { ar: "استوديو", en: "Studio" },
    "1": { ar: "1", en: "1" },
    "2": { ar: "2", en: "2" },
    "3": { ar: "3", en: "3" },
    "4": { ar: "4", en: "4" },
    "5": { ar: "5+", en: "5+" },
  },
  baths: {
    "1": { ar: "1", en: "1" },
    "2": { ar: "2", en: "2" },
    "3": { ar: "3", en: "3" },
    "4": { ar: "4+", en: "4+" },
  },
};

/**
 * Loose name match for suggestions: case, Arabic alef/yaa/taa-marbuta forms and spacing do
 * not matter, so "ميفيدا", "mivida" and "Mi Vida" all find the same compound.
 */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s\-_'’.]/g, "");
}

/** Arabic-Indic digits and separators typed into a price box still mean a number. */
function parseAmount(raw: string): number | undefined {
  const western = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d]/g, "");
  if (!western) return undefined;
  const n = Number(western);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export default function FilterBar({
  facets,
  selection,
  minPrice,
  maxPrice,
  q,
  locale,
}: {
  /** Every facet the page filters by, hidden ones included (they are read, not drawn). */
  facets: Facet[];
  selection: Selection;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState<PanelKey | null>(null);
  const [draft, setDraft] = useState<Selection>(selection);
  const [priceDraft, setPriceDraft] = useState({ min: "", max: "" });
  const [query, setQuery] = useState(q ?? "");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [compoundQuery, setCompoundQuery] = useState("");
  const [panelLeft, setPanelLeft] = useState(0);

  const barRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<PanelKey, HTMLButtonElement | null>>>({});

  const facet = (key: string) => facets.find((f) => f.key === key);
  const label = (f: { ar: string; en: string }) => (ar ? f.ar : f.en);
  const picked = (key: string) => selection[key] ?? [];

  /** Short money for a button, where a full figure will not fit. */
  const short = (n: number) => {
    if (n >= 1_000_000) return `${formatNumber(Math.round((n / 1_000_000) * 10) / 10, locale)}${ar ? " مليون" : "M"}`;
    if (n >= 1_000) return `${formatNumber(Math.round(n / 1_000), locale)}${ar ? " ألف" : "K"}`;
    return formatNumber(n, locale);
  };

  function navigate(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    next.delete("page");
    setOpen(null);
    startTransition(() => router.push(next.size ? `${pathname}?${next}` : pathname, { scroll: false }));
  }

  function toggle(key: PanelKey) {
    if (open === key) {
      setOpen(null);
      return;
    }
    // Every open starts from what the URL says now, never from an abandoned draft.
    setDraft(selection);
    setPriceDraft({
      min: minPrice ? String(minPrice) : "",
      max: maxPrice ? String(maxPrice) : "",
    });
    setCompoundQuery("");
    setDraftCount(null);
    setOpen(key);
  }

  // Place the panel under its button, clamped so it never leaves the bar.
  useLayoutEffect(() => {
    if (!open) return;
    const bar = barRef.current;
    const btn = buttonRefs.current[open];
    const panel = panelRef.current;
    if (!bar || !btn || !panel) return;
    const b = bar.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const width = panel.offsetWidth;
    const start = ar ? r.right - b.left - width : r.left - b.left;
    setPanelLeft(Math.max(0, Math.min(start, b.width - width)));
  }, [open, ar]);

  // Click outside or Escape closes, discarding the draft.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (Object.values(buttonRefs.current).some((b) => b?.contains(target))) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        buttonRefs.current[open]?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* ── Applying drafts ──────────────────────────────────────────────────── */

  const groupMutation = (keys: readonly string[]) => (next: URLSearchParams) => {
    for (const key of keys) {
      next.delete(key);
      for (const v of draft[key] ?? []) next.append(key, v);
    }
  };

  const priceMutation = () => {
    let lo = parseAmount(priceDraft.min);
    let hi = parseAmount(priceDraft.max);
    // A reversed pair is a typo, not a request for nothing.
    if (lo !== undefined && hi !== undefined && lo > hi) [lo, hi] = [hi, lo];
    return (next: URLSearchParams) => {
      next.delete("minPrice");
      next.delete("maxPrice");
      if (lo !== undefined) next.set("minPrice", String(lo));
      if (hi !== undefined) next.set("maxPrice", String(hi));
      next.delete("payment");
      for (const v of draft.payment ?? []) next.append("payment", v);
    };
  };

  const applyGroups = (keys: readonly string[]) => navigate(groupMutation(keys));
  const applyPrice = () => navigate(priceMutation());

  /** What Apply would do for the open panel, so the count can be fetched before applying. */
  const draftMutation = (): ((next: URLSearchParams) => void) | null => {
    switch (open) {
      case "price":
        return priceMutation();
      case "location":
        return groupMutation(["area", "compound"]);
      case "rooms":
        return groupMutation(["beds", "baths"]);
      case "type":
        return groupMutation(["type"]);
      case "more":
        return groupMutation([...MORE_KEYS, "over"]);
      default:
        return null;
    }
  };

  /*
    The Apply button says how many homes it will show ("Show 42 homes"), so nobody applies
    a combination that returns nothing. One small request per draft change, debounced, to
    the same listings API the app uses (it takes the website's filter names).
  */
  const [draftCount, setDraftCount] = useState<number | null>(null);
  useEffect(() => {
    const mutate = draftMutation();
    if (!mutate) return;
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    for (const k of ["page", "view", "sort"]) next.delete(k);
    next.set("perPage", "1");
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/listings?${next}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setDraftCount(typeof j?.total === "number" ? j.total : null))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, priceDraft]);

  const choosePurpose = (trade: boolean) =>
    navigate((next) => {
      next.delete("purpose");
      next.delete("trade");
      // Trade units are priced against what they trade for, so a buy ceiling would empty them.
      next.delete("minPrice");
      next.delete("maxPrice");
      if (trade) next.set("trade", "open");
    });

  /* ── Name suggestions ─────────────────────────────────────────────────── */

  type Place = { key: "area" | "compound"; value: string; ar: string; en: string };
  const places: Place[] = (["area", "compound"] as const).flatMap((key) =>
    (facet(key)?.options ?? []).map((o) => ({ key, value: o.value, ar: o.ar, en: o.en })),
  );
  const matches = (text: string, o: { ar: string; en: string }) => {
    const n = normalise(text);
    return !n || normalise(o.ar).includes(n) || normalise(o.en).includes(n);
  };
  const suggestions = query.trim() ? places.filter((p) => matches(query, p)).slice(0, 8) : [];

  /** A picked suggestion filters by that place exactly, rather than as free text. */
  const pickPlace = (p: Place) => {
    setQuery("");
    setSuggestOpen(false);
    navigate((next) => {
      next.delete("q");
      if (!next.getAll(p.key).includes(p.value)) next.append(p.key, p.value);
    });
  };

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (!suggestOpen || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
    }
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestOpen && suggestIndex >= 0 && suggestions[suggestIndex]) {
      pickPlace(suggestions[suggestIndex]);
      return;
    }
    setSuggestOpen(false);
    navigate((next) => {
      if (query.trim()) next.set("q", query.trim());
      else next.delete("q");
    });
  };

  const resetAll = () =>
    navigate((next) => {
      for (const f of facets) if (f.key !== "purpose" && f.key !== "trade") next.delete(f.key);
      next.delete("minPrice");
      next.delete("maxPrice");
      next.delete("q");
    });

  const flip = (key: string, value: string) =>
    setDraft((d) => {
      const cur = d[key] ?? [];
      return { ...d, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });

  /* ── Button captions ──────────────────────────────────────────────────── */

  const trading = picked("trade").includes("open");

  const pickedPayment = PAYMENT_CHOICES.filter((c) => c.values.some((v) => picked("payment").includes(v)));
  const paymentCaption = pickedPayment.length === 1 ? ` · ${label(pickedPayment[0])}` : "";
  const priceCaption =
    (minPrice && maxPrice
      ? `${short(minPrice)} – ${short(maxPrice)}`
      : maxPrice
        ? ar ? `حتى ${short(maxPrice)}` : `Up to ${short(maxPrice)}`
        : minPrice
          ? ar ? `من ${short(minPrice)}` : `${short(minPrice)}+`
          : ar ? "السعر" : "Price") + paymentCaption;

  /** "Villa" for one pick, "Villa +2" for more, the group's name for none. */
  const groupCaption = (keys: string[], fallback: string) => {
    const all = keys.flatMap((k) =>
      picked(k).map((v) => facet(k)?.options.find((o) => o.value === v)).filter((o) => !!o),
    );
    if (!all.length) return fallback;
    return all.length === 1 ? label(all[0]!) : `${label(all[0]!)} +${formatNumber(all.length - 1, locale)}`;
  };

  const locationCaption = groupCaption(["area", "compound"], ar ? "المنطقة" : "Location");
  const typeCaption = groupCaption(["type"], ar ? "نوع الوحدة" : "Property type");
  const roomsCount = picked("beds").length + picked("baths").length;
  const roomsCaption = roomsCount
    ? groupCaption(["beds", "baths"], "")
    : ar ? "الغرف والحمامات" : "Beds & baths";
  const moreCount = MORE_KEYS.filter((k) => picked(k).length).length + (picked("over").length ? 1 : 0);

  const buttons: { key: PanelKey; caption: string; active: boolean; icon?: boolean; wide?: boolean }[] = [
    { key: "purpose", caption: trading ? (ar ? "مقايضة" : "Trade") : ar ? "للبيع" : "For sale", active: trading },
    { key: "price", caption: priceCaption, active: !!(minPrice || maxPrice) || picked("payment").length > 0, wide: true },
    { key: "location", caption: locationCaption, active: picked("area").length + picked("compound").length > 0 },
    { key: "rooms", caption: roomsCaption, active: roomsCount > 0 },
    { key: "type", caption: typeCaption, active: picked("type").length > 0 },
    {
      key: "more",
      caption: moreCount ? `${ar ? "فلاتر" : "Filters"} (${formatNumber(moreCount, locale)})` : ar ? "فلاتر" : "Filters",
      active: moreCount > 0,
      icon: true,
    },
  ];

  /* ── Panel pieces ─────────────────────────────────────────────────────── */

  const checkList = (key: string, columns = 1) => {
    const f = facet(key);
    if (!f) return null;
    return (
      <fieldset className="px-4 pt-4">
        <legend className="pb-2 text-[14px] font-bold text-ink-900">{label(f)}</legend>
        <div className={columns === 2 ? "grid grid-cols-2 gap-x-3" : "flex flex-col"}>
          {f.options.map((o) => {
            const on = (draft[key] ?? []).includes(o.value);
            return (
              <label key={o.value} className="flex min-w-0 cursor-pointer items-center gap-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => flip(key, o.value)}
                  className="h-[18px] w-[18px] shrink-0 accent-brand-500"
                />
                <span className="truncate text-[14px] text-ink-900">{label(o)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  };

  /** Zillow's joined pill row (Any | 1 | 2 | …), multi-select to match our facets. */
  const pillRow = (key: string) => {
    const f = facet(key);
    if (!f) return null;
    const cur = draft[key] ?? [];
    const pills = [{ value: "", ar: "الكل", en: "Any" }, ...f.options];
    return (
      <fieldset className="px-4 pt-4">
        <legend className="pb-2 text-[14px] font-bold text-ink-900">{label(f)}</legend>
        {/* One row of equal cells; the short labels are what make them fit on a phone. */}
        <div className="flex">
          {pills.map((o) => {
            const on = o.value ? cur.includes(o.value) : cur.length === 0;
            return (
              <button
                key={o.value || "any"}
                type="button"
                aria-pressed={on}
                onClick={() => (o.value ? flip(key, o.value) : setDraft((d) => ({ ...d, [key]: [] })))}
                className={`-ms-px h-10 min-w-0 flex-1 whitespace-nowrap px-1 text-[13px] transition first:ms-0 first:rounded-s-md last:rounded-e-md ${
                  on
                    ? "relative z-[1] bg-brand-50 font-semibold text-ink-900 shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
                    : "bg-white text-ink-900 shadow-[inset_0_0_0_1px_var(--color-navy-300)] hover:bg-ink-50"
                }`}
              >
                {label(PILL_LABELS[key]?.[o.value] ?? o)}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  };

  /** Property type in the owner's sections: Villas / Apartments / Commercial. */
  const typeSections = () => {
    const f = facet("type");
    if (!f) return null;
    return UNIT_TYPE_GROUPS.map((g) => {
      const options = g.types.map((t) => f.options.find((o) => o.value === t)).filter((o) => !!o);
      const types = options.map((o) => o!.value);
      const cur = draft.type ?? [];
      const all = types.length > 0 && types.every((t) => cur.includes(t));
      return (
        <fieldset key={g.key} className="px-4 pt-4">
          <legend className="flex w-full items-center justify-between pb-2">
            <span className="text-[14px] font-bold text-ink-900">{label(g)}</span>
            <button
              type="button"
              onClick={() =>
                setDraft((d) => {
                  const rest = (d.type ?? []).filter((t) => !types.includes(t));
                  return { ...d, type: all ? rest : [...rest, ...types] };
                })
              }
              className="text-[12.5px] font-semibold text-brand-500 hover:underline"
            >
              {all ? (ar ? "إلغاء الكل" : "Clear") : ar ? "الكل" : "All"}
            </button>
          </legend>
          <div className="grid grid-cols-2 gap-x-3">
            {options.map((o) => (
              <label key={o!.value} className="flex min-w-0 cursor-pointer items-center gap-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={cur.includes(o!.value)}
                  onChange={() => flip("type", o!.value)}
                  className="h-[18px] w-[18px] shrink-0 accent-brand-500"
                />
                <span className="truncate text-[14px] text-ink-900">{label(o!)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );
    });
  };

  /** Compounds, found by typing: picked ones stay on top, the rest narrow as you type. */
  const compoundPicker = () => {
    const f = facet("compound");
    if (!f) return null;
    const cur = draft.compound ?? [];
    const chosen = f.options.filter((o) => cur.includes(o.value));
    const found = f.options
      .filter((o) => !cur.includes(o.value) && matches(compoundQuery, o))
      .slice(0, compoundQuery ? 30 : 12);
    return (
      <fieldset className="px-4 pt-4">
        <legend className="pb-2 text-[14px] font-bold text-ink-900">{label(f)}</legend>
        <div className="flex h-11 items-center gap-2 rounded-md bg-white px-3 shadow-[inset_0_0_0_1px_var(--color-navy-300)] focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-500)]">
          <Search size={15} className="shrink-0 text-ink-400" />
          <input
            value={compoundQuery}
            onChange={(e) => setCompoundQuery(e.target.value)}
            placeholder={ar ? "اكتب اسم الكمبوند" : "Type a compound name"}
            aria-label={ar ? "ابحث عن كمبوند" : "Search compounds"}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink-900 outline-none placeholder:text-ink-500"
          />
          {compoundQuery && (
            <button type="button" onClick={() => setCompoundQuery("")} aria-label={ar ? "مسح" : "Clear"} className="text-ink-400 hover:text-ink-900">
              <X size={15} />
            </button>
          )}
        </div>
        {chosen.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chosen.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => flip("compound", o.value)}
                className="flex items-center gap-1 rounded-sm bg-brand-50 px-2 py-1 text-[12.5px] font-semibold text-ink-900 shadow-[inset_0_0_0_1px_var(--color-brand-500)]"
              >
                {label(o)}
                <X size={12} />
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-col">
          {found.map((o) => (
            <label key={o.value} className="flex min-w-0 cursor-pointer items-center gap-2.5 py-1.5">
              <input
                type="checkbox"
                checked={false}
                onChange={() => flip("compound", o.value)}
                className="h-[18px] w-[18px] shrink-0 accent-brand-500"
              />
              <span className="truncate text-[14px] text-ink-900">{label(o)}</span>
            </label>
          ))}
          {compoundQuery && !found.length && (
            <p className="py-2 text-[13px] text-ink-500">{ar ? "مفيش كمبوند بالاسم ده" : "No compound by that name"}</p>
          )}
        </div>
      </fieldset>
    );
  };

  const applyButton = (onApply: () => void, withReset = false) => (
    <div className="sticky bottom-0 flex items-center gap-4 border-t border-[var(--border)] bg-white p-4">
      {withReset && (
        <button type="button" onClick={resetAll} className="whitespace-nowrap text-[14px] font-semibold text-brand-500 hover:underline">
          {ar ? "مسح كل الفلاتر" : "Reset all filters"}
        </button>
      )}
      <button
        type="button"
        onClick={onApply}
        className="btn btn-primary h-12 flex-1 text-[15px]"
      >
        {draftCount === null
          ? ar ? "اعرض النتايج" : "Show results"
          : draftCount === 0
            ? ar ? "مفيش وحدات بالاختيار ده" : "No homes match"
            : ar
              ? `اعرض ${formatNumber(draftCount, locale)} ${unitsLabel(draftCount, locale)}`
              : `Show ${formatNumber(draftCount, locale)} ${draftCount === 1 ? "home" : "homes"}`}
      </button>
    </div>
  );

  const header = (text: string) => (
    <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-[var(--border)] bg-white px-4 py-2">
      <h3 className="text-[15px] font-semibold text-ink-900">{text}</h3>
      <button
        type="button"
        onClick={() => setOpen(null)}
        aria-label={ar ? "اقفل" : "Close"}
        className="-me-2 grid h-11 w-11 place-items-center rounded-md text-ink-500 hover:bg-ink-50 hover:text-ink-900"
      >
        <X size={18} />
      </button>
    </div>
  );

  const priceInput = (which: "min" | "max") => (
    <label className="flex-1">
      <span className="mb-1 block text-[12.5px] font-semibold text-ink-500">
        {which === "min" ? (ar ? "من" : "Minimum") : ar ? "إلى" : "Maximum"}
      </span>
      {/* Figures read left to right in both languages, so the currency tag sits on the right. */}
      <div className="relative" dir="ltr">
        <input
          inputMode="numeric"
          value={priceDraft[which] ? formatNumber(parseAmount(priceDraft[which]) ?? 0, "en") : ""}
          onChange={(e) => setPriceDraft((p) => ({ ...p, [which]: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && applyPrice()}
          placeholder={which === "min" ? (ar ? "بدون حد أدنى" : "No min") : ar ? "بدون حد أقصى" : "No max"}
          className="h-12 w-full rounded-md bg-white pe-12 ps-3 text-[15px] text-ink-900 shadow-[inset_0_0_0_1px_var(--color-navy-300)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
        />
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-500">
          {ar ? "ج.م" : "EGP"}
        </span>
      </div>
    </label>
  );

  const PRICE_PRESETS = [3_000_000, 5_000_000, 8_000_000, 12_000_000, 20_000_000];

  const panelBody = () => {
    switch (open) {
      case "purpose":
        return (
          <>
            {header(ar ? "نوع العرض" : "Listing type")}
            <div role="radiogroup" className="flex flex-col p-4">
              {[
                { trade: false, ar: "للبيع", en: "For sale" },
                { trade: true, ar: "مقايضة", en: "Trade" },
              ].map((o) => (
                <label key={o.en} className="flex cursor-pointer items-center gap-3 py-2">
                  <input
                    type="radio"
                    name="purpose"
                    checked={trading === o.trade}
                    onChange={() => choosePurpose(o.trade)}
                    className="h-[18px] w-[18px] accent-brand-500"
                  />
                  <span className="text-[15px] text-ink-900">{label(o)}</span>
                </label>
              ))}
              {/* A lister who wants to trade says what they want once, and gets matches + alerts. */}
              <Link
                href="/dashboard/trades/request/new"
                className="mt-2 border-t border-[var(--border)] pt-3 text-[13.5px] font-semibold text-brand-500 underline-offset-4 hover:underline"
              >
                {ar ? "اعمل طلب مقايضة بوحدتك" : "Create a trade request for your unit"}
              </Link>
            </div>
          </>
        );
      case "price":
        return (
          <>
            {header(ar ? "نطاق السعر" : "Price range")}
            <div className="p-4">
              <div className="flex items-end gap-2">
                {priceInput("min")}
                <span className="pb-3 text-ink-400">–</span>
                {priceInput("max")}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {PRICE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriceDraft((d) => ({ ...d, max: String(p) }))}
                    className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition ${
                      parseAmount(priceDraft.max) === p
                        ? "bg-brand-50 text-brand-500 shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
                        : "text-ink-700 shadow-[inset_0_0_0_1px_var(--color-navy-300)] hover:bg-ink-50"
                    }`}
                  >
                    {ar ? `حتى ${short(p)}` : `Up to ${short(p)}`}
                  </button>
                ))}
              </div>
            </div>
            <fieldset className="px-4 pb-4">
              <legend className="pb-2 text-[14px] font-bold text-ink-900">{ar ? "طريقة الدفع" : "Payment"}</legend>
              <div className="flex gap-2">
                {PAYMENT_CHOICES.map((c) => {
                  const cur = draft.payment ?? [];
                  const on = c.values.some((v) => cur.includes(v));
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setDraft((d) => {
                          const rest = (d.payment ?? []).filter((v) => !(c.values as readonly string[]).includes(v));
                          return { ...d, payment: on ? rest : [...rest, ...c.values] };
                        })
                      }
                      className={`h-10 flex-1 rounded-md text-[14px] font-semibold transition ${
                        on
                          ? "bg-brand-50 text-ink-900 shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
                          : "bg-white text-ink-900 shadow-[inset_0_0_0_1px_var(--color-navy-300)] hover:bg-ink-50"
                      }`}
                    >
                      {label(c)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {applyButton(applyPrice)}
          </>
        );
      case "location":
        return (
          <>
            {header(ar ? "المنطقة والكمبوند" : "Area & compound")}
            {checkList("area", 2)}
            {compoundPicker()}
            <div className="h-3" />
            {applyButton(() => applyGroups(["area", "compound"]))}
          </>
        );
      case "rooms":
        return (
          <>
            {header(ar ? "الغرف والحمامات" : "Beds & baths")}
            {pillRow("beds")}
            {pillRow("baths")}
            <div className="h-4" />
            {applyButton(() => applyGroups(["beds", "baths"]))}
          </>
        );
      case "type":
        return (
          <>
            {header(ar ? "نوع الوحدة" : "Property type")}
            {typeSections()}
            <div className="h-3" />
            {applyButton(() => applyGroups(["type"]))}
          </>
        );
      case "more":
        return (
          <>
            {header(ar ? "فلاتر أكتر" : "More filters")}
            <label className="mx-4 mt-4 flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={(draft.over ?? []).includes("none")}
                onChange={() => flip("over", "none")}
                className="h-[18px] w-[18px] accent-accent-500"
              />
              <span className="text-[14px] font-semibold text-accent-600">
                {ar ? "وحدات بدون أوفر برايس" : "Units without over price"}
              </span>
            </label>
            {MORE_KEYS.map((k) => (
              <div key={k}>{checkList(k, 2)}</div>
            ))}
            <div className="h-3" />
            {applyButton(() => applyGroups([...MORE_KEYS, "over"]), true)}
          </>
        );
      default:
        return null;
    }
  };

  const panelWidth = open === "location" || open === "more" ? "w-[min(440px,100%)]" : "w-[min(372px,100%)]";

  return (
    <div ref={barRef} className={`relative mb-4 transition-opacity ${pending ? "opacity-70" : ""}`}>
      {/* Phones: the field gets a row of its own and the buttons swipe beneath it, edge to
          edge. From sm up it is Zillow's single row. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* The field takes whatever width the buttons leave, and never less than a word. */}
        <form
          onSubmit={submitSearch}
          className="relative flex h-11 items-center sm:h-10 sm:min-w-[13rem] sm:flex-1 rounded-md bg-white shadow-[inset_0_0_0_1px_var(--color-navy-300)] focus-within:shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
        >
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSuggestOpen(true);
              setSuggestIndex(-1);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setSuggestOpen(false)}
            onKeyDown={onSearchKey}
            placeholder={ar ? "كمبوند، منطقة أو كلمة" : "Compound, area or keyword"}
            aria-label={ar ? "بحث" : "Search"}
            role="combobox"
            aria-expanded={suggestOpen && suggestions.length > 0}
            aria-controls="filter-suggestions"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent ps-3.5 text-[14px] text-ink-900 outline-none placeholder:text-ink-500"
          />
          <button type="submit" aria-label={ar ? "ابحث" : "Submit search"} className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink-900 hover:bg-ink-50 sm:h-10 sm:w-10">
            <Search size={17} strokeWidth={2.5} />
          </button>

          {suggestOpen && suggestions.length > 0 && (
            <ul
              id="filter-suggestions"
              role="listbox"
              className="absolute inset-x-0 top-[calc(100%+4px)] z-40 overflow-hidden rounded-md bg-white py-1 shadow-[0_6px_16px_rgba(0,0,0,0.10)] ring-1 ring-black/10"
            >
              {suggestions.map((p, i) => (
                <li key={p.key + p.value} role="option" aria-selected={i === suggestIndex}>
                  <button
                    type="button"
                    // pointerdown + preventDefault: picks before the input's blur closes the list.
                    onPointerDown={(e) => {
                      e.preventDefault();
                      pickPlace(p);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-start text-[14px] text-ink-900 ${i === suggestIndex ? "bg-ink-50" : "hover:bg-ink-50"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{label(p)}</span>
                    <span className="shrink-0 text-[12px] text-ink-500">
                      {p.key === "compound" ? (ar ? "كمبوند" : "Compound") : ar ? "منطقة" : "Area"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {buttons.map((b) => {
            const isOpen = open === b.key;
            return (
              <button
                key={b.key}
                ref={(el) => {
                  buttonRefs.current[b.key] = el;
                }}
                type="button"
                onClick={() => toggle(b.key)}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                className={`flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 text-[14px] font-semibold text-ink-900 transition sm:h-10 ${
                  b.wide ? "md:min-w-[8.5rem]" : ""
                } ${
                  b.active || isOpen
                    ? "bg-brand-50 shadow-[inset_0_0_0_2px_var(--color-brand-500)]"
                    : "bg-white shadow-[inset_0_0_0_1px_var(--color-navy-300)] hover:bg-ink-50"
                }`}
              >
                {b.icon && <SlidersHorizontal size={15} />}
                <span className="max-w-[12rem] truncate">{b.caption}</span>
                <ChevronDown size={16} strokeWidth={2.5} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
            );
          })}

          {/* Zillow's "Save search", as what we offer instead: tell us what you want and an
              advisor finds it. */}
          <Link
            href="/request"
            className="flex h-11 shrink-0 items-center whitespace-nowrap px-2 text-[14px] font-semibold text-brand-500 underline-offset-4 hover:underline sm:h-10"
          >
            {ar ? "مش لاقي؟ اطلب وحدة" : "Not here? Request a unit"}
          </Link>
        </div>
      </div>

      {/* Phones: the panel is a bottom sheet over a dimmed page, so it can be used with one
          thumb and the Apply button sits at the bottom edge. From sm up it drops down under
          its button. */}
      {open && <div aria-hidden className="fixed inset-0 z-[55] bg-black/30 sm:hidden" />}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={buttons.find((b) => b.key === open)?.caption}
          style={{ left: panelLeft }}
          className={`z-[60] flex flex-col overflow-y-auto bg-white max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:!left-0 max-sm:max-h-[85vh] max-sm:w-full max-sm:rounded-t-lg sm:absolute sm:top-[calc(100%+4px)] sm:z-30 sm:max-h-[min(540px,72vh)] sm:rounded-md sm:shadow-[0_6px_16px_rgba(0,0,0,0.10)] sm:ring-1 sm:ring-black/10 ${panelWidth}`}
        >
          {panelBody()}
        </div>
      )}
    </div>
  );
}
