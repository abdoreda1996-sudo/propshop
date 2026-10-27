"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Locale, t } from "@/lib/i18n";
import { CURRENCIES } from "@/lib/enums";

const COUNTRIES = [
  { code: "EG", ar: "مصر", en: "Egypt" },
  { code: "SA", ar: "السعودية", en: "Saudi Arabia" },
  { code: "AE", ar: "الإمارات", en: "UAE" },
  { code: "KW", ar: "الكويت", en: "Kuwait" },
  { code: "QA", ar: "قطر", en: "Qatar" },
  { code: "OTHER", ar: "دولة أخرى", en: "Elsewhere" },
];

export default function SettingsForm({
  locale,
  user,
  nameLocked,
}: {
  locale: Locale;
  user: {
    fullName: string;
    email: string | null;
    countryOfResidence: string;
    preferredCurrency: string;
    preferredChannel: string;
  };
  nameLocked: boolean;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: user.fullName,
    email: user.email ?? "",
    countryOfResidence: user.countryOfResidence,
    preferredCurrency: user.preferredCurrency,
    preferredChannel: user.preferredChannel,
  });

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
    setError(null);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        // A failed save used to do nothing at all; the button just stopped spinning.
        const j = await res.json().catch(() => ({}));
        setError(
          j.error === "email_taken"
            ? ar ? "الإيميل ده مستخدم في حساب تاني." : "That email is already used by another account."
            : ar ? "مقدرناش نحفظ. راجع البيانات وجرّب تاني." : "Could not save. Check the details and try again.",
        );
      }
    } catch {
      setError(ar ? "مفيش اتصال. جرّب تاني." : "No connection. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-6 max-w-xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-name">
            {t("full_name", locale)}
          </label>
          <input
            id="s-name"
            className="input"
            value={form.fullName}
            readOnly={nameLocked}
            onChange={(e) => set("fullName", e.target.value)}
          />
          {nameLocked && (
            <p className="mt-1.5 text-[12px] muted">
              {ar
                ? "الاسم مقفول بعد توثيق الهوية، لأنه بيتطابق مع البطاقة ومستندات الملكية. لو فيه خطأ، كلّم الدعم."
                : "Your name is locked after identity verification because it is matched against your ID and ownership documents. Contact support if it is wrong."}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-email">
            {ar ? "البريد الإلكتروني" : "Email"}
          </label>
          <input
            id="s-email"
            type="email"
            dir="ltr"
            className="input"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="s-country">
            {ar ? "بلد الإقامة" : "Country of residence"}
          </label>
          <select
            id="s-country"
            className="select"
            value={form.countryOfResidence}
            onChange={(e) => set("countryOfResidence", e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {ar ? c.ar : c.en}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[12px] muted">
            {ar
              ? "لو مقيم بره مصر، بنوجّه طلبك لمستشار بيشتغل بتوقيت الخليج."
              : "If you live outside Egypt we route your request to an advisor working Gulf hours."}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="s-currency">
            {ar ? "عملة العرض" : "Display currency"}
          </label>
          <select
            id="s-currency"
            className="select"
            value={form.preferredCurrency}
            onChange={(e) => set("preferredCurrency", e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {ar ? (CURRENCY_NAMES_AR[c] ?? c) : c}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="s-channel">
            {ar ? "طريقة التواصل المفضلة" : "Preferred contact channel"}
          </label>
          <select
            id="s-channel"
            className="select"
            value={form.preferredChannel}
            onChange={(e) => set("preferredChannel", e.target.value)}
          >
            <option value="in_app">{ar ? "داخل التطبيق" : "In-app"}</option>
            <option value="whatsapp">{ar ? "واتساب" : "WhatsApp"}</option>
            <option value="call">{ar ? "مكالمة" : "Phone call"}</option>
          </select>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? t("loading", locale) : t("save", locale)}
        </button>
        <span role="status" className="text-[13px] font-semibold">
          {saved && <span className="text-ok-700">{ar ? "اتحفظ. التغييرات بتسري على طول." : "Saved. Changes apply straight away."}</span>}
          {error && <span className="text-danger-700">{error}</span>}
        </span>
      </div>
    </form>
  );
}

/** The currency list read as bare ISO codes in the Arabic form. */
const CURRENCY_NAMES_AR: Record<string, string> = {
  EGP: "جنيه مصري",
  SAR: "ريال سعودي",
  AED: "درهم إماراتي",
  USD: "دولار أمريكي",
  KWD: "دينار كويتي",
  QAR: "ريال قطري",
};
