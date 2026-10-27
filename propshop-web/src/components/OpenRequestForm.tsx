"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Locale, t } from "@/lib/i18n";
import { formatPriceExact } from "@/lib/format";

export default function OpenRequestForm({
  locale,
  signedIn,
  areas,
}: {
  locale: Locale;
  signedIn: boolean;
  areas: { slug: string; nameAr: string; nameEn: string }[];
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    purpose: "live",
    budgetMax: "",
    bedrooms: "3",
    downPayment: "",
    monthlyInstallment: "",
    note: "",
  });
  const [installments, setInstallments] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toggleArea = (slug: string) =>
    setSelectedAreas((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "open",
          profile: {
            purpose: form.purpose,
            budgetMax: Number(form.budgetMax) || undefined,
            bedrooms: Number(form.bedrooms) || undefined,
            paymentType: installments ? "installments" : "cash",
            ...(installments
              ? { downPayment: Number(form.downPayment) || undefined, monthlyInstallment: Number(form.monthlyInstallment) || undefined }
              : {}),
            areas: selectedAreas,
            note: form.note || undefined,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          json.error === "brief_too_thin"
            ? ar
              ? "محتاجين على الأقل ميزانية أو منطقة عشان نقدر نساعدك."
              : "We need at least a budget or an area to help you."
            : ar
              ? "الطلب ماتبعتش. جرّب تاني بعد شوية."
              : "The request did not go through. Please try again in a moment.",
        );
        return;
      }
      setDone(json.reference);
      router.refresh();
    } catch {
      setError(ar ? "مفيش اتصال. اتأكد من النت وجرّب تاني." : "No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="mt-8 border-y border-[var(--border)] py-6">
        <p className="text-[15px] text-ink-700">
          {ar
            ? "سجّل دخولك الأول عشان نقدر نتابع طلبك ونوريك حالته."
            : "Sign in first so we can track your request and show you its status."}
        </p>
        <a href="/login?next=/request" className="btn btn-primary mt-4">
          {t("nav_login", locale)}
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mt-8 border-y border-[var(--border)] py-6">
        <h2 className="text-[19px] font-bold text-ok-700">{t("request_created", locale)}</h2>
        <p className="tnum mt-1 text-sm muted">{done}</p>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink-700">
          {ar
            ? "تقدر تتابع الطلب والوحدات المطابقة ليه من «طلباتي». رقمك مش هيوصل لحد قبل ما تأكد معاينة."
            : "Follow the request and the units that match it from My requests. Your number reaches nobody until you confirm a viewing."}
        </p>
        <a href="/dashboard/requests" className="btn btn-primary mt-6">
          {t("my_requests", locale)}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 border-t border-[var(--border)] pt-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="o-purpose">
            {t("purpose", locale)}
          </label>
          <select id="o-purpose" className="select" value={form.purpose} onChange={(e) => set("purpose", e.target.value)}>
            <option value="live">{t("purpose_live", locale)}</option>
            <option value="invest">{t("purpose_invest", locale)}</option>
            <option value="rent_out">{t("purpose_rent_out", locale)}</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="o-beds">
            {t("bedrooms", locale)}
          </label>
          <select id="o-beds" className="select" value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="o-max">
            {ar ? "الميزانية لحد" : "Budget up to"}
          </label>
          <input
            id="o-max"
            className="input tnum"
            inputMode="numeric"
            value={form.budgetMax}
            onChange={(e) => set("budgetMax", e.target.value.replace(/\D/g, ""))}
            placeholder="9000000"
            autoComplete="off"
            aria-describedby="o-max-help"
          />
          <p id="o-max-help" className="mt-1.5 text-[12px] muted">
            {Number(form.budgetMax) > 0
              ? `= ${formatPriceExact(Number(form.budgetMax), locale)}`
              : ar
                ? "بالجنيه المصري. محتاجين على الأقل ميزانية أو منطقة."
                : "In Egyptian pounds. We need at least a budget or an area."}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand-500)]" checked={installments} onChange={(e) => setInstallments(e.target.checked)} />
          <span className="text-[14px] font-semibold text-ink-900">{ar ? "بالتقسيط" : "Installments"}</span>
        </label>

        {installments && (
          <>
            <div>
              <label className="label" htmlFor="o-down">
                {ar ? "المقدّم" : "Down payment"}
              </label>
              <input
                id="o-down"
                className="input tnum"
                inputMode="numeric"
                value={form.downPayment}
                onChange={(e) => set("downPayment", e.target.value.replace(/\D/g, ""))}
                placeholder="1000000"
              />
            </div>
            <div>
              <label className="label" htmlFor="o-monthly">
                {ar ? "القسط في الشهر" : "Installment per month"}
              </label>
              <input
                id="o-monthly"
                className="input tnum"
                inputMode="numeric"
                value={form.monthlyInstallment}
                onChange={(e) => set("monthlyInstallment", e.target.value.replace(/\D/g, ""))}
                placeholder="50000"
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-4">
        <span className="label">{ar ? "المناطق اللي تهمك" : "Areas you care about"}</span>
        <div className="flex flex-wrap gap-2">
          {areas.map((a) => {
            const on = selectedAreas.includes(a.slug);
            return (
              <button
                key={a.slug}
                type="button"
                onClick={() => toggleArea(a.slug)}
                aria-pressed={on}
                className={`rounded-md border px-3 py-1.5 text-[13px] font-medium transition ${
                  on ? "border-accent-500 bg-accent-50 text-accent-600" : "border-[var(--border)] text-ink-700 hover:border-ink-400"
                }`}
              >
                {ar ? a.nameAr : a.nameEn}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="o-note">
          {ar ? "أي حاجة تانية تحب نعرفها" : "Anything else we should know"}
        </label>
        <textarea
          id="o-note"
          className="textarea"
          rows={3}
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder={ar ? "مثلاً: محتاج دور أرضي بحديقة، أو قريب من مدرسة معينة." : "For example: a ground floor with a garden, or close to a particular school."}
        />
      </div>

      {error && <p role="alert" className="mt-3 text-[13px] text-danger-600">{error}</p>}

      <button type="submit" disabled={busy} className="btn btn-primary mt-6 w-full sm:w-auto">
        {busy ? t("loading", locale) : ar ? "ابعت الطلب" : "Send my request"}
      </button>
    </form>
  );
}
