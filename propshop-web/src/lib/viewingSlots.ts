/**
 * Viewing times are three fixed windows a day, in Cairo time (owner, 2026-09-27):
 *
 *   11:00 – 14:00 · 14:00 – 18:00 · 18:00 – 21:00
 *
 * A slot is stored as the instant its window STARTS (the existing `slotsJson` /
 * `proposedAt` / `scheduledAt` columns, unchanged), and the server refuses any instant
 * that is not a window start. Clients never do timezone maths: they send
 * `{ date: "YYYY-MM-DD", window: "11-14" }` and read back `describeSlot()`, so a buyer
 * abroad picking "2 PM – 6 PM" gets Cairo's 2 PM, which is when the owner will be there.
 */

export const VIEWING_TZ = "Africa/Cairo";

export const VIEWING_WINDOWS = [
  { key: "11-14", start: 11, end: 14, ar: "11 ص – 2 م", en: "11 AM – 2 PM" },
  { key: "14-18", start: 14, end: 18, ar: "2 م – 6 م", en: "2 PM – 6 PM" },
  { key: "18-21", start: 18, end: 21, ar: "6 م – 9 م", en: "6 PM – 9 PM" },
] as const;

export type ViewingWindowKey = (typeof VIEWING_WINDOWS)[number]["key"];

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIEWING_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Wall-clock parts of an instant in Cairo. */
function cairoParts(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** The UTC instant at which Cairo's clock reads `date` `hour`:00 (DST-aware). */
function cairoInstant(date: string, hour: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour);
  let guess = target - 2 * 3600_000; // Cairo is UTC+2 or UTC+3
  for (let i = 0; i < 3; i++) {
    const p = cairoParts(new Date(guess));
    const [y, mo, d] = p.date.split("-").map(Number);
    const seen = Date.UTC(y, mo - 1, d, p.hour, p.minute, p.second);
    if (seen === target) return new Date(guess);
    guess += target - seen;
  }
  return null;
}

export function windowByKey(key: string) {
  return VIEWING_WINDOWS.find((w) => w.key === key) ?? null;
}

/** The window an instant starts, or null if it is not exactly a window start. */
export function windowOf(at: Date) {
  if (Number.isNaN(at.getTime())) return null;
  const p = cairoParts(at);
  if (p.minute !== 0 || p.second !== 0 || at.getUTCMilliseconds() !== 0) return null;
  return VIEWING_WINDOWS.find((w) => w.start === p.hour) ?? null;
}

/** Build the stored instant from a day + window key. */
export function slotFor(date: string, windowKey: string): Date | null {
  const w = windowByKey(windowKey);
  if (!w) return null;
  const at = cairoInstant(date, w.start);
  return at && windowOf(at) ? at : null;
}

/**
 * Accept either `{date, window}` (preferred) or an ISO string that is already a window
 * start. Anything else — including a valid time that is not a window start — is null.
 */
export function parseSlot(input: unknown): Date | null {
  if (input && typeof input === "object") {
    const o = input as Record<string, unknown>;
    return typeof o.date === "string" && typeof o.window === "string" ? slotFor(o.date, o.window) : null;
  }
  if (typeof input === "string") {
    const at = new Date(input);
    return windowOf(at) ? at : null;
  }
  return null;
}

/** 12-hour clock: "2:30 PM" / "2:30 م". Never 24-hour. */
export function clock12(hour: number, minute: number, ar: boolean): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const mm = minute ? `:${String(minute).padStart(2, "0")}` : "";
  const suffix = hour < 12 ? (ar ? "ص" : "AM") : ar ? "م" : "PM";
  return `${h}${mm} ${suffix}`;
}

export type SlotView = {
  at: string;
  date: string;
  window: ViewingWindowKey | null;
  labelAr: string;
  labelEn: string;
};

/** What clients render: the Cairo day and the window label, never a raw clock time. */
export function describeSlot(at: Date | string): SlotView {
  const d = typeof at === "string" ? new Date(at) : at;
  const w = windowOf(d);
  const p = cairoParts(d);
  return {
    at: d.toISOString(),
    date: p.date,
    window: w?.key ?? null,
    // Legacy rows from before the windows existed fall back to their clock time — in the
    // 12-hour form, like every time shown to a person on this platform.
    labelAr: w?.ar ?? clock12(p.hour, p.minute, true),
    labelEn: w?.en ?? clock12(p.hour, p.minute, false),
  };
}

/** Today's date in Cairo, for the earliest pickable day. */
export function cairoToday(now = new Date()): string {
  return cairoParts(now).date;
}
