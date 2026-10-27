"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Locale } from "@/lib/i18n";
import ModalPortal from "./ModalPortal";
import { ROOM_LABELS, Room } from "@/lib/enums";

type Media = {
  id: string;
  fileKey: string;
  thumbKey: string | null;
  room: string | null;
  source: string;
  gpsLat: number | null;
  capturedAt: Date | string | null;
};

export default function Gallery({ media, title, locale }: { media: Media[]; title: string; locale: Locale }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  // Phone strip: which photo is showing, for the "2 / 6" counter.
  const [shown, setShown] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);
  const ar = locale === "ar";

  // Keyboard: Escape closes, the arrow keys move in the direction they point.
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? null : (i + (ar ? 1 : -1) + media.length) % media.length));
      else if (e.key === "ArrowRight") setLightbox((i) => (i === null ? null : (i + (ar ? -1 : 1) + media.length) % media.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, ar, media.length]);

  if (media.length === 0) return null;

  const [hero, ...rest] = media;
  const thumbs = rest.slice(0, 4);
  const extra = media.length - thumbs.length - 1;

  const step = (delta: number) => {
    setLightbox((i) => (i === null ? null : (i + delta + media.length) % media.length));
  };

  const sourceLabel =
    hero.source === "photographer"
      ? ar
        ? "تصوير مصوّر بروب شوب"
        : "Shot by our photographer"
      : ar
        ? "متصورة داخل التطبيق"
        : "Captured in-app";

  return (
    <>
      {/*
        Phones: every photo in a swipeable strip (scroll-snap, so the browser handles
        momentum and RTL), with a counter. A tap opens the full-screen viewer.
      */}
      <div className="relative mt-3 sm:hidden">
        <div
          ref={strip}
          onScroll={() => {
            const el = strip.current;
            if (el?.clientWidth) setShown(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
          }}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setLightbox(i)}
              className="media-frame aspect-[4/3] w-full shrink-0 snap-start"
              aria-label={ar ? `افتح الصورة ${i + 1}` : `Open photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={i === 0 ? m.fileKey : (m.thumbKey ?? m.fileKey)}
                alt={i === 0 ? title : roomLabel(m.room, locale)}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute bottom-2.5 start-2.5 rounded bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-ink-900">
          {sourceLabel}
        </span>
        {media.length > 1 && (
          <span dir="ltr" className="tnum pointer-events-none absolute bottom-2.5 end-2.5 rounded bg-ink-900/75 px-2 py-0.5 text-[12px] font-semibold text-white">
            {Math.min(shown + 1, media.length)} / {media.length}
          </span>
        )}
      </div>

      {/*
        Four columns by two rows: the hero occupies the left half (2x2) and the four
        thumbnails fill the right half as a 2x2 block. Declaring only two rows while
        rendering four thumbnails would spill them into implicit rows 3 and 4, leaving
        the row-spanning hero half the height of the grid.
      */}
      <div className="mt-4 hidden gap-2 sm:grid sm:grid-cols-4 sm:grid-rows-2">
        <button
          type="button"
          onClick={() => setLightbox(0)}
          className="media-frame rounded-md sm:col-span-2 sm:row-span-2"
          aria-label={ar ? "افتح الصور" : "Open photos"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.fileKey} alt={title} className="h-full w-full object-cover" />
          <span className="absolute bottom-2.5 start-2.5 rounded bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-ink-900">
            {sourceLabel}
          </span>
        </button>

        {thumbs.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setLightbox(i + 1)}
            className="media-frame hidden aspect-[4/3] rounded-md sm:block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.thumbKey ?? m.fileKey} alt={roomLabel(m.room, locale)} className="h-full w-full object-cover" />
            {i === thumbs.length - 1 && extra > 0 && (
              <span
                dir="ltr"
                className="absolute inset-0 flex items-center justify-center bg-ink-900/55 text-[15px] font-bold text-white"
              >
                +{extra}
              </span>
            )}
          </button>
        ))}
      </div>

      {lightbox !== null && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink-900/95"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(null)}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-sm font-semibold">
              {roomLabel(media[lightbox].room, locale)}
              <span dir="ltr" className="tnum ms-3 inline-block opacity-70">
                {lightbox + 1} / {media.length}
              </span>
            </span>
            <button type="button" onClick={() => setLightbox(null)} aria-label={ar ? "إغلاق" : "Close"} className="-m-2 p-2">
              <X size={22} />
            </button>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center px-2 pb-8 sm:px-4"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              const start = touchX.current;
              touchX.current = null;
              if (start === null) return;
              const dx = e.changedTouches[0].clientX - start;
              // A swipe towards the start of the reading direction shows the next photo.
              if (Math.abs(dx) > 40) step((dx < 0) !== ar ? 1 : -1);
            }}
          >
            <button
              type="button"
              onClick={() => step(ar ? 1 : -1)}
              className="shrink-0 p-3 text-white/70 hover:text-white"
              aria-label={ar ? "التالي" : "Previous"}
            >
              <ChevronLeft size={30} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media[lightbox].fileKey}
              alt={title}
              className="max-h-[80vh] min-w-0 max-w-full object-contain"
            />
            <button
              type="button"
              onClick={() => step(ar ? -1 : 1)}
              className="shrink-0 p-3 text-white/70 hover:text-white"
              aria-label={ar ? "السابق" : "Next"}
            >
              <ChevronRight size={30} />
            </button>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}

function roomLabel(room: string | null, locale: Locale): string {
  if (!room) return "";
  return ROOM_LABELS[room as Room]?.[locale] ?? room;
}
