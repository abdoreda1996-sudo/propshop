import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { canAccessAdminSection, canDecideVerification, canEditListings } from "@/lib/permissions";
import { validateListing } from "@/lib/listingFlow";
import { parseJson } from "@/lib/json";
import { formatPriceExact, formatNumber, formatDate } from "@/lib/format";
import { UNIT_TYPE_LABELS, FINISHING_LABELS, ROOM_LABELS, PAYMENT_TYPE_LABELS, TRUST_LABELS, UnitType, Finishing, Room, VIEWABLE_STATUSES, ListingStatus } from "@/lib/enums";
import OwnershipDocPages from "@/components/admin/OwnershipDocPages";
import { docTypeLabel, docStatusLabel, mediaSourceLabel, offerStatusLabel, reportReasonLabel, reportStatusLabel, roleLabel } from "@/components/admin/labels";
import { effectiveStatus } from "@/lib/offers";
import { STAGE_LABELS, DealStage } from "@/lib/deals";

// Seeded deals still carry the old stage names; show them under the current ones.
const LEGACY_STAGE: Record<string, DealStage> = { deposit_held: "reserved", balance_handover: "transfer", closed: "completed" };
import ReviewActions from "@/components/admin/ReviewActions";
import TourManager from "@/components/TourManager";
import { TOUR_SELECT } from "@/lib/tourService";
import { LocationBadge, LocationIssues, flaggedMediaIds } from "@/components/admin/LocationReview";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "تفاصيل الإعلان", en: "Listing details" });
}
export const dynamic = "force-dynamic";

/**
 * One listing, everything the back office knows about it: every photo with its source and
 * GPS, the ownership document against what was typed, the automatic location check, the
 * publish gate, negotiation activity, reports, and the audit trail.
 *
 * Reached from the verification queue ("Full detail") and the listings table. Accepts the
 * id or the AQ- reference — never infer which from a prefix (see /api/listings/[id]).
 */
export default async function AdminListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Guarded here as well as in the layout: a layout hides the nav link, it does not
  // stop a direct URL. This page renders the data, so it decides who may see it.
  const session = await getSession();
  if (!session || !canAccessAdminSection(session.role, "listings")) notFound();

  const [locale, { id }] = await Promise.all([getLocale(), params]);
  const ar = locale === "ar";

  const listing = await prisma.listing.findFirst({
    where: { OR: [{ id }, { reference: id }] },
    include: {
      unit: { include: { compound: true, area: true, owner: true } },
      media: { orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] },
      tours: { where: { status: { not: "rejected" } }, select: TOUR_SELECT, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      kycDocuments: { orderBy: { createdAt: "desc" } },
      offers: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { buyer: { select: { publicRef: true } } },
      },
      deals: { orderBy: { createdAt: "desc" }, take: 5 },
      reports: { orderBy: { createdAt: "desc" }, take: 20 },
      priceHistory: { orderBy: { changedAt: "desc" }, take: 10 },
    },
  });
  if (!listing) notFound();

  const [gate, auditTrail] = await Promise.all([
    validateListing(listing.id),
    prisma.auditLog.findMany({
      where: { entity: "listing", entityId: listing.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { actor: { select: { fullName: true, role: true } } },
    }),
  ]);

  // Null only if the listing vanished between the two reads; render as "cannot publish".
  const validation = gate ?? { canPublish: false, blocks: [], warnings: [], trustLevel: listing.trustLevel };
  const { unit } = listing;
  const flagged = flaggedMediaIds(listing.locationIssuesJson);
  const doc = listing.kycDocuments.find((d) => ["deed", "contract", "allocation", "court_contract"].includes(d.type));
  const extracted = parseJson<Record<string, unknown>>(doc?.extractedJson ?? null, {});
  const comparisons = [
    { label: ar ? "اسم المالك" : "Owner name", doc: extracted.ownerName, typed: unit.owner.fullName },
    { label: ar ? "الكمبوند" : "Compound", doc: extracted.compoundName, typed: ar ? unit.compound?.nameAr : unit.compound?.nameEn },
    { label: ar ? "المبنى" : "Building", doc: extracted.building, typed: unit.building },
    { label: ar ? "رقم الوحدة" : "Unit number", doc: extracted.unitNumber, typed: unit.unitNumber },
    { label: ar ? "المساحة" : "Size", doc: extracted.sizeSqm, typed: unit.sizeSqm },
    {
      label: ar ? "النوع" : "Type",
      doc: typeof extracted.unitType === "string" ? (UNIT_TYPE_LABELS[extracted.unitType as UnitType]?.[locale] ?? extracted.unitType) : extracted.unitType,
      typed: UNIT_TYPE_LABELS[unit.type as UnitType]?.[locale] ?? unit.type,
    },
  ];
  const publicLink = VIEWABLE_STATUSES.includes(listing.status as ListingStatus);
  const Back = ar ? ArrowRight : ArrowLeft;

  const facts: [string, string][] = [
    [ar ? "النوع" : "Type", UNIT_TYPE_LABELS[unit.type as UnitType]?.[locale] ?? unit.type],
    [ar ? "المساحة" : "Size", `${formatNumber(unit.sizeSqm, locale)} ${ar ? "م²" : "sqm"}`],
    [ar ? "التشطيب" : "Finishing", FINISHING_LABELS[unit.finishing as Finishing]?.[locale] ?? unit.finishing],
    [ar ? "المنطقة" : "Area", ar ? unit.area.nameAr : unit.area.nameEn],
    [ar ? "الكمبوند" : "Compound", (ar ? unit.compound?.nameAr : unit.compound?.nameEn) ?? "—"],
    [ar ? "المبنى / الوحدة" : "Building / unit", `${unit.building ?? "—"} / ${unit.unitNumber ?? "—"}`],
    [ar ? "الغرض" : "Purpose", listing.purpose === "rent" ? (ar ? "إيجار" : "Rent") : ar ? "بيع" : "Sale"],
    [ar ? "الدفع" : "Payment", PAYMENT_TYPE_LABELS[listing.paymentType]?.[locale] ?? listing.paymentType],
    [ar ? "المتبقي للمطور" : "Remaining to developer", listing.remainingToDeveloper == null ? "—" : formatPriceExact(listing.remainingToDeveloper, locale, listing.currency)],
    [ar ? "صيانة مستحقة" : "Maintenance due", listing.maintenanceDue == null ? "—" : formatPriceExact(listing.maintenanceDue, locale, listing.currency)],
    [ar ? "المشاهدات" : "Views", formatNumber(listing.views, locale)],
    [ar ? "أُنشئ" : "Created", formatDate(listing.createdAt, locale)],
    [ar ? "نُشر" : "Published", listing.publishedAt ? formatDate(listing.publishedAt, locale) : "—"],
    [ar ? "ينتهي" : "Expires", listing.expiresAt ? formatDate(listing.expiresAt, locale) : "—"],
  ];

  return (
    <>
      <Link href="/admin/listings" className="inline-flex items-center gap-1 text-[13px] muted hover:underline">
        <Back size={14} />
        {ar ? "كل الإعلانات" : "All listings"}
      </Link>

      {/* Header */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="tnum text-[22px] font-bold tracking-tight text-ink-900">{listing.reference}</h1>
            <span className="badge badge-neutral">{t(`status_${listing.status}`, locale)}</span>
            <span className="badge badge-neutral">{TRUST_LABELS[listing.trustLevel]?.[locale] ?? listing.trustLevel}</span>
            <LocationBadge status={listing.locationStatus} locale={locale} />
          </div>
          <p className="mt-1 text-[15px] font-semibold text-ink-900">{(ar ? listing.titleAr : listing.titleEn) || "—"}</p>
          <p className="tnum mt-0.5 text-[18px] font-bold text-ink-900">
            {formatPriceExact(listing.price, locale, listing.currency)}
          </p>
          {listing.rejectReason && (
            <p className="mt-2 border-s-2 border-danger-600 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
              {ar ? "سبب الرفض" : "Rejected"}: {listing.rejectReason}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEditListings(session.role) && (
            <Link href={`/admin/listings/${listing.id}/edit`} className="btn btn-primary text-[13px]">
              {ar ? "تعديل الوحدة والصور" : "Edit unit & photos"}
            </Link>
          )}
          {publicLink && (
            <Link href={`/listing/${listing.reference}`} className="btn btn-ghost text-[13px]">
              {ar ? "الصفحة العامة" : "Public page"}
            </Link>
          )}
        </div>
      </div>

      {listing.status === "pending_review" && canDecideVerification(session.role) && (
        <div className="mt-2">
          <ReviewActions listingId={listing.id} locale={locale} canPublish={validation.canPublish} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="min-w-0 space-y-8 lg:col-span-2">
          {/* Photos */}
          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">
              {ar ? "الصور" : "Photos"} <span className="tnum muted">({formatNumber(listing.media.length, locale)})</span>
            </h2>
            {listing.media.length === 0 ? (
              <p className="mt-2 text-[13px] muted">{ar ? "مافيش صور." : "No photos."}</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {listing.media.map((m) => (
                  <figure key={m.id} className="text-[12px]">
                    <div
                      className={`media-frame aspect-[4/3] rounded-md ${flagged.has(m.id) ? "ring-2 ring-danger-600" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.thumbKey ?? m.fileKey} alt={m.room ?? ""} className="h-full w-full object-cover" />
                      {m.isCover && (
                        <span className="badge badge-verified absolute start-1 top-1">{ar ? "الغلاف" : "Cover"}</span>
                      )}
                    </div>
                    <figcaption className="mt-1 muted">
                      {m.room ? (ROOM_LABELS[m.room as Room]?.[locale] ?? m.room) : "—"} · {mediaSourceLabel(m.source, locale)}
                      {m.isVerified && <span className="ms-1 text-ok-700">{ar ? "· متحقق" : "· checked"}</span>}
                      <br />
                      <span className="tnum">
                        {m.gpsLat != null && m.gpsLng != null ? `${m.gpsLat.toFixed(5)}, ${m.gpsLng.toFixed(5)}` : ar ? "بدون GPS" : "no GPS"}
                        {m.capturedAt && ` · ${formatDate(m.capturedAt, locale)}`}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          {/* Location check */}
          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">{ar ? "فحص الموقع التلقائي" : "Automatic location check"}</h2>
            <div className="mt-3">
              {listing.locationStatus === "issues" ? (
                <LocationIssues issuesJson={listing.locationIssuesJson} checkedAt={listing.locationCheckedAt} locale={locale} />
              ) : (
                <p className="text-[13px] muted">
                  <LocationBadge status={listing.locationStatus} locale={locale} />
                  {listing.locationCheckedAt && <span className="ms-2">{formatDate(listing.locationCheckedAt, locale)}</span>}
                </p>
              )}
            </div>
          </section>

          {/* Virtual tours — owner-added ones wait here for review */}
          <section className="border-t border-ink-900 pt-3" id="tours">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink-900">
              {ar ? "الجولات الافتراضية" : "Virtual tours"}
              {listing.tours.some((t) => t.status === "pending") && (
                <span className="badge badge-above">
                  {ar ? "محتاجة مراجعة" : "Needs review"}: {listing.tours.filter((t) => t.status === "pending").length}
                </span>
              )}
            </h2>
            <div className="mt-3">
              <TourManager
                listingId={listing.id}
                initial={listing.tours}
                locale={locale}
                canReview={canDecideVerification(session.role)}
                canDelete={session.role === "admin"}
                addsApproved
              />
            </div>
          </section>

          {/* Document vs typed */}
          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">
              {ar ? "المستند مقابل اللي المالك كتبه" : "Document vs what the owner typed"}
              {doc && (
                <span className="ms-2 text-[13px] font-normal text-ink-500">
                  ({docTypeLabel(doc.type, locale)} · {docStatusLabel(doc.status, locale)})
                </span>
              )}
            </h2>
            {!doc ? (
              <p className="mt-2 text-[13px] muted">{ar ? "مافيش مستند ملكية مرفوع." : "No ownership document uploaded."}</p>
            ) : (
              <>
              <OwnershipDocPages doc={doc} extracted={extracted} locale={locale} />
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[460px] text-[13px]">
                  <thead>
                    <tr className="border-b border-ink-900 text-[12px] text-ink-500">
                      <th className="py-2 text-start font-semibold">{ar ? "الحقل" : "Field"}</th>
                      <th className="py-2 text-start font-semibold">{ar ? "في المستند" : "On document"}</th>
                      <th className="py-2 text-start font-semibold">{ar ? "اللي اتكتب" : "Typed"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisons.map((c) => {
                      const docVal = c.doc == null ? "—" : String(c.doc);
                      const typedVal = c.typed == null ? "—" : String(c.typed);
                      const match = docVal !== "—" && typedVal !== "—" && docVal.trim() === typedVal.trim();
                      return (
                        <tr key={c.label} className="border-b border-[var(--border)] last:border-0">
                          <td className="py-2 muted">{c.label}</td>
                          <td className="py-2 font-medium text-ink-900">{docVal}</td>
                          <td className={`py-2 font-medium ${match ? "text-ok-700" : "text-ink-900"}`}>{typedVal}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>

          {/* Gate */}
          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">
              {ar ? "بوابة النشر" : "Publish gate"}{" "}
              <span className="text-[13px] font-normal muted">
                · {ar ? "مستوى الثقة لو اتنشر" : "trust level if published"}: {TRUST_LABELS[validation.trustLevel]?.[locale] ?? validation.trustLevel}
              </span>
            </h2>
            <div className="mt-3 space-y-2">
              {validation.blocks.length === 0 && validation.warnings.length === 0 && (
                <p className="text-[13px] text-ok-700">
                  {ar ? "عدّى كل الفحوصات" : "All checks passed"}
                </p>
              )}
              {validation.blocks.map((b) => (
                <div key={b.code} className="border-s-2 border-danger-600 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
                  <span>{ar ? b.messageAr : b.messageEn}</span>
                </div>
              ))}
              {validation.warnings.map((w) => (
                <div key={w.code} className="border-s-2 border-ink-400 bg-ink-50 px-3 py-2 text-[13px] text-ink-900">
                  <span>{ar ? w.messageAr : w.messageEn}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Offers & deals */}
          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">{ar ? "العروض والصفقات" : "Offers & deals"}</h2>
            {listing.deals.length > 0 && (
              <ul className="mt-3 space-y-1 text-[13px]">
                {listing.deals.map((d) => (
                  <li key={d.id} className="flex flex-wrap gap-2">
                    <span className="tnum font-semibold text-ink-900">{d.reference}</span>
                    <span className="badge badge-neutral">{STAGE_LABELS[(LEGACY_STAGE[d.stage] ?? d.stage) as DealStage]?.[locale] ?? d.stage}</span>
                    <span className="tnum muted">{formatPriceExact(d.agreedPrice, locale, listing.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
            {listing.offers.length === 0 ? (
              <p className="mt-2 text-[13px] muted">{ar ? "مافيش عروض." : "No offers."}</p>
            ) : (
              <table className="mt-3 w-full text-[13px]">
                <tbody>
                  {listing.offers.map((o) => (
                    <tr key={o.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 muted">{o.direction === "seller" ? (ar ? "مقابل من المالك" : "Counter (owner)") : ar ? "عرض" : "Offer"}</td>
                      <td className="tnum py-2 muted">#{o.buyer.publicRef ?? "—"}</td>
                      <td className="tnum py-2 font-semibold text-ink-900">{formatPriceExact(o.amount, locale, o.currency)}</td>
                      <td className="py-2"><span className="badge badge-neutral">{offerStatusLabel(effectiveStatus(o), locale)}</span></td>
                      <td className="py-2 muted">{formatDate(o.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Side column */}
        <div className="space-y-8">
          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">{ar ? "الوحدة" : "Unit"}</h2>
            <dl className="facts mt-2 text-[13px]">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="muted">{k}</dt>
                  <dd className="tnum text-end font-medium text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">{ar ? "المالك" : "Owner"}</h2>
            <p className="mt-2 text-[14px] font-semibold text-ink-900">{unit.owner.fullName}</p>
            <p className="tnum text-[12px] muted">
              #{unit.owner.publicRef ?? "—"} · {TRUST_LABELS[unit.owner.trustLevel]?.[locale] ?? unit.owner.trustLevel} ·{" "}
              {ar ? "إنذارات" : "strikes"} {unit.owner.strikes}
            </p>
          </section>

          {listing.priceHistory.length > 0 && (
            <section className="border-t border-ink-900 pt-3">
              <h2 className="text-[15px] font-bold text-ink-900">{ar ? "تاريخ السعر" : "Price history"}</h2>
              <ul className="mt-2 space-y-1 text-[13px]">
                {listing.priceHistory.map((p) => (
                  <li key={p.id} className="tnum flex justify-between gap-2">
                    <span className="muted">{formatDate(p.changedAt, locale)}</span>
                    <span className="font-medium text-ink-900">{formatPriceExact(p.price, locale, listing.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">
              {ar ? "البلاغات" : "Reports"} <span className="tnum muted">({formatNumber(listing.reports.length, locale)})</span>
            </h2>
            {listing.reports.length === 0 ? (
              <p className="mt-2 text-[13px] muted">{ar ? "مافيش بلاغات." : "No reports."}</p>
            ) : (
              <ul className="mt-2 space-y-2 text-[13px]">
                {listing.reports.map((r) => (
                  <li key={r.id}>
                    <span className="badge badge-neutral">{reportStatusLabel(r.status, locale)}</span> <span className="text-ink-900">{reportReasonLabel(r.reason, locale)}</span>
                    {r.detail && <p className="mt-0.5 muted">{r.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-t border-ink-900 pt-3">
            <h2 className="text-[15px] font-bold text-ink-900">
              {ar ? "سجل التدقيق" : "Audit trail"}
            </h2>
            {auditTrail.length === 0 ? (
              <p className="mt-2 text-[13px] muted">{ar ? "مافيش أحداث مسجلة." : "No recorded events."}</p>
            ) : (
              <ol className="mt-2 space-y-2 text-[12px]">
                {auditTrail.map((a) => (
                  <li key={a.id}>
                    <span className="font-semibold text-ink-900">{a.action}</span>
                    <span className="muted">
                      {" "}
                      · {a.actor ? `${a.actor.fullName} (${roleLabel(a.actor.role, locale)})` : ar ? "النظام" : "system"} ·{" "}
                      {formatDate(a.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
