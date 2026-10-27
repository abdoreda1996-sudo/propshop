"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Locale } from "@/lib/i18n";

/** Pause/resume a trade request's notifications, or delete it. */
export default function TradeRequestActions({ id, active, locale }: { id: string; active: boolean; locale: Locale }) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<"toggle" | "delete" | null>(null);

  async function toggle() {
    setBusy("toggle");
    try {
      await fetch(`/api/trade/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(ar ? "تمسح طلب المقايضة ده؟" : "Delete this trade request?")) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/trade/requests/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard/trades");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn btn-ghost text-[13px]" disabled={!!busy} onClick={toggle}>
        {busy === "toggle" && <Loader2 size={14} className="animate-spin" />}
        {active ? (ar ? "وقّف الإشعارات" : "Pause notifications") : ar ? "شغّل الإشعارات" : "Resume notifications"}
      </button>
      <button type="button" className="btn btn-ghost text-[13px] text-danger-600" disabled={!!busy} onClick={remove}>
        {busy === "delete" && <Loader2 size={14} className="animate-spin" />}
        {ar ? "امسح" : "Delete"}
      </button>
    </div>
  );
}
