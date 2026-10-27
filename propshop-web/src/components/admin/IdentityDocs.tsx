/* eslint-disable @next/next/no-img-element -- private, auth-gated images: not for next/image's public optimiser */
import { Locale } from "@/lib/i18n";
import { parseJson } from "@/lib/json";
import { formatDate } from "@/lib/format";
import { ID_DOC_TYPES, MANUAL_REVIEW_LABELS, isStoredKycKey, kycReviewState } from "@/lib/kyc";
import IdentityReviewActions from "./IdentityReviewActions";

export type IdentityDocRow = {
  id: string;
  userId: string;
  type: string;
  status: string;
  fileKey: string;
  extractedJson: string | null;
  rejectReason: string | null;
  createdAt: Date;
};

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  id_front: { ar: "وش البطاقة", en: "ID front" },
  id_back: { ar: "ضهر البطاقة", en: "ID back" },
  selfie: { ar: "سيلفي", en: "Selfie" },
};

const STATUS_LABELS: Record<string, { ar: string; en: string; cls: string }> = {
  pending: { ar: "مستني", en: "Pending", cls: "badge-neutral" },
  approved: { ar: "معتمد", en: "Approved", cls: "badge-verified" },
  rejected: { ar: "مرفوض", en: "Rejected", cls: "badge-above" },
};

/**
 * One account's identity photos (front, back, selfie) for the verification team, with
 * the automatic check's findings next to each. The images come from
 * /api/admin/kyc/[id]/file, which re-checks the viewer's role and hands out a short-lived
 * signed URL — the page itself never embeds one.
 */
export default function IdentityDocs({
  docs,
  hasIdHash,
  locale,
  canDecide,
}: {
  docs: IdentityDocRow[];
  hasIdHash: boolean;
  locale: Locale;
  canDecide: boolean;
}) {
  const ar = locale === "ar";
  return (
    <div>
      {!hasIdHash && (
        <div className="mb-3 border-s-2 border-danger-600 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
          <span>
            {ar
              ? "مافيش رقم قومي متسجل للحساب ده (البطاقة ماتقرتش آلياً)، فرقم مستند الملكية مش هيتطابق آلياً. قارن بنفسك من الصور."
              : "No ID number on file for this account (the card was not machine-read), so the ownership document's ID number cannot be matched automatically. Compare by eye from the photos."}
          </span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {ID_DOC_TYPES.map((type) => {
          const d = docs.find((x) => x.type === type);
          const label = TYPE_LABELS[type][locale];
          if (!d) {
            return (
              <div key={type} className="rounded-md border border-dashed border-[var(--border)] p-3 text-[12px] muted">
                {label} · {ar ? "مااترفعش" : "not uploaded"}
              </div>
            );
          }
          const extracted = parseJson<Record<string, unknown>>(d.extractedJson, {});
          const state = kycReviewState(extracted);
          const stored = isStoredKycKey(d.userId, d.fileKey);
          const status = STATUS_LABELS[d.status] ?? STATUS_LABELS.pending;
          const flagged = state.manualReview && d.status === "pending";
          return (
            <div
              key={type}
              className={`rounded-md border p-3 ${flagged ? "border-accent-500" : "border-[var(--border)]"}`}
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-bold text-ink-900">{label}</span>
                <span className={`badge ${status.cls}`}>{ar ? status.ar : status.en}</span>
              </div>
              {stored ? (
                <a href={`/api/admin/kyc/${d.id}/file`} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                  <img
                    src={`/api/admin/kyc/${d.id}/file`}
                    alt={label}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-[4/3] w-full rounded-md bg-ink-100 object-contain"
                  />
                </a>
              ) : (
                <div className="mt-2 flex aspect-[4/3] w-full items-center justify-center rounded-md bg-ink-100 p-2 text-center text-[12px] muted">
                  {ar ? "الصورة مش متخزنة (اترفعت قبل ما نحفظ الصور)" : "Photo not stored (uploaded before photos were kept)"}
                </div>
              )}
              {flagged && (
                <p className="mt-2 border-s-2 border-accent-500 ps-2 text-[12px] font-semibold text-accent-700">
                  {ar ? "مراجعة يدوية: " : "Manual review: "}
                  {state.reason ? MANUAL_REVIEW_LABELS[state.reason][locale] : ar ? "مطلوبة" : "required"}
                </p>
              )}
              <dl className="mt-2 space-y-0.5 text-[12px]">
                {typeof extracted.fullName === "string" && extracted.fullName && (
                  <div>
                    <dt className="inline muted">{ar ? "الاسم المقروء: " : "Name read: "}</dt>
                    <dd className="inline text-ink-900">{extracted.fullName}</dd>
                  </div>
                )}
                {state.typedIdLast4 && (
                  <div>
                    <dt className="inline muted">{ar ? "آخر 4 أرقام كتبها: " : "Typed ID ends: "}</dt>
                    <dd className="tnum inline text-ink-900" dir="ltr">…{state.typedIdLast4}</dd>
                  </div>
                )}
                {typeof extracted.legibilityNotes === "string" && extracted.legibilityNotes && (
                  <div className="muted">{extracted.legibilityNotes}</div>
                )}
                {d.rejectReason && <div className="text-danger-700">{d.rejectReason}</div>}
                <div className="muted">{formatDate(d.createdAt, locale)}</div>
              </dl>
              {canDecide && d.status === "pending" && (
                <IdentityReviewActions docId={d.id} locale={locale} needsNumber={type === "id_front" && !hasIdHash} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
