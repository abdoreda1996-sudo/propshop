/**
 * Browser-side image preparation for the JSON upload routes (identity KYC and the
 * ownership document), which take `images: [{ mediaType, data }]` — base64, the same
 * contract the mobile app uses.
 *
 * A phone photo is 3–8 MB straight off the camera (often larger as HEIC). Sent as base64
 * that is a 4–11 MB JSON body, which is over Vercel's 4.5 MB request cap and over the
 * Claude vision limit, so the upload fails before the route ever runs. Re-encoding to a
 * JPEG of at most 1600 px on the long side keeps an ID card or a contract page perfectly
 * legible at ~200–600 KB, and also normalises HEIC/PNG/WebP to one type the server reads.
 *
 * Client-only: uses canvas and FileReader.
 */

export type UploadImage = { mediaType: "image/jpeg"; data: string };

/** Long side in pixels. Enough for an ID card or a contract page to stay readable. */
const MAX_SIDE = 1600;
const QUALITY = 0.85;

export class ImageReadError extends Error {
  constructor(message = "image_unreadable") {
    super(message);
  }
}

/**
 * The picked file is HEIC/HEIF and this browser cannot decode it. iPhones save photos as
 * HEIC; Safari decodes them, desktop Chrome and Firefox do not. A converter would mean a
 * ~1 MB WASM dependency for one edge case, so the user is asked for a JPG/PNG instead (or
 * to use the camera option, which hands the browser a JPEG).
 */
export class HeicUnsupportedError extends ImageReadError {
  constructor() {
    super("heic_unsupported");
  }
}

/** HEIC/HEIF by type or, when the OS reports no type (Windows often does not), by name. */
export function isHeic(file: { type: string; name: string }): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** The bilingual message for a file prepareImage could not read. */
export function imageReadMessage(err: unknown, ar: boolean, fallback: { ar: string; en: string }): string {
  if (err instanceof HeicUnsupportedError) {
    return ar
      ? "المتصفح ده مش بيفتح صور HEIC اللي بتطلع من الآيفون. اختار صورة JPG أو PNG، أو استخدم زرار الكاميرا وصوّر على طول. (على الآيفون: الإعدادات ← الكاميرا ← التنسيقات ← الأكثر توافقاً.)"
      : "This browser can't open HEIC photos from an iPhone. Pick a JPG or PNG, or use the camera button to take the photo directly. (On iPhone: Settings → Camera → Formats → Most Compatible.)";
  }
  return ar ? fallback.ar : fallback.en;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // createImageBitmap applies the EXIF orientation, so a portrait phone photo stays upright.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Fall through to <img>, which some browsers decode more formats with (Safari + HEIC).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new ImageReadError());
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Resize + re-encode one picked file to a base64 JPEG. Throws ImageReadError if
 * undecodable, HeicUnsupportedError when that is because the browser cannot read HEIC.
 */
export async function prepareImage(file: File): Promise<UploadImage> {
  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    throw isHeic(file) ? new HeicUnsupportedError() : new ImageReadError();
  }
  const { source, width, height, close } = decoded;
  try {
    if (!width || !height) throw new ImageReadError();
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageReadError();
    ctx.fillStyle = "#fff"; // transparent PNG areas would otherwise turn black in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new ImageReadError();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new ImageReadError());
      reader.readAsDataURL(blob);
    });
    return { mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) };
  } finally {
    close();
  }
}
