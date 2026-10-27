/**
 * Production launcher: one Next.js worker per CPU core, all on the same port.
 *
 *   npm run build            (or STANDALONE=1 npm run build for the standalone bundle)
 *   PORT=4100 node scripts/cluster.mjs
 *
 * Why: a Node process uses one core. `next start` on an 8-core server leaves 7 idle, and
 * page rendering (CPU) is what runs out first under load. The OS hands each incoming
 * connection to one of the workers; a worker that dies is replaced.
 *
 * Env:
 *   WEB_CONCURRENCY   workers (default: cores)
 *   DB_CONNECTIONS    total Postgres connections this server may open (default 40). Split
 *                     evenly into each worker's Prisma pool, so N workers never exceed
 *                     max_connections (Postgres default: 100, shared with migrations,
 *                     jobs and admin tools). Behind PgBouncer, raise it.
 */
import cluster from "node:cluster";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const port = process.env.PORT ?? "4100";

if (cluster.isPrimary) {
  const workers = Math.max(1, Number(process.env.WEB_CONCURRENCY) || os.availableParallelism());
  const budget = Math.max(workers, Number(process.env.DB_CONNECTIONS) || 40);
  const perWorker = Math.max(2, Math.floor(budget / workers));

  const env = { PORT: port, NODE_ENV: "production" };
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres") && !/[?&]connection_limit=/.test(url)) {
    env.DATABASE_URL = `${url}${url.includes("?") ? "&" : "?"}connection_limit=${perWorker}`;
  }

  console.log(`[cluster] ${workers} workers on :${port}${env.DATABASE_URL ? `, ${perWorker} DB connections each` : ""}`);
  for (let i = 0; i < workers; i++) cluster.fork(env);

  let restarts = 0;
  cluster.on("exit", (w, code, signal) => {
    console.error(`[cluster] worker ${w.process.pid} exited (${signal ?? code})`);
    // Crash-looping workers would burn the CPU they are meant to use: back off.
    restarts++;
    setTimeout(() => cluster.fork(env), Math.min(30_000, 500 * restarts));
  });
  setInterval(() => (restarts = Math.max(0, restarts - 1)), 60_000).unref();
} else {
  const standalone = path.join(root, ".next", "standalone", "server.js");
  if (fs.existsSync(standalone)) {
    process.chdir(path.dirname(standalone));
    createRequire(import.meta.url)(standalone);
  } else {
    // Regular build: run `next start` inside the worker. Its listen() is shared through
    // the cluster primary, so every worker serves the same port.
    process.chdir(root);
    process.argv = [process.argv[0], "next", "start", "-p", port];
    createRequire(path.join(root, "package.json"))("next/dist/bin/next");
  }
}
