/**
 * Money columns must be typed as numbers by the app's Prisma client on BOTH databases.
 *
 * prisma/generate-postgres-schema.mjs turns every column named in MONEY_FIELDS into
 * Decimal(14,2) for Postgres. src/lib/prisma.ts shadows each of those with a `number`
 * result field (MONEY_AS_NUMBER). If a money column is added and only one side learns
 * about it, the Postgres build stops compiling — which is how ~100 type errors went
 * unnoticed until the first Postgres build. This test fails first instead.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MONEY_AS_NUMBER } from "../prisma";

const root = process.cwd();

function moneyFieldNames(): string[] {
  const src = readFileSync(path.join(root, "prisma", "generate-postgres-schema.mjs"), "utf8");
  const block = src.match(/const MONEY_FIELDS = \[([\s\S]*?)\];/);
  assert.ok(block, "MONEY_FIELDS not found in the generator");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** model.field for every Float column whose name is a money field — what the generator converts. */
function convertedColumns(): string[] {
  const names = new Set(moneyFieldNames());
  const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  const out: string[] = [];
  let model = "";
  for (const line of schema.split("\n")) {
    const m = line.match(/^model (\w+) \{/);
    if (m) model = m[1];
    const f = line.match(/^\s+(\w+)\s+Float\??/);
    if (model && f && names.has(f[1])) out.push(`${model}.${f[1]}`);
  }
  return out.sort();
}

test("every money column the Postgres schema makes Decimal is typed as number by the client", () => {
  assert.deepEqual([...MONEY_AS_NUMBER].sort(), convertedColumns());
});
