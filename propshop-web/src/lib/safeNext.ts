/**
 * A post-login destination taken from the URL, reduced to a same-site path.
 *
 * Rejects absolute URLs, protocol-relative `//host`, backslash tricks browsers normalise
 * into `//host` (`/\host`), and control characters. Anything rejected falls back.
 */
export function safeNextPath(input: unknown, fallback = "/dashboard"): string {
  if (typeof input !== "string" || !input.startsWith("/")) return fallback;
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(input)) return fallback;
  return input.slice(0, 512);
}
