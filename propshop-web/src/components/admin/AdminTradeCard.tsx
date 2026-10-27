"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { TRADE_STAGES, TRADE_STAGE_LABELS, TradeStage } from "@/lib/trade";
import { roleLabel } from "@/components/admin/labels";

export type AdminTrade = {
  id: string;
  reference: string;
  status: string; // effective
  stage: string | null;
  cancelReason: string | null;
  createdAt: string;
  expiresAt: string;
  cashAmount: number;
  cashPayer: string | null;
  /** Success fee per side, fixed at acceptance (null before). */
  proposerFee: number | null;
  recipientFee: number | null;
  target: { id: string; reference: string; title: string; price: number };
  units: { id: string; reference: string; title: string; price: number }[];
  proposer: { name: string; phone: string; ref: number | null };
  recipient: { name: string; phone: string; ref: number | null };
  phonesVisible: boolean;
  assignedStaffId: string | null;
  notes: { id: string; body: string; author: string; createdAt: string }[];
};

const STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  pending: { ar: "مستني رد المالك", en: "Awaiting owner", tone: "badge-neutral" },
  accepted: { ar: "اتقبلت", en: "Accepted", tone: "badge-verified" },
  rejected: { ar: "اترفضت", en: "Declined", tone: "badge-above" },
  withdrawn: { ar: "اتسحبت", en: "Withdrawn", tone: "badge-neutral" },
  expired: { ar: "انتهت مدتها", en: "Expired", tone: "badge-neutral" },
  cancelled: { ar: "اتلغت", en: "Cancelled", tone: "badge-above" },
};
const ERRORS: Record<string, { ar: string; en: string }> = {
  stage_invalid: { ar: "مينفعش ترجع لمرحلة قبلها.", en: "Stages only move forward." },
  cannot_cancel: { ar: "المقايضة دي مش ممكن تتلغي.", en: "This trade cannot be cancelled." },
  reason_required: { ar: "اكتب سبب الإلغاء.", en: "Enter a reason." },
  staff_invalid: { ar: "الشخص ده مش من الفريق.", en: "Not assignable staff." },
};

const egp = (n: number, ar: boolean) => `${Math.round(n).toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-US")} ${ar ? "ج.م" : "EGP"}`;

function Party({ label, p, visible }: { label: string; p: AdminTrade["proposer"]; visible: boolean }) {
  return (
    <div className="rounded-md bg-ink-50 p-3 text-[13px]">
      <div className="text-[12px] font-bold muted">{label}</div>
      <div className="font-semibold text-ink-900">
        {p.name} {p.ref && <span className="tnum muted">#{p.ref}</span>}
      </div>
      {visible ? (
        <a href={`tel:${p.phone}`} dir="ltr" className="tnum inline-flex items-center gap-1 text-navy-700 hover:underline">
          {p.phone}
        </a>
      ) : (
        <span dir="ltr" className="tnum inline-flex items-center gap-1 muted">
          {p.phone}
        </span>
      )}
    </div>
  );
}

export default function AdminTradeCard({
  trade: t,
  staff,
  locale,
}: {
  trade: AdminTrade;
  staff: { id: string; fullName: string; role: string }[];
  locale: Locale;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  async function call(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/trades/${t.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(ERRORS[j.error]?.[locale] ?? j.error ?? "error");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  const st = STATUS[t.status] ?? { ar: t.status, en: t.status, tone: "badge-neutral" };
  const offeredValue = t.units.reduce((s, u) => s + u.price, 0);
  const cash =
    t.cashAmount > 0
      ? `${egp(t.cashAmount, ar)}, ${t.cashPayer === "proposer" ? (ar ? "يدفعها صاحب العرض" : "paid by proposer") : ar ? "يدفعها المالك" : "paid by owner"}`
      : ar ? "من غير فرق فلوس" : "no cash difference";
  const stageIdx = TRADE_STAGES.indexOf((t.stage ?? "") as TradeStage);
  const inProgress = t.status === "accepted" && t.stage !== "completed";

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tnum text-[15px] font-bold text-ink-900">{t.reference}</span>
        <span className={`badge ${st.tone}`}>{st[locale]}</span>
        {t.stage && <span className="badge badge-neutral">{TRADE_STAGE_LABELS[t.stage as TradeStage]?.[locale] ?? t.stage}</span>}
        <span className="ms-auto text-[12px] muted">{new Date(t.createdAt).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-GB")}</span>
      </div>

      {/* The swap */}
      <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-md border border-[var(--border)] p-3">
          <div className="text-[12px] font-bold muted">{ar ? "المعروض" : "Offered"}</div>
          {t.units.map((u) => (
            <Link key={u.id} href={`/admin/listings/${u.id}`} className="mt-1 block truncate font-semibold text-ink-900 hover:underline">
              <span className="tnum">{u.reference}</span> · {u.title} <span className="tnum font-normal muted">· {egp(u.price, ar)}</span>
            </Link>
          ))}
          <div className="tnum mt-1.5 text-[12px] text-navy-700">{t.cashAmount > 0 ? `+ ${cash}` : cash}</div>
        </div>
        <Repeat size={18} className="mx-auto text-ink-500" />
        <div className="rounded-md border border-[var(--border)] p-3">
          <div className="text-[12px] font-bold muted">{ar ? "مقابل" : "For"}</div>
          <Link href={`/admin/listings/${t.target.id}`} className="mt-1 block truncate font-semibold text-ink-900 hover:underline">
            <span className="tnum">{t.target.reference}</span> · {t.target.title} <span className="tnum font-normal muted">· {egp(t.target.price, ar)}</span>
          </Link>
          <div className="tnum mt-1.5 text-[12px] muted">
            {ar ? "فرق القيمة المطلوبة" : "Asking-price gap"}: {egp(Math.abs(t.target.price - offeredValue), ar)}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Party label={ar ? "صاحب العرض" : "Proposer"} p={t.proposer} visible={t.phonesVisible} />
        <Party label={ar ? "المالك" : "Owner"} p={t.recipient} visible={t.phonesVisible} />
      </div>
      {t.proposerFee != null && t.recipientFee != null && (
        <p className="tnum mt-2 text-[12px] text-ink-900">
          {ar ? "رسم النجاح" : "Success fee"}: {ar ? "صاحب العرض" : "proposer"} <b>{egp(t.proposerFee, ar)}</b> · {ar ? "المالك" : "owner"}:{" "}
          <b>{egp(t.recipientFee, ar)}</b> <span className="muted">({ar ? "كل طرف حسب الوحدة اللي بياخدها" : "each by the unit received"})</span>
        </p>
      )}
      {!t.phonesVisible && <p className="mt-1.5 text-[12px] muted">{ar ? "الأرقام بتظهر لما المقايضة تتسند ليك." : "Numbers show once the trade is assigned to you."}</p>}
      {t.cancelReason && <p className="mt-2 text-[12.5px] text-danger-700">{ar ? "سبب الإلغاء" : "Cancelled"}: {t.cancelReason}</p>}

      {/* Stage stepper for accepted trades */}
      {t.status === "accepted" && (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <div className="text-[12.5px] font-bold text-navy-700">{ar ? "مراحل التنفيذ" : "Progress"}</div>
          <ol className="mt-2 flex flex-wrap gap-2">
            {TRADE_STAGES.map((s, i) => {
              const done = i <= stageIdx;
              const next = i > stageIdx;
              return (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!next || busy !== null}
                    onClick={() => call(`stage:${s}`, { action: "stage", stage: s })}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                      done ? "border-ok-700 bg-ok-50 text-ok-700" : "border-[var(--border)] text-ink-700 hover:border-navy-300"
                    }`}
                  >
                    {busy === `stage:${s}` && <Loader2 size={12} className="me-1 inline animate-spin" />}
                    {done ? "✓ " : ""}
                    {TRADE_STAGE_LABELS[s][locale]}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-1.5 text-[12px] muted">
            {ar ? "اضغط على المرحلة اللي وصلتلها. «تمت» بتعلّم كل الوحدات إنها اتباعت بالمقايضة." : "Click the stage reached. “Completed” marks every unit sold (traded)."}
          </p>
        </div>
      )}

      {inProgress && (
        <div className="mt-3">
          {cancelling ? (
            <div className="flex flex-wrap items-center gap-2">
              <input className="input w-auto min-w-[240px] flex-1 text-[13px]" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={ar ? "سبب الإلغاء (مطلوب)" : "Reason (required)"} />
              <button type="button" className="btn btn-primary text-[13px]" disabled={busy !== null || !reason.trim()} onClick={() => call("cancel", { action: "cancel", reason })}>
                {busy === "cancel" && <Loader2 size={13} className="animate-spin" />}
                {ar ? "ألغي المقايضة" : "Cancel trade"}
              </button>
              <button type="button" className="btn btn-ghost text-[13px]" onClick={() => setCancelling(false)}>{ar ? "رجوع" : "Back"}</button>
              <p className="w-full text-[12px] muted">{ar ? "الوحدات هترجع للسوق تلقائياً لو مدة إعلانها لسه سارية." : "Units go back on the market automatically if their listing period is still running."}</p>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost text-[13px] text-danger-700" onClick={() => setCancelling(true)}>
              {ar ? "إلغاء المقايضة" : "Cancel trade"}
            </button>
          )}
        </div>
      )}

      {/* Assign */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-bold text-navy-700">{ar ? "مسندة لـ" : "Assigned to"}</span>
        <select className="input w-auto" value={t.assignedStaffId ?? ""} disabled={busy !== null} onChange={(e) => call("assign", { action: "assign", staffId: e.target.value || null })}>
          <option value="">{ar ? "محدش" : "Nobody"}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} ({roleLabel(s.role, locale)})
            </option>
          ))}
        </select>
        {busy === "assign" && <Loader2 size={14} className="animate-spin" />}
      </div>

      {error && <p className="mt-3 rounded-md bg-danger-50 p-3 text-[13px] font-semibold text-danger-700">{error}</p>}

      {/* Notes */}
      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <div className="flex items-center gap-2 text-[13px] font-bold text-navy-700">
          {ar ? "ملاحظات داخلية (للفريق بس)" : "Internal notes (staff only)"}
        </div>
        <div className="mt-2 flex gap-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className="input min-h-[44px] flex-1" />
          <button type="button" className="btn btn-ghost self-start" disabled={busy !== null || !note.trim()} onClick={() => call("note", { action: "note", body: note }).then((ok) => ok && setNote(""))}>
            {busy === "note" && <Loader2 size={13} className="animate-spin" />}
            {ar ? "أضف" : "Add"}
          </button>
        </div>
        {t.notes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {t.notes.map((n) => (
              <li key={n.id} className="border-s-2 border-ink-200 py-0.5 ps-3 text-[13px]">
                <p className="whitespace-pre-wrap text-ink-900">{n.body}</p>
                <p className="mt-1 text-[12px] muted">
                  {n.author} · {new Date(n.createdAt).toLocaleString(ar ? "ar-EG-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: "Africa/Cairo" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
