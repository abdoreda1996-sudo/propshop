/* eslint-disable @next/next/no-img-element -- private, auth-gated images: not for next/image's public optimiser */
import { Locale } from "@/lib/i18n";
import { OWNERSHIP_REVIEW_LABELS, OwnershipReviewReason, ownershipPageKeys } from "@/lib/kyc";

/**
 * The stored pages of a listing's ownership document, for the verification team. The
 * images come from /api/admin/kyc/[id]/file?page=N, which re-checks the viewer's role and
 * hands out a short-lived signed URL; the page never embeds one.
 *
 * When the document was not machine-read the comparison table next to it is empty, so the
 * flag says plainly that approving the listing means the reviewer compared it by eye.
 */
export default function OwnershipDocPages({
  doc,
  extracted,
  locale,
}: {
  doc: { id: string; userId: string; listingId: string | null; fileKey: string; status: string };
  extracted: Record<string, unknown>;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const pages = ownershipPageKeys(doc, extracted);
  const reason =
    typeof extracted.manualReviewReason === "string" && extracted.manualReviewReason in OWNERSHIP_REVIEW_LABELS
      ? (extracted.manualReviewReason as OwnershipReviewReason)
      : null;
  const manual = extracted.manualReview === true && doc.status === "pending";

  return (
    <div className="mt-2">
      {manual && (
        <p className="mb-3 border-s-2 border-accent-500 ps-3 text-[13px] text-ink-900">
          <span className="font-semibold text-accent-700">
            {ar ? "مراجعة يدوية: " : "Manual review: "}
            {reason ? OWNERSHIP_REVIEW_LABELS[reason][locale] : ar ? "مطلوبة" : "required"}.
          </span>{" "}
          {ar
            ? "مفيش قراءة آلية تتقارن، فالبوابة ماقارنتش الاسم ولا بيانات الوحدة. قارن الصفحات بالبيانات اللي تحت قبل ما تعتمد."
            : "There is no automatic reading, so the gate did not compare the name or the unit details. Compare the pages with the details below before you approve."}
        </p>
      )}
      {pages.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pages.map((_, i) => {
            const src = `/api/admin/kyc/${doc.id}/file?page=${i}`;
            const label = ar ? `صفحة ${i + 1}` : `Page ${i + 1}`;
            return (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="block w-40 shrink-0">
                <img
                  src={src}
                  alt={label}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="aspect-[3/4] w-full rounded-md border border-[var(--border)] bg-ink-100 object-contain"
                />
                <span className="tnum mt-1 block text-[12px] muted">{label}</span>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-[12px] muted">
          {ar ? "صفحات المستند مش متخزنة (اترفع قبل ما نحفظ المستندات)." : "Document pages not stored (uploaded before documents were kept)."}
        </p>
      )}
    </div>
  );
}
