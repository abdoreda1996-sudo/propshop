import Link from "next/link";
import { getLocale } from "@/lib/locale";

export default async function NotFound() {
  const locale = await getLocale();
  const ar = locale === "ar";

  return (
    <div className="container-page py-16 md:py-24">
      <p className="tnum text-[14px] text-ink-400">404</p>
      <h1 className="display mt-2">{ar ? "الصفحة دي مش موجودة" : "This page does not exist"}</h1>
      <p className="lede mt-4">
        {ar
          ? "ممكن تكون الوحدة اتباعت أو اتشالت، أو الرابط فيه غلطة. الإعلانات اللي لسه تحت المراجعة مابتظهرش للناس."
          : "The home may have been sold or taken down, or the link has a typo. Listings still under review are not shown publicly."}
      </p>
      <p className="mt-6 text-[15px]">
        <Link href="/" className="font-semibold text-brand-500 underline underline-offset-4">
          {ar ? "ارجع لكل الوحدات" : "Back to all homes"}
        </Link>
      </p>
    </div>
  );
}
