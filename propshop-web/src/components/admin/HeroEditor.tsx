"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, Check, Loader2 } from "lucide-react";
import HeroBackdrop, { backgroundEmbed, heroWash, type HeroMedia, type HeroPosition } from "@/components/HeroBackdrop";
import { parseTourLink, TOUR_PROVIDER_LABELS, type TourProvider } from "@/lib/tours";
import type { HeroConfig, HeroOptions, HeroSource } from "@/lib/siteHero";
import type { Locale } from "@/lib/i18n";

type Tour = HeroOptions["tours"][number];
type Photo = HeroOptions["photos"][number];

const MAX_UPLOAD_MB = 150;

const ERRORS: Record<string, { ar: string; en: string }> = {
  tour_required: { ar: "اختار جولة", en: "Pick a tour" },
  photo_required: { ar: "اختار صورة", en: "Pick a photo" },
  upload_required: { ar: "ارفع ملف الأول", en: "Upload a file first" },
  link_invalid: { ar: "الرابط مش صحيح", en: "That link isn't valid" },
  provider_not_supported: { ar: "بندعم يوتيوب وفيميو وماتربورت وكوولا بس", en: "Only YouTube, Vimeo, Matterport and Kuula links" },
  too_large: { ar: `الملف أكبر من ${MAX_UPLOAD_MB} ميجا`, en: `File is over ${MAX_UPLOAD_MB} MB` },
  too_large_hosted: { ar: "الملف كبير على السيرفر (حوالي 4 ميجا كحد أقصى). للفيديو استخدم «رابط جولة».", en: "Too big for the server (about 4 MB max). For video, use a tour link instead." },
  type_not_allowed: { ar: "نوع الملف مش مدعوم (JPG / PNG / WEBP / MP4 / MOV)", en: "Unsupported file (JPG / PNG / WEBP / MP4 / MOV)" },
  not_an_image: { ar: "الملف مش صورة", en: "That file isn't an image" },
  not_a_video: { ar: "الملف مش فيديو", en: "That file isn't a video" },
  storage_driver_unsupported: { ar: "الرفع المباشر مش متاح على التخزين ده", en: "Direct upload isn't available on this storage" },
  network_error: { ar: "مشكلة في الاتصال", en: "Network error" },
};

const label = (l: Tour["listing"], ar: boolean) =>
  `${(ar ? l.unit.compound?.nameAr : l.unit.compound?.nameEn) ?? (ar ? l.unit.area.nameAr : l.unit.area.nameEn)} · ${l.reference}`;

function tourMedia(t: Tour): HeroMedia {
  return t.kind === "video" ? { type: "video", src: t.url, poster: t.posterUrl } : { type: "embed", src: backgroundEmbed(t.url, t.provider), provider: t.provider };
}

export default function HeroEditor({ locale, initial, options }: { locale: Locale; initial: HeroConfig; options: HeroOptions }) {
  const ar = locale === "ar";
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [source, setSource] = useState<HeroSource>(initial.source);
  const [tourId, setTourId] = useState(initial.tourId ?? options.tours[0]?.id ?? "");
  const [linkInput, setLinkInput] = useState(initial.linkUrl ?? "");
  const [mediaId, setMediaId] = useState(initial.mediaId ?? options.photos[0]?.id ?? "");
  const [upload, setUpload] = useState<{ url: string; kind: "image" | "video"; poster: string | null } | null>(
    initial.uploadUrl ? { url: initial.uploadUrl, kind: initial.uploadKind ?? "image", poster: initial.uploadPoster ?? null } : null,
  );
  const [dim, setDim] = useState(initial.dim);
  const [position, setPosition] = useState<HeroPosition>(initial.position);

  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const msg = (code: string) => ERRORS[code]?.[locale] ?? (ar ? `حصل خطأ (${code})` : `Something went wrong (${code})`);

  const parsedLink = useMemo(() => (linkInput.trim() ? parseTourLink(linkInput) : null), [linkInput]);

  // What the preview shows — mirrors resolveHeroCover() in src/lib/siteHero.ts.
  const preview: HeroMedia | null = useMemo(() => {
    switch (source) {
      case "tour": {
        const t = options.tours.find((x) => x.id === tourId);
        return t ? tourMedia(t) : null;
      }
      case "link":
        return parsedLink?.ok ? { type: "embed", src: backgroundEmbed(parsedLink.embedUrl, parsedLink.provider), provider: parsedLink.provider } : null;
      case "photo": {
        const p = options.photos.find((x) => x.id === mediaId);
        return p ? { type: "image", src: p.fileKey } : null;
      }
      case "upload":
        return upload ? (upload.kind === "video" ? { type: "video", src: upload.url, poster: upload.poster } : { type: "image", src: upload.url }) : null;
      case "auto":
        return options.tours[0] ? tourMedia(options.tours[0]) : options.photos[0] ? { type: "image", src: options.photos[0].fileKey } : null;
    }
  }, [source, tourId, parsedLink, mediaId, upload, options]);

  const touched = () => {
    setSaved(false);
    setError(null);
  };

  // Hosted on Vercel, one request may carry at most ~4.5 MB. Photos are shrunk in the
  // browser first (the server re-encodes them anyway); videos must already be small.
  async function shrinkImage(file: File): Promise<File> {
    if (!file.type.startsWith("image/") || file.size <= 3.5 * 1024 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
      return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch {
      return file;
    }
  }

  async function sendFile(original: File) {
    touched();
    if (original.size > MAX_UPLOAD_MB * 1024 * 1024) return setError("too_large");
    const file = await shrinkImage(original);
    const form = new FormData();
    form.append("file", file);
    // XHR for upload progress — a hero video can be large.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/hero/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      let j: { url?: string; kind?: "image" | "video"; poster?: string | null; error?: string } = {};
      try {
        j = JSON.parse(xhr.responseText);
      } catch {}
      // 413 comes from the host's request-size cap, before our route runs.
      if (xhr.status === 413) return setError("too_large_hosted");
      if (xhr.status >= 400 || !j.url) return setError(j.error ?? "request_failed");
      setUpload({ url: j.url, kind: j.kind ?? "image", poster: j.poster ?? null });
      setSource("upload");
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("network_error");
    };
    setProgress(0);
    xhr.send(form);
  }

  async function save() {
    touched();
    setSaving(true);
    try {
      const r = await fetch("/api/admin/hero", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source,
          tourId,
          linkUrl: linkInput,
          mediaId,
          uploadUrl: upload?.url,
          uploadKind: upload?.kind,
          uploadPoster: upload?.poster,
          dim,
          position,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error ?? "request_failed");
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const SOURCES: { key: HeroSource; title: string; hint: string }[] = [
    { key: "auto", title: ar ? "تلقائي" : "Automatic", hint: ar ? "أحدث جولة افتراضية، وإلا أحدث صورة" : "Newest virtual tour, else newest photo" },
    { key: "tour", title: ar ? "جولة افتراضية" : "Virtual tour", hint: ar ? `${options.tours.length} جولة معتمدة` : `${options.tours.length} approved` },
    { key: "link", title: ar ? "رابط جولة" : "Tour link", hint: "YouTube · Vimeo · Matterport · Kuula" },
    { key: "photo", title: ar ? "صورة إعلان" : "Listing photo", hint: ar ? `${options.photos.length} صورة` : `${options.photos.length} photos` },
    { key: "upload", title: ar ? "رفع ملف" : "Upload", hint: ar ? "صورة أو فيديو" : "Image or video" },
  ];

  const pickCls = (active: boolean) =>
    `relative overflow-hidden rounded-md border-2 text-start transition ${active ? "border-brand-500 ring-2 ring-brand-500/20" : "border-transparent hover:border-ink-200"}`;

  return (
    <div className="mt-5 grid gap-5">
      {/* Live preview: the same backdrop + wash component the home page renders. */}
      <figure>
        <div className="relative isolate h-[220px] overflow-hidden rounded-md bg-ink-100 sm:h-[300px]">
          {preview && <HeroBackdrop media={preview} position={position} />}
          <div aria-hidden className="absolute inset-0 -z-10" style={{ background: heroWash(dim) }} />
          {!preview && (
            <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-500">
              {ar ? "مفيش حاجة للمعاينة، هتظهر الصورة الافتراضية" : "Nothing to preview. The default photo will show"}
            </div>
          )}
        </div>
        <figcaption className="mt-1.5 text-[12px] text-ink-500">{ar ? "معاينة الغلاف زي ما هيظهر في الصفحة الرئيسية" : "Cover preview, as it will appear on the home page"}</figcaption>
      </figure>

      {/* Source */}
      <div className="border-t border-ink-900 pt-3">
        <div className="text-[13px] font-bold text-ink-900">{ar ? "مصدر الغلاف" : "Cover source"}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                touched();
                setSource(s.key);
              }}
              className={`rounded-md border px-3 py-2.5 text-start transition ${source === s.key ? "border-brand-500 bg-brand-50" : "border-[var(--border)] hover:bg-ink-50"}`}
            >
              <div className="text-[13px] font-semibold text-ink-900">{s.title}</div>
              <div className="text-[12px] muted">{s.hint}</div>
            </button>
          ))}
        </div>

        <div className="mt-4">
          {source === "auto" && (
            <p className="text-[13px] muted">
              {ar
                ? "الغلاف بيتغير لوحده: أحدث جولة افتراضية معتمدة على إعلان منشور، ولو مفيش، صورة أحدث إعلان."
                : "Changes on its own: the newest approved virtual tour on a live listing, or the newest listing's cover photo if there is no tour."}
            </p>
          )}

          {source === "tour" &&
            (options.tours.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {options.tours.map((t) => (
                  <button key={t.id} type="button" onClick={() => (touched(), setTourId(t.id))} className={pickCls(t.id === tourId)}>
                    <div className="relative aspect-video bg-navy-900">
                      {t.posterUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.posterUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-white/60">
                          <PlayCircle size={28} />
                        </div>
                      )}
                      <span className="absolute start-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[12px] font-semibold text-white">
                        {TOUR_PROVIDER_LABELS[t.provider as TourProvider]?.[locale] ?? t.provider}
                      </span>
                      {t.id === tourId && <Check size={18} className="absolute end-1.5 top-1.5 rounded-full bg-brand-500 p-0.5 text-white" />}
                    </div>
                    <div className="truncate px-2 py-1.5 text-[12px] font-medium text-ink-900">{t.title || label(t.listing, ar)}</div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] muted">
                {ar
                  ? "مفيش جولات افتراضية معتمدة على إعلانات منشورة لسه. استخدم «رابط جولة» أو «رفع ملف»."
                  : "No approved virtual tours on live listings yet. Use “Tour link” or “Upload” instead."}
              </p>
            ))}

          {source === "link" && (
            <div>
              <input
                className="input w-full"
                dir="ltr"
                placeholder="https://my.matterport.com/show/?m=…  ·  https://kuula.co/share/…  ·  https://youtu.be/…"
                value={linkInput}
                onChange={(e) => (touched(), setLinkInput(e.target.value))}
              />
              {parsedLink && !parsedLink.ok && <p className="mt-1.5 text-[12px] text-danger-600">{msg(parsedLink.reason)}</p>}
              {parsedLink?.ok && (
                <p className="mt-1.5 text-[12px] text-ok-700">
                  {TOUR_PROVIDER_LABELS[parsedLink.provider][locale]} ✓
                </p>
              )}
            </div>
          )}

          {source === "photo" &&
            (options.photos.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {options.photos.map((p: Photo) => (
                  <button key={p.id} type="button" onClick={() => (touched(), setMediaId(p.id))} className={pickCls(p.id === mediaId)} title={label(p.listing, ar)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbKey ?? p.fileKey} alt="" className="aspect-[4/3] w-full object-cover" />
                    {p.id === mediaId && <Check size={18} className="absolute end-1.5 top-1.5 rounded-full bg-brand-500 p-0.5 text-white" />}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] muted">{ar ? "مفيش صور على إعلانات منشورة." : "No photos on live listings."}</p>
            ))}

          {source === "upload" && (
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) sendFile(f);
                  e.target.value = "";
                }}
              />
              <button type="button" className="btn btn-ghost" disabled={progress !== null} onClick={() => fileRef.current?.click()}>
                {upload ? (ar ? "استبدال الملف" : "Replace file") : ar ? "اختار صورة أو فيديو" : "Choose image or video"}
              </button>
              {progress !== null && (
                <span className="flex items-center gap-1.5 text-[13px] muted">
                  <Loader2 size={14} className="animate-spin" /> {progress}%
                </span>
              )}
              {upload && progress === null && (
                <span className="text-[12px] muted">
                  {upload.kind === "video" ? (ar ? "فيديو مرفوع ✓" : "Video uploaded ✓") : ar ? "صورة مرفوعة ✓" : "Image uploaded ✓"}
                </span>
              )}
              <span className="w-full text-[12px] muted">
                {ar ? `JPG / PNG / WEBP أو MP4 / MOV حتى ${MAX_UPLOAD_MB} ميجا. الفيديو بيشتغل صامت ومتكرر.` : `JPG / PNG / WEBP or MP4 / MOV up to ${MAX_UPLOAD_MB} MB. Videos play muted on a loop.`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Adjust */}
      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-bold text-ink-900">
            {ar ? "درجة التعتيم" : "Darkness"} <span className="font-normal muted">· {dim}%</span>
          </span>
          <input type="range" min={20} max={100} step={5} value={dim} onChange={(e) => (touched(), setDim(Number(e.target.value)))} className="mt-2 w-full accent-brand-500" />
          <span className="text-[12px] muted">{ar ? "أقل = الغلاف أوضح، أعلى = الكلام أوضح" : "Lower shows more of the cover; higher keeps text crisp"}</span>
        </label>
        <label className="block">
          <span className="text-[13px] font-bold text-ink-900">{ar ? "تركيز الصورة" : "Focus point"}</span>
          <select className="input mt-2 w-full" value={position} onChange={(e) => (touched(), setPosition(e.target.value as HeroPosition))}>
            <option value="center">{ar ? "المنتصف" : "Center"}</option>
            <option value="top">{ar ? "فوق" : "Top"}</option>
            <option value="bottom">{ar ? "تحت" : "Bottom"}</option>
            <option value="left">{ar ? "شمال" : "Left"}</option>
            <option value="right">{ar ? "يمين" : "Right"}</option>
          </select>
          <span className="text-[12px] muted">{ar ? "للصور والفيديو بس. الجولات التفاعلية بتملأ المساحة" : "Photos and videos only. Interactive tours always fill"}</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || progress !== null}>
          {saving && <Loader2 size={15} className="animate-spin" />}
          {ar ? "حفظ ونشر" : "Save & publish"}
        </button>
        <a href="/" target="_blank" className="text-[13px] font-semibold text-ink-700 underline-offset-2 hover:underline">
          {ar ? "افتح الصفحة الرئيسية" : "Open home page"}
        </a>
        {saved && <span className="text-[13px] font-semibold text-ok-700">{ar ? "اتحفظ ✓" : "Saved ✓"}</span>}
        {error && <span className="text-[13px] text-danger-600">{msg(error)}</span>}
      </div>
    </div>
  );
}
