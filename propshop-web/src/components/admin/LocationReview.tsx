import { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { parseLocationIssues } from "@/lib/locationService";

/**
 * The automatic location verdict, as a reviewer sees it. Server component.
 *
 * "unchecked" is shown as its own state rather than folded into verified: a check that
 * has not run has not verified anything.
 */
export function LocationBadge({ status, locale }: { status: string; locale: Locale }) {
  const ar = locale === "ar";
  if (status === "verified") {
    return (
      <span className="badge badge-verified">
        {ar ? "الموقع متأكد منه تلقائي" : "Location verified"}
      </span>
    );
  }
  if (status === "issues") {
    return (
      <span className="badge badge-above">
        {ar ? "مشكلة في الموقع" : "Location issue"}
      </span>
    );
  }
  return (
    <span className="badge badge-neutral">
      {ar ? "الموقع لسه ماتراجعش" : "Location not checked"}
    </span>
  );
}

export function LocationIssues({
  issuesJson,
  checkedAt,
  locale,
}: {
  issuesJson: string | null;
  checkedAt: Date | null;
  locale: Locale;
}) {
  const ar = locale === "ar";
  const issues = parseLocationIssues(issuesJson);
  if (issues.length === 0) return null;

  return (
    <div className="space-y-2">
      {issues.map((issue, i) => {
        const high = issue.severity === "high";
        return (
          <div
            key={`${issue.code}-${issue.mediaId ?? i}`}
            className={`border-s-2 px-3 py-2 text-[13px] ${
              high ? "border-danger-600 bg-danger-50 text-danger-700" : "border-ink-400 bg-ink-50 text-ink-900"
            }`}
          >
            <span>
              {ar ? issue.messageAr : issue.messageEn}
              <span className="ms-2 text-[12px] opacity-70">({issue.code})</span>
            </span>
          </div>
        );
      })}
      {checkedAt && (
        <p className="text-[12px] muted">
          {ar ? "آخر فحص تلقائي" : "Last automatic check"} {formatDate(checkedAt, locale)}
        </p>
      )}
    </div>
  );
}

/** Media ids a location issue points at, so the photo strip can outline them. */
export function flaggedMediaIds(issuesJson: string | null): Set<string> {
  return new Set(parseLocationIssues(issuesJson).flatMap((i) => (i.mediaId ? [i.mediaId] : [])));
}
