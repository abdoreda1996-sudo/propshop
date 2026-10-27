"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { ListingCardVM } from "@/lib/listings";
import { Locale } from "@/lib/i18n";
import { formatPriceExact } from "@/lib/format";

// Leaflet's own stylesheet. Without it the tile panes have no positioning and the map
// renders as a pile of images in the top-left corner — the classic "Leaflet looks broken"
// symptom. Imported here rather than globally so it ships only with the map view.
import "leaflet/dist/leaflet.css";

/**
 * The map view of the results.
 *
 * WHY LEAFLET IS LOADED DYNAMICALLY
 * Leaflet touches `window` at module scope, so a static import crashes server rendering.
 * The `await import()` inside the effect also keeps ~150KB of map code out of the bundle
 * for the list view, which is what most visitors use and never need it for.
 *
 * WHY PRICE PINS RATHER THAN MARKERS
 * A field of identical teardrops tells you where units are; it does not help you choose
 * between them. The price is the thing being compared, so it IS the pin — the map becomes
 * a scatter of what things cost in each spot, which is the question someone opens a map to
 * answer.
 *
 * ONE PIN PER COMPOUND. A unit's location is its compound's, so every unit in a compound
 * shares one point and separate pins would stack into one visible marker. They are
 * grouped instead: the pin shows how many units and the lowest price, and the popup lists
 * each of them.
 */
export default function ResultsMap({
  items,
  locale,
  height = 620,
}: {
  items: ListingCardVM[];
  locale: Locale;
  height?: number;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [failed, setFailed] = useState(false);
  const ar = locale === "ar";

  const pins = items.filter((i) => i.geo);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const L = await import("leaflet");
        if (cancelled || !holder.current) return;

        if (!map.current) {
          map.current = L.map(holder.current, {
            // The scroll wheel belongs to the PAGE here. A map that swallows it traps the
            // reader halfway down a results screen — the one scroll region this layout has
            // spent its whole design avoiding.
            scrollWheelZoom: false,
            attributionControl: true,
          });

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
          }).addTo(map.current);
        }

        // Rebuild the pins on every result change rather than diffing: the set is at most a
        // page of listings, and a diff here would be more code than it saves.
        for (const m of markers.current) m.remove();
        markers.current = [];

        const groups = new Map<string, ListingCardVM[]>();
        for (const item of pins) {
          const key = `${item.geo!.lat.toFixed(6)},${item.geo!.lng.toFixed(6)}`;
          const list = groups.get(key);
          if (list) list.push(item);
          else groups.set(key, [item]);
        }

        for (const group of groups.values()) {
          const first = group[0];
          const cheapest = group.reduce((a, b) => (b.price < a.price ? b : a));
          const where = escapeHtml(
            (ar ? first.compoundAr : first.compoundEn) ?? (ar ? first.areaAr : first.areaEn),
          );
          const lowest = formatPriceExact(cheapest.price, locale, cheapest.currency);
          const label =
            group.length === 1
              ? lowest
              : ar
                ? `${group.length} وحدات · من ${lowest}`
                : `${group.length} units · from ${lowest}`;
          const icon = L.divIcon({
            className: "",
            html: `<span class="map-pin">${escapeHtml(label)}</span>`,
            iconSize: [0, 0],
          });

          const rows = group
            .slice()
            .sort((a, b) => a.price - b.price)
            .map(
              (item) =>
                `<a class="map-pop" href="${item.href}">
                   <strong>${formatPriceExact(item.price, locale, item.currency)}</strong>
                   <span>${escapeHtml(ar ? item.titleAr : item.titleEn)}</span>
                 </a>`,
            )
            .join("");

          const marker = L.marker([first.geo!.lat, first.geo!.lng], { icon })
            .addTo(map.current!)
            .bindPopup(
              `<div class="map-pop-group">
                 <span class="map-pop-where">${where}</span>
                 <div style="max-height:240px;overflow-y:auto">${rows}</div>
               </div>`,
            );
          markers.current.push(marker);
        }

        if (pins.length) {
          const bounds = L.latLngBounds(pins.map((p) => [p.geo!.lat, p.geo!.lng] as [number, number]));
          map.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        } else {
          // Cairo, so an empty result set still shows a map of somewhere meaningful.
          map.current.setView([30.0444, 31.2357], 10);
        }
      } catch {
        // Tiles come from a third party; an offline or blocked network must degrade to a
        // message rather than an empty grey box the reader cannot interpret.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `pins` is derived from `items`; depending on it directly would rebuild on every render.
  }, [items, locale, ar, pins]);

  // Tear the map down only when the component itself goes away.
  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  if (failed) {
    return (
      <div
        className="grid place-items-center rounded-md border border-[var(--border)] bg-white p-10 text-center"
        style={{ height }}
      >
        <div>
          <p className="text-[15px] font-semibold text-ink-900">
            {ar ? "مش قادرين نحمّل الخريطة." : "The map could not load."}
          </p>
          <p className="mt-1.5 text-[13px] muted">
            {ar ? "الخرائط بتحتاج اتصال بالإنترنت. جرّب عرض القائمة." : "Maps need a network connection. Try the list view."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={holder}
        style={{ height }}
        className="overflow-hidden rounded-md border border-[var(--border)] bg-ink-100"
        role="application"
        aria-label={ar ? "خريطة الوحدات" : "Map of results"}
      />
      {pins.length < items.length && (
        <p className="mt-2 text-[12px] muted">
          {ar
            ? `${items.length - pins.length} وحدة من غير إحداثيات مش ظاهرة على الخريطة.`
            : `${items.length - pins.length} ${items.length - pins.length === 1 ? "home has" : "homes have"} no map position and ${items.length - pins.length === 1 ? "is" : "are"} not shown.`}
        </p>
      )}
    </div>
  );
}

/** Popups take raw HTML, and a listing title is owner-supplied text. */
function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
