"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

/**
 * The heart. One request per page for the signed-in user's saved ids, shared by every
 * card on the page (module-level promise), then each heart toggles itself optimistically.
 * Signed out (401): the heart sends you to log in and come back.
 *
 * It sits INSIDE the card's link, so the click must not bubble into a navigation.
 */
let savedIds: Promise<Set<string> | null> | null = null;
function loadSaved(): Promise<Set<string> | null> {
  savedIds ??= fetch("/api/saved?ids=1&quiet=1")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && Array.isArray(j.ids) ? new Set<string>(j.ids) : null))
    .catch(() => null);
  return savedIds;
}

export default function SaveButton({ listingId, className = "" }: { listingId: string; className?: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // No locale prop (the cards that use this do not pass one): read it from <html lang>.
  const [ar, setAr] = useState(true);

  useEffect(() => {
    setAr(document.documentElement.lang !== "en");
    let live = true;
    loadSaved().then((set) => {
      if (!live) return;
      setSignedIn(set !== null);
      setSaved(!!set?.has(listingId));
    });
    return () => {
      live = false;
    };
  }, [listingId]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (signedIn === false) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const next = !saved;
    setSaved(next);
    const res = await fetch(next ? "/api/saved" : `/api/saved?listingId=${encodeURIComponent(listingId)}`, {
      method: next ? "POST" : "DELETE",
      headers: next ? { "Content-Type": "application/json" } : undefined,
      body: next ? JSON.stringify({ listingId }) : undefined,
    }).catch(() => null);
    if (!res?.ok) {
      setSaved(!next); // roll back
      return;
    }
    // Keep the shared set honest for other cards of the same listing on the page.
    const set = await loadSaved();
    if (set) {
      if (next) set.add(listingId);
      else set.delete(listingId);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? (ar ? "شيلها من المحفوظات" : "Remove from saved") : ar ? "احفظ الوحدة" : "Save"}
      className={`shrink-0 rounded-full p-1 transition hover:bg-ink-50 ${saved ? "text-accent-500" : "text-ink-400"} ${className}`}
    >
      <Heart size={18} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}
