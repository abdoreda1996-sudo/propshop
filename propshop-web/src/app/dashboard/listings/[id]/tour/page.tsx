import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { TOUR_SELECT } from "@/lib/tourService";
import TourManager from "@/components/TourManager";
import TourBookingCard from "@/components/TourBookingCard";
import { ownerBookingView } from "@/lib/tourBooking";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "الجولة الافتراضية", en: "Virtual tour" });
}
export const dynamic = "force-dynamic";

/**
 * The owner adds virtual tours to one of their listings — a hosted link or an uploaded
 * walkthrough video. Each waits for the team's review before it appears publicly, so this
 * works on a live listing without unpublishing it.
 */
export default async function ListingTourPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, locale, { id }] = await Promise.all([getSession(), getLocale(), params]);
  if (!session) return null;
  const ar = locale === "ar";

  const listing = await prisma.listing.findFirst({
    where: { OR: [{ id }, { reference: id }], unit: { ownerId: session.id } },
    select: {
      id: true,
      reference: true,
      titleAr: true,
      titleEn: true,
      status: true,
      tours: { select: TOUR_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  // Someone else's listing is a 404, not a 403: do not confirm it exists.
  if (!listing) notFound();
  const booking = await ownerBookingView(listing.id, session.id);

  return (
    <>
      <Link href="/dashboard/listings" className="text-[13px] muted hover:underline">
        {ar ? "رجوع لإعلاناتي" : "Back to my listings"}
      </Link>
      <h1 className="mt-2 text-[24px] font-bold text-ink-900">{ar ? "الجولة الافتراضية" : "Virtual tour"}</h1>
      <p className="tnum mt-1 text-[14px] muted">
        {listing.reference} · {(ar ? listing.titleAr : listing.titleEn) || ""}
      </p>
      <p className="mt-3 max-w-2xl text-[14px] leading-7 text-ink-900">
        {ar
          ? "الوحدات اللي فيها جولة فيديو بتاخد اهتمام أكتر: المشتري يشوف الشقة كاملة قبل المعاينة. حط لينك يوتيوب أو جولة ثلاثية الأبعاد، أو ارفع فيديو صورته بنفسك."
          : "Listings with a video tour get more attention: buyers see the whole unit before booking a viewing. Add a YouTube link or a 3D tour, or upload a video you filmed yourself."}
      </p>
      {booking && (
        <div className="mt-6 max-w-3xl">
          <TourBookingCard
            listingId={listing.id}
            booking={booking.booking ? JSON.parse(JSON.stringify(booking.booking)) : booking.last?.status === "delivered" ? JSON.parse(JSON.stringify(booking.last)) : null}
            fee={booking.fee}
            bookable={booking.bookable}
            locale={locale}
          />
        </div>
      )}
      <h2 className="mt-9 border-b border-ink-900 pb-2 text-[17px] font-bold text-ink-900">{ar ? "أو أضف جولتك بنفسك" : "Or add your own tour"}</h2>
      <div className="mt-3 max-w-3xl">
        {["closed", "sold"].includes(listing.status) ? (
          <p className="text-[14px] muted">{ar ? "الإعلان ده مقفول." : "This listing is closed."}</p>
        ) : (
          <TourManager listingId={listing.id} initial={listing.tours} locale={locale} canReview={false} canDelete addsApproved={false} />
        )}
      </div>
    </>
  );
}
