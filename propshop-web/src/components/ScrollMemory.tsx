"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/*
  Set when the browser's back/forward buttons fire, so only a return trip restores the
  position. A fresh visit to the same URL starts at the top.
*/
let cameBack = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    cameBack = true;
  });
}

/**
 * Puts the results list back where you left it when you come back from a listing.
 *
 * The results page is rendered on the server on every visit, so by the time it arrives
 * the router's own scroll restoration has already run against a shorter page and lands
 * part-way up. This remembers the position per URL (filters included) in sessionStorage
 * and re-applies it once the page has rendered.
 */
export default function ScrollMemory() {
  const pathname = usePathname();
  const params = useSearchParams();
  const key = `scroll:${pathname}?${params.toString()}`;

  useEffect(() => {
    if (cameBack) {
      let y = 0;
      try {
        y = Number(sessionStorage.getItem(key)) || 0;
      } catch {}
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
    }
    cameBack = false;

    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(key, String(Math.round(window.scrollY)));
        } catch {}
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
    };
  }, [key]);

  return null;
}
