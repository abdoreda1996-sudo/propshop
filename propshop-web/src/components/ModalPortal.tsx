"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders a dialog at the end of <body> instead of where its button sits.
 *
 * `fixed inset-0 z-50` is NOT enough on its own. The buy-box on the listing page is
 * `lg:sticky`, and a sticky element opens its own stacking context: a z-50 overlay inside
 * it only outranks siblings in that aside, so the z-40 site header painted on top of the
 * dialog and hid its top edge. Any ancestor with a transform, filter or backdrop-filter
 * does worse — it becomes the containing block and the "fixed" overlay shrinks to it.
 * A portal sidesteps every such ancestor, present or future.
 *
 * Also locks page scroll while open, so on a phone scrolling the slot list does not
 * scroll the page behind it.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Every dialog opens from a click, so this never renders during SSR — the guard is only
  // there so a future default-open dialog degrades to nothing instead of crashing.
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}
