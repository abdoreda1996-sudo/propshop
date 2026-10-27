import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import OpenRequestForm from "@/components/OpenRequestForm";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta(
    { ar: "ابعتلنا طلبك", en: "Send us your request" },
    {
      ar: "ابعت طلبك (المنطقة والميزانية وعدد الغرف) وهنجمعلك الوحدات الموثقة المطابقة.",
      en: "Send your brief (area, budget, bedrooms) and we gather the matching verified units for you.",
    },
  );
}

/** Path 2 of the buying process (Section 6c): the open request. */
export default async function RequestPage() {
  const [locale, session, areas] = await Promise.all([
    getLocale(),
    getSession(),
    prisma.area.findMany({ orderBy: { nameEn: "asc" } }),
  ]);
  const ar = locale === "ar";

  return (
    <div className="container-page pb-6 pt-10 md:pt-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-16">
        <div className="max-w-2xl">
          <h1 className="display">{ar ? "قولنا بتدور على إيه" : "Tell us what you are looking for"}</h1>
          <p className="lede mt-4">{t("request_sla", locale)}</p>

          <OpenRequestForm
            locale={locale}
            signedIn={!!session}
            areas={areas.map((a) => ({ slug: a.slug, nameAr: a.nameAr, nameEn: a.nameEn }))}
          />
        </div>

        <aside className="lg:pt-3">
          <h2 className="ruled text-[13px] font-semibold text-ink-900">{ar ? "اللي بيحصل بعد كده" : "What happens next"}</h2>
          <ol className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-700">
            {(ar
              ? [
                  "بنراجع الوحدات الموثقة اللي تطابق طلبك.",
                  "بتتابع طلبك والوحدات المطابقة من حسابك.",
                  "لو عجبتك وحدة، بتطلب معاينة ونرتبها مع المالك. رقمك مش بيوصل لحد قبل كده.",
                ]
              : [
                  "We go through the verified units that match your request.",
                  "You follow your request and its matches from your account.",
                  "If you like a unit, request a viewing and we arrange it with the owner. Your number reaches nobody before that.",
                ]
            ).map((line, i) => (
              <li key={i} className="grid grid-cols-[20px_1fr] gap-x-1">
                <span className="tnum font-semibold text-accent-500">{i + 1}</span>
                {line}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
