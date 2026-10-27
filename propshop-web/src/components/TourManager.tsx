"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Video, Box } from "lucide-react";
import { Locale } from "@/lib/i18n";
import { MAX_TOURS_PER_LISTING, TOUR_PROVIDER_LABELS, TourProvider, isImmersive } from "@/lib/tours";

export type ManagedTour = {
  id: string;
  kind: string;
  provider: string;
  url: string;
  posterUrl: string | null;
  title: string | null;
  status: string;
  rejectReason: string | null;
};

const MAX_VIDEO_MB = 200;

const ERRORS: Record<string, { ar: string; en: string }> = {
  link_invalid: { ar: "اللينك ده مش لينك فيديو أو جولة صالح.", en: "That isn't a valid video or tour link." },
  provider_not_supported: { ar: "بنقبل لينكات يوتيوب وفيميو وماتربورت وكوولا بس.", en: "We accept YouTube, Vimeo, Matterport and Kuula links only." },
  too_many_tours: { ar: `الحد ${MAX_TOURS_PER_LISTING} جولات للإعلان.`, en: `The limit is ${MAX_TOURS_PER_LISTING} tours per listing.` },
  title_contact_details: { ar: "العنوان مايقدرش يكون فيه أرقام تليفون أو لينكات.", en: "The title can't contain phone numbers or links." },
  too_large: { ar: `الفيديو أكبر من ${MAX_VIDEO_MB} ميجا.`, en: `The video is larger than ${MAX_VIDEO_MB} MB.` },
  type_not_allowed: { ar: "ارفع فيديو MP4 أو MOV.", en: "Upload an MP4 or MOV video." },
  not_a_video: { ar: "الملف ده مش فيديو MP4 أو MOV.", en: "That file isn't an MP4 or MOV video." },
  listing_closed: { ar: "الإعلان ده مقفول.", en: "This listing is closed." },
  rate_limited: { ar: "رفعت كتير. استنى شوية.", en: "Too many uploads. Wait a little." },
  storage_driver_unsupported: { ar: "رفع الفيديو مش متاح هنا، استخدم لينك.", en: "Video upload isn't available here. Use a link instead." },
  network_error: { ar: "النت فصل أثناء الرفع. جرّب تاني.", en: "The connection dropped during the upload. Try again." },
  request_failed: { ar: "مقدرناش ننفذ ده. جرّب تاني.", en: "That did not work. Try again." },
};

const STATUS: Record<string, { ar: string; en: string; tone: string }> = {
  pending: { ar: "مستنية المراجعة", en: "Awaiting review", tone: "badge-neutral" },
  approved: { ar: "ظاهرة على الإعلان", en: "Live on the listing", tone: "badge-verified" },
  rejected: { ar: "اترفضت", en: "Rejected", tone: "badge-above" },
};

/**
 * Add, review and remove a listing's virtual tours. Used on the owner's tour page and in
 * the admin listing editor — what each viewer may do comes from the props, and the server
 * re-checks every action (src/lib/tourService.ts).
 */
export default function TourManager({
  listingId,
  initial,
  locale,
  canReview,
  canDelete,
  addsApproved,
}: {
  listingId: string;
  initial: ManagedTour[];
  locale: Locale;
  canReview: boolean;
  canDelete: boolean;
  /** Staff: what they add is live immediately (shown in the help text). */
  addsApproved: boolean;
}) {
  const router = useRouter();
  const ar = locale === "ar";
  const [tours, setTours] = useState(initial);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slotsLeft = MAX_TOURS_PER_LISTING - tours.filter((t) => t.status !== "rejected").length;
  const msg = (code: string) => ERRORS[code]?.[locale] ?? ERRORS.request_failed[locale];

  const added = (tour: ManagedTour) => {
    setTours((t) => [...t, tour]);
    setLink("");
    setTitle("");
    router.refresh();
  };

  async function addLink() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/listings/${listingId}/tours`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link, title }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error ?? "request_failed");
      added(j.tour);
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File) {
    setError(null);
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) return setError("too_large");
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    // XHR rather than fetch: fetch has no upload progress, and a 150 MB video on a phone
    // connection needs a progress bar or people assume it froze.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/listings/${listingId}/tours`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      setBusy(false);
      const j = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return {};
        }
      })();
      if (xhr.status >= 400) return setError(j.error ?? "request_failed");
      added(j.tour);
    };
    xhr.onerror = () => {
      setProgress(null);
      setBusy(false);
      setError("network_error");
    };
    setBusy(true);
    setProgress(0);
    xhr.send(form);
  }

  async function review(id: string, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      reason = window.prompt(ar ? "سبب الرفض (هيظهر للمالك):" : "Reason (shown to the owner):") ?? undefined;
      if (!reason?.trim()) return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/listings/${listingId}/tours/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error ?? "request_failed");
      setTours((ts) => ts.map((t) => (t.id === id ? { ...t, status: j.status, rejectReason: reason ?? null } : t)));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(ar ? "تشيل الجولة دي؟" : "Remove this tour?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/listings/${listingId}/tours/${id}`, { method: "DELETE" });
      if (!r.ok) return setError((await r.json().catch(() => ({}))).error ?? "request_failed");
      setTours((ts) => ts.filter((t) => t.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {tours.length > 0 && (
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {tours.map((t) => {
            const st = STATUS[t.status] ?? STATUS.pending;
            const label = TOUR_PROVIDER_LABELS[t.provider as TourProvider]?.[locale] ?? t.provider;
            return (
              <li key={t.id} className="flex flex-wrap items-start gap-3 py-3.5">
                <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-ink-900 text-white">
                  {t.kind === "video" && t.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.posterUrl} alt="" className="h-full w-full object-cover" />
                  ) : isImmersive(t.provider) ? (
                    <Box size={22} />
                  ) : (
                    <Video size={22} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink-900">{t.title || label}</span>
                    <span className="badge badge-neutral">{label}</span>
                    <span className={`badge ${st.tone}`}>{st[locale]}</span>
                  </div>
                  {t.status === "rejected" && t.rejectReason && (
                    <p className="mt-1 text-[12px] text-danger-700">{t.rejectReason}</p>
                  )}
                  <a href={t.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[12px] muted underline">
                    {t.kind === "video" ? (ar ? "شوف الفيديو" : "Watch video") : ar ? "افتح الجولة" : "Open tour"}
                  </a>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canReview && t.status === "pending" && (
                    <>
                      <button type="button" disabled={busy} onClick={() => review(t.id, "approve")} className="btn btn-primary text-[13px]">
                        {ar ? "وافق" : "Approve"}
                      </button>
                      <button type="button" disabled={busy} onClick={() => review(t.id, "reject")} className="btn btn-ghost text-[13px]">
                        {ar ? "ارفض" : "Reject"}
                      </button>
                    </>
                  )}
                  {canDelete && (
                    <button type="button" disabled={busy} onClick={() => remove(t.id)} className="btn btn-ghost text-[13px]" aria-label={ar ? "شيل" : "Remove"}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {slotsLeft > 0 ? (
        <div className="space-y-4">
          <p className="text-[13px] muted">
            {addsApproved
              ? ar
                ? "اللي هتضيفه هيظهر على الإعلان على طول."
                : "What you add goes live on the listing immediately."
              : ar
                ? "فريق بروب شوب بيراجع كل جولة قبل ما تظهر. ماينفعش يبان فيها أرقام تليفون أو لوجو سمسار، ولازم تكون للوحدة دي."
                : "The PropShop team reviews every tour before it appears. No phone numbers or broker logos, and it has to show this unit."}
          </p>
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-900">{ar ? "عنوان (اختياري)" : "Title (optional)"}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="input mt-1 w-full" placeholder={ar ? "مثلاً: جولة في الشقة كاملة" : "e.g. Full walkthrough"} />
          </label>
          <div>
            <span className="text-[13px] font-semibold text-ink-900">{ar ? "لينك جولة أو فيديو" : "Tour or video link"}</span>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                dir="ltr"
                className="input min-w-[220px] flex-1"
                placeholder="https://youtu.be/…  ·  https://my.matterport.com/show/?m=…"
              />
              <button type="button" disabled={busy || !link.trim()} onClick={addLink} className="btn btn-primary text-[13px]">
                {ar ? "أضف اللينك" : "Add link"}
              </button>
            </div>
            <p className="mt-1 text-[12px] muted">{ar ? "يوتيوب · فيميو · ماتربورت (3D) · كوولا (360°)" : "YouTube · Vimeo · Matterport (3D) · Kuula (360°)"}</p>
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <span className="text-[13px] font-semibold text-ink-900">{ar ? "أو ارفع فيديو من جهازك" : "Or upload a video"}</span>
            <label className={`btn btn-ghost mt-2 w-full cursor-pointer justify-center text-[13px] ${busy ? "pointer-events-none opacity-60" : ""}`}>
              {progress !== null ? (ar ? `جاري الرفع… ${progress}%` : `Uploading… ${progress}%`) : ar ? `اختار فيديو (MP4 / MOV، لحد ${MAX_VIDEO_MB} ميجا)` : `Choose a video (MP4 / MOV, up to ${MAX_VIDEO_MB} MB)`}
              <input
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) upload(f);
                }}
              />
            </label>
            {progress !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-ink-100">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[13px] muted">{ar ? `وصلت للحد (${MAX_TOURS_PER_LISTING} جولات).` : `You've reached the limit (${MAX_TOURS_PER_LISTING} tours).`}</p>
      )}

      {error && <p className="text-[13px] text-danger-700">{msg(error)}</p>}
    </div>
  );
}
