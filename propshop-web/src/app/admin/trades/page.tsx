import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";

import { maskPhone } from "@/lib/antiBroker";
import { BulkProvider, BulkCheckbox, BulkSelectAll, BulkBar } from "@/components/admin/Bulk";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, assigneeWhere, keepParams, SearchParams } from "@/lib/adminList";

import { canAccessAdminSection, VIEWING_ASSIGNABLE_ROLES } from "@/lib/permissions";
import { tradeEffectiveStatus } from "@/lib/trade";
import AdminTradeCard, { AdminTrade } from "@/components/admin/AdminTradeCard";

import { AdminTitle, AdminTabs, AdminEmpty } from "@/components/admin/AdminUi";
import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "المقايضات", en: "Trades" });
}
export const dynamic = "force-dynamic";

type Tab = "in_progress" | "pending" | "mine" | "closed";
const TABS: { key: Tab; ar: string; en: string }[] = [
  { key: "in_progress", ar: "شغالين عليها", en: "In progress" },
  { key: "pending", ar: "مستنية رد المالك", en: "Awaiting owner" },
  { key: "mine", ar: "المسندة ليّا", en: "Assigned to me" },
  { key: "closed", ar: "المقفولة", en: "Closed" },
];

/**
 * Trades across the platform. Owners decide whether to trade; staff arrange the trades
 * that were accepted — two property transfers at once — through to completion.
 */
export default async function AdminTradesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await getSession();
  if (!session || !canAccessAdminSection(session.role, "trades")) notFound();
  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const tab = (TABS.find((t) => t.key === param(sp, "tab"))?.key ?? "in_progress") as Tab;
  const now = new Date();
  const { page, skip, take, pageSize } = pageOf(sp);
  const q = param(sp, "q");
  const assignee = param(sp, "assignee");
  const filter = {
    ...assigneeWhere("assignedStaffId", assignee, session.id),
    ...(q ? { OR: [{ reference: { contains: q } }, { targetListing: { reference: { contains: q } } }] } : {}),
  };

  const whereFor = (k: Tab) => {
    switch (k) {
      case "in_progress":
        return { status: "accepted", stage: { not: "completed" } };
      case "pending":
        return { status: "pending", expiresAt: { gt: now } };
      case "mine":
        return { assignedStaffId: session.id, status: { in: ["pending", "accepted"] } };
      case "closed":
        return {
          OR: [
            { status: { in: ["rejected", "withdrawn", "cancelled", "expired"] } },
            { status: "pending", expiresAt: { lte: now } },
            { status: "accepted", stage: "completed" },
          ],
        };
    }
  };

  const [counts, rows, staff, total] = await Promise.all([
    Promise.all(TABS.map((t) => prisma.tradeOffer.count({ where: whereFor(t.key) }))),
    prisma.tradeOffer.findMany({
      where: { AND: [whereFor(tab), filter] },
      include: {
        targetListing: { select: { id: true, reference: true, titleAr: true, titleEn: true, price: true } },
        units: { include: { listing: { select: { id: true, reference: true, titleAr: true, titleEn: true, price: true } } } },
        proposer: { select: { fullName: true, phone: true, publicRef: true } },
        recipient: { select: { fullName: true, phone: true, publicRef: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 20, include: { author: { select: { fullName: true } } } },
      },
      orderBy: tab === "in_progress" ? { stageUpdatedAt: "asc" } : { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.user.findMany({
      where: { role: { in: [...VIEWING_ASSIGNABLE_ROLES] }, isBlocked: false },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.tradeOffer.count({ where: { AND: [whereFor(tab), filter] } }),
  ]);

  const title = (l: { titleAr: string | null; titleEn: string | null; reference: string }) => (ar ? l.titleAr : l.titleEn) || l.reference;
  const trades: AdminTrade[] = rows.map((o) => {
    // Same rule as viewings and the advisor queue: numbers unmask for the assignee only.
    const mine = o.assignedStaffId === session.id;
    const party = (u: { fullName: string; phone: string; publicRef: number | null }) => ({ name: u.fullName, phone: mine ? u.phone : maskPhone(u.phone), ref: u.publicRef });
    return {
      id: o.id,
      reference: o.reference,
      status: tradeEffectiveStatus(o, now),
      stage: o.stage,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt.toISOString(),
      expiresAt: o.expiresAt.toISOString(),
      cashAmount: o.cashAmount,
      cashPayer: o.cashPayer,
      proposerFee: o.proposerFee,
      recipientFee: o.recipientFee,
      target: { id: o.targetListing.id, reference: o.targetListing.reference, title: title(o.targetListing), price: o.targetListing.price },
      units: o.units.map((u) => ({ id: u.listing.id, reference: u.listing.reference, title: title(u.listing), price: u.listing.price })),
      proposer: party(o.proposer),
      recipient: party(o.recipient),
      phonesVisible: mine,
      assignedStaffId: o.assignedStaffId,
      notes: o.notes.map((n) => ({ id: n.id, body: n.body, author: n.author.fullName, createdAt: n.createdAt.toISOString() })),
    };
  });

  return (
    <>
      <AdminTitle
        title={ar ? "المقايضات" : "Trades"}
        intro={ar
          ? "الملاك هما اللي بيقبلوا أو بيرفضوا. الفريق بيرتّب المقايضات المقبولة لحد ما تخلص: المستندات، العقود، والتسليم."
          : "Owners accept or decline. Staff arrange accepted trades through to completion: documents, contracts, handover."}
      />

      <AdminTabs
        locale={locale}
        tabs={TABS.map((t, i) => ({ href: `/admin/trades?tab=${t.key}`, label: ar ? t.ar : t.en, count: counts[i], active: tab === t.key }))}
      />

      <FilterBar
        basePath="/admin/trades"
        locale={locale}
        keep={{ tab }}
        values={{ q, assignee }}
        fields={[
          { kind: "search", name: "q", placeholder: ar ? "رقم المقايضة أو الإعلان" : "Trade or listing reference" },
          {
            kind: "select",
            name: "assignee",
            label: ar ? "مسندة لـ" : "Assigned to",
            options: [{ value: "me", label: ar ? "أنا" : "Me" }, { value: "none", label: ar ? "مش مسندة" : "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.fullName }))],
          },
        ]}
      />

      {trades.length === 0 ? (
        <AdminEmpty>{ar ? "مفيش مقايضات هنا." : "No trades here."}</AdminEmpty>
      ) : (
        <BulkProvider ids={trades.map((t) => t.id)}>
          <div className="mt-5"><BulkSelectAll locale={locale} /></div>
          <BulkBar entity="trade" locale={locale} actions={[{ key: "stage_documents", label: ar ? "مرحلة الأوراق" : "Documents stage" }, { key: "stage_contracts", label: ar ? "مرحلة العقود" : "Contracts stage" }, { key: "stage_completed", label: ar ? "تمت المقايضة" : "Completed" }, { key: "cancel", label: ar ? "إلغاء المقايضة" : "Cancel trade", needsReason: true, danger: true }]} staff={staff} assignLabel={ar ? "أسند لـ…" : "Assign to…"} />
          <ul className="mt-4 space-y-4">
            {trades.map((t) => (
              <li key={t.id} className="flex items-start gap-3">
                <div className="pt-6"><BulkCheckbox id={t.id} label={t.reference} /></div>
                <div className="min-w-0 flex-1">
                  <AdminTradeCard trade={t} staff={staff} locale={locale} />
                </div>
              </li>
            ))}
          </ul>
        </BulkProvider>
      )}
      <Pager basePath="/admin/trades" params={keepParams(sp)} page={page} total={total} pageSize={pageSize} locale={locale} />
    </>
  );
}
