import { getLocale } from "@/lib/locale";
import { MAX_ACTIVE_LISTINGS_PER_IDENTITY, SLA_HOURS } from "@/lib/enums";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "الشروط والأحكام", en: "Terms and conditions" });
}

/**
 * Plain-language terms. Deliberately short and specific: a page nobody can read is a
 * dark pattern of its own, and the brief rules those out (Section 11).
 */
export default async function TermsPage() {
  const locale = await getLocale();
  const ar = locale === "ar";

  const sections = ar
    ? [
        { h: "إحنا مين", p: "بروب شوب منصة بتوصل مالك العقار بالمشتري مباشرة. إحنا مش وسيط عقاري ومابناخدش عمولة على أي صفقة. دورنا: التوثيق، تنظيم التواصل، وتقديم أدوات تساعد الطرفين." },
        { h: "الرسوم", p: `كل رسومنا ثابتة ومنشورة على صفحة الرسوم. مابنحسبش نسبة من سعر أي وحدة. أي تعديل في الرسوم بيتنشر قبل ما يسري، والإعلانات النشطة بتكمل مدتها بالسعر اللي اتدفع.` },
        { h: "مسؤوليتك كمالك", p: `بتقر إنك المالك أو المفوّض قانوناً ببيع الوحدة، وإن كل البيانات والمستندات اللي بترفعها صحيحة. الهوية الواحدة مسموح ليها بحد أقصى ${MAX_ACTIVE_LISTINGS_PER_IDENTITY} إعلانات نشطة إلا بموافقة إدارية.` },
        { h: "منع السماسرة", p: "المنصة للملاك فقط. السماسرة والشركات التسويقية ممنوعين من النشر. لو ثبت إن حساب بيمارس وساطة، بيتوقف وبتتشال إعلاناته، والرسوم المدفوعة عن الفترة المتبقية بترد." },
        { h: "التوثيق مش ضمان", p: "التوثيق بيأكد إن المستندات المقدمة متطابقة وإن الصور اتصورت في مكان الوحدة. ده بيقلل الاحتيال بشكل كبير لكنه مش بديل عن الفحص القانوني والمعاينة قبل التعاقد، وبننصح دايماً بمراجعة محامٍ." },
        { h: "تقديرات الأسعار", p: "«السعر العادل» ومؤشر بروب شوب تقديرات استرشادية محسوبة من بيانات السوق. مش تقييم عقاري معتمد ومايصلحش أساس لقرار تمويلي أو نزاع قضائي." },
        { h: "التواصل", p: `أرقام التليفونات مخفية بشكل افتراضي. التواصل بيبدأ من المشتري، ومستشار بيرد خلال ${SLA_HOURS} ساعة. الرسايل داخل المنصة بتتفحص آلياً لمنع مشاركة بيانات التواصل ولغة الوساطة.` },
        { h: "البيانات", p: "بنخزن رقم البطاقة مشفّر باتجاه واحد ومابنحتفظش بالرقم نفسه. صور الهوية بيشوفها فريق التوثيق فقط. مابنبيعش بياناتك ولا بنشاركها مع معلنين." },
        { h: "إنهاء الخدمة", p: "تقدر تقفل حسابك في أي وقت. لو قفلنا حسابك لمخالفة، هنوضحلك السبب، وليك حق التظلم." },
        { h: "القانون الواجب التطبيق", p: "بتخضع الشروط دي للقانون المصري، وأي نزاع بينظر أمام المحاكم المصرية المختصة." },
      ]
    : [
        { h: "Who we are", p: "PropShop connects property owners directly with buyers. We are not a real-estate brokerage and we take no commission on any transaction. Our role is verification, structured communication, and tools that help both sides." },
        { h: "Fees", p: "Every fee we charge is flat and published on the pricing page. We never take a percentage of a unit's price. Any change is published before it takes effect, and active listings run out their term at the price already paid." },
        { h: "Your obligations as an owner", p: `You confirm that you own the unit or are legally authorised to sell it, and that every detail and document you upload is accurate. One identity may hold at most ${MAX_ACTIVE_LISTINGS_PER_IDENTITY} active listings unless an administrator approves more.` },
        { h: "No brokers", p: "The platform is for owners only. Brokers and marketing companies may not list. An account found to be brokering is suspended and its listings removed, with fees for the unused period refunded." },
        { h: "Verification is not a guarantee", p: "Verification confirms that the documents provided are consistent and that photos were taken at the unit. That substantially reduces fraud but does not replace legal due diligence and an in-person viewing before you contract. We always recommend a lawyer's review." },
        { h: "Price estimates", p: "The Fair Price and the PropShop Index are indicative estimates computed from market data. They are not certified valuations and must not be relied on for a financing decision or in a dispute." },
        { h: "Contact", p: `Phone numbers are masked by default. Contact begins with the buyer, and an advisor responds within ${SLA_HOURS} hours. In-platform messages are scanned automatically to prevent contact-detail sharing and brokering language.` },
        { h: "Your data", p: "Your national ID number is stored as a one-way hash; we do not keep the number itself. ID images are visible only to the verification team. We do not sell your data or share it with advertisers." },
        { h: "Ending the relationship", p: "You may close your account at any time. If we suspend an account for a breach, we tell you why, and you may appeal." },
        { h: "Governing law", p: "These terms are governed by Egyptian law, and any dispute falls to the competent Egyptian courts." },
      ];

  return (
    <div className="container-page pb-6 pt-10 md:pt-16">
      <h1 className="display">
        {ar ? "الشروط والأحكام" : "Terms and conditions"}
      </h1>
      <p className="lede mt-4">
        {ar
          ? "كتبناها بلغة واضحة عشان تتقري فعلاً. لو فيه بند مش مفهوم، يبقى العيب عندنا. كلمنا ونوضحه."
          : "Written in plain language so it can actually be read. If a clause is unclear, that is our fault. Tell us and we will explain it."}
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
          ? "ملاحظة: النص ده مسودة منتج ومحتاج مراجعة مستشار قانوني قبل الإطلاق."
          : "Note: this text is a product draft and needs review by legal counsel before launch."}
      </p>
    </div>
  );
}
