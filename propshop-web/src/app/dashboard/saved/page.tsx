import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { LISTING_CARD_INCLUDE, toCardVM } from "@/lib/listings";
import { MIN_PUBLIC_TRUST, LIST_PAGE } from "@/lib/enums";
import ListingCard from "@/components/ListingCard";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "الوحدات المحفوظة", en: "Saved homes" });
}
export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";

  const saved = await prisma.savedListing.findMany({
    where: { userId: session.id },
    include: { listing: { include: LISTING_CARD_INCLUDE } },
    orderBy: { createdAt: "desc" },
    // Each row carries a full card payload, so this is the heaviest per-user list.
    take: LIST_PAGE,
  });

  // A saved unit that has since been closed or unpublished should not reappear as live.
  const visible = saved.filter((s) => s.listing.status === "live" && s.listing.trustLevel >= MIN_PUBLIC_TRUST);
  const goneCount = saved.length - visible.length;

  return (
    <>
      <h1 className="text-[24px] font-bold text-ink-900">{ar ? "الوحدات المحفوظة" : "Saved units"}</h1>

      {visible.length === 0 ? (
        <p className="mt-6 border-t border-[var(--border)] pt-4 text-[14px] muted">
          {ar ? "مفيش وحدات محفوظة. اضغط على القلب في أي إعلان عشان يتحفظ هنا. " : "Nothing saved. Tap the heart on any listing to keep it here. "}
          <Link href="/" className="font-semibold text-brand-500 hover:underline">
            {t("hero_cta_browse", locale)}
          </Link>
        </p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => (
            <ListingCard key={s.id} vm={toCardVM(s.listing)} locale={locale} layout="grid" />
          ))}
        </div>
      )}

      {goneCount > 0 && (
        <p className="tnum mt-6 text-[13px] muted">
          {ar
            ? `${goneCount} من الوحدات المحفوظة اتقفلت أو اتشالت من المنصة.`
            : goneCount === 1
              ? "1 saved unit has since been closed or removed."
              : `${goneCount} saved units have since been closed or removed.`}
        </p>
      )}
    </>
  );
}
