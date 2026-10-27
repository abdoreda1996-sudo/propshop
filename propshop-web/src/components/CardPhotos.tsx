"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A result card's photos, browsable in place (owner, 2026-10-24): swipe on a phone, arrows
 * on hover with a mouse, without opening the listing.
 *
 * A horizontal scroll-snap strip rather than a JS slider: the browser does the swiping,
 * momentum and RTL direction, and every slide is a plain link to the listing, so a tap
 * still opens it. The arrows only scroll the strip by one slide.
 *
 * Every image is `loading="lazy"` inside a scroller, so the extra photos are fetched when
 * they scroll into view, not with the results page.
 */
export default function CardPhotos({
  photos,
  href,
  alt,
  ar,
  className = "",
  children,
}: {
  photos: string[];
  /** Omit when the whole card is already a link: slides then render as plain boxes. */
  href?: string;
  alt: string;
  ar: boolean;
  className?: string;
  /** Overlays (badges, counters) drawn over the strip. */
  children?: React.ReactNode;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (e: React.MouseEvent, step: number) => {
    // Inside a card that is itself a link, an arrow must not also open the listing.
    e.preventDefault();
    e.stopPropagation();
    const el = strip.current;
    if (!el) return;
    const next = Math.max(0, Math.min(photos.length - 1, index + step));
    // scrollLeft is negative in RTL in every current engine, so scroll by the slide's own offset.
    (el.children[next] as HTMLElement | undefined)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  const onScroll = () => {
    const el = strip.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  };

  if (!photos.length) {
    return (
      <div className={`relative bg-ink-100 ${className}`}>
        <div className="absolute inset-0 grid place-items-center text-[12px] text-ink-500">
          {ar ? "بدون صورة" : "No photo"}
        </div>
        {children}
      </div>
    );
  }

  // Shown on hover and on keyboard focus (opacity rather than display, so the buttons stay
  // focusable); left out on touch screens, where the strip is swiped.
  const arrow =
    "absolute top-1/2 z-[2] grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white text-ink-900 opacity-0 shadow-sm transition hover:bg-white group-hover:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:hidden";
  // In RTL the "previous" slide is on the right, so the icons swap with the direction.
  const PrevIcon = ar ? ChevronRight : ChevronLeft;
  const NextIcon = ar ? ChevronLeft : ChevronRight;

  return (
    <div className={`group relative overflow-hidden bg-ink-100 ${className}`}>
      <div
        ref={strip}
        onScroll={onScroll}
        className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((src, i) => {
          // eslint-disable-next-line @next/next/no-img-element
          const img = <img src={src} alt={i === 0 ? alt : ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />;
          const cls = "relative h-full w-full shrink-0 snap-start";
          return href ? (
            <Link key={src + i} href={href} className={cls} tabIndex={i === 0 ? 0 : -1}>
              {img}
            </Link>
          ) : (
            <div key={src + i} className={cls}>
              {img}
            </div>
          );
        })}
      </div>

      {photos.length > 1 && (
        <>
          {index > 0 && (
            <button type="button" onClick={(e) => go(e, -1)} aria-label={ar ? "الصورة السابقة" : "Previous photo"} className={`${arrow} start-2`}>
              <PrevIcon size={18} />
            </button>
          )}
          {index < photos.length - 1 && (
            <button type="button" onClick={(e) => go(e, 1)} aria-label={ar ? "الصورة التالية" : "Next photo"} className={`${arrow} end-2`}>
              <NextIcon size={18} />
            </button>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[2] flex justify-center gap-1">
            {photos.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
      {children}
    </div>
  );
}
