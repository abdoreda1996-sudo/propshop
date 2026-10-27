import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { parseJson } from "@/lib/json";
import { MAX_ACTIVE_LISTINGS_PER_IDENTITY, TRUST } from "@/lib/enums";
import ListingWizard from "@/components/ListingWizard";
import { whatsappHref } from "@/lib/whatsapp";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "اعرض وحدتك", en: "List your property" });
}

export default async function NewListingPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) redirect("/login?next=/dashboard/listings/new");
  const ar = locale === "ar";

  const [areas, compounds, activeCount, fees] = await Promise.all([
    prisma.area.findMany({ orderBy: { nameEn: "asc" } }),
    prisma.compound.findMany({ orderBy: { nameEn: "asc" }, include: { area: { select: { id: true, slug: true } } } }),
    prisma.listing.count({
      where: { unit: { ownerId: session.id }, status: { in: ["live", "pending_review", "paused"] } },
    }),
    prisma.feeConfig.findMany(),
  ]);

  // Gate the wizard on the two hard preconditions rather than letting the owner fill in
  // five steps and be refused at the end.
  if (session.trustLevel < TRUST.IDENTITY) {
    return (
      <div>
        <h1 className="text-[24px] font-bold text-ink-900">
          {ar ? "وثّق حسابك الأول" : "Verify your account first"}
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed muted">
          {ar
            ? "قبل ما تعرض وحدة لازم نوثق بطاقتك الشخصية، وبعدين مستند ملكية الوحدة. ده اللي بيخلي كل إعلان على المنصة موثوق، ومفيش سماسرة."
            : "Before you list a unit we check your national ID, then the unit's ownership document. That is how every listing here stays genuine and broker-free."}
        </p>
        <Link href="/dashboard/verify" className="btn btn-primary mt-5">
          {ar ? "ابدأ التوثيق" : "Start verification"}
        </Link>
      </div>
    );
  }

  if (activeCount >= MAX_ACTIVE_LISTINGS_PER_IDENTITY) {
    // There is no support page yet; the WhatsApp line is the only channel to the team.
    const contact = whatsappHref(locale);
    return (
      <div>
        <h1 className="text-[24px] font-bold text-ink-900">
          {ar ? "وصلت للحد الأقصى للإعلانات" : "You have reached the listing limit"}
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed muted">
          {ar
            ? `الهوية الواحدة تقدر يكون عندها ${MAX_ACTIVE_LISTINGS_PER_IDENTITY} إعلانات نشطة بحد أقصى. ده جزء من منع السماسرة. لو فعلاً عندك وحدات أكتر، اطلب موافقة الإدارة بإثبات ملكية لكل وحدة.`
            : `A verified identity may hold at most ${MAX_ACTIVE_LISTINGS_PER_IDENTITY} active listings. This is part of how we keep brokers out. If you genuinely own more units, request admin approval with ownership proof for each.`}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard/listings" className="btn btn-primary">
            {ar ? "إعلاناتي" : "My listings"}
          </Link>
          {/* Was a link to /support/listing-cap, a page that does not exist. */}
          {contact && (
            <a href={contact} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              {ar ? "اطلب رفع الحد على واتساب" : "Ask for a higher limit on WhatsApp"}
            </a>
          )}
        </div>
      </div>
    );
  }

  // Listing is free — there is no listing fee to look up any more.
  const photoFee = fees.find((f) => f.key === "photo_package");

  return (
    <ListingWizard
      locale={locale}
      areas={areas.map((a) => ({ id: a.id, slug: a.slug, nameAr: a.nameAr, nameEn: a.nameEn }))}
      compounds={compounds.map((c) => ({
        id: c.id,
        areaId: c.areaId,
        slug: c.slug,
        nameAr: c.nameAr,
        nameEn: c.nameEn,
        developer: c.developer,
        minSizeSqm: c.minSizeSqm,
        maxSizeSqm: c.maxSizeSqm,
        unitTypes: parseJson<string[]>(c.unitTypesJson, []),
        centerLat: c.centerLat,
        geomJson: c.geomJson,
        centerLng: c.centerLng,
      }))}
      fees={{ photo: photoFee ? { amount: photoFee.amount } : null }}
      remainingSlots={MAX_ACTIVE_LISTINGS_PER_IDENTITY - activeCount}
    />
  );
}
