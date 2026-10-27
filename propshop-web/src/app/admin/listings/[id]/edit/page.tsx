import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { canEditListings } from "@/lib/permissions";
import AdminListingEditor from "@/components/admin/AdminListingEditor";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "تعديل الإعلان", en: "Edit listing" });
}
export const dynamic = "force-dynamic";

/** Back-office editor for one listing: unit facts, details and photos. Admin only. */
export default async function AdminListingEditPage({ params }: { params: Promise<{ id: string }> }) {
  // Page-level guard as well as the API's: the layout only knows "may open /admin".
  const session = await getSession();
  if (!session || !canEditListings(session.role)) notFound();

  const [locale, { id }] = await Promise.all([getLocale(), params]);
  const ar = locale === "ar";

  const listing = await prisma.listing.findFirst({
    where: { OR: [{ id }, { reference: id }] },
    include: {
      unit: { include: { compound: true, area: true } },
      media: { orderBy: [{ sortOrder: "asc" }] },
    },
  });
  if (!listing) notFound();
  const { unit } = listing;
  const Back = ar ? ArrowRight : ArrowLeft;

  return (
    <>
      <Link href={`/admin/listings/${listing.id}`} className="inline-flex items-center gap-1 text-[13px] muted hover:underline">
        <Back size={14} />
        {listing.reference}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-[22px] font-bold tracking-tight text-ink-900">{ar ? "تعديل الإعلان" : "Edit listing"}</h1>
        <span className="tnum badge badge-neutral">{listing.reference}</span>
        <span className="badge badge-neutral">{t(`status_${listing.status}`, locale)}</span>
      </div>
      <p className="mt-1 text-[13px] muted">
        {(ar ? unit.compound?.nameAr : unit.compound?.nameEn) ?? "—"} · {ar ? unit.area.nameAr : unit.area.nameEn} ·{" "}
        {ar
          ? "الكمبوند والمنطقة مش بيتعدلوا من هنا. نقل الوحدة لكمبوند تاني يعني إعلان جديد."
          : "Compound and area cannot be changed here. Moving a unit to another compound means a new listing."}
      </p>
      {listing.status === "live" && (
        <p className="mt-3 rounded-md border-s-2 border-accent-500 bg-accent-50 px-3 py-2 text-[13px] text-accent-700">
          {ar
            ? "الإعلان ده منشور. أي تعديل هيظهر للمشترين على طول، وبيتسجل في سجل التدقيق."
            : "This listing is live. Changes show to buyers immediately and are recorded in the audit log."}
        </p>
      )}

      <AdminListingEditor
        locale={locale}
        listingId={listing.id}
        unitType={unit.type}
        initial={{
          unit: {
            type: unit.type,
            bedrooms: unit.bedrooms,
            bathrooms: unit.bathrooms,
            sizeSqm: unit.sizeSqm,
            landSqm: unit.landSqm,
            floor: unit.floor,
            building: unit.building,
            unitNumber: unit.unitNumber,
            finishing: unit.finishing,
            deliveryStatus: unit.deliveryStatus,
            deliveryDate: unit.deliveryDate ? unit.deliveryDate.toISOString().slice(0, 10) : null,
            view: unit.view,
          },
          listing: {
            titleAr: listing.titleAr,
            titleEn: listing.titleEn,
            descriptionAr: listing.descriptionAr,
            descriptionEn: listing.descriptionEn,
            price: listing.price,
            purpose: listing.purpose,
            paymentType: listing.paymentType,
            remainingToDeveloper: listing.remainingToDeveloper,
            maintenanceDue: listing.maintenanceDue,
          },
        }}
        media={listing.media.map((m) => ({
          id: m.id,
          fileKey: m.fileKey,
          thumbKey: m.thumbKey,
          room: m.room,
          source: m.source,
          isCover: m.isCover,
          isVerified: m.isVerified,
        }))}
      />
    </>
  );
}
