import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { formatNumber, formatPriceExact } from "@/lib/format";
import { PUBLIC_LISTING_WHERE } from "@/lib/listings";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta(
    { ar: "الكمبوندات", en: "Compounds" },
    {
      ar: "كل الكمبوندات اللي بنغطيها في القاهرة الجديدة والسادس من أكتوبر والشيخ زايد، بعدد الوحدات الموثقة ومتوسط سعر المتر.",
      en: "Every compound we cover in New Cairo, 6th of October and Sheikh Zayed, with its verified units and average price per metre.",
    },
  );
}

export const revalidate = 1800;

export default async function CompoundsPage() {
  const locale = await getLocale();
  const ar = locale === "ar";

  const [compounds, liveListings] = await Promise.all([
    prisma.compound.findMany({ include: { area: true }, orderBy: { nameEn: "asc" } }),
    prisma.listing.findMany({
      where: PUBLIC_LISTING_WHERE,
      select: { price: true, unit: { select: { compoundId: true, sizeSqm: true } } },
    }),
  ]);

  // Live counts and median EGP/sqm per compound, computed from what is actually public.
  const stats = new Map<string, { count: number; sqm: number[] }>();
  for (const l of liveListings) {
    const id = l.unit.compoundId;
    if (!id) continue;
    if (!stats.has(id)) stats.set(id, { count: 0, sqm: [] });
    const s = stats.get(id)!;
    s.count += 1;
    if (l.unit.sizeSqm > 0) s.sqm.push(l.price / l.unit.sizeSqm);
  }

  const medianOf = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const byArea = new Map<string, typeof compounds>();
  for (const c of compounds) {
    const key = ar ? c.area.nameAr : c.area.nameEn;
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key)!.push(c);
  }

  return (
    <div className="container-page pb-6 pt-10 md:pt-14">
      <h1 className="display">{ar ? "الكمبوندات" : "Compounds"}</h1>
      <p className="lede mt-4">
        {ar
          ? "بنشتغل بقايمة كمبوندات ثابتة بدل العناوين المكتوبة بإيد. كده نقدر نتأكد إن الوحدة جوه الكمبوند فعلاً وإن مساحتها منطقية."
          : "We work from a fixed list of compounds instead of typed-in addresses. That is how we check a unit is really inside its compound and that its size makes sense."}
      </p>

      {[...byArea.entries()].map(([area, list]) => (
        <section key={area} className="ruled mt-10">
          <h2 className="section-title">{area}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="border-b border-[var(--border)] text-start text-[12.5px] text-ink-500">
                  <th className="py-2 pe-4 text-start font-normal">{ar ? "الكمبوند" : "Compound"}</th>
                  <th className="py-2 pe-4 text-start font-normal">{ar ? "المطور" : "Developer"}</th>
                  <th className="py-2 pe-4 text-end font-normal">{ar ? "وحدات معروضة" : "Listed"}</th>
                  <th className="py-2 pe-4 text-end font-normal">{ar ? "وسيط سعر المتر" : "Median per m²"}</th>
                  <th className="py-2 text-end font-normal">{ar ? "المساحات" : "Sizes"}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const s = stats.get(c.id);
                  const med = medianOf(s?.sqm ?? []);
                  return (
                    <tr key={c.id} className="border-b border-[var(--border)] hover:bg-ink-50">
                      <td className="py-2.5 pe-4">
                        <Link href={`/?compound=${c.slug}`} className="font-semibold text-ink-900 hover:underline">
                          {ar ? c.nameAr : c.nameEn}
                        </Link>
                      </td>
                      <td className="py-2.5 pe-4 text-ink-500">{c.developer}</td>
                      <td className="tnum py-2.5 pe-4 text-end text-ink-900">{formatNumber(s?.count ?? 0, locale)}</td>
                      <td className="tnum py-2.5 pe-4 text-end text-ink-900">{med > 0 ? formatPriceExact(med, locale) : "—"}</td>
                      <td className="tnum py-2.5 text-end text-ink-500">
                        {c.minSizeSqm && c.maxSizeSqm
                          ? `${formatNumber(c.minSizeSqm, locale)}–${formatNumber(c.maxSizeSqm, locale)} ${ar ? "م²" : "m²"}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
