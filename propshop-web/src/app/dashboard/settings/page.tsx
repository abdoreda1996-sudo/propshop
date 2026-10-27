import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { TRUST_LABELS } from "@/lib/enums";
import { formatDate } from "@/lib/format";
import SettingsForm from "@/components/SettingsForm";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "الإعدادات", en: "Settings" });
}
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      fullName: true,
      email: true,
      phone: true,
      trustLevel: true,
      countryOfResidence: true,
      preferredCurrency: true,
      preferredChannel: true,
      createdAt: true,
    },
  });
  if (!user) return null;

  return (
    <>
      <h1 className="text-[24px] font-bold text-ink-900">{ar ? "الإعدادات" : "Settings"}</h1>

      <SettingsForm
        locale={locale}
        user={{
          fullName: user.fullName,
          email: user.email,
          countryOfResidence: user.countryOfResidence,
          preferredCurrency: user.preferredCurrency,
          preferredChannel: user.preferredChannel,
        }}
        nameLocked={user.trustLevel >= 1}
      />

      <div className="mt-10 max-w-xl">
        <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">{ar ? "الحساب" : "Account"}</h2>
        <dl className="facts text-[14px]">
          <div>
            <dt className="muted">{ar ? "رقم الموبايل" : "Mobile"}</dt>
            <dd className="tnum font-semibold text-ink-900" dir="ltr">
              {user.phone}
            </dd>
          </div>
          <div>
            <dt className="muted">{ar ? "مستوى التوثيق" : "Verification level"}</dt>
            <dd className="font-semibold text-ink-900">{TRUST_LABELS[user.trustLevel]?.[locale]}</dd>
          </div>
          <div>
            <dt className="muted">{ar ? "تاريخ الانضمام" : "Member since"}</dt>
            <dd className="tnum font-semibold text-ink-900">{formatDate(user.createdAt, locale)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-[12px] leading-relaxed muted">
          {ar
            ? "رقم موبايلك مابيظهرش لأي مستخدم تاني على المنصة، ولا بيتباع ولا بيتشارك. بيتشاف من المستشار المسؤول عن طلبك بس، وبعد ما يسجّل أول رد."
            : "Your number is never shown to another user, sold, or shared. Only the advisor handling your request sees it, and only after they log their first response."}
        </p>
      </div>
    </>
  );
}
