/**
 * Startup checks.
 *
 * Next.js calls `register()` once per server process, before it serves anything. That
 * makes it the right place to refuse to start on a configuration that would fail under
 * traffic rather than immediately — the failures that are invisible until the worst
 * possible moment.
 *
 * Only genuine showstoppers throw. Everything else is surfaced by /api/health as
 * `degraded`, so an operator can see it without the deploy being blocked.
 */

export async function register() {
  // Runs in the edge runtime too; these checks only make sense on the Node server.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) return;

  const { assertProductionStorage } = await import("./lib/storage");

  const failures: string[] = [];

  // Media through the application server is not a degraded mode, it is an outage waiting
  // for traffic — ~650 GB in month one on the projected volumes.
  try {
    assertProductionStorage();
  } catch (e) {
    failures.push((e as Error).message);
  }

  // Auth tokens signed with a missing or placeholder secret are forgeable.
  const secret = process.env.JWT_SECRET ?? "";
  if (!secret) {
    failures.push("JWT_SECRET is not set.");
  } else if (secret.includes("dev-only") || secret.length < 32) {
    failures.push("JWT_SECRET looks like a development placeholder. Generate one: openssl rand -base64 48");
  }

  // SQLite allows one writer for the entire database file. Measured at 20k listings and
  // 200 concurrent operations, mixed read+write reached a p95 of 7 seconds. See SCALING.md.
  if ((process.env.DATABASE_URL ?? "").startsWith("file:")) {
    failures.push("DATABASE_URL points at SQLite. Production requires Postgres — see SCALING.md.");
  }

  /*
    Load-test escape hatch: measure a PRODUCTION BUILD on a dev box (SQLite copy, local
    media) without lying to the checks. It waives only the infrastructure items — never
    the JWT secret, which must be strong even for a test — and shouts about it. /api/health
    reports `loadTestMode` as degraded, so it cannot sit unnoticed on a real deploy.
  */
  if (failures.length > 0 && process.env.PROPSHOP_LOAD_TEST === "1") {
    const waivable = failures.filter((f) => !f.startsWith("JWT_SECRET"));
    if (waivable.length === failures.length) {
      console.warn(
        [
          "",
          "!!! PROPSHOP_LOAD_TEST=1 — starting despite:",
          ...failures.map((f) => `  - ${f}`),
          "!!! This is for load testing only. Never set it on a real deployment.",
          "",
        ].join("\n"),
      );
      return;
    }
  }

  if (failures.length > 0) {
    throw new Error(
      "Refusing to start in production with an unsafe configuration:\n" +
        failures.map((f) => `  - ${f}`).join("\n") +
        "\n\nSee .env.production.example. Set these, or run in development mode.",
    );
  }
}
