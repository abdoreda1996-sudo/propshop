import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safeNext";
import { getLocale } from "@/lib/locale";
import { getSession } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import Link from "next/link";

import { localMeta } from "@/lib/seo";
export async function generateMetadata() {
  return localMeta({ ar: "تسجيل الدخول", en: "Sign in" });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  const [locale, session, sp] = await Promise.all([getLocale(), getSession(), searchParams]);
  // `next` comes from the URL, so it is attacker-controlled: /login?next=https://evil.example
  // would hand a freshly signed-in user to another site. Only same-site paths are honoured.
  // Signing in lands on the home page unless a page sent you here (owner, 2026-10-24).
  const next = safeNextPath(sp.next, "/");
  if (session) redirect(next);

  const ar = locale === "ar";
  const signup = sp.mode === "signup";

  return (
    <div className="container-page pb-10 pt-10 md:pt-16">
      <div className="w-full max-w-[400px]">
        <h1 className="text-[28px] font-bold leading-tight text-ink-900">
          {signup ? (ar ? "حساب جديد" : "Create an account") : ar ? "تسجيل الدخول" : "Sign in"}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
          {signup
            ? ar
              ? "كل اللي محتاجينه رقم موبايلك. هنبعتلك كود، وبعدها نسألك على اسمك. رقمك مش بيظهر لأي حد على المنصة."
              : "All we need is your mobile number. We text you a code, then ask your name. Your number is never shown to anyone on the site."
            : ar
              ? "ادخل برقم موبايلك. رقمك مش بيظهر لأي حد على المنصة."
              : "Sign in with your mobile number. Your number is never shown to anyone on the site."}
        </p>

        <div className="mt-6 border-t border-[var(--border)]">
          <LoginForm locale={locale} next={next} />
        </div>

        <p className="mt-8 text-[12px] leading-relaxed muted">
          {ar ? "بتسجيلك بتوافق على " : "By signing in you accept the "}
          <Link href="/legal/terms" className="underline underline-offset-2 hover:text-ink-900">
            {ar ? "الشروط" : "terms"}
          </Link>
          {ar ? " و" : " and the "}
          <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-ink-900">
            {ar ? "سياسة الخصوصية" : "privacy policy"}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
