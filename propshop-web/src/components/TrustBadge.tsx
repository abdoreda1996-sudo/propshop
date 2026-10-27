import { BadgeCheck } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { TRUST_LABELS } from "@/lib/enums";

/** Trust level 2-4, shown wherever a listing appears (Section 11). One mark for every level. */
export default function TrustBadge({ level, locale }: { level: number; locale: Locale }) {
  const label = TRUST_LABELS[level]?.[locale] ?? "";
  return (
    <span className="badge badge-verified">
      <BadgeCheck size={13} />
      {label}
    </span>
  );
}
