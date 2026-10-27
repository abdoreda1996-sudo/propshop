import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { TRUST, TRUST_LABELS } from "@/lib/enums";
import { isClaudeConfigured } from "@/lib/claude";
import VerifyIdentityForm from "@/components/VerifyIdentityForm";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "توثيق الهوية", en: "Verify your identity" });
}
export const dynamic = "force-dynamic";

/**
 * KYC level 1 (Section 5): national ID front/back plus a liveness selfie, name matched
 * against the ID. Level 2 (ownership) happens per-listing inside the listing wizard,
 * because the document is about a specific unit.
 */
export default async function VerifyPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";

  const docs = await prisma.kycDocument.findMany({
    where: { userId: session.id, type: { in: ["id_front", "id_back", "selfie"] } },
    orderBy: { createdAt: "desc" },
  });

  // A rejected document (e.g. name mismatch) counts as missing, so it can be uploaded again.
  const has = (type: string) => docs.find((d) => d.type === type && d.status !== "rejected");
  const steps = [
    { type: "id_front", label: ar ? "وش البطاقة" : "ID front" },
    { type: "id_back", label: ar ? "ضهر البطاقة" : "ID back" },
    { type: "selfie", label: ar ? "سيلفي حي" : "Liveness selfie" },
  ];

  // "Under review" only once all three are in. Checking any one pending document swapped
  // the form out after the first photo, leaving the other two impossible to upload.
  const pending = steps.every((s) => has(s.type)) && docs.some((d) => d.status === "pending");

  return (
    <>
      <h1 className="text-[24px] font-bold text-ink-900">{ar ? "توثيق الهوية" : "Identity verification"}</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed muted">
        {ar
          ? "بنوثق هويتك مرة واحدة بس. بعدها كل وحدة بتعرضها محتاجة مستند ملكية خاص بيها، وده بيتم جوه خطوات إضافة الإعلان."
          : "We verify your identity once. After that, each unit you list needs its own ownership document, handled inside the listing steps."}
      </p>

      <p className="mt-5 border-y border-[var(--border)] py-3 text-[14px]">
        <span className="muted">{ar ? "مستواك الحالي: " : "Your current level: "}</span>
        <strong className="font-semibold text-ink-900">{TRUST_LABELS[session.trustLevel]?.[locale] ?? session.trustLevel}</strong>
        <span className="tnum muted"> ({ar ? `مستوى ${session.trustLevel}` : `level ${session.trustLevel}`})</span>
      </p>

      {session.trustLevel >= TRUST.IDENTITY ? (
        <div className="mt-5 border-s-2 border-ok-700 ps-4">
          <div>
            <p className="text-[15px] font-bold text-ok-700">
              {ar ? "هويتك موثقة" : "Your identity is verified"}
            </p>
            <p className="mt-1 text-[13px] text-ink-700">
              {ar
                ? "تقدر تضيف وحدة دلوقتي. مستند الملكية بيتطلب مع كل وحدة على حدة."
                : "You can list a unit now. The ownership document is requested per unit."}
            </p>
          </div>
        </div>
      ) : pending ? (
        <div className="mt-5 border-s-2 border-ink-400 ps-4">
          <p className="text-[15px] font-bold text-ink-900">{ar ? "تحت المراجعة" : "Under review"}</p>
          <p className="mt-1 text-[13px] muted">
            {ar
              ? "استلمنا مستنداتك وبنراجعها. عادة بتاخد أقل من يوم عمل."
              : "We have your documents and are reviewing them. This usually takes less than a business day."}
          </p>
        </div>
      ) : (
        <VerifyIdentityForm
          locale={locale}
          fullName={session.fullName}
          steps={steps.map((s) => ({
            type: s.type,
            label: s.label,
            done: !!has(s.type),
            // Shown next to the step so the user knows what to fix before uploading again.
            rejectReason: has(s.type) ? null : (docs.find((d) => d.type === s.type && d.status === "rejected")?.rejectReason ?? null),
          }))}
          claudeConfigured={isClaudeConfigured()}
        />
      )}

      <p className="mt-8 max-w-2xl text-[12px] leading-relaxed muted">
        {ar
          ? "بنخزّن رقم البطاقة مشفّر باتجاه واحد، يعني مابنحتفظش بالرقم نفسه، وبنستخدمه بس للمطابقة مع مستند الملكية. صور البطاقة بتتشاف من فريق التوثيق فقط ومابتظهرش لأي مستخدم تاني."
          : "Your ID number is stored as a one-way hash: we never keep the number itself, only enough to match it against an ownership document. The ID images are visible to the verification team alone and never to another user."}
      </p>
    </>
  );
}
