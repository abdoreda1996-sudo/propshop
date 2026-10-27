import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { Locale } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { formatPriceExact, formatDate } from "@/lib/format";
import { tradeEffectiveStatus, isTradeLive, TRADE_STAGE_LABELS } from "@/lib/trade";
import { matchesForUser } from "@/lib/tradeService";
import { tradeRequestsFor } from "@/lib/tradeRequestService";
import TradeOfferActions from "@/components/TradeOfferActions";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "المقايضة", en: "Trade" });
}
export const dynamic = "force-dynamic";

const STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  pending: { ar: "مستني رد", en: "Awaiting reply", tone: "badge-neutral" },
  accepted: { ar: "اتقبلت", en: "Accepted", tone: "badge-verified" },
  rejected: { ar: "اترفضت", en: "Declined", tone: "badge-above" },
  withdrawn: { ar: "اتسحبت", en: "Withdrawn", tone: "badge-neutral" },
  expired: { ar: "انتهت مدتها", en: "Expired", tone: "badge-neutral" },
  cancelled: { ar: "اتلغت", en: "Cancelled", tone: "badge-neutral" },
};

type Row = Awaited<ReturnType<typeof loadOffers>>[number];

function loadOffers(me: string) {
  return prisma.tradeOffer.findMany({
    where: { OR: [{ proposerId: me }, { recipientId: me }] },
    include: {
      targetListing: { select: { reference: true, titleAr: true, titleEn: true, price: true, currency: true } },
      units: { include: { listing: { select: { reference: true, titleAr: true, titleEn: true, price: true, currency: true } } } },
      proposer: { select: { fullName: true, phone: true, publicRef: true } },
      recipient: { select: { fullName: true, phone: true, publicRef: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
}

function TradeCard({ o, me, locale, now }: { o: Row; me: string; locale: Locale; now: Date }) {
  const ar = locale === "ar";
  const role = o.proposerId === me ? "proposer" : "recipient";
  const status = tradeEffectiveStatus(o, now);
  const st = STATUS[status] ?? { ar: status, en: status, tone: "badge-neutral" };
  const t = (l: { titleAr: string | null; titleEn: string | null; reference: string }) => (ar ? l.titleAr : l.titleEn) || l.reference;
  const other = role === "proposer" ? o.recipient : o.proposer;
  const cashLine =
    o.cashAmount > 0
      ? `${formatPriceExact(o.cashAmount, locale, "EGP")} ${
          (o.cashPayer === "proposer") === (role === "proposer") ? (ar ? "(إنت هتدفعها)" : "(you pay)") : ar ? "(هتاخدها)" : "(you receive)"
        }`
      : ar ? "من غير فلوس" : "No cash";

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="tnum text-[13px] font-bold text-ink-900">{o.reference}</span>
        <span className={`badge ${st.tone}`}>{st[locale]}</span>
        {o.status === "accepted" && o.stage && (
          <span className="badge badge-neutral">{TRADE_STAGE_LABELS[o.stage as keyof typeof TRADE_STAGE_LABELS]?.[locale] ?? o.stage}</span>
        )}
        <span className="tnum ms-auto text-[12px] muted">
          {isTradeLive(o, now) ? `${ar ? "صالح لحد" : "Valid until"} ${formatDate(o.expiresAt, locale)}` : formatDate(o.createdAt, locale)}
        </span>
      </div>

      <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <div className="min-w-0">
          <div className="text-[12px] font-bold muted">{role === "proposer" ? (ar ? "وحداتك" : "Your units") : ar ? "اللي معروض عليك" : "Offered to you"}</div>
          {o.units.map((u) => (
            <Link key={u.id} href={`/listing/${u.listing.reference}`} className="mt-1 block truncate font-semibold text-ink-900 hover:underline">
              {t(u.listing)} <span className="tnum font-normal muted">· {formatPriceExact(u.listing.price, locale, u.listing.currency)}</span>
            </Link>
          ))}
          <div className="tnum mt-1 text-[12px] text-ink-700">+ {cashLine}</div>
        </div>
        <span className="text-[12px] font-semibold text-ink-500 sm:pt-5">{ar ? "مقابل" : "for"}</span>
        <div className="min-w-0">
          <div className="text-[12px] font-bold muted">{role === "proposer" ? (ar ? "الوحدة اللي عايزها" : "The unit you want") : ar ? "وحدتك" : "Your unit"}</div>
          <Link href={`/listing/${o.targetListing.reference}`} className="mt-1 block truncate font-semibold text-ink-900 hover:underline">
            {t(o.targetListing)}{" "}
            <span className="tnum font-normal muted">· {formatPriceExact(o.targetListing.price, locale, o.targetListing.currency)}</span>
          </Link>
        </div>
      </div>

      {/* Accepted: the two owners can now reach each other, like a confirmed viewing. */}
      {o.status === "accepted" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-s-2 border-ok-700 ps-3 text-[13px]">
          <span className="font-semibold text-ink-900">{other.fullName}</span>
          <a href={`tel:${other.phone}`} dir="ltr" className="tnum font-semibold text-brand-500 hover:underline">
            {other.phone}
          </a>
          <span className="text-[12px] muted">{ar ? "فريق بروب شوب هيتابع معاكم الأوراق." : "The PropShop team will follow up on the paperwork."}</span>
          {(role === "proposer" ? o.proposerFee : o.recipientFee) != null && (
            <span className="tnum w-full text-[12px] text-ink-900">
              {ar ? "رسم النجاح عليك" : "Your success fee"}:{" "}
              <b>{formatPriceExact((role === "proposer" ? o.proposerFee : o.recipientFee)!, locale, "EGP")}</b>{" "}
              <span className="muted">{ar ? "(حسب نوع الوحدة اللي هتاخدها، ومستحق لما المقايضة تتم)" : "(set by the type of unit you receive, due when the trade completes)"}</span>
            </span>
          )}
        </div>
      )}
      {o.status === "cancelled" && o.cancelReason && <p className="mt-2 text-[12px] muted">{o.cancelReason}</p>}

      {status === "pending" && <TradeOfferActions id={o.id} role={role} locale={locale} />}
    </li>
  );
}

/**
 * The user's trading hub: offers to answer, offers sent, accepted trades, units open to
 * trade, and "your unit fits" suggestions (perfect two-way swaps first).
 */
export default async function TradesPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return null;
  const ar = locale === "ar";
  const me = session.id;
  const now = new Date();

  const [offers, matches, openUnits, requests] = await Promise.all([
    loadOffers(me),
    matchesForUser(me),
    prisma.listing.findMany({
      where: { unit: { ownerId: me }, openToTrade: true },
      select: { id: true, reference: true, titleAr: true, titleEn: true, status: true },
    }),
    tradeRequestsFor(me),
  ]);

  // "Your units fit these trades", one entry per listing, perfect swaps first.
  const byListing = new Map<string, { listing: (typeof matches)[number]["listing"]; mine: string[]; perfect: boolean }>();
  for (const m of matches) {
    const g = byListing.get(m.listing.id) ?? { listing: m.listing, mine: [], perfect: false };
    if (!g.mine.includes(m.myUnit.reference)) g.mine.push(m.myUnit.reference);
    g.perfect ||= m.perfect;
    byListing.set(m.listing.id, g);
  }
  const allGroups = [...byListing.values()].sort((a, b) => Number(b.perfect) - Number(a.perfect));
  const matchListingsTotal = allGroups.length;
  const grouped = allGroups.slice(0, 12);

  const toAnswer = offers.filter((o) => o.recipientId === me && isTradeLive(o, now));
  const sent = offers.filter((o) => o.proposerId === me && isTradeLive(o, now));
  const accepted = offers.filter((o) => o.status === "accepted");
  const past = offers.filter((o) => !isTradeLive(o, now) && o.status !== "accepted");

  const section = (title: string, rows: Row[]) =>
    rows.length > 0 && (
      <section>
        <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">
          {title} <span className="tnum font-medium muted">{rows.length}</span>
        </h2>
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((o) => (
            <TradeCard key={o.id} o={o} me={me} locale={locale} now={now} />
          ))}
        </ul>
      </section>
    );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold text-ink-900">{ar ? "المقايضة" : "Trades"}</h1>
        <div className="flex gap-2">
          <Link href="/trade" className="btn btn-ghost text-[13px]">
            {ar ? "سوق المقايضة" : "Trade market"}
          </Link>
          <Link href="/dashboard/trades/request/new" className="btn btn-primary text-[13px]">
            {ar ? "طلب مقايضة جديد" : "New trade request"}
          </Link>
        </div>
      </div>
      <p className="mt-1.5 text-[14px] muted">
        {ar ? "بدّل وحدتك بوحدة تانية مباشرة مع المالك، ومعاها فرق فلوس لو محتاج." : "Swap your unit for another, owner to owner, with a cash difference if needed."}
      </p>

      <section className="mt-7">
        <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">
          {ar ? "طلبات المقايضة بتاعتك" : "Your trade requests"}
        </h2>
        {requests.length === 0 ? (
          <p className="mt-3 text-[13px] muted">
            {ar
              ? "قول عايز تقايض وحدتك بإيه بنفس فلاتر البحث، وهنوريك الوحدات المناسبة ونبلغك بأي وحدة جديدة زيها."
              : "Say what you want for your unit using the search filters. We show what fits and tell you when a new unit matches."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/trades/request/${r.id}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-[13.5px] transition hover:bg-ink-50"
                >
                  {r.listing && <span className="tnum font-semibold text-ink-900">{r.listing.reference}</span>}
                  <span className="min-w-0 flex-1 truncate text-ink-700">
                    {r.description ? r.description.slice(0, 60) : ar ? "طلب مقايضة" : "Trade request"}
                  </span>
                  <span className={`text-[12px] font-semibold ${r.active ? "text-ok-700" : "text-ink-500"}`}>
                    {r.active ? (ar ? "شغال" : "Active") : ar ? "متوقف" : "Paused"}
                  </span>
                  <span className="tnum text-[12px] muted">{formatDate(r.createdAt, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-7">
        <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">
          {ar ? "وحداتك المتاحة للمقايضة" : "Your units open to trade"}
        </h2>
        {openUnits.length === 0 ? (
          <p className="mt-3 text-[13px] muted">
            {ar ? "مفيش. افتح أي وحدة للمقايضة من " : "None yet. Open a unit to trade from "}
            <Link href="/dashboard/listings" className="font-semibold text-brand-500 hover:underline">
              {ar ? "إعلاناتي" : "My listings"}
            </Link>
            {ar ? " عشان الناس تقدر تعرض عليك." : " so others can make you an offer."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {openUnits.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/dashboard/listings/${u.id}/trade`}
                  className="flex items-baseline gap-3 py-2.5 text-[13.5px] transition hover:bg-ink-50"
                >
                  <span className="tnum font-semibold text-ink-900">{u.reference}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-700">{(ar ? u.titleAr : u.titleEn) || ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-7 space-y-7">
        {section(ar ? "محتاجة ردك" : "Needs your reply", toAnswer)}
        {section(ar ? "مقايضات اتقبلت" : "Accepted trades", accepted)}
        {section(ar ? "عروض بعتها" : "Offers you sent", sent)}

        {matches.length > 0 && (
          <section>
            <h2 className="border-b border-ink-900 pb-2 text-[15px] font-bold text-ink-900">
              {ar ? "وحداتك بتناسب الطلبات دي" : "Your units fit these trades"}
            </h2>
            {/* One row per listing, with every unit of yours that fits it. Listing each
                (listing, unit) pair separately repeated the same listing up to a dozen times. */}
            <ul className="divide-y divide-[var(--border)]">
              {grouped.map((g) => (
                <li key={g.listing.id} className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/listing/${g.listing.reference}`} className="block truncate text-[14px] font-semibold text-ink-900 hover:underline">
                      {(ar ? g.listing.titleAr : g.listing.titleEn) || g.listing.reference}
                    </Link>
                    <p className="tnum text-[12.5px] text-ink-500">
                      {g.listing.reference} · {formatPriceExact(g.listing.price, locale, g.listing.currency)}
                      {g.perfect && (
                        <span className="font-semibold text-accent-600"> · {ar ? "تبادل مثالي: الطرفين بيناسبوا بعض" : "perfect swap: fits both ways"}</span>
                      )}
                    </p>
                  </div>
                  <p className="tnum text-[12.5px] text-ink-700">
                    {ar ? "وحداتك اللي بتناسب: " : "Your units that fit: "}
                    <span className="font-semibold">{g.mine.join("، ")}</span>
                  </p>
                </li>
              ))}
            </ul>
            {matchListingsTotal > grouped.length && (
              <p className="tnum mt-2 text-[12.5px] text-ink-500">
                {ar ? `وكمان ${matchListingsTotal - grouped.length} إعلان تاني. ` : `And ${matchListingsTotal - grouped.length} more listings. `}
                <Link href="/trade" className="font-semibold text-brand-500 hover:underline">
                  {ar ? "شوفهم في سوق المقايضة" : "See them in the trade market"}
                </Link>
              </p>
            )}
          </section>
        )}

        {section(ar ? "اللي فات" : "Past", past)}

        {offers.length === 0 && matches.length === 0 && (
          <p className="text-[14px] muted">
            {ar ? "مفيش عروض مقايضة لسه. " : "No trade offers yet. "}
            <Link href="/trade" className="font-semibold text-brand-500 hover:underline">
              {ar ? "شوف الوحدات المتاحة للمقايضة" : "Browse units open to trade"}
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
