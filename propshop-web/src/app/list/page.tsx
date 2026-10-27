import Link from "next/link";
import { getLocale } from "@/lib/locale";
import { FEE_MODEL_NOTE, PHOTOGRAPHY_FEE } from "@/lib/fees";
import { whatsappHref } from "@/lib/whatsapp";
import { formatPriceExact } from "@/lib/format";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "اعرض وحدتك", en: "List your property" });
}

/**
 * The fork an owner hits before listing: do it yourself, or send it to us on WhatsApp.
 *
 * WHY THIS SCREEN EXISTS
 * The wizard asks for six in-app photos, an ownership document and a set of typed details.
 * That is the right bar for inventory we are going to call verified, but it is a lot to
 * meet on a phone at the moment someone decides to sell — and the alternative most owners
 * actually reach for is to send someone a message. Offering that as a first-class choice
 * rather than a fallback is the difference between capturing that supply and losing it.
 *
 * Both paths end at the same verification. WhatsApp changes who does the typing, not what
 * gets checked, and the copy says so — an owner who thinks the message route skips the
 * document will be surprised later, and being surprised late is what makes people abandon.
 */
export default async function ListChoicePage() {
  const locale = await getLocale();
  const ar = locale === "ar";
  const wa = whatsappHref(locale, "listing");
  const waPhoto = whatsappHref(locale, "photography");

  const selfPoints = ar
    ? ["أسرع طريقة، الإعلان بيدخل المراجعة على طول", "بتصوّر الوحدة من داخل التطبيق", "إنت اللي بتكتب كل التفاصيل"]
    : ["The quickest route: the listing goes straight into review", "You take the photos inside the app", "You fill in every detail yourself"];

  const waPoints = ar
    ? ["ابعت اللي معاك وإحنا نكمّل", "مستشار بيراجع معاك المستندات", "نفس التوثيق، بس إحنا اللي بنكتب"]
    : ["Send what you have and we finish it", "An advisor goes through the documents with you", "Same verification, we just do the typing"];

  const points = (items: string[]) => (
    <ul className="mt-4 flex-1 space-y-1.5 text-[13.5px] leading-relaxed text-ink-700">
      {items.map((p) => (
        <li key={p} className="flex gap-2">
          <span aria-hidden className="text-ink-400">·</span>
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="container-page pb-6 pt-10 md:pt-16">
      <header className="max-w-3xl">
        <h1 className="display">{ar ? "اعرض وحدتك مجاناً" : "List your property for free"}</h1>
        <p className="lede mt-4">
          {ar ? "فيه طريقتين، والاتنين بيعدوا على نفس التوثيق." : "There are two ways to do it, and both go through the same verification."}
        </p>
      </header>

      <div className="mt-10 grid border-y border-ink-900 md:grid-cols-2">
        {/* --- Do it yourself ------------------------------------------------ */}
        <article className="flex flex-col border-b border-[var(--border)] py-6 md:border-b-0 md:border-e md:pe-8">
          <h2 className="text-[19px] font-bold text-ink-900">
            <span className="tnum me-2 text-accent-500">1</span>
            {ar ? "ارفعها بنفسك" : "Upload it yourself"}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
            {ar
              ? "املا بيانات الوحدة، صوّرها من داخل التطبيق، وارفع مستند الملكية. بتاخد حوالي 10 دقايق."
              : "Fill in the unit's details, take the photos in the app, and upload the ownership document. It takes about 10 minutes."}
          </p>
          {points(selfPoints)}
          <Link href="/dashboard/listings/new" className="btn btn-primary mt-6 self-start">
            {ar ? "ابدأ الرفع" : "Start uploading"}
          </Link>
        </article>

        {/* --- Send it on WhatsApp ------------------------------------------- */}
        <article className="flex flex-col py-6 md:ps-8">
          <h2 className="text-[19px] font-bold text-ink-900">
            <span className="tnum me-2 text-accent-500">2</span>
            {ar ? "ابعتها على واتساب" : "Send it on WhatsApp"}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
            {ar
              ? "ابعتلنا تفاصيل الوحدة والصور اللي معاك، ومستشار هيكمّل الإعلان معاك ويرد عليك خلال 24 ساعة."
              : "Send us the unit's details and whatever photos you have. An advisor finishes the listing with you and replies within 24 hours."}
          </p>
          {points(waPoints)}

          {/*
            Rendered as a real link only when a number is configured. An unset
            NEXT_PUBLIC_WHATSAPP_NUMBER shows the button disabled and says why, rather than
            a dead `wa.me//` that looks live and fails on tap. The visitor-facing note does
            not name the env var; that is for us, not for owners.
          */}
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mt-6 self-start">
              {ar ? "افتح واتساب" : "Open WhatsApp"}
            </a>
          ) : (
            <div className="mt-6">
              <button type="button" disabled className="btn btn-ghost" aria-describedby="wa-note">
                {ar ? "افتح واتساب" : "Open WhatsApp"}
              </button>
              <p id="wa-note" className="mt-2 text-[12px] leading-relaxed muted">
                {ar ? "خط الواتساب لسه مش شغال. استخدم الطريقة الأولى لحد ما يشتغل." : "The WhatsApp line is not live yet. Use the first route for now."}
              </p>
            </div>
          )}
        </article>
      </div>

      {/* --- Optional add-on ------------------------------------------------
          Deliberately BELOW the two routes and visually separate, because it is not a third
          way to list: it is an extra on either of them.

          A NOTE ON "PROMOTED". Paid placement was removed from this product on purpose: a
          slot that can be bought is an undisclosed ranking advantage, and the card's badges
          are all earned. This does not reinstate it. It buys BETTER MEDIA (a professional
          shoot, a floor plan and a walkable 360 tour), which makes a listing more
          persuasive to the people who reach it. It does not move the listing up a result
          list, and the copy says so, because an owner who pays expecting rank and does not
          get it has been misled. */}
      <section className="mt-12 grid gap-6 md:grid-cols-[200px_1fr] md:gap-10">
        <h2 className="text-[13px] font-semibold text-ink-900 md:pt-1">{ar ? "إضافة اختيارية" : "Optional extra"}</h2>
        <div className="max-w-2xl">
          <h3 className="text-[17px] font-semibold text-ink-900">
            {ar ? "تصوير احترافي وجولة افتراضية 360" : "Professional photos and a 360° virtual tour"}
          </h3>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
            {ar
              ? "مصورنا بييجي الوحدة ويصورها، ويعمل رسم مساحي وجولة 360 المشتري يتمشى فيها من موبايله. الوحدات اللي فيها جولة الناس بتتفرج عليها وقت أطول، والاستفسارات اللي بتجيلها أجدّ."
              : "Our photographer visits the unit, photographs it, draws a floor plan and records a 360° tour a buyer can walk through on their phone. Units with a tour get looked at for longer and draw more serious enquiries."}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed muted">
            {ar
              ? "ده بيحسّن إعلانك، مش ترتيبه. مفيش حاجة على بروب شوب بتشتري مكان أعلى في نتايج البحث."
              : "This improves your listing, not its ranking. Nothing on PropShop buys a higher position in search results."}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-[var(--border)] pt-4">
            <div>
              <span className="tnum text-[22px] font-bold text-ink-900">{formatPriceExact(PHOTOGRAPHY_FEE, locale)}</span>{" "}
              <span className="text-[13px] muted">{ar ? "مرة واحدة لكل وحدة" : "once, per unit"}</span>
            </div>
            <Link href="/virtual-tour" className="btn btn-ghost">
              {ar ? "التفاصيل والحجز" : "Details and booking"}
            </Link>
            {waPhoto && (
              <a href={waPhoto} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-brand-500 underline underline-offset-4">
                {ar ? "أو احجز على واتساب" : "Or book on WhatsApp"}
              </a>
            )}
          </div>
          <p className="mt-2 text-[12px] muted">
            {ar ? "لو صوّرت بنفسك من التطبيق مش هتدفع حاجة." : "Shoot it yourself in the app and you pay nothing."}
          </p>
        </div>
      </section>

      <p className="mt-12 max-w-[70ch] border-t border-[var(--border)] pt-6 text-[13px] leading-relaxed muted">
        {FEE_MODEL_NOTE[locale]}
      </p>
    </div>
  );
}
