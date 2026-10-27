/**
 * Anti-broker enforcement (Section 5). Phone numbers are masked by default and in-app
 * messages are scanned for broker language and contact-sharing attempts before delivery.
 *
 * Pure functions — unit tested in src/lib/__tests__/antiBroker.test.ts.
 */

/** Matches Egyptian and Gulf numbers in Latin or Arabic-Indic digits, with separators. */
const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

export function latiniseDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => DIGIT_MAP[d] ?? d);
}

/**
 * JavaScript's `\b` is defined over [A-Za-z0-9_] only, so it never matches at the edge of
 * an Arabic word — `/\bسمسار\b/` silently matches nothing. On an Arabic-first product that
 * would disable the entire classifier, so boundaries are expressed as Unicode-aware
 * lookarounds instead. Every pattern below is built through this helper.
 */
function word(body: string, flags = "gi"): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, `${flags}u`);
}

/**
 * Contact patterns people use to route a deal off-platform. Kept deliberately broad:
 * a false positive costs a redacted word, a false negative costs a cold call.
 */
const CONTACT_PATTERNS: { name: string; re: RegExp }[] = [
  // 9+ digits in a row, tolerating spaces, dots and dashes used to dodge filters
  { name: "phone", re: /(?:\+?\d[\s.\-_]*){9,15}/g },
  { name: "email", re: /[\w.+-]+\s*(?:@|\(at\)|\[at\])\s*[\w-]+\s*(?:\.|\(dot\))\s*[\w.]{2,}/gi },
  { name: "whatsapp", re: word("whats?app|واتس\\s*اب|واتساب|wa\\.me") },
  { name: "telegram", re: word("telegram|t\\.me|تليجرام|تلجرام") },
  { name: "social", re: word("instagram|facebook|fb\\.com|@[A-Za-z0-9._]{3,}") },
];

/** Words that signal the sender is an agent, not the owner or a genuine buyer. */
const BROKER_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "commission", re: word("commission|عموله|عمولة|كوميشن|بعموله|بعمولة|نسبه|نسبة\\s*السمسره") },
  { name: "broker_title", re: word("broker|سمسار|سمسرة|سمسره|وسيط|بروكر|مسوق\\s*عقاري|consultant\\s*at") },
  { name: "agency", re: word("real\\s*estate\\s*(?:co|company|agency)|شركة\\s*تسويق|مكتب\\s*عقارات|agency") },
  { name: "portfolio", re: word("عندي\\s*وحدات|عندنا\\s*وحدات|لدينا\\s*وحدات|i\\s*have\\s*(?:other|more)\\s*units|portfolio\\s*of\\s*units") },
  { name: "off_platform", re: word("خارج\\s*التطبيق|off\\s*the\\s*app|كلمني\\s*عل[يى]|اتصل\\s*ب[يى]\\s*عل[يى]") },
];

export type ScanResult = {
  flagged: boolean;
  /** Distinct reasons, e.g. ["contact_sharing", "broker_language"]. */
  reasons: string[];
  /** Specific pattern names, for the admin queue and the strike system. */
  matches: string[];
  /** The body with contact details replaced — this is what the recipient sees. */
  redacted: string;
};

const REDACTION = "•••";

export function scanMessage(body: string): ScanResult {
  const normalised = latiniseDigits(body);
  const matches: string[] = [];
  const reasons = new Set<string>();
  let redacted = normalised;

  for (const { name, re } of CONTACT_PATTERNS) {
    const found = normalised.match(new RegExp(re.source, re.flags));
    if (found && found.length > 0) {
      // A bare 9-digit run inside a price ("1,250,000 EGP") is not a phone number.
      const real = name === "phone" ? found.filter((m) => looksLikePhone(m)) : found;
      if (real.length === 0) continue;
      matches.push(name);
      reasons.add("contact_sharing");
      redacted = redacted.replace(new RegExp(re.source, re.flags), (m) =>
        name === "phone" && !looksLikePhone(m) ? m : REDACTION,
      );
    }
  }

  for (const { name, re } of BROKER_PATTERNS) {
    if (new RegExp(re.source, re.flags).test(normalised)) {
      matches.push(name);
      reasons.add("broker_language");
    }
  }

  return {
    flagged: reasons.size > 0,
    reasons: [...reasons],
    matches,
    redacted: redacted.trim(),
  };
}

/** A phone number has 9-15 digits and is not formatted as a price. */
function looksLikePhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return false;
  // Prices are usually written with thousands separators and end in several zeros.
  if (/,\d{3}/.test(candidate)) return false;
  if (/0{4,}$/.test(digits)) return false;
  return true;
}

/**
 * Public phone masking. Buyers never see the owner's number until a viewing is confirmed
 * (Section 6c) — until then the UI shows this.
 */
export function maskPhone(e164: string): string {
  if (e164.length < 6) return REDACTION;
  const cc = e164.startsWith("+") ? e164.slice(0, 3) : "";
  return `${cc}${" "}•••• ••${e164.slice(-2)}`;
}

/** Strike thresholds — three upheld reports and the account cannot list. */
export const STRIKE_BLOCK_THRESHOLD = 3;

export function shouldBlockForStrikes(strikes: number): boolean {
  return strikes >= STRIKE_BLOCK_THRESHOLD;
}
