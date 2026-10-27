"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { roleLabel } from "@/components/admin/labels";

/**
 * Bulk selection for the back-office queues: a checkbox per item, "select all on this
 * page", and an action bar that appears once something is selected.
 *
 * The page stays a server component; only these islands are client-side. Every action is
 * sent to POST /api/admin/bulk, which runs the SAME per-item rules as the single-item
 * buttons and reports what it skipped and why — a bulk approve never publishes a listing
 * that fails its own gate.
 */

type Ctx = { ids: string[]; selected: Set<string>; toggle: (id: string) => void; setAll: (on: boolean) => void; clear: () => void };
const BulkCtx = createContext<Ctx | null>(null);

export function BulkProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setAll = (on: boolean) => setSelected(on ? new Set(ids) : new Set());
  return <BulkCtx.Provider value={{ ids, selected, toggle, setAll, clear: () => setSelected(new Set()) }}>{children}</BulkCtx.Provider>;
}

function useBulk() {
  const c = useContext(BulkCtx);
  if (!c) throw new Error("Bulk components must be inside <BulkProvider>");
  return c;
}

export function BulkCheckbox({ id, label }: { id: string; label?: string }) {
  const { selected, toggle } = useBulk();
  return (
    <input
      type="checkbox"
      className="h-4 w-4 shrink-0 cursor-pointer accent-[#0f3d2e]"
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      aria-label={label ?? "Select"}
    />
  );
}

export function BulkSelectAll({ locale }: { locale: Locale }) {
  const { ids, selected, setAll } = useBulk();
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = !all && ids.some((id) => selected.has(id));
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-900">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[#0f3d2e]"
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = some;
        }}
        onChange={(e) => setAll(e.target.checked)}
      />
      {locale === "ar" ? "اختار كل الصفحة" : "Select all on this page"}
    </label>
  );
}

export type BulkAction = { key: string; label: string; needsReason?: boolean; danger?: boolean };

const SKIP_REASONS: Record<string, { ar: string; en: string }> = {
  not_found: { ar: "مش موجود", en: "not found" },
  forbidden: { ar: "مش مسموح", en: "not allowed" },
  validation_failed: { ar: "مش عادّي فحوصات النشر", en: "fails the publish checks" },
  invalid_transition: { ar: "الحالة مش بتسمح", en: "status does not allow it" },
  already_resolved: { ar: "اتحلّ قبل كده", en: "already resolved" },
  already_blocked: { ar: "موقوف بالفعل", en: "already blocked" },
  not_blocked: { ar: "مش موقوف", en: "not blocked" },
  cannot_block_admin: { ar: "أدمن", en: "is an admin" },
  cannot_block_self: { ar: "ده إنت", en: "is you" },
};

export function BulkBar({
  entity,
  actions,
  staff,
  assignLabel,
  locale,
}: {
  entity: "listing" | "request" | "viewing" | "trade" | "report" | "user" | "booking";
  actions: BulkAction[];
  /** Offer "assign to" when given. */
  staff?: { id: string; fullName: string; role: string }[];
  assignLabel?: string;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const router = useRouter();
  const { selected, clear } = useBulk();
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<BulkAction | null>(null);
  const [reason, setReason] = useState("");
  const [assignee, setAssignee] = useState("");
  const [result, setResult] = useState<string | null>(null);

  async function run(action: string, params: Record<string, unknown> = {}) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, action, ids: [...selected], params }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(j.error === "forbidden" ? (ar ? "مش مسموحلك بالإجراء ده." : "You are not allowed to do that.") : j.error ?? "error");
        return;
      }
      const skipped: { id: string; reason: string }[] = j.skipped ?? [];
      const why = [...new Set(skipped.map((s) => SKIP_REASONS[s.reason]?.[ar ? "ar" : "en"] ?? s.reason))].join("، ");
      setResult(
        ar
          ? `اتنفّذ على ${j.done}${skipped.length ? `، واتسابت ${skipped.length} (${why})` : ""}`
          : `Done for ${j.done}${skipped.length ? `, skipped ${skipped.length} (${why})` : ""}`,
      );
      clear();
      setReasonFor(null);
      setReason("");
      router.refresh();
    } catch {
      setResult(ar ? "مشكلة في الاتصال، جرّب تاني." : "Connection problem, try again.");
    } finally {
      setBusy(false);
    }
  }

  if (selected.size === 0) {
    return result ? <p className="mt-3 border-s-2 border-ink-900 bg-ink-50 px-3 py-2 text-[13px] text-ink-900">{result}</p> : null;
  }

  return (
    <div className="sticky top-[68px] z-20 mt-3 flex flex-wrap items-center gap-2 rounded-md border border-ink-900 bg-white p-2.5 shadow-[0_6px_16px_rgba(0,0,0,0.08)]">
      <span className="tnum px-1 text-[13px] font-semibold text-ink-900">
        {ar ? `${selected.size} محدد` : `${selected.size} selected`}
      </span>
      {reasonFor && !reasonFor.needsReason ? (
        <>
          <span className="text-[13px] text-ink-900">
            {ar ? `${reasonFor.label} لـ ${selected.size}؟` : `${reasonFor.label} for ${selected.size}?`}
          </span>
          <button type="button" className="btn btn-primary px-3 py-1.5 text-[13px]" disabled={busy} onClick={() => run(reasonFor.key)}>
            {busy && <Loader2 size={13} className="animate-spin" />}
            {ar ? "أيوه، نفّذ" : "Yes, do it"}
          </button>
          <button type="button" className="btn btn-ghost px-3 py-1.5 text-[13px]" disabled={busy} onClick={() => setReasonFor(null)}>
            {ar ? "رجوع" : "Back"}
          </button>
        </>
      ) : reasonFor ? (
        <>
          <input
            autoFocus
            className="input min-w-[220px] flex-1 text-[13px]"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder={ar ? "السبب (مطلوب)" : "Reason (required)"}
          />
          <button type="button" className="btn btn-primary text-[13px]" disabled={busy || !reason.trim()} onClick={() => run(reasonFor.key, { reason })}>
            {busy && <Loader2 size={13} className="animate-spin" />}
            {reasonFor.label}
          </button>
          <button type="button" className="btn btn-ghost text-[13px]" onClick={() => setReasonFor(null)}>
            {ar ? "رجوع" : "Back"}
          </button>
        </>
      ) : (
        <>
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={busy}
              // Anything destructive asks first; a reason doubles as the confirmation.
              onClick={() => (a.needsReason || a.danger ? setReasonFor(a) : run(a.key))}
              className={`btn px-3 py-1.5 text-[13px] ${a.danger ? "btn-ghost text-danger-700" : "btn-ghost"}`}
            >
              {a.label}
            </button>
          ))}
          {staff && (
            <span className="flex items-center gap-1.5">
                            <select className="input w-auto text-[13px]" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label={assignLabel}>
                <option value="">{assignLabel ?? (ar ? "أسند لـ…" : "Assign to…")}</option>
                <option value="none">{ar ? "شيل الإسناد" : "Unassign"}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({roleLabel(s.role, locale)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary text-[13px]"
                disabled={busy || !assignee}
                onClick={() => run("assign", { staffId: assignee === "none" ? null : assignee })}
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                {ar ? "أسند" : "Assign"}
              </button>
            </span>
          )}
        </>
      )}
      <button type="button" className="ms-auto p-1 text-ink-500 hover:text-ink-900" onClick={clear} aria-label={ar ? "إلغاء التحديد" : "Clear selection"}>
        <X size={16} />
      </button>
      {result && <p role="status" className="w-full text-[13px] font-semibold text-danger-700">{result}</p>}
    </div>
  );
}
