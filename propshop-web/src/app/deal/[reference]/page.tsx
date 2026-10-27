import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { formatPriceExact, formatDate } from "@/lib/format";
import { publicIdentity, identityLabel, PUBLIC_IDENTITY_SELECT } from "@/lib/identity";
import { parseJson } from "@/lib/json";
import { MIN_PUBLIC_TRUST } from "@/lib/enums";
import {
  timeline,
  STAGE_EXPLAINER,
  DealStage,
  checklistLabel,
  ChecklistItem,
  DEFAULT_CHECKLIST,
  countdown,
  PROVIDER_PENDING,
  DEAL_EVENT_COPY,
} from "@/lib/deals";
import ReserveButton from "@/components/ReserveButton";
import { splitFee, FEE_PARTY_LABELS } from "@/lib/fees";

export const dynamic = "force-dynamic";

/** Event codes written by the older stage machine (seed data), with the same plain copy. */
const LEGACY_EVENT: Record<string, { ar: string; en: string }> = {
  deposit_held: { ar: "مقدم الحجز اتدفع", en: "Deposit paid" },
  balance_handover: { ar: "باقي المبلغ والتسليم", en: "Balance and handover" },
  closed: { ar: "الصفقة اتقفلت", en: "Deal closed" },
};

/**
 * The Deal Room (Section 11).
 *
 * One screen answering: what did we agree, where are we, and what happens next. Only the
 * two parties (and staff, for support) can open it — enforced below, not by an
 * unguessable URL.
 */
export default async function DealRoomPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return notFound();
  const ar = locale === "ar";

  const deal = await prisma.deal.findUnique({
    where: { reference },
    include: {
      listing: {
        select: {
          reference: true,
          titleAr: true,
          titleEn: true,
          price: true,
          currency: true,
          status: true,
          trustLevel: true,
        },
      },
      buyer: { select: PUBLIC_IDENTITY_SELECT },
      seller: { select: PUBLIC_IDENTITY_SELECT },
      events: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!deal) return notFound();

  // A deal room is private to its two parties. Staff may view it for support and dispute
  // handling; everyone else gets a 404 rather than a 403, which would confirm it exists.
  const isBuyer = deal.buyerId === session.id;
  const isSeller = deal.sellerId === session.id;
  const isStaffMember = ["admin", "reviewer", "advisor"].includes(session.role);
  if (!isBuyer && !isSeller && !isStaffMember) return notFound();

  const role = isBuyer ? "buyer" : "seller";
  const counterparty = isBuyer
    ? publicIdentity(deal.seller, "seller", { ownershipVerified: deal.listing.trustLevel >= MIN_PUBLIC_TRUST })
    : publicIdentity(deal.buyer, "buyer");

  // enums.ts (and the seed) still use the older stage names; read them as their
  // deals.ts equivalents so the timeline and the explainer agree with the row.
  const LEGACY_STAGE: Record<string, DealStage> = { deposit_held: "reserved", balance_handover: "transfer", closed: "completed" };
  const stage = (LEGACY_STAGE[deal.stage] ?? deal.stage) as DealStage;
  const steps = timeline(stage);
  // The total agreed at acceptance, split — never recomputed from the current schedule.
  const fee = splitFee(deal.adminFee);
  const checklist = parseJson<ChecklistItem[]>(deal.checklistJson, DEFAULT_CHECKLIST);
  const hold = countdown(deal.reservedUntil);
  const title = (ar ? deal.listing.titleAr : deal.listing.titleEn) || deal.listing.reference;

  return (
    <div className="container-page py-8">
      <div className="flex flex-wrap items-center gap-2 text-[13px] muted">
        <Link href="/dashboard/deals" className="hover:underline">
          {ar ? "الصفقات" : "Deals"}
        </Link>
        <span aria-hidden>/</span>
        <span className="tnum">{deal.reference}</span>
      </div>

      {/* --- Summary ------------------------------------------------------ */}
      <header className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-[var(--border)] pb-6">
        <div className="min-w-0 max-w-[44rem]">
          <h1 className="text-[24px] font-bold leading-tight tracking-[-0.01em] text-ink-900 sm:text-[28px]">{title}</h1>
          <p className="mt-2 text-[13px] muted">
            <Link href={`/listing/${deal.listing.reference}`} className="tnum hover:underline">
              {deal.listing.reference}
            </Link>
            {" · "}
            {identityLabel(counterparty, locale)}
          </p>
        </div>
        <div className="text-end">
          <div className="text-[12px] muted">{ar ? "السعر المتفق عليه" : "Agreed price"}</div>
          <div className="tnum text-[26px] font-bold leading-tight text-ink-900">
            {formatPriceExact(deal.agreedPrice, locale, deal.listing.currency)}
          </div>
        </div>
      </header>

      {hold && !hold.expired && (
        <p className="mt-4 text-[14px] font-semibold text-accent-700">
          {ar ? "الوحدة محجوزة، وباقي" : "Reserved. Time remaining:"}{" "}
          <span className="tnum" dir="ltr">
            {String(hold.hours).padStart(2, "0")}:{String(hold.minutes).padStart(2, "0")}
          </span>
        </p>
      )}

      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-10">
          {/* --- Next action ---------------------------------------------- */}
          <section>
            <h2 className="text-[16px] font-bold text-ink-900">{ar ? "الخطوة الجاية" : "What happens next"}</h2>

            {stage === "offer_accepted" && isBuyer && (
              <div className="mt-3 max-w-sm">
                <ReserveButton dealReference={deal.reference} locale={locale} price={deal.agreedPrice} />
              </div>
            )}
            {stage === "offer_accepted" && isSeller && (
              <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
                {ar
                  ? "مستنيين المشتري يدفع مقدم الحجز. الوحدة اتشالت من البحث ومش بتستقبل عروض تانية."
                  : "Waiting for the buyer to pay the reservation deposit. The unit has left search and takes no further offers."}
              </p>
            )}
            {stage !== "offer_accepted" && (
              <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
                {ar ? STAGE_EXPLAINER[stage]?.ar : STAGE_EXPLAINER[stage]?.en}
              </p>
            )}

            {PROVIDER_PENDING && (
              <p className="mt-3 text-[12px] leading-relaxed muted">
                {ar
                  ? "بروب شوب مابتحتفظش بفلوسك. الدفع بيتم عن طريق جهة دفع مرخّصة، والربط معاها لسه بيتعمل، فمفيش أي مبلغ بيتحصّل دلوقتي."
                  : "PropShop does not hold your money. Payment runs through a licensed provider; that link is still being built, so no money is collected yet."}
              </p>
            )}
          </section>

          {/*
            What each side owes, on the screen where they are deciding whether to proceed.

            Shown to BOTH parties in full, including the other side's amount: the whole point
            of a published fee is that neither party has to wonder what the other was quoted.
            The fee is ONLY ever shown per side, never as one whole-deal figure (owner,
            2026-09-27). Both sides pay the same band fee, so the two figures are equal.
            `deal.adminFee` is the total agreed when the offer was accepted, so a later
            change to the fee schedule cannot retroactively alter a live deal.
          */}
          <section>
            <h2 className="text-[16px] font-bold text-ink-900">
              {ar ? "رسم إتمام الصفقة (على كل طرف)" : "Deal completion fee (per side)"}
            </h2>
            <dl className="facts mt-2 text-[14px]">
              {(["buyer", "seller"] as const).map((party) => {
                const mine = (party === "buyer" && isBuyer) || (party === "seller" && isSeller);
                return (
                  <div key={party}>
                    <dt className={mine ? "font-semibold text-ink-900" : "muted"}>
                      {FEE_PARTY_LABELS[party][locale]}
                      {mine && (ar ? " (إنت)" : " (you)")}
                    </dt>
                    <dd className="tnum font-semibold text-ink-900">
                      {formatPriceExact(fee[party], locale, deal.listing.currency)}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-2 text-[12px] leading-relaxed muted">
              {ar
                ? "رسم ثابت حسب نوع الوحدة، وكل طرف بيدفعه على حدة. بيستحق لما الصفقة تتم. مش نسبة من السعر، ومفيش عمولة من أي طرف."
                : "A fixed fee set by the unit type. Each side pays it separately, when the deal completes. Not a percentage of the price, and no commission from either side."}
            </p>
          </section>

          {/* --- Due diligence -------------------------------------------- */}
          <section>
            <h2 className="text-[16px] font-bold text-ink-900">{ar ? "المستندات" : "Documents"}</h2>
            <ul className="mt-2 divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {checklist.map((item) => (
                <li key={item.key} className="flex items-center gap-2.5 py-2.5 text-[14px]">
                  {item.done ? (
                    <Check size={15} className="shrink-0 text-ok-700" />
                  ) : (
                    <Circle size={15} className="shrink-0 text-ink-200" />
                  )}
                  <span className={item.done ? "text-ink-900" : "muted"}>{checklistLabel(item, locale)}</span>
                </li>
              ))}
            </ul>
            {deal.documents.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-[13px] text-ink-700">
                {deal.documents.map((d) => (
                  <li key={d.id}>{d.type}</li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-10">
          {/* --- Timeline --------------------------------------------------- */}
          <section>
            <h2 className="text-[16px] font-bold text-ink-900">{ar ? "مراحل الصفقة" : "Deal progress"}</h2>
            <ol className="mt-4">
              {steps.map((s, i) => (
                <li key={s.stage} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {s.state === "done" ? (
                      <Check size={16} className="shrink-0 text-ok-700" />
                    ) : s.state === "current" ? (
                      <Circle size={16} className="shrink-0 fill-accent-500 text-accent-500" />
                    ) : (
                      <Circle size={16} className="shrink-0 text-ink-200" />
                    )}
                    {i < steps.length - 1 && (
                      <span className={`my-1 w-px flex-1 ${s.state === "done" ? "bg-ok-700/40" : "bg-ink-200"}`} aria-hidden />
                    )}
                  </div>
                  <div className="pb-4">
                    <div className={`text-[14px] leading-tight ${s.state === "upcoming" ? "muted" : "font-semibold text-ink-900"}`}>
                      {ar ? s.label.ar : s.label.en}
                      {s.state === "current" && (
                        <span className="ms-2 text-[12px] font-normal text-accent-700">{ar ? "(دلوقتي)" : "(now)"}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* --- Who you are dealing with --------------------------------- */}
          <section>
            <h2 className="text-[16px] font-bold text-ink-900">
              {role === "buyer" ? (ar ? "المالك" : "The owner") : ar ? "المشتري" : "The buyer"}
            </h2>
            <p className="mt-2 text-[15px] font-semibold text-ink-900">{identityLabel(counterparty, locale)}</p>
            <p className="mt-1 text-[13px] text-ink-700">
              {[
                counterparty.identityVerified ? (ar ? "الهوية موثقة" : "Identity verified") : null,
                counterparty.ownershipVerified ? (ar ? "الملكية موثقة" : "Ownership verified") : null,
                counterparty.fundsVerified ? (ar ? "القدرة المالية موثقة" : "Funds verified") : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 text-[13px] muted">
              {ar ? "عضو من" : "Member since"} <span className="tnum">{counterparty.memberSince}</span>
            </p>
            <p className="mt-3 text-[12px] leading-relaxed muted">
              {ar
                ? "الأسماء وأرقام التليفون مش بتظهر. التواصل كله بيتم من خلال الموقع لحد ما تتفقوا على المعاينة."
                : "Names and phone numbers are not shown. All contact goes through the site until a viewing is agreed."}
            </p>
          </section>

          {/* --- History ------------------------------------------------------ */}
          {deal.events.length > 0 && (
            <section>
              <h2 className="text-[16px] font-bold text-ink-900">{ar ? "السجل" : "History"}</h2>
              <ol className="facts mt-2 text-[13px]">
                {deal.events.map((e) => (
                  <li key={e.id}>
                    <span className="text-ink-900">
                      {(ar ? (DEAL_EVENT_COPY[e.event] ?? LEGACY_EVENT[e.event])?.ar : (DEAL_EVENT_COPY[e.event] ?? LEGACY_EVENT[e.event])?.en) ?? e.event}
                    </span>
                    <span className="tnum shrink-0 muted">{formatDate(e.createdAt, locale)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
