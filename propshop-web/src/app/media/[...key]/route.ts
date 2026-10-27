import { open, stat } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { MEDIA_TYPES, publicMediaPath } from "@/lib/mediaStore";

/**
 * GET /media/<key> — serves public photo renditions, tour posters and processed tour
 * videos for the LOCAL storage driver only.
 *
 * This is LocalDriver.publicUrl's other half. In production the same URLs come from the
 * CDN in front of the public bucket and this route is never hit. Keys contain a uuid and
 * files never change once written, so they cache forever.
 *
 * Videos are served in byte ranges: a <video> element seeks by asking for ranges, and
 * Safari on iPhone will not play a video at all from a server that ignores `Range`.
 */
const CHUNK_MAX = 4 * 1024 * 1024;

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const file = publicMediaPath(key);
  if (!file) return new NextResponse("Not found", { status: 404 });
  const type = MEDIA_TYPES[file.split(".").pop() ?? ""] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    // Public, immutable files. The Flutter web build loads images and video with fetch
    // from another origin, which needs this; native apps and <img>/<video> do not.
    "Access-Control-Allow-Origin": "*",
  };

  try {
    const { size } = await stat(file);
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    let start = 0;
    let end = size - 1;
    let partial = false;
    if (range && (range[1] || range[2])) {
      partial = true;
      if (range[1]) {
        start = Number(range[1]);
        end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      } else {
        start = Math.max(0, size - Number(range[2])); // suffix range: the last N bytes
      }
      if (start > end || start >= size) {
        return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
      }
      // Bounded chunks: a player asking for "bytes=0-" must not pull a 200 MB file into memory.
      end = Math.min(end, start + CHUNK_MAX - 1);
    } else if (size > CHUNK_MAX && type.startsWith("video/")) {
      partial = true;
      end = CHUNK_MAX - 1;
    }

    const length = end - start + 1;
    const buf = Buffer.alloc(length);
    const fh = await open(file, "r");
    try {
      await fh.read(buf, 0, length, start);
    } finally {
      await fh.close();
    }
    return new NextResponse(new Uint8Array(buf), {
      status: partial ? 206 : 200,
      headers: { ...headers, "Content-Length": String(length), ...(partial ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
