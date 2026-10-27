import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { formatDate, formatNumber } from "@/lib/format";
import { TRUST_LABELS } from "@/lib/enums";
import { maskPhone } from "@/lib/antiBroker";
import { canAccessAdminSection } from "@/lib/permissions";
import { getSession } from "@/lib/auth";
import { notFound } from "next/navigation";
import BlockUserButton from "@/components/admin/BlockUserButton";
import { BulkProvider, BulkCheckbox, BulkSelectAll, BulkBar } from "@/components/admin/Bulk";
import { Pager, FilterBar } from "@/components/admin/AdminPaging";
import { pageOf, param, oneOf, keepParams, SearchParams } from "@/lib/adminList";

import { AdminTitle } from "@/components/admin/AdminUi";
import { roleLabel } from "@/components/admin/labels";
import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "المستخدمون", en: "Users" });
}
export const dynamic = "force-dynamic";

const ROLES = ["buyer", "owner", "investor", "advisor", "reviewer", "photographer", "admin"] as const;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Guarded here as well as in the layout: a layout hides the nav link, it does not
  // stop a direct URL. This page renders the data, so it decides who may see it.
  const guardSession = await getSession();
  if (!guardSession || !canAccessAdminSection(guardSession.role, "users")) notFound();

  const [locale, sp] = await Promise.all([getLocale(), searchParams]);
  const ar = locale === "ar";
  const q = param(sp, "q") ?? "";
  const blockedParam = oneOf(param(sp, "blocked"), ["1", "0"] as const);
  const role = oneOf(param(sp, "role"), ROLES);
  const trustParam = oneOf(param(sp, "trust"), ["0", "1", "2", "3", "4"] as const);
  const { page, skip, take, pageSize } = pageOf(sp);
  // Search by name, email or phone. A phone search ignores spaces and a leading 0 or +20,
  // so "0100 123 4567", "+201001234567" and "1001234567" all find the same account.
  const digits = q.replace(/\D/g, "").replace(/^(20|0)/, "");

  const where = {
      ...(blockedParam ? { isBlocked: blockedParam === "1" } : {}),
      ...(role ? { role } : {}),
      ...(trustParam ? { trustLevel: Number(trustParam) } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q } },
              { email: { contains: q.toLowerCase() } },
              ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : {}),
  };
  // 200k accounts: paged, never "the latest 80".
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { _count: { select: { units: true, buyerRequests: true, strikeRecords: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return (
    <>
      <AdminTitle
        title={ar ? "المستخدمون" : "Users"}
        intro={ar
          ? "الأرقام مخفية جزئياً هنا كمان، وأي فتح للرقم الكامل بيتسجل في سجل التدقيق."
          : "Numbers are partly hidden here too. Opening a full number is recorded in the audit log."}
      />

      <FilterBar
        basePath="/admin/users"
        locale={locale}
        values={{ q: q || undefined, blocked: blockedParam, role, trust: trustParam }}
        fields={[
          { kind: "search", name: "q", placeholder: ar ? "دوّر بالاسم أو الرقم أو الإيميل" : "Search name, phone or email" },
          { kind: "select", name: "role", label: ar ? "الدور" : "Role", options: ROLES.map((r) => ({ value: r, label: roleLabel(r, locale) })) },
          { kind: "select", name: "blocked", label: ar ? "الحساب" : "Account", options: [{ value: "1", label: ar ? "موقوف" : "Blocked" }, { value: "0", label: ar ? "نشط" : "Active" }] },
          { kind: "select", name: "trust", label: ar ? "التوثيق" : "Verification", options: [0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: TRUST_LABELS[n]?.[locale] ?? String(n) })) },
        ]}
      />

      <BulkProvider ids={users.filter((u) => u.role !== "admin" && u.id !== guardSession.id).map((u) => u.id)}>
      <div className="mt-4"><BulkSelectAll locale={locale} /></div>
      <BulkBar
        entity="user"
        locale={locale}
        actions={[
          { key: "block", label: ar ? "إيقاف" : "Block", needsReason: true, danger: true },
          { key: "unblock", label: ar ? "ارفع الإيقاف" : "Unblock" },
        ]}
      />
      <div className="card mt-5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-ink-900 text-[12px] text-ink-500">
                <th className="w-8 px-3 py-2" aria-label={ar ? "اختيار" : "Select"} />
                <th className="px-3 py-2 font-semibold text-start">{ar ? "الاسم" : "Name"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "الدور" : "Role"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "الرقم" : "Phone"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "التوثيق" : "Verification"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "وحدات" : "Units"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "طلبات" : "Requests"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "إنذارات" : "Strikes"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "انضم" : "Joined"}</th>
                <th className="px-3 py-2 font-semibold text-start">{ar ? "الحساب" : "Access"}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border)] text-[13px] last:border-0">
                  <td className="px-3 py-2.5">{u.role !== "admin" && u.id !== guardSession.id && <BulkCheckbox id={u.id} label={u.fullName} />}</td>
                  <td className="px-3 py-2.5 font-semibold text-ink-900">
                    {u.fullName}
                    {u.isBlocked && <span className="badge badge-above ms-2">{ar ? "موقوف" : "Suspended"}</span>}
                  </td>
                  <td className="px-3 py-2.5 muted">{roleLabel(u.role, locale)}</td>
                  <td className="tnum px-3 py-2.5 muted" dir="ltr">
                    {maskPhone(u.phone)}
                  </td>
                  <td className="px-3 py-2.5 muted">{TRUST_LABELS[u.trustLevel]?.[locale] ?? u.trustLevel}</td>
                  <td className="tnum px-3 py-2.5 muted">{formatNumber(u._count.units, locale)}</td>
                  <td className="tnum px-3 py-2.5 muted">{formatNumber(u._count.buyerRequests, locale)}</td>
                  <td className="tnum px-3 py-2.5">
                    {u._count.strikeRecords > 0 ? (
                      <span className="font-bold text-danger-700">{u._count.strikeRecords}</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 muted">{formatDate(u.createdAt, locale)}</td>
                  <td className="px-3 py-2.5">
                    {/* Admins and yourself are not blockable — the API refuses too. */}
                    {u.role === "admin" || u.id === guardSession.id ? (
                      <span className="text-[12px] muted">—</span>
                    ) : (
                      <BlockUserButton userId={u.id} blocked={u.isBlocked} locale={locale} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </BulkProvider>
      <Pager basePath="/admin/users" params={keepParams(sp)} page={page} total={total} pageSize={pageSize} locale={locale} />
    </>
  );
}
