/**
 * The hero cover's media layer: a photo, a looping muted video, or a tour embed playing
 * as a background. Shared by the home page and the admin editor's live preview so the
 * preview cannot drift from what visitors get.
 *
 * No hooks, no server imports — renders on either side.
 */

export type HeroMedia =
  | { type: "image"; src: string }
  | { type: "video"; src: string; poster: string | null }
  | { type: "embed"; src: string; provider: string };

export type HeroPosition = "center" | "top" | "bottom" | "left" | "right";

const OBJECT_POSITION: Record<HeroPosition, string> = {
  center: "50% 50%",
  top: "50% 15%",
  bottom: "50% 85%",
  left: "15% 50%",
  right: "85% 50%",
};

/**
 * Turns a stored tour embed URL into its background-playback form: autoplay, muted,
 * looping, no chrome. Muted is not optional — browsers refuse to autoplay with sound.
 */
export function backgroundEmbed(url: string, provider: string): string {
  const u = new URL(url);
  const set = (params: Record<string, string>) => Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  if (provider === "youtube") {
    const id = u.pathname.split("/").pop()!;
    set({ autoplay: "1", mute: "1", loop: "1", playlist: id, controls: "0", playsinline: "1", modestbranding: "1" });
  } else if (provider === "vimeo") {
    set({ background: "1" }); // vimeo's own autoplay + muted + loop + no-controls mode
  } else if (provider === "matterport") {
    set({ play: "1", qs: "1", brand: "0", title: "0", help: "0", hr: "0" });
  } else if (provider === "kuula") {
    set({ autorotate: "0.15", chromeless: "1", logo: "0", info: "0", card: "0", thumbs: "0", fs: "0", vr: "0" });
  }
  return u.toString();
}

/** The tone over the cover. dim 100 is the darkest; lower lets more of the picture through. */
export function heroWash(dim: number): string {
  const k = Math.min(100, Math.max(20, dim)) / 100;
  const a = (v: number) => (v * k).toFixed(2);
  // Neutral and light (owner, 2026-10-11): the home cover is a framed picture, so this
  // only tones it down; dim 100 is the strongest the admin can choose.
  return `linear-gradient(180deg, rgba(0,0,0,${a(0.05)}) 0%, rgba(0,0,0,${a(0.28)}) 100%)`;
}

export default function HeroBackdrop({ media, position = "center" }: { media: HeroMedia; position?: HeroPosition }) {
  const objectPosition = OBJECT_POSITION[position];

  if (media.type === "video") {
    return (
      <video
        key={media.src}
        src={media.src}
        poster={media.poster ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
        className="absolute inset-0 -z-10 h-full w-full object-cover"
        style={{ objectPosition }}
      />
    );
  }

  if (media.type === "embed") {
    // An iframe has no object-fit. The wrapper is a size container, so the frame can be
    // sized in cq units to always overfill it at 16:9 — "cover", done by hand. Not
    // clickable: it is a backdrop under the headline; the "take the tour" pill opens it.
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" style={{ containerType: "size" }}>
        <iframe
          key={media.src}
          src={media.src}
          title=""
          tabIndex={-1}
          allow="autoplay; fullscreen; xr-spatial-tracking"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0"
          style={{ width: "max(100cqw, 177.78cqh)", height: "max(100cqh, 56.25cqw)" }}
        />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.src} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full object-cover" style={{ objectPosition }} />
  );
}
