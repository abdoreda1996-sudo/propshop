import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { validateListing } from "@/lib/listingFlow";
import { parseJson } from "@/lib/json";
import { formatPriceExact, formatNumber, formatDate } from "@/lib/format";
import { UNIT_TYPE_LABELS, FINISHING_LABELS, ROOM_LABELS, UnitType, Finishing, Room } from "@/lib/enums";
import ReviewActions from "@/components/admin/ReviewActions";
import { canAccessAdminSection, canEditListings, canDecideVerification } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import { LocationBadge, LocationIssues, flaggedMediaIds } from "@/components/admin/LocationReview";
import { BulkProvider, BulkCheckbox, BulkSelectAll, BulkBar } from "@/components/admin/Bulk";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, assigneeWhere, oneOf, keepParams, SearchParams } from "@/lib/adminList";
import { UNIT_TYPES } from "@/lib/enums";
import IdentityDocs, { IdentityDocRow } from "@/components/admin/IdentityDocs";
import { ID_DOC_TYPES } from "@/lib/kyc";
import { manualReviewWhere } from "@/lib/kycService";
import { AdminTitle, AdminTabs, AdminEmpty } from "@/components/admin/AdminUi";
import { docTypeLabel } from "@/components/admin/labels";
import OwnershipDocPages from "@/components/admin/OwnershipDocPages";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "طابور التوثيق", en: "Verification queue" });
}
export const dynamic = "force-dynamic";

/**
 * Verification queue (Phase 0 checklist). The reviewer only ever sees listings that
 * already passed the automated checks — so this page shows the extraction next to what
 * the owner typed, and the reviewer's job is judgement, not data entry.
 */
export default async function VerificationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Guarded here as well as in the layout: a layout hides the nav link, it does not
  // stop a direct URL. This page renders the data, so it decides who may see it.
  const guardSession = await getSession();
  if (!guardSession || !canAccessAdminSection(guardSession.role, "verification")) notFound();

  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const onlyIssues = param(sp, "location") === "issues";
  const { page, skip, take, pageSize } = pageOf(sp);
  const q = param(sp, "q");
  const area = param(sp, "area");
  const type = oneOf(param(sp, "type"), UNIT_TYPES);
  const assignee = param(sp, "assignee");

  // Filters compose with paging: every filter is a URL param, so a view can be shared.
  const where = {
    status: "pending_review",
    ...(onlyIssues ? { locationStatus: "issues" } : {}),
    ...assigneeWhere("assignedReviewerId", assignee, guardSession.id),
    ...(q ? { OR: [{ reference: { contains: q } }, { titleAr: { contains: q } }, { titleEn: { contains: q } }] } : {}),
    ...(area || type ? { unit: { ...(area ? { area: { slug: area } } : {}), ...(type ? { type } : {}) } } : {}),
  };

  const [pending, issueCount, totalPending, filteredTotal, areas, reviewers] = await Promise.all([
    prisma.listing.findMany({
      where,
      include: {
        unit: { include: { compound: true, area: true, owner: true } },
        media: { orderBy: { sortOrder: "asc" } },
        kycDocuments: true,
        assignedReviewer: { select: { fullName: true } },
      },
      // Location problems first: they are the ones a reviewer most needs to look at.
      orderBy: [{ locationStatus: "asc" }, { updatedAt: "asc" }],
      skip,
      take,
    }),
    prisma.listing.count({ where: { status: "pending_review", locationStatus: "issues" } }),
    prisma.listing.count({ where: { status: "pending_review" } }),
    prisma.listing.count({ where }),
    prisma.area.findMany({ select: { slug: true, nameAr: true, nameEn: true }, orderBy: { nameEn: "asc" } }),
    prisma.user.findMany({ where: { role: { in: ["admin", "reviewer"] }, isBlocked: false }, select: { id: true, fullName: true, role: true }, orderBy: { fullName: "asc" } }),
  ]);
  const canDecide = canDecideVerification(guardSession.role);

  // Identity documents flagged for manual review (unreadable card, number not read or not
  // matching the typed one). They hold the account below level 1 until decided, so they
  // are listed here whether or not the account has a listing in the queue.
  const [flaggedRows, flaggedCount] = await Promise.all([
    prisma.kycDocument.findMany({ where: manualReviewWhere(), select: { userId: true }, orderBy: { createdAt: "asc" }, take: 200 }),
    prisma.kycDocument.count({ where: manualReviewWhere() }),
  ]);
  const flaggedUserIds = [...new Set(flaggedRows.map((r) => r.userId))].slice(0, 20);
  const ownerIds = [...new Set(pending.map((l) => l.unit.ownerId))];
  const [idDocs, flaggedUsers] = await Promise.all([
    prisma.kycDocument.findMany({
      where: { userId: { in: [...new Set([...ownerIds, ...flaggedUserIds])] }, type: { in: [...ID_DOC_TYPES] }, listingId: null },
      select: { id: true, userId: true, type: true, status: true, fileKey: true, extractedJson: true, rejectReason: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { id: { in: flaggedUserIds } },
      select: { id: true, fullName: true, publicRef: true, nationalIdHash: true },
    }),
  ]);
  const docsOf = (userId: string): IdentityDocRow[] => idDocs.filter((d) => d.userId === userId);

  // Re-run the gate for each so the reviewer sees the current state, not a stale snapshot.
  const validations = await Promise.all(pending.map((l) => validateListing(l.id)));

  return (
    <>
      <AdminTitle
        title={ar ? "طابور التوثيق" : "Verification queue"}
        intro={
          ar
            ? "إعلانات عدّت الفحص الآلي ومستنية مراجعة. أي إعلان فيه مانع مش هيتنشر حتى لو اعتمدته."
            : "Listings that passed the automated checks and are waiting for a person. A listing with a blocking check will not publish even if you approve it."
        }
      />

      {/* Location filter: the automatic check's findings, one click away. */}
      <AdminTabs
        locale={locale}
        tabs={[
          { href: "/admin/verification", label: ar ? "الكل" : "All", count: totalPending, active: !onlyIssues },
          { href: "/admin/verification?location=issues", label: ar ? "مشاكل الموقع" : "Location issues", count: issueCount, active: onlyIssues, alert: true },
        ]}
      />

      {/* Identity checks a human has to make. */}
      {flaggedUsers.length > 0 && (
        <section className="mt-6 border-s-2 border-accent-500 ps-4">
          <h2 className="text-[15px] font-semibold text-ink-900">
            {ar ? "هويات محتاجة مراجعة يدوية" : "Identity checks needing manual review"}
            <span className="tnum ms-2 font-normal text-ink-500">{formatNumber(flaggedCount, locale)}</span>
          </h2>
          <p className="mt-1 text-[12px] muted">
            {ar
              ? "الصور اتخزنت بس القراءة الآلية ماكملتش. الحساب مش هيتوثق لحد ما تعتمد أو ترفض."
              : "The photos are stored but the automatic read did not complete. The account stays unverified until you approve or reject."}
          </p>
          <ul className="mt-4 space-y-5">
            {flaggedUsers.map((u) => (
              <li key={u.id} className="border-t border-[var(--border)] pt-4 first:border-0 first:pt-0">
                <p className="mb-2 text-[13px] font-semibold text-ink-900">
                  {u.fullName}
                  {u.publicRef !== null && <span className="tnum ms-2 muted">#{u.publicRef}</span>}
                </p>
                <IdentityDocs docs={docsOf(u.id)} hasIdHash={!!u.nationalIdHash} locale={locale} canDecide={canDecide} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <FilterBar
        basePath="/admin/verification"
        locale={locale}
        keep={onlyIssues ? { location: "issues" } : {}}
        values={{ q, area, type, assignee }}
        fields={[
          { kind: "search", name: "q", placeholder: ar ? "رقم الإعلان أو العنوان" : "Reference or title" },
          { kind: "select", name: "area", label: ar ? "المنطقة" : "Area", options: areas.map((a) => ({ value: a.slug, label: ar ? a.nameAr : a.nameEn })) },
          { kind: "select", name: "type", label: ar ? "النوع" : "Type", options: UNIT_TYPES.map((t) => ({ value: t, label: UNIT_TYPE_LABELS[t][locale] })) },
          {
            kind: "select",
            name: "assignee",
            label: ar ? "مسندة لـ" : "Assigned to",
            options: [
              { value: "me", label: ar ? "أنا" : "Me" },
              { value: "none", label: ar ? "مش مسندة" : "Unassigned" },
              ...reviewers.map((r) => ({ value: r.id, label: r.fullName })),
            ],
          },
        ]}
      />

      {pending.length === 0 ? (
        <AdminEmpty>{ar ? "مافيش حاجة مستنية مراجعة." : "Nothing awaiting review."}</AdminEmpty>
      ) : (
        <BulkProvider ids={pending.map((l) => l.id)}>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <BulkSelectAll locale={locale} />
        </div>
        <BulkBar
          entity="listing"
          locale={locale}
          actions={
            canDecide
              ? [
                  { key: "approve", label: ar ? "اعتمد ونشر" : "Approve & publish" },
                  { key: "reject", label: ar ? "ارفض" : "Reject", needsReason: true, danger: true },
                ]
              : []
          }
          staff={canDecide ? reviewers : undefined}
          assignLabel={ar ? "أسند لمراجع…" : "Assign to reviewer…"}
        />
        <ul className="mt-4 space-y-6">
          {pending.map((l, i) => {
            const v = validations[i];
            const doc = l.kycDocuments.find((d) => ["deed", "contract", "allocation", "court_contract"].includes(d.type));
            const extracted = parseJson<Record<string, unknown>>(doc?.extractedJson ?? null, {});
            const flagged = flaggedMediaIds(l.locationIssuesJson);

            // Side-by-side: what Claude read vs what the owner typed.
            const comparisons = [
              { label: ar ? "اسم المالك" : "Owner name", doc: extracted.ownerName, typed: l.unit.owner.fullName },
              { label: ar ? "الكمبوند" : "Compound", doc: extracted.compoundName, typed: ar ? l.unit.compound?.nameAr : l.unit.compound?.nameEn },
              { label: ar ? "المبنى" : "Building", doc: extracted.building, typed: l.unit.building },
              { label: ar ? "رقم الوحدة" : "Unit number", doc: extracted.unitNumber, typed: l.unit.unitNumber },
              { label: ar ? "المساحة" : "Size", doc: extracted.sizeSqm, typed: l.unit.sizeSqm },
              {
                label: ar ? "النوع" : "Type",
                doc: typeof extracted.unitType === "string" ? (UNIT_TYPE_LABELS[extracted.unitType as UnitType]?.[locale] ?? extracted.unitType) : extracted.unitType,
                typed: UNIT_TYPE_LABELS[l.unit.type as UnitType]?.[locale] ?? l.unit.type,
              },
            ];

            return (
              <li key={l.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <BulkCheckbox id={l.id} label={l.reference} />
                      <span className="tnum text-[15px] font-bold text-ink-900">{l.reference}</span>
                      <span className="badge badge-neutral">
                        {l.assignedReviewer ? `${ar ? "مسندة لـ" : "Assigned:"} ${l.assignedReviewer.fullName}` : ar ? "مش مسندة" : "Unassigned"}
                      </span>
                      <span className="badge badge-neutral">
                        {UNIT_TYPE_LABELS[l.unit.type as UnitType]?.[locale] ?? l.unit.type}
                      </span>
                      {v?.canPublish ? (
                        <span className="badge badge-verified">{ar ? "عدّى كل الفحوصات" : "All checks passed"}</span>
                      ) : (
                        <span className="badge badge-above">
                          {ar ? `${v?.blocks.length ?? 0} مانع` : `${v?.blocks.length ?? 0} blocking`}
                        </span>
                      )}
                      <LocationBadge status={l.locationStatus} locale={locale} />
                      {extracted.manualReview === true && doc?.status === "pending" && (
                        <span className="badge badge-accent">{ar ? "مستند للمراجعة اليدوية" : "Document: manual review"}</span>
                      )}
                    </div>
                    <p className="mt-2 text-[14px] font-semibold text-ink-900">
                      {(ar ? l.titleAr : l.titleEn) || "—"}
                    </p>
                    <p className="tnum mt-0.5 text-[13px] muted">
                      {formatPriceExact(l.price, locale, l.currency)} ·{" "}
                      {formatNumber(l.unit.sizeSqm, locale)} {ar ? "م²" : "sqm"} ·{" "}
                      {FINISHING_LABELS[l.unit.finishing as Finishing]?.[locale]} ·{" "}
                      {ar ? l.unit.area.nameAr : l.unit.area.nameEn}
                    </p>
                    <p className="mt-1 text-[12px] muted">
                      {ar ? "المالك" : "Owner"}: {l.unit.owner.fullName} · {ar ? "مستوى الثقة" : "trust"}{" "}
                      {l.unit.owner.trustLevel} · {ar ? "إنذارات" : "strikes"} {l.unit.owner.strikes}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canEditListings(guardSession.role) && (
                      <Link href={`/admin/listings/${l.id}/edit`} className="btn btn-ghost px-3 py-1.5 text-[13px]">
                        {ar ? "تعديل" : "Edit"}
                      </Link>
                    )}
                    <Link href={`/admin/listings/${l.id}`} className="btn btn-ghost px-3 py-1.5 text-[13px]">
                      {ar ? "كل التفاصيل" : "Full detail"}
                    </Link>
                  </div>
                </div>

                {/* Photos — any the location check flagged are outlined in red. */}
                <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                  {l.media.slice(0, 8).map((m) => (
                    <div
                      key={m.id}
                      className={`media-frame h-20 w-28 shrink-0 rounded-md ${
                        flagged.has(m.id) ? "ring-2 ring-danger-600" : ""
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.thumbKey ?? m.fileKey} alt={m.room ?? ""} className="h-full w-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-ink-900/70 px-1 py-0.5 text-center text-[12px] text-white">
                        {m.room ? (ROOM_LABELS[m.room as Room]?.[locale] ?? m.room) : "—"} ·{" "}
                        {m.source === "in_app" ? "GPS" : m.source === "photographer" ? (ar ? "مصور" : "shot") : m.source}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Automatic location check */}
                {l.locationStatus === "issues" && (
                  <div className="mt-5">
                    <h3 className="mb-2 text-[13px] font-bold text-ink-900">
                      {ar ? "فحص الموقع التلقائي" : "Automatic location check"}
                    </h3>
                    <LocationIssues issuesJson={l.locationIssuesJson} checkedAt={l.locationCheckedAt} locale={locale} />
                  </div>
                )}

                {/* The owner's identity photos, so the name and number can be checked by eye */}
                <div className="mt-5">
                  <h3 className="mb-2 text-[13px] font-bold text-ink-900">
                    {ar ? "هوية المالك" : "Owner identity"}
                  </h3>
                  <IdentityDocs
                    docs={docsOf(l.unit.ownerId)}
                    hasIdHash={!!l.unit.owner.nationalIdHash}
                    locale={locale}
                    canDecide={canDecide}
                  />
                </div>

                {/* Document extraction vs typed */}
                <div className="mt-5">
                  <h3 className="text-[13px] font-bold text-ink-900">
                    {ar ? "المستند مقابل اللي المالك كتبه" : "Document vs what the owner typed"}
                    {doc && <span className="ms-2 font-normal text-ink-500">({docTypeLabel(doc.type, locale)})</span>}
                  </h3>
                  {doc ? (
                    <OwnershipDocPages doc={doc} extracted={extracted} locale={locale} />
                  ) : (
                    <p className="mt-2 text-[13px] muted">{ar ? "مافيش مستند ملكية مرفوع." : "No ownership document uploaded."}</p>
                  )}
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[500px] text-[13px]">
                      <thead>
                        <tr className="border-b border-ink-900 text-start text-[12px] text-ink-500">
                          <th className="py-2 text-start font-semibold">{ar ? "الحقل" : "Field"}</th>
                          <th className="py-2 text-start font-semibold">{ar ? "في المستند" : "On document"}</th>
                          <th className="py-2 text-start font-semibold">{ar ? "اللي اتكتب" : "Typed"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparisons.map((c) => {
                          const docVal = c.doc === null || c.doc === undefined ? "—" : String(c.doc);
                          const typedVal = c.typed === null || c.typed === undefined ? "—" : String(c.typed);
                          const match = docVal !== "—" && typedVal !== "—" && docVal.trim() === typedVal.trim();
                          return (
                            <tr key={c.label} className="border-b border-[var(--border)] last:border-0">
                              <td className="py-2 muted">{c.label}</td>
                              <td className="py-2 font-medium text-ink-900">{docVal}</td>
                              <td className={`py-2 font-medium ${match ? "text-ok-700" : "text-ink-900"}`}>
                                {typedVal}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {typeof extracted.legibilityNotes === "string" && extracted.legibilityNotes && (
                    <p className="mt-2 border-s-2 border-ink-400 bg-ink-50 px-3 py-2 text-[12px] text-ink-900">
                      {extracted.legibilityNotes}
                    </p>
                  )}
                </div>

                {/* Gate results */}
                {v && (v.blocks.length > 0 || v.warnings.length > 0) && (
                  <div className="mt-5 space-y-2">
                    {v.blocks.map((b) => (
                      <div key={b.code} className="border-s-2 border-danger-600 bg-danger-50 px-3 py-2 text-[13px] text-danger-700">
                        <span>
                          {locale === "ar" ? b.messageAr : b.messageEn}
                          {b.field && <span className="ms-2 opacity-70">({b.field})</span>}
                        </span>
                      </div>
                    ))}
                    {v.warnings.map((w) => (
                      <div key={w.code} className="border-s-2 border-ink-400 bg-ink-50 px-3 py-2 text-[13px] text-ink-900">
                        <span>{locale === "ar" ? w.messageAr : w.messageEn}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="mt-4 text-[12px] muted">
                  {ar ? "اتبعت للمراجعة" : "Submitted"} {formatDate(l.updatedAt, locale)} ·{" "}
                  {ar ? "مستوى الثقة لو اتنشر" : "trust level if published"}: {v?.trustLevel ?? "—"}
                </p>

                <ReviewActions listingId={l.id} locale={locale} canPublish={!!v?.canPublish} />
              </li>
            );
          })}
        </ul>
        </BulkProvider>
      )}

      <Pager basePath="/admin/verification" params={keepParams(sp)} page={page} total={filteredTotal} pageSize={pageSize} locale={locale} />
    </>
  );
}
