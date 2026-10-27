/**
 * Virtual tours: which links become iframes on a listing page, and what an uploaded video
 * may carry. An accepted link is a third-party page embedded under our name, and an
 * unstripped video can publish where an owner lives — these pin both.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseTourLink, isSafeEmbedUrl, looksLikeVideo, blankVideoLocation } from "../tours";

test("YouTube: every common shape becomes a nocookie embed", () => {
  for (const u of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ]) {
    const r = parseTourLink(u);
    assert.ok(r.ok, u);
    assert.equal(r.ok && r.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
  }
});

test("Vimeo, Matterport and Kuula are rebuilt from their ids", () => {
  const v = parseTourLink("https://vimeo.com/76979871");
  assert.equal(v.ok && v.embedUrl, "https://player.vimeo.com/video/76979871");
  const m = parseTourLink("https://my.matterport.com/show/?m=SxQL3iGyoDo");
  assert.equal(m.ok && m.provider, "matterport");
  assert.equal(m.ok && m.embedUrl, "https://my.matterport.com/show/?m=SxQL3iGyoDo&play=0");
  const k = parseTourLink("https://kuula.co/share/7lVLq");
  assert.equal(k.ok && k.provider, "kuula");
});

test("anything else is refused, and bad ids are not passed through", () => {
  assert.deepEqual(parseTourLink("https://evil.example.com/tour"), { ok: false, reason: "provider_not_supported" });
  assert.deepEqual(parseTourLink("not a url"), { ok: false, reason: "link_invalid" });
  assert.deepEqual(parseTourLink("javascript:alert(1)"), { ok: false, reason: "link_invalid" });
  assert.deepEqual(parseTourLink("https://youtube.com/watch?v=short"), { ok: false, reason: "link_invalid" });
  assert.deepEqual(parseTourLink('https://youtu.be/dQw4w9WgXc"><script>'), { ok: false, reason: "link_invalid" });
  assert.deepEqual(parseTourLink("https://my.matterport.com/show/?m=../../x"), { ok: false, reason: "link_invalid" });
});

test("every embed we produce passes the render-time guard; foreign URLs do not", () => {
  for (const u of ["https://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/76979871", "https://my.matterport.com/show/?m=SxQL3iGyoDo", "https://kuula.co/share/collection/7lVLq"]) {
    const r = parseTourLink(u);
    assert.ok(r.ok && isSafeEmbedUrl(r.embedUrl), u);
  }
  assert.equal(isSafeEmbedUrl("https://evil.example.com/embed"), false);
  assert.equal(isSafeEmbedUrl("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ\"onload=x"), false);
});

/** A minimal ISO-BMFF file: ftyp + moov containing a ©xyz location atom. */
function fakeVideo(brand: string, location: string) {
  const box = (type: string, body: Buffer) => {
    const h = Buffer.alloc(8);
    h.writeUInt32BE(8 + body.length);
    h.write(type, 4, "latin1");
    return Buffer.concat([h, body]);
  };
  const ftyp = box("ftyp", Buffer.from(brand + "\0\0\0\0isommp42", "latin1"));
  const xyz = box("\xa9xyz", Buffer.from("\0\x12\x15\xc7" + location, "latin1"));
  const moov = box("moov", box("udta", xyz));
  const mdat = box("mdat", Buffer.from("+30.0444+031.2357/ frame bytes", "latin1"));
  return Buffer.concat([ftyp, moov, mdat]);
}

test("container sniffing: MP4 and QuickTime by their ftyp box, anything else refused", () => {
  assert.deepEqual(looksLikeVideo(fakeVideo("isom", "")), { ok: true, ext: "mp4", mime: "video/mp4" });
  assert.deepEqual(looksLikeVideo(fakeVideo("qt  ", "")), { ok: true, ext: "mov", mime: "video/quicktime" });
  assert.deepEqual(looksLikeVideo(Buffer.from("<html>not a video</html>")), { ok: false });
  assert.deepEqual(looksLikeVideo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), { ok: false });
});

test("GPS in the metadata is blanked in place; size and media bytes unchanged", () => {
  const v = fakeVideo("qt  ", "+30.04441+031.23572+021.000/");
  const before = Buffer.from(v);
  const n = blankVideoLocation(v);
  assert.equal(n, 1);
  assert.equal(v.length, before.length);
  assert.equal(v.toString("latin1").includes("+30.04441"), false);
  // Coordinates-looking bytes in the media data (outside moov) are not touched.
  assert.equal(v.toString("latin1").includes("+30.0444+031.2357/ frame bytes"), true);
});
