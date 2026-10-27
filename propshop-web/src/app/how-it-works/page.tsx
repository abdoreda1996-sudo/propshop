import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { t } from "@/lib/i18n";
import { MAX_ACTIVE_LISTINGS_PER_IDENTITY, MIN_PHOTOS, SLA_HOURS } from "@/lib/enums";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta(
    { ar: "إزاي بنشتغل", en: "How it works" },
    {
      ar: "إزاي بنوثق كل وحدة، وإزاي بنمنع السماسرة، وإيه اللي بيحصل بعد ما تطلب وحدة.",
      en: "How we verify every unit, how we keep brokers out, and what happens after you request a unit.",
    },
  );
}

/**
 * Layout (2026-10-26): an editorial page. Each part has a short heading in a narrow side
 * column and its content beside it, separated by ink rules. The verification levels are a
 * numbered list with the number set large, the broker rules are label/text rows, and the
 * request steps are a plain ordered list.
 */
export default async function HowItWorksPage() {
  const locale = await getLocale();
  const ar = locale === "ar";

  const levels = [
    {
      level: 1,
      title: ar ? "الهوية" : "Identity",
      body: ar
        ? "بطاقة رقم قومي (وش وضهر) وسيلفي حي. بنقرأ البطاقة آلياً ونتأكد إن الاسم مطابق، ومراجع بشري بيراجع أي حالة مش واضحة."
        : "A national ID (front and back) plus a liveness selfie. We read the card automatically and check the name matches, with a human reviewer for anything unclear.",
    },
    {
      level: 2,
      title: ar ? "الملكية" : "Ownership",
      body: ar
        ? "عقد مسجل أو عقد بيع موقّع أو خطاب تخصيص. بنستخرج بيانات الوحدة من المستند ونقارنها باللي المالك كتبه. أي اختلاف بيوقف النشر، وبيرجع للمالك بالحقل اللي محتاج يتعدل بالظبط."
        : "A registered deed, signed sale contract, or allocation letter. We extract the unit details from the document and compare them with what the owner typed. Any mismatch stops publication and goes back to the owner with the exact field to fix.",
      note: ar ? "ده أقل مستوى يخلي الإعلان يظهر للمشترين." : "This is the minimum level at which a listing becomes visible to buyers.",
    },
    {
      level: 3,
      title: ar ? "الصور" : "Photos",
      body: ar
        ? `على الأقل ${MIN_PHOTOS} صور متصورة من داخل التطبيق ببيانات الموقع والتوقيت، أو بواسطة مصورنا. بنقارن كل صورة بصور الإعلانات التانية وبالمواقع التانية، والصورة المنقولة بتترفض.`
        : `At least ${MIN_PHOTOS} photos captured in the app with GPS and a timestamp, or shot by our photographer. Every photo is compared against other listings and other portals, and a lifted photo is rejected.`,
    },
    {
      level: 4,
      title: ar ? "زيارة على الطبيعة" : "Site visit",
      body: ar
        ? "حد من فريقنا بيزور الوحدة بنفسه. المستوى ده اختياري، وبنعمله للوحدات الكبيرة أو لما يكون عندنا شك."
        : "Someone from our team visits the unit in person. This level is optional, used for larger units or when something needs checking.",
    },
  ];

  const brokerRules = [
    {
      title: ar ? `${MAX_ACTIVE_LISTINGS_PER_IDENTITY} إعلانات بالكتير لكل هوية` : `At most ${MAX_ACTIVE_LISTINGS_PER_IDENTITY} listings per identity`,
      body: ar
        ? "الهوية الواحدة متقدرش تعرض أكتر من كده من غير موافقة الإدارة وإثبات ملكية لكل وحدة. السمسار شغله على الكمية، والقاعدة دي بتقفل الباب ده."
        : "One identity cannot list more without admin approval and ownership proof for each unit. Brokers work on volume, and this rule closes that off.",
    },
    {
      title: ar ? "إعلان واحد لكل وحدة" : "One listing per unit",
      body: ar
        ? "كل وحدة ليها بصمة من الكمبوند والمبنى والدور ورقم الوحدة. أي إعلان تاني لنفس الوحدة بيترفض من قاعدة البيانات نفسها."
        : "Every unit has a fingerprint built from its compound, building, floor and unit number. A second listing for the same unit is refused by the database itself.",
    },
    {
      title: ar ? "الصور لازم تكون أصلية" : "Photos must be original",
      body: ar
        ? "بنحسب بصمة لكل صورة ونقارنها بكل الصور اللي عندنا وبالمواقع التانية. الصور المنقولة بتترفض قبل ما الإعلان يظهر."
        : "We fingerprint every photo and compare it with everything we hold and with other portals. Lifted photos are rejected before the listing appears.",
    },
    {
      title: ar ? "زرار للإبلاغ" : "A report button",
      body: ar
        ? "لو كلمك سمسار، فيه زرار «اتصل بيا سمسار» على كل إعلان. البلاغ بيروح لفريق الجودة، وتلات بلاغات مؤكدة بتوقف الحساب."
        : "If a broker contacts you, every listing has an “I was contacted by a broker” link. Reports go to our quality team, and three upheld reports suspend the account.",
    },
  ];

  const steps = [
    {
      title: ar ? "بتبعت الطلب" : "You send a request",
      body: ar ? "من صفحة الوحدة، أو طلب مفتوح لو لسه بتدور." : "From a unit page, or as an open brief if you are still looking.",
    },
    {
      title: ar ? `رد خلال ${SLA_HOURS} ساعة` : `A reply within ${SLA_HOURS} hours`,
      body: ar
        ? "بيتعيّن على طلبك مستشار بمرتب ثابت (مش بعمولة)، وبتشوف عداد بالوقت الباقي."
        : "An advisor on a fixed salary (not commission) is assigned, and you see a countdown of the time left.",
    },
    {
      title: ar ? "معاينة متفق عليها" : "An agreed viewing",
      body: ar
        ? "المستشار بيرتب المعاينة مع المالك. الأرقام مبتتبادلش غير بعد تأكيد المعاينة."
        : "The advisor arranges the viewing with the owner. Numbers are exchanged only once the viewing is confirmed.",
    },
    {
      title: ar ? "غرفة الصفقة" : "The deal room",
      body: ar
        ? "التفاوض ونموذج العقد وحجز العربون وقائمة التسليم في مكان واحد، برسم ثابت."
        : "Negotiation, a contract template, the deposit hold and a handover checklist in one place, for a flat fee.",
    },
  ];

  const side = "text-[13px] font-semibold text-ink-900 md:pt-1";
  const row = "ruled mt-14 grid gap-6 md:grid-cols-[200px_1fr] md:gap-10";

  return (
    <div className="container-page pb-6 pt-10 md:pt-16">
      <header className="max-w-3xl">
        <h1 className="display">{ar ? "إزاي بنعرف إن الوحدة حقيقية" : "How we know a unit is real"}</h1>
        <p className="lede mt-4">
          {ar
            ? "مشكلة السوق في مصر مش قلة الإعلانات. المشكلة إن أغلبها مكرر، أو صوره منقولة، أو سعره مش حقيقي. عشان كده كل وحدة بتعدي على الخطوات اللي تحت قبل ما تظهر."
            : "The problem in the Egyptian market is not a shortage of listings. Most of them are duplicates, use lifted photos, or quote a price that is not real. So every unit goes through the checks below before it appears."}
        </p>
      </header>

      {/* --- Verification levels ------------------------------------------ */}
      <section id="verification" className={`${row} scroll-mt-24`}>
        <h2 className={side}>{ar ? "مستويات التوثيق" : "Verification levels"}</h2>
        <ol className="max-w-2xl">
          {levels.map((l) => (
            <li key={l.level} className="grid grid-cols-[44px_1fr] gap-x-3 border-b border-[var(--border)] py-5 first:pt-0 last:border-0">
              <span className="tnum text-[28px] font-bold leading-none text-accent-500">{l.level}</span>
              <div>
                <h3 className="text-[16px] font-semibold text-ink-900">{l.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-700">{l.body}</p>
                {l.note && <p className="mt-2 text-[13px] font-medium text-ok-700">{l.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Keeping brokers out ------------------------------------------ */}
      <section className={row}>
        <div>
          <h2 className={side}>{ar ? "إزاي بنمنع السماسرة" : "How we keep brokers out"}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed muted">
            {ar ? "قواعد بيطبقها النظام نفسه، مش بنعتمد على حسن النية." : "Rules the system enforces itself, not goodwill."}
          </p>
        </div>
        <dl className="max-w-2xl">
          {brokerRules.map((c) => (
            <div key={c.title} className="grid gap-1 border-b border-[var(--border)] py-4 first:pt-0 last:border-0 sm:grid-cols-[220px_1fr] sm:gap-6">
              <dt className="text-[14px] font-semibold text-ink-900">{c.title}</dt>
              <dd className="text-[14px] leading-relaxed text-ink-700">{c.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* --- What happens when you request a unit ------------------------- */}
      <section className={row}>
        <div>
          <h2 className={side}>{ar ? "لما تطلب وحدة" : "When you request a unit"}</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed muted">
            {ar
              ? "مفيش أرقام بتتبادل، ومحدش مش عارفه هيكلمك. كل حاجة بتبدأ منك."
              : "No numbers are exchanged and nobody you do not know will call you. It all starts with you."}
          </p>
        </div>
        <div className="max-w-2xl">
          <ol className="border-t border-[var(--border)]">
            {steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[28px_1fr] gap-x-2 border-b border-[var(--border)] py-3.5">
                <span className="tnum text-[14px] font-semibold text-accent-500">{i + 1}</span>
                <div>
                  <h3 className="text-[14px] font-semibold text-ink-900">{s.title}</h3>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-700">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[14px] leading-relaxed text-ink-700">
            {ar
              ? `لو عدّت ${SLA_HOURS} ساعة من غير ما حد يرد عليك، الطلب بيتحول لمدير الفريق تلقائياً وبيوصلك اعتذار. النظام هو اللي بيحسب الوقت ده، مش إحنا.`
              : `If ${SLA_HOURS} hours pass without a reply from a person, the request goes to a team manager automatically and you get an apology. The system keeps that clock, not us.`}
          </p>
        </div>
      </section>

      <div className="mt-14 flex flex-wrap gap-3 border-t border-[var(--border)] pt-6">
        <Link href="/" className="btn btn-primary">
          {t("hero_cta_browse", locale)}
        </Link>
        <Link href="/pricing" className="btn btn-ghost">
          {t("nav_pricing", locale)}
        </Link>
      </div>
    </div>
  );
}
