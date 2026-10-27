import { getLocale } from "@/lib/locale";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "الخصوصية", en: "Privacy" });
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const ar = locale === "ar";

  const sections = ar
    ? [
        { h: "إيه اللي بنجمعه", p: "رقم الموبايل، الاسم، والبريد لو أضفته. للملاك: صور البطاقة ومستند الملكية وصور الوحدة ببيانات الموقع والتوقيت. للمشترين: بيانات طلبك (الميزانية، المناطق، التوقيت) وسجل الرسايل داخل المنصة." },
        { h: "رقم البطاقة", p: "مابنخزنش رقم البطاقة نفسه. بنخزن بصمة تشفيرية أحادية الاتجاه منه، بنستخدمها بس عشان نتأكد إن الاسم ورقم البطاقة في مستند الملكية مطابقين للهوية الموثقة. حتى موظفينا مايقدروش يستخرجوا الرقم من البصمة دي." },
        { h: "بيانات الموقع", p: "صور الوحدة بتحمل إحداثيات المكان اللي اتصورت فيه. بنستخدمها للتأكد إن الصور اتصورت في الوحدة فعلاً. الإحداثيات الدقيقة مابتظهرش للمشترين، هما بيشوفوا موقع الكمبوند بس." },
        { h: "رقم موبايلك", p: "مخفي بشكل افتراضي ومابيظهرش لأي مستخدم تاني. المستشار المسؤول عن طلبك بيشوفه بعد ما يسجّل أول رد، وكل وصول لرقم كامل بيتسجل في سجل تدقيق." },
        { h: "الرسايل", p: "الرسايل داخل المنصة بتتفحص آلياً لاكتشاف مشاركة بيانات التواصل ولغة الوساطة. الفحص ده آلي، والمراجعة البشرية بتحصل بس لما رسالة تترفع كمخالفة أو يجيلها بلاغ." },
        { h: "مين بيشوف إيه", p: "فريق التوثيق بيشوف المستندات. المستشار بيشوف بيانات طلبك. الإدارة بتشوف سجلات التدقيق. المشترين والملاك مابيشوفوش غير اللي منشور في الإعلان." },
        { h: "مابنعملهوش", p: "مابنبيعش بياناتك. مابنشاركهاش مع معلنين أو وسطاء عقاريين. مابنستخدمش صورك في تسويق من غير إذنك." },
        { h: "مدة الاحتفاظ", p: "بيانات الحساب بتفضل طول ما الحساب شغال. مستندات التوثيق بتتحفظ طول مدة الإعلان وسنة بعدها لأغراض النزاعات، وبعدين بتتمسح. سجلات التدقيق بتتحفظ أطول لأسباب أمنية." },
        { h: "حقوقك", p: "تقدر تطلب نسخة من بياناتك، أو تصحيحها، أو مسح حسابك. اكتبلنا وهنرد خلال 30 يوم." },
      ]
    : [
        { h: "What we collect", p: "Your mobile number, name, and email if you add one. From owners: ID images, the ownership document, and unit photos with their location and timestamp. From buyers: your brief (budget, areas, timing) and your in-platform message history." },
        { h: "Your ID number", p: "We do not store your national ID number. We store a one-way cryptographic hash of it, used only to confirm that the name and ID on an ownership document match the verified identity. Not even our staff can recover the number from that hash." },
        { h: "Location data", p: "Unit photos carry the coordinates where they were taken. We use these to confirm the photos were actually shot at the unit. Exact coordinates are never shown to buyers; they see the compound location only." },
        { h: "Your phone number", p: "Masked by default and never shown to another user. The advisor handling your request sees it after logging their first response, and every access to a full number is recorded in an audit log." },
        { h: "Messages", p: "In-platform messages are scanned automatically for contact-detail sharing and brokering language. That scan is automated; a human reads a message only when it is flagged or reported." },
        { h: "Who sees what", p: "The verification team sees documents. Your advisor sees your brief. Administrators see audit logs. Buyers and owners see only what the listing publishes." },
        { h: "What we do not do", p: "We do not sell your data. We do not share it with advertisers or real-estate brokers. We do not use your photos in marketing without your permission." },
        { h: "How long we keep it", p: "Account data lasts as long as the account. Verification documents are kept for the life of the listing plus one year for dispute purposes, then deleted. Audit logs are kept longer for security reasons." },
        { h: "Your rights", p: "You may request a copy of your data, ask us to correct it, or delete your account. Write to us and we respond within 30 days." },
      ];

  return (
    <div className="container-page pb-6 pt-10 md:pt-16">
      <h1 className="display">{ar ? "سياسة الخصوصية" : "Privacy policy"}</h1>
      <p className="lede mt-4">
        {ar
          ? "بنطلب منك مستندات حساسة، فمن حقك تعرف بالظبط بيحصلها إيه."
          : "We ask you for sensitive documents, so you are entitled to know exactly what happens to them."}
      </p>

      <ol className="mt-10 max-w-3xl border-t border-ink-900">
        {sections.map((s, i) => (
          <li key={s.h} className="grid gap-x-6 gap-y-1 border-b border-[var(--border)] py-5 sm:grid-cols-[32px_180px_1fr]">
            <span className="tnum text-[13px] font-semibold text-ink-400">{i + 1}</span>
            <h2 className="text-[15px] font-semibold text-ink-900">{s.h}</h2>
            <p className="text-[14.5px] leading-[1.85] text-ink-700">{s.p}</p>
          </li>
        ))}
      </ol>

      <p className="mt-8 max-w-3xl text-[12px] muted">
        {ar
          ? "ملاحظة: النص ده مسودة منتج ومحتاج مراجعة قانونية للتوافق مع قانون حماية البيانات الشخصية المصري قبل الإطلاق."
          : "Note: this text is a product draft and needs legal review for Egyptian PDPL compliance before launch."}
      </p>
    </div>
  );
}
