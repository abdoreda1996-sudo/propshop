"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Locale, t } from "@/lib/i18n";

type Step = "phone" | "code" | "password";

/**
 * Two sign-in paths: phone OTP for members (the default), email + password for staff.
 * In development the API echoes the code back so the flow is testable without SMS.
 */
export default function LoginForm({ locale, next }: { locale: Locale; next: string }) {
  const router = useRouter();
  const ar = locale === "ar";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [needsName, setNeedsName] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorText = (key: string) => {
    const map: Record<string, { ar: string; en: string }> = {
      invalid_phone: { ar: "رقم موبايل غير صحيح. استخدم رقم مصري أو خليجي.", en: "Invalid number. Use an Egyptian or Gulf mobile number." },
      invalid_code: { ar: "الكود لازم يكون 6 أرقام.", en: "The code must be 6 digits." },
      code_incorrect: { ar: "الكود غلط. جرّب تاني.", en: "That code is incorrect." },
      code_expired: { ar: "الكود انتهت صلاحيته. اطلب كود جديد.", en: "That code expired. Request a new one." },
      name_required: { ar: "أول مرة تسجل؟ اكتب اسمك بالكامل زي ما هو في البطاقة.", en: "First time here? Enter your full name exactly as on your ID." },
      too_many_requests: { ar: "محاولات كتير. استنى شوية.", en: "Too many attempts. Please wait a little." },
      too_many_attempts: { ar: "محاولات كتير على الكود ده. اطلب كود جديد.", en: "Too many attempts on this code. Request a new one." },
      invalid_credentials: { ar: "البريد أو كلمة المرور غير صحيحة.", en: "Incorrect email or password." },
      account_blocked: { ar: "الحساب موقوف. تواصل مع الدعم.", en: "This account is suspended. Contact support." },
    };
    return (
      map[key]?.[locale] ??
      (ar ? "حصلت مشكلة. جرّب تاني بعد شوية." : "Something went wrong. Please try again in a moment.")
    );
  };

  async function post(url: string, body: unknown) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, json };
    } catch {
      return { ok: false, json: { error: "network" } };
    }
  }

  async function requestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/auth/otp/request", { phone });
    setBusy(false);
    if (!ok) return setError(errorText(json.error));
    setNeedsName(!!json.isNewUser);
    setDevCode(json.devCode ?? null);
    setStep("code");
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/auth/otp/verify", { phone, code, fullName });
    setBusy(false);
    if (!ok) {
      if (json.error === "name_required") setNeedsName(true);
      return setError(errorText(json.error));
    }
    router.push(next);
    router.refresh();
  }

  async function passwordLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/auth/login", { email, password });
    setBusy(false);
    if (!ok) return setError(errorText(json.error));
    router.push(next);
    router.refresh();
  }

  return (
    <div className="mt-5">
      {step === "phone" && (
        <form onSubmit={requestOtp}>
          <label className="label" htmlFor="l-phone">
            {t("phone", locale)}
          </label>
          <input
            id="l-phone"
            type="tel"
            className="input tnum"
            inputMode="tel"
            aria-invalid={!!error || undefined}
            aria-describedby="l-phone-help"
            dir="ltr"
            placeholder="01XXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
          <p id="l-phone-help" className="mt-2 text-[12px] muted">
            {ar ? "بنقبل أرقام مصر والسعودية والإمارات والكويت وقطر." : "Egypt, Saudi Arabia, UAE, Kuwait and Qatar numbers are accepted."}
          </p>
          {error && <p role="alert" className="mt-3 text-[13px] text-danger-600">{error}</p>}
          <button type="submit" disabled={busy || phone.length < 8} className="btn btn-primary mt-5 w-full">
            {busy ? t("loading", locale) : t("send_otp", locale)}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("password");
              setError(null);
            }}
            className="mt-4 text-[13px] font-medium muted underline-offset-4 hover:text-ink-900 hover:underline"
          >
            {ar ? "دخول الفريق بالبريد وكلمة المرور" : "Staff sign-in with email and password"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verifyOtp}>
          <p className="text-[14px] muted">
            {ar ? "بعتنا كود لـ" : "We sent a code to"} <span className="tnum font-semibold text-ink-900" dir="ltr">{phone}</span>
          </p>

          {devCode && (
            <p className="mt-3 rounded-md bg-ink-100 p-3 text-[12px] muted">
              {ar ? "نسخة تجريبية، الكود:" : "Test mode, code:"}{" "}
              <span className="tnum font-bold text-ink-900">{devCode}</span>
            </p>
          )}

          <label className="label mt-4" htmlFor="l-code">
            {t("enter_otp", locale)}
          </label>
          <input
            id="l-code"
            className="input tnum text-center text-[20px] tracking-[0.4em]"
            inputMode="numeric"
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoComplete="one-time-code"
          />

          {needsName && (
            <>
              <label className="label mt-4" htmlFor="l-name">
                {t("full_name", locale)}
              </label>
              <input
                id="l-name"
                className="input"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={ar ? "الاسم زي ما هو في البطاقة" : "Your name exactly as on your ID"}
              />
              <p className="mt-2 text-[12px] muted">
                {ar
                  ? "الاسم ده بيتطابق مع بطاقتك ومستند الملكية وقت التوثيق."
                  : "This name is matched against your ID and ownership document during verification."}
              </p>
            </>
          )}

          {error && <p role="alert" className="mt-3 text-[13px] text-danger-600">{error}</p>}

          <button type="submit" disabled={busy || code.length !== 6} className="btn btn-primary mt-5 w-full">
            {busy ? t("loading", locale) : t("verify", locale)}
          </button>
          <div className="mt-3 flex justify-between text-[13px]">
            <button type="button" onClick={() => setStep("phone")} className="font-semibold muted hover:text-ink-900">
              {t("back", locale)}
            </button>
            <button type="button" onClick={() => requestOtp()} disabled={busy} className="font-semibold muted hover:text-ink-900">
              {ar ? "إعادة إرسال الكود" : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={passwordLogin}>
          <label className="label" htmlFor="l-email">
            {ar ? "البريد الإلكتروني" : "Email"}
          </label>
          <input
            id="l-email"
            className="input"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <label className="label mt-4" htmlFor="l-pass">
            {ar ? "كلمة المرور" : "Password"}
          </label>
          <input
            id="l-pass"
            className="input"
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error && <p role="alert" className="mt-3 text-[13px] text-danger-600">{error}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary mt-5 w-full">
            {busy ? t("loading", locale) : t("nav_login", locale)}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setError(null);
            }}
            className="mt-4 text-[13px] font-medium muted underline-offset-4 hover:text-ink-900 hover:underline"
          >
            {ar ? "الدخول برقم الموبايل" : "Sign in with a mobile number"}
          </button>
        </form>
      )}
    </div>
  );
}
