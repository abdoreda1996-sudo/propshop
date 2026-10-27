"use client";

import { useState } from "react";
import { Play, Box } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { TOUR_PROVIDER_LABELS, TourProvider, isImmersive, isSafeEmbedUrl } from "@/lib/tours";

export type PublicTour = {
  id: string;
  kind: string;
  provider: string;
  url: string;
  posterUrl: string | null;
  title: string | null;
};

/**
 * The listing page's virtual tours.
 *
 * Uploaded videos play in a plain <video> (preload="none": nothing downloads until the
 * buyer presses play). Hosted players and 3D tours are click-to-load: the third-party
 * iframe — and its scripts and cookies — only exists after the buyer asks for it, so a
 * listing page view costs no YouTube or Matterport traffic.
 */
export default function VirtualTours({ tours, fallbackPoster, locale }: { tours: PublicTour[]; fallbackPoster: string | null; locale: Locale }) {
  const ar = locale === "ar";
  if (tours.length === 0) return null;
  return (
    <section id="tour" className="mt-10 scroll-mt-24">
      <h2 className="text-[17px] font-bold text-ink-900">{ar ? "جولة افتراضية" : "Virtual tour"}</h2>
      <p className="mt-1 text-[13px] muted">
        {ar ? "اتراجعت من فريق بروب شوب قبل ما تظهر." : "Reviewed by the PropShop team before it appears."}
      </p>
      <div className={`mt-4 grid gap-4 ${tours.length > 1 ? "md:grid-cols-2" : ""}`}>
        {tours.map((t) => (
          <TourPlayer key={t.id} tour={t} fallbackPoster={fallbackPoster} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function TourPlayer({ tour, fallbackPoster, locale }: { tour: PublicTour; fallbackPoster: string | null; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const ar = locale === "ar";
  const label = TOUR_PROVIDER_LABELS[tour.provider as TourProvider]?.[locale] ?? tour.provider;
  const immersive = isImmersive(tour.provider);
  const caption = tour.title || label;

  if (tour.kind === "video") {
    return (
      <figure className="overflow-hidden rounded-md border border-[var(--border)]">
        <video
          className="aspect-video w-full bg-black"
          src={tour.url}
          poster={tour.posterUrl ?? fallbackPoster ?? undefined}
          controls
          preload="none"
          playsInline
          controlsList="nodownload"
        />
        <figcaption className="p-3 text-[13px] font-semibold text-ink-900">{caption}</figcaption>
      </figure>
    );
  }

  // Never render an iframe for a URL we would not have produced ourselves.
  if (!isSafeEmbedUrl(tour.url)) return null;

  return (
    <figure className="overflow-hidden rounded-md border border-[var(--border)]">
      <div className="relative aspect-video w-full bg-ink-900">
        {open ? (
          <iframe
            src={tour.url + (tour.provider === "youtube" || tour.provider === "vimeo" ? (tour.url.includes("?") ? "&" : "?") + "autoplay=1" : "")}
            title={caption}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; fullscreen; picture-in-picture; xr-spatial-tracking; gyroscope; accelerometer"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 text-white"
            style={fallbackPoster ? { backgroundImage: `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),url(${fallbackPoster})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            aria-label={immersive ? (ar ? `افتح ${caption}` : `Open ${caption}`) : ar ? `شغّل ${caption}` : `Play ${caption}`}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink-900 transition group-hover:bg-brand-50">
              {immersive ? <Box size={28} /> : <Play size={28} className="ms-1" />}
            </span>
            <span className="text-[14px] font-bold">
              {immersive ? (ar ? "ادخل الجولة" : "Enter the tour") : ar ? "شغّل الفيديو" : "Play video"}
            </span>
          </button>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 p-3 text-[13px]">
        <span className="font-semibold text-ink-900">{caption}</span>
        <span className="text-[12px] muted">{label}</span>
      </figcaption>
    </figure>
  );
}
