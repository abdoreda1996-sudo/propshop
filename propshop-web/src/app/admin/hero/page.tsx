import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { canAccessAdminSection } from "@/lib/permissions";
import { getHeroConfig, heroOptions } from "@/lib/siteHero";
import HeroEditor from "@/components/admin/HeroEditor";

import { AdminTitle } from "@/components/admin/AdminUi";
import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "غلاف الصفحة الرئيسية", en: "Home cover" });
}
export const dynamic = "force-dynamic";

export default async function AdminHeroPage() {
  const session = await getSession();
  if (!session || !canAccessAdminSection(session.role, "site")) notFound();

  const [locale, config, options] = await Promise.all([getLocale(), getHeroConfig(), heroOptions()]);
  const ar = locale === "ar";

  return (
    <div>
      <AdminTitle
        title={ar ? "غلاف الصفحة الرئيسية" : "Home page cover"}
        intro={
          ar
            ? "اختار جولة افتراضية أو صورة أو ارفع ملف. التغيير بيظهر للزوار أول ما تحفظ."
            : "Pick a virtual tour, a listing photo, or upload your own. Visitors see it as soon as you save."
        }
      />
      <HeroEditor locale={locale} initial={config} options={JSON.parse(JSON.stringify(options))} />
    </div>
  );
}
