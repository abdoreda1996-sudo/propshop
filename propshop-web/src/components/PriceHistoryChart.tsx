"use client";

import { Locale } from "@/lib/i18n";
import { formatPriceExact, formatDate } from "@/lib/format";

type Point = { price: number; at: string; kind: string };

/**
 * Price history is a trust signal, not a sales tool (Section 11) — so it is a plain,
 * honest line with every change labelled, including increases.
 */
export default function PriceHistoryChart({
  points,
  locale,
  currency,
}: {
  points: Point[];
  locale: Locale;
  currency: string;
}) {
  const ar = locale === "ar";
  if (points.length < 2) return null;

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(1, max - min);

  const w = 600;
  const h = 140;
  const pad = 12;
  // Time runs with the reading direction: left-to-right in English, right-to-left in
  // Arabic. An SVG always draws from x=0 on the left, so in RTL the position is mirrored.
  const rtl = locale === "ar";
  const x = (i: number) => {
    const t = points.length > 1 ? i / (points.length - 1) : 0;
    return pad + (rtl ? 1 - t : t) * (w - pad * 2);
  };
  const y = (p: number) => h - pad - ((p - min) / range) * (h - pad * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
  const first = points[0].price;
  const last = points[points.length - 1].price;
  const changePct = ((last - first) / first) * 100;

  return (
    <div className="mt-3 max-w-[44rem]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] muted">
          {ar ? "التغير منذ النشر" : "Change since listing"}
        </span>
        <span
          dir="ltr"
          className={`tnum text-[15px] font-bold ${changePct < 0 ? "text-ok-700" : changePct > 0 ? "text-danger-700" : "text-ink-900"}`}
        >
          {changePct > 0 ? "+" : ""}
          {changePct.toFixed(1)}%
        </span>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full border-y border-[var(--border)]" role="img" aria-label={ar ? "تاريخ السعر" : "Price history"}>
        <path d={path} fill="none" stroke="#1d1d1f" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.price)}
            r="4"
            fill={p.kind === "closed" ? "#1a7f37" : "#fff"}
            stroke={p.kind === "closed" ? "#1a7f37" : "#1d1d1f"}
            strokeWidth="2"
          />
        ))}
      </svg>

      <ul className="mt-3 space-y-1.5">
        {points.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="muted">
              {formatDate(p.at, locale)}
              {p.kind === "closed" && (
                <span className="ms-2 font-semibold text-ok-700">{ar ? "سعر التعاقد" : "Closed price"}</span>
              )}
            </span>
            <span className="tnum font-semibold text-ink-900">{formatPriceExact(p.price, locale, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
