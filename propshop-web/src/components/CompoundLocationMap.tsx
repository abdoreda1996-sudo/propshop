"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { Locale } from "@/lib/i18n";
import "leaflet/dist/leaflet.css";

/**
 * The unit's location, as the owner sees it in the listing wizard.
 *
 * Read-only on purpose. A unit's location IS its compound's — the server sets it from the
 * compound and ignores anything the client sends — so there is no pin to drag. The map
 * exists to show the owner what the system selected, and what their photos will be
 * checked against: the compound boundary.
 *
 * Leaflet is imported inside the effect for the same reason as in ResultsMap: it touches
 * `window` at module scope and would crash server rendering.
 */
export default function CompoundLocationMap({
  locale,
  name,
  centerLat,
  centerLng,
  geomJson,
  height = 220,
}: {
  locale: Locale;
  name: string;
  centerLat: number | null;
  centerLng: number | null;
  geomJson: string | null;
  height?: number;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const [failed, setFailed] = useState(false);
  const ar = locale === "ar";
  const located = typeof centerLat === "number" && typeof centerLng === "number";

  useEffect(() => {
    if (!located) return;
    let cancelled = false;

    (async () => {
      try {
        const L = await import("leaflet");
        if (cancelled || !holder.current) return;

        map.current?.remove();
        const m = L.map(holder.current, {
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          attributionControl: true,
        });
        map.current = m;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(m);

        const ring = parseRing(geomJson);
        if (ring) {
          const poly = L.polygon(
            ring.map(([lng, lat]) => [lat, lng] as [number, number]),
            { color: "#c24418", weight: 2, fillColor: "#c24418", fillOpacity: 0.12, interactive: false },
          ).addTo(m);
          m.fitBounds(poly.getBounds(), { padding: [16, 16], maxZoom: 16 });
        } else {
          m.setView([centerLat!, centerLng!], 15);
        }

        L.marker([centerLat!, centerLng!], {
          icon: L.divIcon({ className: "", html: `<span class="map-pin">${escapeHtml(name)}</span>`, iconSize: [0, 0] }),
          interactive: false,
          keyboard: false,
        }).addTo(m);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [located, centerLat, centerLng, geomJson, name]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  if (!located) {
    return (
      <p className="rounded-md bg-ink-50 p-3 text-[12.5px] muted">
        {ar
          ? "الكمبوند ده لسه مالوش موقع على الخريطة. فريقنا هيحدده، والإعلان هيتراجع يدوي."
          : "This compound has no map location yet. Our team will add it, and the listing will be reviewed by hand."}
      </p>
    );
  }

  return (
    <div>
      {failed ? (
        <div className="grid place-items-center rounded-md border border-[var(--border)] bg-white p-6 text-[13px] muted" style={{ height }}>
          {ar ? "مش قادرين نحمّل الخريطة." : "The map could not load."}
        </div>
      ) : (
        <div ref={holder} className="overflow-hidden rounded-md border border-[var(--border)]" style={{ height }} />
      )}
      <p className="mt-2 text-[12px] leading-relaxed muted">
        {ar
          ? `موقع الوحدة هو موقع ${name}، وبيتحدد تلقائي فمش محتاج تحدده بنفسك. صور الوحدة بتتراجع أوتوماتيك إنها متصورة جوه الكمبوند.`
          : `The unit's location is ${name}'s. It is set automatically, so there is nothing to pin. Your photos are checked automatically to confirm they were taken inside the compound.`}
      </p>
    </div>
  );
}

function parseRing(geomJson: string | null): [number, number][] | null {
  if (!geomJson) return null;
  try {
    const g = JSON.parse(geomJson) as { type?: string; coordinates?: unknown } | unknown[];
    if (!Array.isArray(g) && g?.type === "Polygon" && Array.isArray(g.coordinates)) {
      return ((g.coordinates as [number, number][][])[0] ?? null);
    }
    if (Array.isArray(g)) {
      if (Array.isArray(g[0]) && typeof (g[0] as unknown[])[0] === "number") return g as [number, number][];
      if (Array.isArray(g[0])) return ((g as [number, number][][])[0] ?? null);
    }
  } catch {
    // fall through
  }
  return null;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
